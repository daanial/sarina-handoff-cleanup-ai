import type { ChangeReport, FrameChangeEntry } from "../types";
import { PLUGIN_VERSION } from "../types";

export function emptyReport(params: {
  mode: ChangeReport["mode"];
  dryRun: boolean;
  cancelled?: boolean;
}): ChangeReport {
  const now = new Date().toISOString();
  return {
    pluginVersion: PLUGIN_VERSION,
    startedAt: now,
    finishedAt: now,
    dryRun: params.dryRun,
    mode: params.mode,
    cancelled: params.cancelled ?? false,
    frames: [],
  };
}

export function finalizeReport(
  report: ChangeReport,
  frames: FrameChangeEntry[],
  cancelled: boolean
): ChangeReport {
  return {
    ...report,
    frames,
    cancelled,
    finishedAt: new Date().toISOString(),
  };
}
