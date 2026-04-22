import type { AnnotationOptions } from "../types";

export const VISION_SYSTEM_INSTRUCTION =
  "You are a senior product designer and accessibility expert analyzing UI screenshots for developer handoff.\n" +
  "Provide extremely detailed, comprehensive analysis.\n" +
  "Return strict JSON only.\n" +
  "Be thorough and specific - cite exact UI elements, colors, measurements you observe.\n" +
  "Provide actionable, detailed feedback that developers can immediately act on.";

export function buildVisionAnalysisPrompt(
  frameName: string,
  width: number,
  height: number,
  tone: AnnotationOptions["tone"],
  override?: string
): string {
  const toneLine =
    tone === "dev-focused"
      ? "Tone: engineering-oriented, technical."
      : tone === "pm-friendly"
        ? "Tone: stakeholder-friendly, user-impact focused."
        : "Tone: very concise, direct.";

  const schema =
    "Return a single JSON object with keys:\n" +
    "- short_frame_name (string, max 6 words)\n" +
    "- screen_summary (string, max 200 chars, rich description)\n" +
    "- annotation_bullets (array of 5-8 detailed strings, each max 180 chars, specific handoff notes)\n" +
    "- layout_issues (array of 0-6 detailed strings, each max 180 chars: spacing, alignment, hierarchy, white-space, visual balance)\n" +
    "- contrast_warnings (array of 0-5 detailed strings, each max 180 chars: text/bg contrast with specific hex codes, readability issues, WCAG level)\n" +
    "- ux_notes (array of 0-6 detailed strings, each max 180 chars: CTAs, navigation, form usability, interaction patterns, user flow)\n" +
    "- consistency_notes (array of 0-5 detailed strings, each max 180 chars: design token gaps, style inconsistencies, brand alignment)\n" +
    "- accessibility_note (optional string, max 180 chars, detailed a11y summary)\n" +
    "- handoff_intelligence (object):\n" +
    "  - severity (critical|high|medium|low)\n" +
    "  - scorecard {ux, accessibility, consistency, devReadiness, overall} each 0-100\n" +
    "  - top_risks (array of 2-5 strings)\n" +
    "  - actionable_recommendations (array of 2-5 objects with fields: title, action, impact, effort:low|medium|high, severity:critical|high|medium|low)";

  const task =
    `Frame: "${frameName}" (${width}×${height}px)\n\n` +
    "Analyze the screenshot in EXTREME DETAIL and produce a comprehensive JSON object.\n\n" +
    "Instructions:\n" +
    "1. Layout/spacing: Examine spacing between all elements (measure gaps), alignment issues (left/right/center), visual hierarchy (size/weight/position), white-space balance, grid alignment, optical adjustments needed.\n" +
    "2. Accessibility: Check EVERY text element's contrast ratio (estimate hex codes), font sizes (estimate px), touch target sizes (min 44×44px), keyboard navigation indicators, focus states, screen reader considerations, ARIA needs.\n" +
    "3. UX patterns: Evaluate CTA visibility and microcopy, navigation discoverability, form field labels/validation/helper text, button states (default/hover/disabled), error handling, empty states, loading indicators, progressive disclosure.\n" +
    "4. Consistency: Compare button styles, spacing patterns, color usage, typography scale, border radius, shadows, icon styles. Identify where design tokens should be applied.\n" +
    "5. Be EXTREMELY specific: Mention exact UI elements (e.g., 'Primary CTA button \"Sign Up\" uses #4F46E5 on white background, contrast 8.2:1 WCAG AAA, but hover state unclear').\n" +
    "6. Provide measurements, color codes, specific recommendations.\n" +
    "7. Fill ALL applicable arrays - be thorough, not minimal.\n\n" +
    `${toneLine}\n` +
    schema;

  const extra = override?.trim()
    ? `\n\nAdditional instructions:\n${override.trim()}`
    : "";

  return `${task}${extra}`;
}

export function estimateVisionTokens(imageBase64Length: number): number {
  const imageBytes = (imageBase64Length * 3) / 4;
  const imageMB = imageBytes / (1024 * 1024);
  const tokensPerMB = 1500;
  const imageTokens = Math.ceil(imageMB * tokensPerMB);
  const textTokens = 600;
  return imageTokens + textTokens;
}
