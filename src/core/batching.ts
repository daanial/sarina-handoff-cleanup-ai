import type { ProgressState } from "../types";
import { MAX_BATCH_SIZE, TIME_BUDGET_MS_PER_BATCH } from "./limits";

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function yieldToUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export type CancelToken = { cancelled: boolean };

export async function runBatches<T>(params: {
  items: T[];
  batchSize?: number;
  isCancelled: () => boolean;
  onProgress: (p: ProgressState) => void;
  stage: ProgressState["stage"];
  step: (batch: T[], batchIndex: number) => Promise<void>;
}): Promise<void> {
  const batchSize = params.batchSize ?? MAX_BATCH_SIZE;
  const batches = chunk(params.items, batchSize);
  const total = params.items.length;
  let processed = 0;

  for (let i = 0; i < batches.length; i++) {
    if (params.isCancelled()) break;

    const batchStart = Date.now();
    await params.step(batches[i], i);
    processed += batches[i].length;

    params.onProgress({
      totalFrames: total,
      processedFrames: processed,
      currentBatch: i + 1,
      totalBatches: batches.length,
      stage: params.stage,
      canCancel: true,
    });

    const elapsed = Date.now() - batchStart;
    if (elapsed < TIME_BUDGET_MS_PER_BATCH) {
      await yieldToUI();
    } else {
      await yieldToUI();
    }
  }
}
