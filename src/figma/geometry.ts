import type { ScopeNode } from "./selection";

export function getScopeSize(node: ScopeNode): { width: number; height: number } {
  const box = node.absoluteBoundingBox;
  if (box) return { width: box.width, height: box.height };
  return { width: node.width, height: node.height };
}
