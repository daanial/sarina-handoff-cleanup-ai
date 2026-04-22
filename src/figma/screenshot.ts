import type { ScopeNode } from "./selection";

const MAX_WIDTH = 1500;

export type ScreenshotResult =
  | { ok: true; base64: string; width: number; height: number }
  | { ok: false; error: string };

export async function exportFrameScreenshot(
  node: ScopeNode
): Promise<ScreenshotResult> {
  try {
    const bounds = node.absoluteBoundingBox;
    if (!bounds) {
      return {
        ok: false,
        error: "No absoluteBoundingBox (node may be off-canvas or collapsed).",
      };
    }
    if (bounds.width === 0 || bounds.height === 0) {
      return {
        ok: false,
        error: `Frame has zero dimensions (${bounds.width}×${bounds.height})`,
      };
    }

    let scale = 1;
    if (bounds.width > MAX_WIDTH) {
      scale = MAX_WIDTH / bounds.width;
    }
    scale = Math.max(0.1, Math.min(1, scale));

    const strategies: ExportSettingsImage[] = [
      { format: "PNG", constraint: { type: "SCALE", value: scale } },
      {
        format: "JPG",
        constraint: { type: "SCALE", value: scale },
        contentsOnly: true,
      },
      { format: "PNG", constraint: { type: "SCALE", value: scale * 0.5 } },
    ];

    let bytes: Uint8Array | null = null;
    let lastError = "";

    for (const settings of strategies) {
      try {
        const exportPromise = node.exportAsync(settings);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Strategy timeout")), 8000);
        });
        bytes = await Promise.race([exportPromise, timeoutPromise]);
        if (bytes && bytes.length > 0) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    if (!bytes || bytes.length === 0) {
      return {
        ok: false,
        error: `All export strategies failed. Last error: ${lastError || "unknown"}`,
      };
    }

    if (bytes.length > 10 * 1024 * 1024) {
      return {
        ok: false,
        error: `Exported image too large (${Math.round(bytes.length / 1024 / 1024)}MB).`,
      };
    }

    const base64 = uint8ArrayToBase64(bytes);
    return {
      ok: true,
      base64,
      width: Math.round(bounds.width * scale),
      height: Math.round(bounds.height * scale),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Export failed: ${msg}` };
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const maybeFigmaEncode = (
    figma as unknown as { base64Encode?: (b: Uint8Array) => string }
  ).base64Encode;
  if (typeof maybeFigmaEncode === "function") {
    return maybeFigmaEncode(bytes);
  }

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    result += chars[b1 >> 2];
    result += chars[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += chars[((b2 & 0x0f) << 2) | (b3 >> 6)];
    result += chars[b3 & 0x3f];
  }
  if (i < bytes.length) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 0x03) << 4) | (b2 >> 4)];
    if (i + 1 < bytes.length) {
      result += chars[(b2 & 0x0f) << 2];
      result += "=";
    } else {
      result += "==";
    }
  }
  return result;
}
