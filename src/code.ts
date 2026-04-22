import type {
  ChangeReport,
  FrameChangeEntry,
  JobMode,
  PluginMessage,
  RenameOptions,
  UIMessage,
} from "./types";
import {
  getSelectedScopeNodes,
  collectRenameTargets,
  type ScopeNode,
  type RenameableNode,
} from "./figma/selection";
import { runPreflight, summarizeNode } from "./core/preflight";
import { validateFrameCount, validateDescendantsForMode } from "./core/validation";
import { emptyReport, finalizeReport } from "./core/reporting";
import { runBatches } from "./core/batching";
import { mergeAiName } from "./figma/rename";
import {
  buildAnnotationContent,
  createOrUpdateAnnotation,
  localBulletsForFrame,
} from "./figma/annotations";
import { exportFrameScreenshot } from "./figma/screenshot";
import {
  collectRenameableLayers,
  suggestLayerName,
} from "./figma/layer-rename";

let cancelRequested = false;

figma.showUI(__html__, { width: 420, height: 600, themeColors: true });

figma.on("run", (event) => {
  figma.ui.show();
  const cmd = event.command;
  if (cmd === "rename-frames") {
    figma.ui.postMessage({ type: "shortcut", command: "rename-frames" } satisfies PluginMessage);
  } else if (cmd === "annotate-frames") {
    figma.ui.postMessage({ type: "shortcut", command: "annotate-frames" } satisfies PluginMessage);
  } else {
    figma.ui.postMessage({ type: "shortcut", command: "open" } satisfies PluginMessage);
  }
});

