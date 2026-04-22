import {
  MAX_SELECTED_FRAMES,
  MAX_TEXT_CHARS_FOR_AI,
  MAX_TOTAL_DESCENDANTS,
  MAX_TOTAL_DESCENDANTS_RENAME_ONLY,
  buildDowngradeSuggestions,
  computeAiAllowed,
} from "./limits";
import type { PreflightReport, FrameSummary } from "../types";
import { suggestLocalName } from "../figma/rename";
import {
  buildClaudePayload,
  scanScopeSubtree,
  trimPayloadForAi,
} from "../figma/traversal";
import type { RenameableNode, ScopeNode } from "../figma/selection";
import { getScopeSize } from "../figma/geometry";

export function runPreflight(params: {
  scopeNodes: ScopeNode[];
  includeSections: boolean;
  processLockedNodes: boolean;
  skipDeepInstances: boolean;
  renameOptions: import("../types").RenameOptions;
}): { report: PreflightReport; frameSummaries: FrameSummary[] } {
  const warnings: string[] = [];
  const selectedFrameIds = params.scopeNodes.map((n) => n.id);
  const selectedFrameCount = params.scopeNodes.length;

  if (selectedFrameCount === 0) {
    warnings.push("No frames or sections in selection.");
  }
  if (selectedFrameCount > MAX_SELECTED_FRAMES) {
    warnings.push(
      `Too many selected frames (${selectedFrameCount}). Maximum is ${MAX_SELECTED_FRAMES}.`
    );
  }

  let estimatedDescendantCount = 0;
  let totalVisibleTextChars = 0;
  let textNodeCount = 0;
  let instanceNodeCount = 0;
  let hiddenNodeCount = 0;
  let lockedNodeCount = 0;
  let descendantCapHit = false;

  const frameSummaries: FrameSummary[] = [];

  for (const node of params.scopeNodes) {
    const scan = scanScopeSubtree(node, {
      processLockedNodes: params.processLockedNodes,
      skipDeepInstances: params.skipDeepInstances,
    });
    estimatedDescendantCount += scan.descendantCount;
    totalVisibleTextChars += scan.visibleTextChars;
    textNodeCount += scan.textNodeCount;
    instanceNodeCount += scan.instanceNodeCount;
    hiddenNodeCount += scan.hiddenNodeCount;
    lockedNodeCount += scan.lockedNodeCount;
    if (scan.descendantCapHit) descendantCapHit = true;

    const { width, height } = getScopeSize(node);
    const basePayload = buildClaudePayload(node.name, width, height, scan);
    const payload = trimPayloadForAi(basePayload, MAX_TEXT_CHARS_FOR_AI);

    const localSuggestedName = suggestLocalName(
      node.name,
      payload,
      params.renameOptions
    );

    frameSummaries.push({
      id: node.id,
      name: node.name,
      type: node.type === "SECTION" ? "SECTION" : "FRAME",
      width,
      height,
      estimatedDescendants: scan.descendantCount,
      visibleTextChars: scan.visibleTextChars,
      payload,
      localSuggestedName,
    });
  }

  if (descendantCapHit) {
    warnings.push(
      "Descendant count hit the scan cap; reported counts may be lower than the full file."
    );
  }
  if (estimatedDescendantCount > MAX_TOTAL_DESCENDANTS) {
    warnings.push(
      `Large subtree (${estimatedDescendantCount} nodes). Annotations/AI require ≤ ${MAX_TOTAL_DESCENDANTS} descendants.`
    );
  }
  if (totalVisibleTextChars > MAX_TEXT_CHARS_FOR_AI) {
    warnings.push(
      `Visible text is large (${totalVisibleTextChars} chars). AI payload is trimmed to ≤ ${MAX_TEXT_CHARS_FOR_AI} chars.`
    );
  }
  if (instanceNodeCount > 500) {
    warnings.push(
      "High instance count detected; consider keeping deep instance traversal disabled."
    );
  }

  const containsTooManyNodes =
    estimatedDescendantCount > MAX_TOTAL_DESCENDANTS_RENAME_ONLY;

  const report: PreflightReport = {
    selectedFrameIds,
    selectedFrameCount,
    estimatedDescendantCount,
    totalVisibleTextChars,
    textNodeCount,
    instanceNodeCount,
    hiddenNodeCount,
    lockedNodeCount,
    containsTooManyNodes,
    aiAllowed: false,
    warnings,
    downgradeSuggestions: [],
  };

  report.aiAllowed = computeAiAllowed(report);
  report.downgradeSuggestions = buildDowngradeSuggestions({
    selectedFrameCount,
    estimatedDescendantCount,
    totalVisibleTextChars,
    instanceNodeCount,
  });

  return { report, frameSummaries };
}

/** Re-scan a single frame/section (used during apply for nested rename targets). */
export function summarizeNode(
  node: RenameableNode,
  renameOptions: import("../types").RenameOptions,
  traversalOpts: { processLockedNodes: boolean; skipDeepInstances: boolean }
): FrameSummary {
  const scan = scanScopeSubtree(node as ScopeNode, traversalOpts);
  const { width, height } = getScopeSize(node as ScopeNode);
  const basePayload = buildClaudePayload(node.name, width, height, scan);
  const payload = trimPayloadForAi(basePayload, MAX_TEXT_CHARS_FOR_AI);
  const localSuggestedName = suggestLocalName(node.name, payload, renameOptions);
  return {
    id: node.id,
    name: node.name,
    type: node.type === "SECTION" ? "SECTION" : "FRAME",
    width,
    height,
    estimatedDescendants: scan.descendantCount,
    visibleTextChars: scan.visibleTextChars,
    payload,
    localSuggestedName,
  };
}
