import type {
  AIFrameSuggestion,
  AnnotationMeta,
  AnnotationOptions,
  HandoffIntelligence,
} from "../types";
import { PLUGIN_VERSION } from "../types";
import {
  clearLinkedAnnotationId,
  getLinkedAnnotationId,
  setLinkedAnnotationId,
  writeAnnotationMeta,
} from "./metadata";
import type { ScopeNode } from "./selection";

const ANNOTATION_WIDTH = 280;
const ANNOTATION_MIN_HEIGHT = 120;
const MARGIN = 24;

export type AnnotationContent = {
  title: string;
  bullets: string[];
  screenSummary?: string;
  accessibilityNote?: string;
  uxNotes?: string[];
  intelligence?: HandoffIntelligence;
};

function annotationDisplayName(frameName: string): string {
  const safe = frameName.replace(/\n/g, " ").slice(0, 80);
  return `[HC] Annotation — ${safe}`;
}

export function localBulletsForFrame(
  frameName: string,
  width: number,
  height: number
): string[] {
  return [
    `Align spacing and token usage across “${frameName.slice(0, 48)}”.`,
    `Confirm breakpoint/state coverage for ~${Math.round(width)}×${Math.round(
      height
    )}.`,
    "Validate primary CTA visibility and hierarchy in first viewport.",
    "Check edge states (empty, error, loading) before handoff.",
  ];
}

export function buildAnnotationContent(
  frameName: string,
  opts: AnnotationOptions,
  localBullets: string[],
  ai: AIFrameSuggestion | undefined,
  _generatedBy: AnnotationMeta["generatedBy"]
): AnnotationContent {
  const tone =
    opts.tone === "dev-focused"
      ? "Dev Handoff"
      : opts.tone === "pm-friendly"
        ? "Product Handoff"
        : "Design Handoff";

  const bullets: string[] = [];
  if (opts.includeScreenSummary && ai?.screen_summary) {
    bullets.push(ai.screen_summary);
  }
  const base = ai?.annotation_bullets?.length
    ? ai.annotation_bullets.slice(0, 4)
    : localBullets.slice(0, 4);
  for (const b of base) {
    if (b && !bullets.includes(b)) bullets.push(b);
  }

  if (ai?.layout_issues?.length) {
    bullets.push(...ai.layout_issues.map((x) => `⚠️ Layout: ${x}`));
  }
  if (ai?.contrast_warnings?.length) {
    bullets.push(...ai.contrast_warnings.map((x) => `♿️ A11y: ${x}`));
  }
  if (ai?.consistency_notes?.length) {
    bullets.push(...ai.consistency_notes.map((x) => `🎨 Consistency: ${x}`));
  }

  if (bullets.length === 0) {
    bullets.push("No extra AI findings — run a quick pass on hierarchy and states.");
  }

  return {
    title: `✨ ${tone} · ${frameName.slice(0, 60)}`,
    bullets: bullets.slice(0, 10),
    screenSummary: opts.includeScreenSummary ? ai?.screen_summary : undefined,
    accessibilityNote: opts.includeAccessibilityNotes
      ? ai?.accessibility_note
      : undefined,
    uxNotes:
      opts.includeUxNotes && ai?.ux_notes?.length
        ? ai.ux_notes.slice(0, 3)
        : undefined,
    intelligence: ai?.handoff_intelligence,
  };
}

export async function createOrUpdateAnnotation(
  target: ScopeNode,
  frameName: string,
  content: AnnotationContent,
  generatedBy: AnnotationMeta["generatedBy"]
): Promise<FrameNode> {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });

  const existingId = getLinkedAnnotationId(target);
  let container: FrameNode | null = null;
  if (existingId) {
    const n = await figma.getNodeByIdAsync(existingId);
    if (n && n.type === "FRAME" && !n.removed) {
      container = n;
    }
  }

  if (!container) {
    container = figma.createFrame();
    container.name = annotationDisplayName(frameName);
    container.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.14, b: 0.18 } }];
    container.cornerRadius = 8;
    container.layoutMode = "VERTICAL";
    container.primaryAxisSizingMode = "AUTO";
    container.counterAxisSizingMode = "FIXED";
    container.layoutAlign = "STRETCH";
    container.paddingLeft = 12;
    container.paddingRight = 12;
    container.paddingTop = 10;
    container.paddingBottom = 10;
    container.itemSpacing = 6;
    container.clipsContent = false;
    figma.currentPage.appendChild(container);
    setLinkedAnnotationId(target, container.id);
  } else {
    container.name = annotationDisplayName(frameName);
  }

  layoutTexts(container, content, generatedBy);

  const meta: AnnotationMeta = {
    sourceFrameId: target.id,
    pluginVersion: PLUGIN_VERSION,
    generatedBy,
    generatedAt: new Date().toISOString(),
  };
  writeAnnotationMeta(container, meta);

  positionAnnotation(container, target);

  return container;
}