figma.ui.onmessage = async (raw: unknown) => {
  const msg = raw as UIMessage;
  try {
    if (msg.type === "close") {
      figma.closePlugin();
      return;
    }
    if (msg.type === "cancel-job") {
      cancelRequested = true;
      return;
    }
    if (msg.type === "run-preflight") {
      await handlePreflight(msg);
      return;
    }
    if (msg.type === "run-job") {
      cancelRequested = false;
      await handleRunJob(msg);
      return;
    }
    if (msg.type === "request-screenshot") {
      await handleScreenshotRequest(msg.frameId);
      return;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({ type: "error", message } satisfies PluginMessage);
  }
};

async function handlePreflight(
  msg: Extract<UIMessage, { type: "run-preflight" }>
) {
  const scopeNodes = getSelectedScopeNodes(
    figma.currentPage.selection,
    msg.includeSections
  );
  const err = validateFrameCount(scopeNodes.length);
  if (err) {
    figma.ui.postMessage({ type: "error", message: err } satisfies PluginMessage);
    return;
  }

  const renameOptions: RenameOptions = {
    namingStyle: "slash-title-case",
    includeBreakpoint: true,
    includeState: true,
    useAI: false,
    preservePrefix: false,
    renameSectionsToo: msg.includeSections,
  };

  const { report, frameSummaries } = runPreflight({
    scopeNodes,
    includeSections: msg.includeSections,
    processLockedNodes: msg.processLockedNodes,
    skipDeepInstances: msg.skipDeepInstances,
    renameOptions,
  });

  figma.ui.postMessage({
    type: "preflight-result",
    report,
    frameSummaries,
  } satisfies PluginMessage);
}

type JobSemantics = {
  doRename: boolean;
  doAnnotate: boolean;
  useAiRename: boolean;
  useAiAnnotate: boolean;
};

function interpretMode(mode: JobMode): JobSemantics {
  switch (mode) {
    case "audit":
      return {
        doRename: false,
        doAnnotate: false,
        useAiRename: false,
        useAiAnnotate: false,
      };
    case "rename-local":
      return {
        doRename: true,
        doAnnotate: false,
        useAiRename: false,
        useAiAnnotate: false,
      };
    case "rename-ai":
      return {
        doRename: true,
        doAnnotate: false,
        useAiRename: true,
        useAiAnnotate: false,
      };
    case "annotate-local":
      return {
        doRename: false,
        doAnnotate: true,
        useAiRename: false,
        useAiAnnotate: false,
      };
    case "annotate-ai":
      return {
        doRename: false,
        doAnnotate: true,
        useAiRename: false,
        useAiAnnotate: true,
      };
    case "rename-and-annotate-local":
      return {
        doRename: true,
        doAnnotate: true,
        useAiRename: false,
        useAiAnnotate: false,
      };
    case "rename-and-annotate-ai":
      return {
        doRename: true,
        doAnnotate: true,
        useAiRename: true,
        useAiAnnotate: true,
      };
    default:
      return {
        doRename: false,
        doAnnotate: false,
        useAiRename: false,
        useAiAnnotate: false,
      };
  }
}

function validateJobAgainstPreflight(
  semantics: JobSemantics,
  estimatedDescendants: number,
  containsTooManyNodes: boolean
): string | null {
  if (containsTooManyNodes) {
    return "Selection exceeds the maximum safe descendant count for this plugin.";
  }
  const needsStrict =
    semantics.doAnnotate ||
    semantics.useAiAnnotate ||
    semantics.useAiRename;
  if (needsStrict) {
    return validateDescendantsForMode(estimatedDescendants, false);
  }
  if (semantics.doRename) {
    return validateDescendantsForMode(estimatedDescendants, true);
  }
  return null;
}

function pushOrMergeFrameRow(
  rows: FrameChangeEntry[],
  row: FrameChangeEntry
): void {
  const i = rows.findIndex((r) => r.frameId === row.frameId);
  if (i === -1) {
    rows.push(row);
    return;
  }
  const cur = rows[i];
  rows[i] = {
    ...cur,
    newName: row.newName ?? cur.newName,
    renameApplied: cur.renameApplied || row.renameApplied,
    annotationId: row.annotationId ?? cur.annotationId,
    annotationUpdated: cur.annotationUpdated || row.annotationUpdated,
    intelligence: row.intelligence ?? cur.intelligence,
    errors: [...cur.errors, ...row.errors],
  };
}

async function handleRunJob(msg: Extract<UIMessage, { type: "run-job" }>) {
  const semantics = interpretMode(msg.mode);
  if (msg.mode === "audit") {
    const rep = finalizeReport(
      emptyReport({ mode: msg.mode, dryRun: true }),
      [],
      false
    );
    figma.ui.postMessage({ type: "job-done", report: rep } satisfies PluginMessage);
    return;
  }

  const opts = msg.options;
  const scopeNodes = getSelectedScopeNodes(
    figma.currentPage.selection,
    opts.includeSections
  );

  const countErr = validateFrameCount(scopeNodes.length);
  if (countErr) {
    figma.ui.postMessage({ type: "error", message: countErr } satisfies PluginMessage);
    return;
  }

  const maxN = opts.maxFramesToProcess ?? scopeNodes.length;
  const slicedScope = scopeNodes.slice(0, maxN);

  const renameOpts = {
    namingStyle: opts.namingStyle,
    includeBreakpoint: opts.includeBreakpoint,
    includeState: opts.includeState,
    useAI: opts.useAI,
    preservePrefix: opts.preservePrefix,
    renameSectionsToo: opts.renameSectionsToo,
  };

  const { report: pfReport, frameSummaries } = runPreflight({
    scopeNodes: slicedScope,
    includeSections: opts.includeSections,
    processLockedNodes: opts.processLockedNodes,
    skipDeepInstances: opts.skipDeepInstances,
    renameOptions: renameOpts,
  });

  const jobErr = validateJobAgainstPreflight(
    semantics,
    pfReport.estimatedDescendantCount,
    pfReport.containsTooManyNodes
  );
  if (jobErr) {
    figma.ui.postMessage({ type: "error", message: jobErr } satisfies PluginMessage);
    return;
  }

  const aiMap = msg.aiSuggestions ?? {};
  const baseReport = emptyReport({ mode: msg.mode, dryRun: msg.dryRun });
  const framesOut: FrameChangeEntry[] = [];
  const createdAnnotations: SceneNode[] = [];
  const traversalOpts = {
    processLockedNodes: opts.processLockedNodes,
    skipDeepInstances: opts.skipDeepInstances,
  };

  const renameTargets = collectRenameTargets(slicedScope, {
    includeNestedFrames: opts.includeNestedFrames,
    renameSectionsToo: opts.renameSectionsToo,
  });

  const totalSteps =
    (semantics.doRename ? renameTargets.length : 0) +
    (semantics.doAnnotate && opts.addAnnotations ? slicedScope.length : 0);
  let doneSteps = 0;

  const emitProgress = (stage: import("./types").ProgressState["stage"]) => {
    const totalBatches = Math.max(1, Math.ceil(totalSteps / 10) || 1);
    figma.ui.postMessage({
      type: "progress",
      payload: {
        totalFrames: totalSteps || 1,
        processedFrames: Math.min(doneSteps, totalSteps || 1),
        currentBatch: Math.min(
          totalBatches,
          Math.ceil(doneSteps / 10) || 1
        ),
        totalBatches,
        stage,
        canCancel: true,
      },
    } satisfies PluginMessage);
  };

  if (semantics.doRename && renameTargets.length) {
    await runBatches({
      items: renameTargets,
      isCancelled: () => cancelRequested,
      stage: "applying",
      onProgress: () => {
        /* progress emitted manually for combined totals */
      },
      step: async (batch) => {
        for (const node of batch) {
          if (cancelRequested) return;
          const summary = summarizeNode(node, renameOpts, traversalOpts);
          const aiName = semantics.useAiRename
            ? aiMap[node.id]?.short_frame_name
            : undefined;
          const newName = mergeAiName(
            summary.localSuggestedName,
            aiName,
            semantics.useAiRename
          );
          const entry: FrameChangeEntry = {
            frameId: node.id,
            oldName: node.name,
            newName,
            renameApplied: false,
            annotationUpdated: false,
            errors: [],
          };
          if (!msg.dryRun && newName && newName !== node.name) {
            try {
              node.name = newName;
              entry.renameApplied = true;
            } catch (e) {
              entry.errors.push(e instanceof Error ? e.message : String(e));
            }
          }
          
          if (opts.renameInternalLayers && !msg.dryRun) {
            const layers = collectRenameableLayers(node, {
              skipInstances: true,
              maxDepth: 10,
            });
            for (const layer of layers) {
              const suggested = suggestLayerName(layer);
              if (suggested && suggested !== layer.name) {
                try {
                  layer.name = suggested;
                } catch (e) {
                  entry.errors.push(`Layer ${layer.name}: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }
          }
          
          pushOrMergeFrameRow(framesOut, entry);
          doneSteps++;
          emitProgress("applying");
        }
      },
    });
  }

  if (semantics.doAnnotate && opts.addAnnotations && slicedScope.length) {
    await runBatches({
      items: slicedScope,
      isCancelled: () => cancelRequested,
      stage: "applying",
      onProgress: () => {
        /* combined */
      },
      step: async (batch) => {
        for (const scope of batch) {
          if (cancelRequested) return;
          const summary =
            frameSummaries.find((s) => s.id === scope.id) ??
            summarizeNode(scope as RenameableNode, renameOpts, traversalOpts);
          const ai = semantics.useAiAnnotate ? aiMap[scope.id] : undefined;
          const bullets = localBulletsForFrame(
            scope.name,
            summary.width,
            summary.height
          );
          const content = buildAnnotationContent(
            scope.name,
            opts,
            bullets,
            ai,
            ai ? "claude" : "local"
          );
          let annId: string | undefined;
          if (!msg.dryRun) {
            try {
              const ann = await createOrUpdateAnnotation(
                scope as ScopeNode,
                scope.name,
                content,
                ai ? "claude" : "local"
              );
              annId = ann.id;
              createdAnnotations.push(ann);
            } catch (e) {
              pushOrMergeFrameRow(framesOut, {
                frameId: scope.id,
                oldName: scope.name,
                errors: [e instanceof Error ? e.message : String(e)],
                renameApplied: false,
                annotationUpdated: false,
              });
              doneSteps++;
              emitProgress("applying");
              continue;
            }
          }
          pushOrMergeFrameRow(framesOut, {
            frameId: scope.id,
            oldName: scope.name,
            annotationId: annId,
            annotationUpdated: !msg.dryRun && !!annId,
            renameApplied: false,
            intelligence: ai?.handoff_intelligence,
            errors: [],
          });
          doneSteps++;
          emitProgress("applying");
        }
      },
    });
  }

  const done: ChangeReport = finalizeReport(
    baseReport,
    framesOut,
    cancelRequested
  );
  if (!msg.dryRun && createdAnnotations.length > 0) {
    figma.viewport.scrollAndZoomIntoView(createdAnnotations.slice(0, 20));
  }
  figma.ui.postMessage({ type: "job-done", report: done } satisfies PluginMessage);
}

async function handleScreenshotRequest(frameId: string) {
  try {
    const node = await figma.getNodeByIdAsync(frameId);
    if (!node) {
      figma.ui.postMessage({
        type: "screenshot-result",
        frameId,
        error: "Node not found (may have been deleted)",
      } satisfies PluginMessage);
      return;
    }
    
    if (node.type !== "FRAME" && node.type !== "SECTION") {
      figma.ui.postMessage({
        type: "screenshot-result",
        frameId,
        error: `Node is ${node.type}, not FRAME or SECTION`,
      } satisfies PluginMessage);
      return;
    }

    if (node.removed) {
      figma.ui.postMessage({
        type: "screenshot-result",
        frameId,
        error: "Node was removed from document",
      } satisfies PluginMessage);
      return;
    }

    const result = await exportFrameScreenshot(node as ScopeNode);
    if (result.ok) {
      figma.ui.postMessage({
        type: "screenshot-result",
        frameId,
        base64: result.base64,
      } satisfies PluginMessage);
    } else {
      figma.ui.postMessage({
        type: "screenshot-result",
        frameId,
        error: result.error,
      } satisfies PluginMessage);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({
      type: "screenshot-result",
      frameId,
      error: `Screenshot handler error: ${msg}`,
    } satisfies PluginMessage);
  }
}
