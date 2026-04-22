import type { AnnotationOptions, ClaudeFramePayload } from "../types";

export const SYSTEM_STYLE_INSTRUCTION =
  "You are a senior product designer helping prepare a Figma file for developer handoff.\n" +
  "Return strict JSON only.\n" +
  "Keep names short and specific.\n" +
  "Do not invent flows not visible in the input.\n" +
  "Prefer labels developers can understand quickly.";

export function buildPerFrameUserPrompt(
  payload: ClaudeFramePayload,
  tone: AnnotationOptions["tone"],
  override?: string
): string {
  const toneLine =
    tone === "dev-focused"
      ? "Tone: concise, engineering-oriented."
      : tone === "pm-friendly"
        ? "Tone: stakeholder-friendly but still concrete."
        : "Tone: very concise.";

  const schema =
    "Return a single JSON object with keys: " +
    "short_frame_name (string, max 6 words), " +
    "screen_summary (string, max 140 chars), " +
    "annotation_bullets (array of 2-4 strings, each max 100 chars), " +
    "ux_notes (array of 0-3 strings, each max 100 chars), " +
    "accessibility_note (optional string, max 100 chars), " +
    "handoff_intelligence (object with severity, scorecard, top_risks, actionable_recommendations). " +
    "scorecard shape: {ux:number 0-100, accessibility:number 0-100, consistency:number 0-100, devReadiness:number 0-100, overall:number 0-100}. " +
    "actionable_recommendations: array of up to 3 objects {title, action, impact, effort:low|medium|high, severity:critical|high|medium|low}.";

  const task =
    "Given this frame summary, produce the JSON object.\n" +
    "Rules:\n" +
    "- Be concrete, not generic.\n" +
    "- Mention state or breakpoint only if obvious.\n" +
    "- Avoid marketing language.\n" +
    `${toneLine}\n` +
    schema;

  const extra = override?.trim() ? `\nAdditional instructions:\n${override.trim()}` : "";

  return `${task}\n\nFRAME_SUMMARY_JSON:\n${JSON.stringify(payload)}${extra}`;
}
