import type {
  AIFrameSuggestion,
  ActionableRecommendation,
  HandoffIntelligence,
  HandoffScorecard,
  SeverityLevel,
} from "../types";

export type ParseResult =
  | { ok: true; value: AIFrameSuggestion }
  | { ok: false; reason: string };

const MAX_NAME = 120;
const MAX_SUMMARY = 200;
const MAX_BULLET = 180;
const MAX_UX = 6;
const MAX_RISKS = 5;
const MAX_RECOMMENDATIONS = 5;

export function parseAiFrameSuggestion(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `Invalid JSON: ${String(e)}` };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, reason: "JSON root must be an object" };
  }
  const o = json as Record<string, unknown>;
  const short_frame_name = truncate(
    typeof o.short_frame_name === "string" ? o.short_frame_name : "",
    MAX_NAME
  );
  const screen_summary = truncate(
    typeof o.screen_summary === "string" ? o.screen_summary : "",
    MAX_SUMMARY
  );
  const annotation_bullets = normalizeBullets(o.annotation_bullets, 8, MAX_BULLET);
  const ux_notes = normalizeBullets(o.ux_notes, MAX_UX, MAX_BULLET);
  const accessibility_note =
    typeof o.accessibility_note === "string"
      ? truncate(o.accessibility_note, MAX_BULLET)
      : undefined;
  const layout_issues = normalizeBullets(o.layout_issues, 6, MAX_BULLET);
  const contrast_warnings = normalizeBullets(o.contrast_warnings, 5, MAX_BULLET);
  const consistency_notes = normalizeBullets(o.consistency_notes, 5, MAX_BULLET);
  const handoff_intelligence = parseHandoffIntelligence(o.handoff_intelligence);

  if (!short_frame_name && !screen_summary && annotation_bullets.length === 0) {
    return { ok: false, reason: "Empty suggestion object" };
  }

  return {
    ok: true,
    value: {
      short_frame_name: short_frame_name || "Screen",
      screen_summary: screen_summary || "",
      annotation_bullets,
      ux_notes,
      accessibility_note,
      layout_issues,
      contrast_warnings,
      consistency_notes,
      handoff_intelligence,
    },
  };
}

function parseHandoffIntelligence(v: unknown): HandoffIntelligence | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const severity = normalizeSeverity(o.severity);
  const scorecard = normalizeScorecard(o.scorecard);
  const topRisks = normalizeBullets(o.top_risks, MAX_RISKS, MAX_BULLET);
  const recs = normalizeRecommendations(o.actionable_recommendations);
  if (!severity && !scorecard && topRisks.length === 0 && recs.length === 0) {
    return undefined;
  }
  return {
    severity: severity ?? "medium",
    scorecard:
      scorecard ??
      ({
        ux: 70,
        accessibility: 70,
        consistency: 70,
        devReadiness: 70,
        overall: 70,
      } satisfies HandoffScorecard),
    top_risks: topRisks,
    actionable_recommendations: recs,
  };
}

function normalizeSeverity(v: unknown): SeverityLevel | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase().trim();
  if (s === "critical" || s === "high" || s === "medium" || s === "low") {
    return s;
  }
  return undefined;
}

function normalizeScorecard(v: unknown): HandoffScorecard | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const score = (k: string) => clampScore(o[k]);
  const ux = score("ux");
  const accessibility = score("accessibility");
  const consistency = score("consistency");
  const devReadiness = clampScore(o.devReadiness ?? o.dev_readiness);
  const overall = score("overall");
  if (
    ux === undefined ||
    accessibility === undefined ||
    consistency === undefined ||
    devReadiness === undefined ||
    overall === undefined
  ) {
    return undefined;
  }
  return { ux, accessibility, consistency, devReadiness, overall };
}

function clampScore(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeRecommendations(v: unknown): ActionableRecommendation[] {
  if (!Array.isArray(v)) return [];
  const out: ActionableRecommendation[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title =
      typeof o.title === "string" ? truncate(o.title.trim(), 90) : "";
    const action =
      typeof o.action === "string" ? truncate(o.action.trim(), MAX_BULLET) : "";
    const impact =
      typeof o.impact === "string" ? truncate(o.impact.trim(), MAX_BULLET) : "";
    const effortRaw =
      typeof o.effort === "string" ? o.effort.toLowerCase().trim() : "";
    const effort =
      effortRaw === "low" || effortRaw === "medium" || effortRaw === "high"
        ? effortRaw
        : "medium";
    const severity = normalizeSeverity(o.severity) ?? "medium";
    if (!title || !action) continue;
    out.push({ title, action, impact, effort, severity });
    if (out.length >= MAX_RECOMMENDATIONS) break;
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function normalizeBullets(
  v: unknown,
  maxItems: number,
  maxLen: number
): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = truncate(item.trim(), maxLen);
    if (t) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function extractJsonFromModelText(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  return trimmed;
}
