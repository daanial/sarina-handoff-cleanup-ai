import type { AnnotationMeta } from "../types";
import { PLUGIN_DATA_KEYS } from "../types";

export function getLinkedAnnotationId(
  node: BaseNode & PluginDataMixin
): string | undefined {
  const v = node.getPluginData(PLUGIN_DATA_KEYS.frameAnnotationId);
  return v ? v : undefined;
}

export function setLinkedAnnotationId(
  node: BaseNode & PluginDataMixin,
  annotationId: string
): void {
  node.setPluginData(PLUGIN_DATA_KEYS.frameAnnotationId, annotationId);
}

export function clearLinkedAnnotationId(node: BaseNode & PluginDataMixin): void {
  node.setPluginData(PLUGIN_DATA_KEYS.frameAnnotationId, "");
}

export function readAnnotationMeta(
  node: BaseNode & PluginDataMixin
): AnnotationMeta | null {
  const raw = node.getPluginData(PLUGIN_DATA_KEYS.annotationMeta);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AnnotationMeta;
  } catch {
    return null;
  }
}

export function writeAnnotationMeta(
  node: BaseNode & PluginDataMixin,
  meta: AnnotationMeta
): void {
  node.setPluginData(
    PLUGIN_DATA_KEYS.annotationMeta,
    JSON.stringify(meta)
  );
}
