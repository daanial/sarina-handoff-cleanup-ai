import { extractJsonFromModelText, parseAiFrameSuggestion } from "./schemas";
import type { AIFrameSuggestion } from "../types";
import { buildPerFrameUserPrompt, SYSTEM_STYLE_INSTRUCTION } from "./prompts";
import {
  buildVisionAnalysisPrompt,
  VISION_SYSTEM_INSTRUCTION,
} from "./vision-prompts";
import type { AnnotationOptions, ClaudeFramePayload } from "../types";

/** Override in UI later if needed; Sonnet 3.5 is broadly available on the Messages API. */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-5";

export type ClaudeCallResult =
  | { ok: true; suggestion: AIFrameSuggestion }
  | { ok: false; error: string };

const RETRYABLE_STATUS = new Set([429, 529, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postAnthropicWithRetry(
  apiKey: string,
  body: unknown,
  maxAttempts = 7
): Promise<
  | { ok: true; json: unknown }
  | { ok: false; error: string }
> {
  let lastError = "Unknown Anthropic request failure";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes("Failed to fetch")) {
        return {
          ok: false,
          error: `Network blocked. Use Figma Desktop (not browser), remove+reimport plugin, check firewall. Error: ${errMsg}`,
        };
      }
      lastError = `Network error: ${errMsg}`;
      if (attempt < maxAttempts) {
        await sleep(300 * attempt);
        continue;
      }
      return { ok: false, error: lastError };
    }

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      lastError = `HTTP ${res.status}: ${t.slice(0, 400)}`;
      if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
        const backoffMs = Math.min(2000, 300 * 2 ** (attempt - 1));
        const jitterMs = Math.floor(Math.random() * 200);
        await sleep(backoffMs + jitterMs);
        continue;
      }
      if (res.status === 529) {
        return {
          ok: false,
          error: `HTTP 529: Anthropic is temporarily overloaded after ${attempt} attempt(s). Please retry shortly.`,
        };
      }
      return { ok: false, error: lastError };
    }

    try {
      const json = (await res.json()) as unknown;
      return { ok: true, json };
    } catch (e) {
      return { ok: false, error: `Bad response JSON: ${String(e)}` };
    }
  }

  return { ok: false, error: lastError };
}

export async function callClaudeForFrame(params: {
  apiKey: string;
  model?: string;
  payload: ClaudeFramePayload;
  tone: AnnotationOptions["tone"];
  promptOverride?: string;
}): Promise<ClaudeCallResult> {
  const model = params.model ?? DEFAULT_CLAUDE_MODEL;
  const userPrompt = buildPerFrameUserPrompt(
    params.payload,
    params.tone,
    params.promptOverride
  );

  const body = {
    model,
    max_tokens: 600,
    messages: [
      { role: "user", content: SYSTEM_STYLE_INSTRUCTION },
      { role: "user", content: userPrompt },
    ],
  };

  const apiResult = await postAnthropicWithRetry(params.apiKey, body);
  if (!apiResult.ok) return apiResult;
  const json = apiResult.json;

  const text = extractAssistantText(json);
  if (!text) return { ok: false, error: "Empty model response" };

  const extracted = extractJsonFromModelText(text);
  const parsed = parseAiFrameSuggestion(extracted);
  if (!parsed.ok) return { ok: false, error: parsed.reason };

  return { ok: true, suggestion: parsed.value };
}

export async function callClaudeVision(params: {
  apiKey: string;
  model?: string;
  frameName: string;
  width: number;
  height: number;
  screenshotBase64: string;
  tone: AnnotationOptions["tone"];
  promptOverride?: string;
}): Promise<ClaudeCallResult> {
  const model = params.model ?? DEFAULT_CLAUDE_MODEL;
  const userPrompt = buildVisionAnalysisPrompt(
    params.frameName,
    params.width,
    params.height,
    params.tone,
    params.promptOverride
  );

  const body = {
    model,
    max_tokens: 2500,
    messages: [
      { role: "user", content: VISION_SYSTEM_INSTRUCTION },
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: params.screenshotBase64,
            },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  };

  const apiResult = await postAnthropicWithRetry(params.apiKey, body);
  if (!apiResult.ok) return apiResult;
  const json = apiResult.json;

  const text = extractAssistantText(json);
  if (!text) return { ok: false, error: "Empty model response" };

  const extracted = extractJsonFromModelText(text);
  const parsed = parseAiFrameSuggestion(extracted);
  if (!parsed.ok) return { ok: false, error: parsed.reason };

  return { ok: true, suggestion: parsed.value };
}

function extractAssistantText(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const content = (json as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
  }
  const joined = parts.join("\n").trim();
  return joined.length ? joined : null;
}
