/**
 * Layer-level renaming: renames internal layers based on type and content
 */

type RenameableLayer = SceneNode;

export type LayerRenameResult = {
  nodeId: string;
  oldName: string;
  newName: string;
  type: string;
};

const GENERIC_NAMES = [
  /^frame\s*\d*$/i,
  /^rectangle\s*\d*$/i,
  /^ellipse\s*\d*$/i,
  /^group\s*\d*$/i,
  /^vector\s*\d*$/i,
  /^text\s*\d*$/i,
  /^component\s*\d*$/i,
  /^instance\s*\d*$/i,
  /^auto\s*layout\s*\d*$/i,
];

function hasGenericName(name: string): boolean {
  return GENERIC_NAMES.some((re) => re.test(name.trim()));
}

export function suggestLayerName(node: RenameableLayer): string | null {
  if (!hasGenericName(node.name)) return null;

  switch (node.type) {
    case "TEXT":
      return suggestTextLayerName(node);
    case "RECTANGLE":
    case "ELLIPSE":
    case "POLYGON":
    case "STAR":
    case "VECTOR":
      return suggestShapeLayerName(node);
    case "FRAME":
      return suggestFrameName(node);
    case "GROUP":
      return suggestGroupName(node);
    case "INSTANCE":
      return suggestInstanceName(node);
    case "COMPONENT":
      return node.name;
    default:
      return null;
  }
}

function suggestTextLayerName(node: TextNode): string {
  const text = node.characters.trim();
  if (!text) return "Empty Text";
  
  const maxLen = 40;
  let name = text.slice(0, maxLen);
  if (text.length > maxLen) name += "…";
  
  name = name.replace(/\n/g, " ");
  
  const fs = typeof node.fontSize === "number" ? node.fontSize : 16;
  if (fs >= 32) return `Heading / ${name}`;
  if (fs >= 24) return `Title / ${name}`;
  if (fs >= 18) return `Subtitle / ${name}`;
  if (fs <= 11) return `Caption / ${name}`;
  
  return `Text / ${name}`;
}

function suggestShapeLayerName(
  node: RectangleNode | EllipseNode | PolygonNode | StarNode | VectorNode
): string {
  const fills = "fills" in node && Array.isArray(node.fills) ? node.fills : [];
  const hasImage = fills.some((f) => f.type === "IMAGE");
  if (hasImage) return "Image";

  const strokes =
    "strokes" in node && Array.isArray(node.strokes) ? node.strokes : [];
  const hasStroke = strokes.length > 0 && strokes.some((s) => s.visible !== false);

  if (node.type === "RECTANGLE") {
    const w = node.width;
    const h = node.height;
    const ratio = w / h;
    
    if (Math.abs(ratio - 1) < 0.1 && w < 100 && h < 100) {
      return hasStroke ? "Icon Border" : "Icon Background";
    }
    
    if (h < 10 && w > 100) return "Divider";
    if (w < 10 && h > 100) return "Divider";
    
    if (ratio > 3 || ratio < 0.33) return hasStroke ? "Border" : "Background";
    
    return hasStroke ? "Card Border" : "Card Background";
  }

  if (node.type === "ELLIPSE") {
    const w = node.width;
    if (w < 60) return "Avatar";
    return "Circle";
  }

  return node.type;
}

function suggestFrameName(node: FrameNode): string {
  const children = node.children;
  if (children.length === 0) return "Container";
  
  const hasText = children.some((c) => c.type === "TEXT");
  const hasButton = children.some((c) => /button|btn/i.test(c.name));
  const hasInput = children.some((c) => /input|field/i.test(c.name));
  
  if (hasButton && hasInput) return "Form Section";
  if (hasButton) return "Button Container";
  if (hasInput) return "Input Container";
  if (hasText) return "Content Block";
  
  if (node.layoutMode !== "NONE") {
    return node.layoutMode === "HORIZONTAL" ? "Row" : "Column";
  }
  
  return "Container";
}

function suggestGroupName(node: GroupNode): string {
  const children = node.children;
  if (children.length === 0) return "Group";
  
  const types = new Set(children.map((c) => c.type));
  if (types.size === 1) {
    const type = Array.from(types)[0];
    if (type === "VECTOR") return "Icon";
    if (type === "RECTANGLE") return "Shape Group";
    if (type === "TEXT") return "Text Group";
  }
  
  return "Group";
}

function suggestInstanceName(node: InstanceNode): string {
  const main = node.mainComponent;
  if (main) return main.name;
  return "Component Instance";
}

export function collectRenameableLayers(
  root: SceneNode,
  options: { skipInstances: boolean; maxDepth: number }
): RenameableLayer[] {
  const results: RenameableLayer[] = [];
  const stack: Array<{ node: SceneNode; depth: number }> = [
    { node: root, depth: 0 },
  ];

  while (stack.length) {
    const { node, depth } = stack.pop()!;
    
    if (depth > options.maxDepth) continue;
    
    if (node.type === "INSTANCE" && options.skipInstances) continue;
    
    if (hasGenericName(node.name)) {
      results.push(node);
    }
    
    if ("children" in node) {
      const children = (node as ChildrenMixin).children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ node: children[i], depth: depth + 1 });
      }
    }
  }

  return results;
}
