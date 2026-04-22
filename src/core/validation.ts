import {
  MAX_SELECTED_FRAMES,
  MAX_TOTAL_DESCENDANTS,
  MAX_TOTAL_DESCENDANTS_RENAME_ONLY,
} from "./limits";

export function validateFrameCount(count: number): string | null {
  if (count === 0) return "Select one or more frames (or sections) to continue.";
  if (count > MAX_SELECTED_FRAMES)
    return `Too many top-level frames selected (${count}). Max is ${MAX_SELECTED_FRAMES}.`;
  return null;
}

export function validateDescendantsForMode(
  count: number,
  renameOnly: boolean
): string | null {
  const cap = renameOnly
    ? MAX_TOTAL_DESCENDANTS_RENAME_ONLY
    : MAX_TOTAL_DESCENDANTS;
  if (count > cap) {
    return renameOnly
      ? `Selection is too large for rename-only (${count} descendants > ${cap}). Reduce selection scope.`
      : `Too many descendants (${count}) for annotations/AI. Max is ${cap} for this mode.`;
  }
  return null;
}
