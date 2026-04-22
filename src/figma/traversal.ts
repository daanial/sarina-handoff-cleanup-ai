import type { ClaudeFramePayload } from "../types";
import { MAX_TOTAL_DESCENDANTS_RENAME_ONLY } from "../core/limits";
import type { ScopeNode } from "./selection";

export type TraversalOptions = {
  processLockedNodes: boolean;
  skipDeepInstances: boolean;
};

export type ChildSummary = ClaudeFramePayload["childSummary"];

export type ScanResult = {
  descendantCount: number;
  textNodeCount: number;
  instanceNodeCount: number;
  hiddenNodeCount: number;
  lockedNodeCount: number;
  visibleTextChars: number;
  /** Uncapped scan hit walk limit */
  descendantCapHit: boolean;
  childSummary: ChildSummary;
  textCandidates: TextCandidate[];
};

export type TextCandidate = {
  text: string;
  fontSize: number;
  y: number;
  x: number;
};

const MAX_TEXT_LEN = 300;

export function scanScopeSubtree(
  root: ScopeNode,
  opts: TraversalOptions
): ScanResult {
  const state = emptyState();
  const children = "children" in root ? root.children : [];
  for (const c of children) {
    walk(c, opts, state, 0);
    if (state.descendantCount > MAX_TOTAL_DESCENDANTS_RENAME_ONLY) {
      state.descendantCapHit = true;
      break;
    }
  }
  return finalizeState(state);
}

function emptyState(): MutableScanState {
  return {
    descendantCount: 0,
    textNodeCount: 0,
    instanceNodeCount: 0,
    hiddenNodeCount: 0,
    lockedNodeCount: 0,
    visibleTextChars: 0,
    descendantCapHit: false,
    childSummary: {
      buttons: 0,
      inputs: 0,
      textLayers: 0,
      images: 0,
      components: 0,
    },
    textCandidates: [],
  };
}

type MutableScanState = Omit<ScanResult, "childSummary"> & {
  childSummary: ChildSummary;
};

function finalizeState(state: MutableScanState): ScanResult {
  return {
    descendantCount: state.descendantCount,
    textNodeCount: state.textNodeCount,
    instanceNodeCount: state.instanceNodeCount,
    hiddenNodeCount: state.hiddenNodeCount,
    lockedNodeCount: state.lockedNodeCount,
    visibleTextChars: state.visibleTextChars,
    descendantCapHit: state.descendantCapHit,
    childSummary: { ...state.childSummary },
    textCandidates: state.textCandidates.slice(),
  };
}

function walk(
  node: SceneNode,
  opts: TraversalOptions,
  state: MutableScanState,
  depth: number
): void {
  if (state.descendantCount > MAX_TOTAL_DESCENDANTS_RENAME_ONLY) {
    state.descendantCapHit = true;
    return;
  }

  if (!node.visible) {
    state.hiddenNodeCount++;
    return;
  }

  if ("locked" in node && node.locked && !opts.processLockedNodes) {
    state.lockedNodeCount++;
    return;
  }

  state.descendantCount++;

  if (node.type === "TEXT") {
    state.textNodeCount++;
    state.childSummary.textLayers++;
    const raw = node.characters.trim();
    if (raw.length > 0 && raw.length <= MAX_TEXT_LEN) {
      state.visibleTextChars += raw.length;
      const fs = typeof node.fontSize === "number" ? node.fontSize : 12;
      const box = node.absoluteBoundingBox;
      const y = box ? box.y : node.y;
      const x = box ? box.x : node.x;
      state.textCandidates.push({ text: raw, fontSize: fs, y, x });
    }
    return;
  }

  if (node.type === "INSTANCE") {
    state.instanceNodeCount++;
    state.childSummary.components++;
    categorizeByName(node.name, state.childSummary);
    if (opts.skipDeepInstances) return;
  } else if (node.type === "COMPONENT") {
    state.childSummary.components++;
    categorizeByName(node.name, state.childSummary);
  } else if (node.type === "COMPONENT_SET") {
    state.childSummary.components++;
    return;
  } else {
    if (looksLikeImage(node)) state.childSummary.images++;
  }

  if (!("children" in node)) return;
  const children = (node as ChildrenMixin).children;
  for (const c of children) {
    walk(c, opts, state, depth + 1);
    if (state.descendantCount > MAX_TOTAL_DESCENDANTS_RENAME_ONLY) {
      state.descendantCapHit = true;
      return;
    }
  }
}

function categorizeByName(name: string, s: ChildSummary) {
  if (/(button|btn\b|cta|submit)/i.test(name)) s.buttons++;
  else if (/(input|field|textfield|textarea|select|dropdown)/i.test(name))
    s.inputs++;
}

function looksLikeImage(node: SceneNode): boolean {
  const n = node.name.toLowerCase();
  if (/(image|photo|img|illustration|hero|banner)/i.test(n)) return true;
  if (
    node.type === "RECTANGLE" ||
    node.type === "ELLIPSE" ||
    node.type === "VECTOR"
  ) {
    if ("fills" in node && Array.isArray(node.fills)) {
      for (const f of node.fills) {
        if (f.type === "IMAGE") return true;
      }
    }
  }
  return false;
}

function scoreCandidate(c: TextCandidate): number {
  return c.fontSize * 1000 - c.y + c.x / 100000;
}

export function buildClaudePayload(
  frameName: string,
  width: number,
  height: number,
  scan: ScanResult
): ClaudeFramePayload {
  const sorted = scan.textCandidates
    .slice()
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const dedup = new Set<string>();
  const textSnippets: string[] = [];
  for (const c of sorted) {
    const key = c.text.toLowerCase();
    if (dedup.has(key)) continue;
    dedup.add(key);
    textSnippets.push(c.text);
    if (textSnippets.length >= 20) break;
  }

  const visibleLabels = textSnippets.slice(0, 10);

  return {
    frameName,
    frameSize: { width, height },
    textSnippets,
    childSummary: { ...scan.childSummary },
    visibleLabels,
  };
}

export function estimateAiPayloadChars(payload: ClaudeFramePayload): number {
  return JSON.stringify(payload).length;
}

export function trimPayloadForAi(
  payload: ClaudeFramePayload,
  maxChars: number
): ClaudeFramePayload {
  let p = { ...payload, textSnippets: [...payload.textSnippets], visibleLabels: [...payload.visibleLabels] };
  while (estimateAiPayloadChars(p) > maxChars && p.textSnippets.length > 3) {
    p = {
      ...p,
      textSnippets: p.textSnippets.slice(0, -1),
      visibleLabels: p.visibleLabels.slice(0, -1),
    };
  }
  return p;
}
