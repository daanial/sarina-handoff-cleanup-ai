import type { ClaudeFramePayload, RenameOptions } from "../types";

const UI_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(login|sign in|log in)\b/i, label: "Login" },
  { re: /\b(sign up|register|create account)\b/i, label: "Sign Up" },
  { re: /\b(dashboard|overview|home)\b/i, label: "Dashboard" },
  { re: /\b(settings|preferences|account settings)\b/i, label: "Settings" },
  { re: /\b(checkout|shipping|payment|order summary)\b/i, label: "Checkout" },
  { re: /\b(empty state|no results|nothing here)\b/i, label: "Empty State" },
  { re: /\b(modal|dialog|drawer|sheet)\b/i, label: "Modal" },
  { re: /\b(success|confirmed|all set|done)\b/i, label: "Success" },
  { re: /\b(error|something went wrong|failed)\b/i, label: "Error" },
  { re: /\b(profile|account|my profile)\b/i, label: "Profile" },
  { re: /\b(card list|list view|grid)\b/i, label: "Card List" },
];

function breakpointFromWidth(width: number): string | null {
  if (width < 428) return "Mobile";
  if (width < 900) return "Tablet";
  return "Desktop";
}

function detectStateFromText(snippets: string[]): string | null {
  const blob = snippets.join(" ").toLowerCase();
  if (/\bloading\b|spinner/i.test(blob)) return "Loading";
  if (/\berror\b|invalid/i.test(blob)) return "Error";
  if (/\bsuccess\b|saved\b/i.test(blob)) return "Success";
  return null;
}

function detectUiLabel(snippets: string[], frameName: string): string | null {
  const hay = [frameName, ...snippets].join(" ");
  for (const { re, label } of UI_PATTERNS) {
    if (re.test(hay)) return label;
  }
  return null;
}

function titleCaseSegment(s: string): string {
  return s
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function toSlashTitle(parts: string[]): string {
  return parts.map(titleCaseSegment).join(" / ");
}

function toSentence(parts: string[]): string {
  const head = titleCaseSegment(parts[0] ?? "");
  const tail = parts.slice(1).map((p) => p.toLowerCase());
  return [head, ...tail].filter(Boolean).join(" — ");
}

function toKebab(parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function suggestLocalName(
  frameName: string,
  payload: ClaudeFramePayload,
  options: RenameOptions
): string {
  const width = payload.frameSize.width;
  const snippets = payload.textSnippets.slice(0, 8);
  const ui = detectUiLabel(snippets, frameName);
  const bp = options.includeBreakpoint ? breakpointFromWidth(width) : null;
  const st =
    options.includeState && snippets.length
      ? detectStateFromText(snippets)
      : null;

  const coreParts: string[] = [];
  if (ui) coreParts.push(ui);
  else if (frameName.trim() && !/^frame\s*\d+$/i.test(frameName.trim())) {
    coreParts.push(frameName.trim());
  } else if (snippets[0]) {
    coreParts.push(snippets[0].slice(0, 40));
  } else {
    coreParts.push("Screen");
  }

  if (st && !coreParts.some((p) => p.toLowerCase() === st.toLowerCase())) {
    coreParts.push(st);
  }
  if (bp) coreParts.push(bp);

  let name =
    options.namingStyle === "slash-title-case"
      ? toSlashTitle(coreParts)
      : options.namingStyle === "sentence-case"
        ? toSentence(coreParts)
        : toKebab(coreParts);

  if (options.preservePrefix) {
    const m = frameName.match(/^(\[[^\]]+\]\s*)/);
    if (m) name = `${m[1]}${name}`;
  }

  return name.slice(0, 255);
}

export function mergeAiName(
  localName: string,
  aiName: string | undefined,
  useAI: boolean
): string {
  if (!useAI || !aiName?.trim()) return localName;
  const t = aiName.trim().slice(0, 255);
  return t.length ? t : localName;
}
