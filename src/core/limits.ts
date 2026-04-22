import type { PreflightReport } from "../types";

export const MAX_SELECTED_FRAMES = 50;
export const MAX_TOTAL_DESCENDANTS = 2000;
export const MAX_TOTAL_DESCENDANTS_RENAME_ONLY = 10000;
export const MAX_TEXT_CHARS_FOR_AI = 12000;
export const MAX_BATCH_SIZE = 10;
export const TIME_BUDGET_MS_PER_BATCH = 400;

export type DowngradeContext = {
  selectedFrameCount: number;
  estimatedDescendantCount: number;
  totalVisibleTextChars: number;
  instanceNodeCount: number;
};

export function buildDowngradeSuggestions(ctx: DowngradeContext): string[] {
  const s: string[] = [];
  if (ctx.selectedFrameCount > MAX_SELECTED_FRAMES) {
    s.push(
      `Process only the first ${MAX_SELECTED_FRAMES} selected frames (MVP limit).`
    );
  }
  if (ctx.estimatedDescendantCount > MAX_TOTAL_DESCENDANTS) {
    s.push(
      "Use rename-only mode (skips heavy traversal for annotations/AI) or disable nested frames."
    );
    s.push("Exclude nested content: turn off “Include nested child frames”.");
    s.push("Turn off AI and use local rules only for faster, safer runs.");
  }
  if (ctx.totalVisibleTextChars > MAX_TEXT_CHARS_FOR_AI) {
    s.push(
      "Reduce visible text sent to AI: shrink selection or disable AI notes."
    );
  }
  if (ctx.instanceNodeCount > 500) {
    s.push(
      "Many instances detected: keep “Skip deep instance traversal” on for lighter scans."
    );
  }
  return s;
}

export function computeAiAllowed(report: PreflightReport): boolean {
  return (
    report.selectedFrameCount > 0 &&
    report.selectedFrameCount <= MAX_SELECTED_FRAMES &&
    report.estimatedDescendantCount <= MAX_TOTAL_DESCENDANTS &&
    report.totalVisibleTextChars <= MAX_TEXT_CHARS_FOR_AI &&
    !report.containsTooManyNodes
  );
}

export function computeContainsTooManyNodes(
  estimatedDescendantCount: number,
  mode: "full" | "rename-only"
): boolean {
  const cap =
    mode === "rename-only"
      ? MAX_TOTAL_DESCENDANTS_RENAME_ONLY
      : MAX_TOTAL_DESCENDANTS;
  return estimatedDescendantCount > cap;
}