export function removeAnnotationLink(target: ScopeNode): void {
  clearLinkedAnnotationId(target);
}

function layoutTexts(
  container: FrameNode,
  content: AnnotationContent,
  generatedBy: AnnotationMeta["generatedBy"]
) {
  while (container.children.length) {
    container.children[0].remove();
  }

  const chip = figma.createText();
  chip.fontName = { family: "Inter", style: "Medium" };
  chip.characters = generatedBy === "claude" ? "AI Note" : "Handoff Note";
  chip.fontSize = 10;
  chip.fills = [{ type: "SOLID", color: { r: 0.7, g: 0.82, b: 1 } }];
  chip.opacity = 0.95;
  container.appendChild(chip);

  const title = figma.createText();
  title.fontName = { family: "Inter", style: "Semi Bold" };
  title.characters = content.title;
  title.fontSize = 12;
  title.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  title.opacity = 0.95;
  container.appendChild(title);

  const body = figma.createText();
  body.fontName = { family: "Inter", style: "Regular" };
  const parts: string[] = [];
  parts.push("🧠 AI Handoff Recommendations");
  parts.push("");
  for (const b of content.bullets) {
    parts.push(`• ${b}`);
  }
  if (content.accessibilityNote) {
    parts.push("");
    parts.push("♿ Accessibility check");
    parts.push(`Action: ${content.accessibilityNote}`);
  }
  if (content.uxNotes?.length) {
    parts.push("");
    parts.push("🧭 UX refinements");
    parts.push(`Action: ${content.uxNotes.join(" · ")}`);
  }
  if (content.intelligence) {
    parts.push("");
    parts.push("📊 Handoff Intelligence");
    parts.push(
      `Severity: ${content.intelligence.severity.toUpperCase()} • Overall score: ${content.intelligence.scorecard.overall}/100`
    );
    parts.push(
      `Scores — UX ${content.intelligence.scorecard.ux}, A11y ${content.intelligence.scorecard.accessibility}, Consistency ${content.intelligence.scorecard.consistency}, Dev ${content.intelligence.scorecard.devReadiness}`
    );
    if (content.intelligence.top_risks.length) {
      parts.push("");
      parts.push("⚠️ Top risks");
      for (const risk of content.intelligence.top_risks.slice(0, 3)) {
        parts.push(`• ${risk}`);
      }
    }
    if (content.intelligence.actionable_recommendations.length) {
      parts.push("");
      parts.push("✅ Priority actions");
      for (const rec of content.intelligence.actionable_recommendations.slice(0, 3)) {
        parts.push(
          `• ${rec.title} [${rec.severity.toUpperCase()} | ${rec.effort}]`
        );
        parts.push(`  Do: ${rec.action}`);
        if (rec.impact) parts.push(`  Impact: ${rec.impact}`);
      }
    }
  }
  body.characters = parts.join("\n");
  body.fontSize = 11;
  body.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.96 } }];
  body.opacity = 0.95;
  body.textAutoResize = "HEIGHT";
  body.resize(ANNOTATION_WIDTH - 24, body.height);
  container.appendChild(body);

  container.resize(
    ANNOTATION_WIDTH,
    Math.max(ANNOTATION_MIN_HEIGHT, container.height)
  );
}

function positionAnnotation(container: FrameNode, target: ScopeNode) {
  const tb = target.absoluteBoundingBox;
  if (!tb) return;

  let x = tb.x + tb.width + MARGIN;
  let y = tb.y;

  const cw = container.width;
  const vb = figma.viewport.bounds;
  if (x + cw > vb.x + vb.width - 40) {
    x = tb.x;
    y = tb.y + tb.height + MARGIN;
  }

  container.x = x;
  container.y = y;
}
