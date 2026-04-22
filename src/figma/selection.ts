import type { JobScopeOptions, RenameOptions } from "../types";

export type ScopeNode = FrameNode | SectionNode;

/** Nodes that can receive a semantic rename in MVP. */
export type RenameableNode = FrameNode | SectionNode;

function isScopeType(
  node: SceneNode,
  includeSections: boolean
): node is ScopeNode {
  if (node.type === "FRAME") return true;
  if (includeSections && node.type === "SECTION") return true;
  return false;
}

/**
 * Top-level selected frames/sections only (selection array), no auto-climb.
 */
export function getSelectedScopeNodes(
  selection: readonly SceneNode[],
  includeSections: boolean
): ScopeNode[] {
  const out: ScopeNode[] = [];
  for (const n of selection) {
    if (isScopeType(n, includeSections)) out.push(n);
  }
  return out;
}

/**
 * Rename targets: selected FRAMEs; selected SECTIONs only when `renameSectionsToo`;
 * optional nested FRAME descendants (never renames COMPONENT_SET root by selection rules).
 */
export function collectRenameTargets(
  scopeNodes: readonly ScopeNode[],
  options: Pick<JobScopeOptions, "includeNestedFrames"> &
    Pick<RenameOptions, "renameSectionsToo">
): RenameableNode[] {
  const targets: RenameableNode[] = [];
  const seen = new Set<string>();

  const add = (n: RenameableNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    targets.push(n);
  };

  for (const node of scopeNodes) {
    if (node.type === "FRAME") {
      add(node);
      if (options.includeNestedFrames) collectNestedFrames(node, add);
    } else if (node.type === "SECTION") {
      if (options.renameSectionsToo) add(node);
      if (options.includeNestedFrames) {
        const stack: SceneNode[] = [...node.children];
        while (stack.length) {
          const n = stack.pop();
          if (!n) continue;
          if (n.type === "FRAME") {
            add(n);
            collectNestedFrames(n, add);
          } else if ("children" in n) {
            stack.push(...(n as ChildrenMixin & SceneNode).children);
          }
        }
      }
    }
  }

  return targets;
}

function collectNestedFrames(
  frame: FrameNode,
  add: (f: FrameNode) => void
) {
  const stack: SceneNode[] = [...frame.children];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.type === "FRAME") {
      add(n);
      stack.push(...n.children);
    } else if ("children" in n) {
      stack.push(...(n as ChildrenMixin & SceneNode).children);
    }
  }
}
