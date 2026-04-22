import type {
  AIFrameSuggestion,
  ChangeReport,
  FrameSummary,
  JobOptions,
  PluginMessage,
  PreflightReport,
  ProgressState,
  UIMessage,
} from "./types";
import { callClaudeForFrame, callClaudeVision } from "./ai/anthropic";
import { testAnthropicConnection } from "./ai/test-connection";
import sarinaLogo from "./assets/LogoSarina.jpg";

function postToPlugin(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

const API_KEY_STORAGE = "sarina_api_key";

let lastReport: ChangeReport | null = null;
let lastPreflight: { report: PreflightReport; summaries: FrameSummary[] } | null =
  null;
let aiSuggestions: Record<string, AIFrameSuggestion> = {};
let apiKey = "";
let aiCancelled = false;
let visionScreenshots: Record<string, string> = {};
let visionScreenshotErrors: Record<string, string> = {};
let pendingPreflightResolver:
  | ((value: { report: PreflightReport; summaries: FrameSummary[] }) => void)
  | null = null;

let progressStartedAt = 0;
let progressCurrentLabel = "Idle";
let lastProgressState: ProgressState | null = null;
let progressTicker: number | null = null;
let lastAiErrors: string[] = [];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<HTMLElementTagNameMap[K]> & { class?: string; html?: string }
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    const { class: c, html, ...rest } = props as Record<string, unknown>;
    if (c) node.className = c as string;
    if (html) node.innerHTML = html as string;
    Object.assign(node, rest);
  }
  return node as HTMLElementTagNameMap[K];
}

function getCheckboxValue(id: string, fallback = false): boolean {
  const node = document.getElementById(id) as HTMLInputElement | null;
  return node?.checked ?? fallback;
}

function getTextValue(id: string, fallback = ""): string {
  const node = document.getElementById(id) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  const value = node?.value?.trim();
  return value && value.length ? value : fallback;
}

function getSelectValue(id: string, fallback: string): string {
  const node = document.getElementById(id) as HTMLSelectElement | null;
  return node?.value || fallback;
}

function getNumberValue(id: string): number | undefined {
  const node = document.getElementById(id) as HTMLInputElement | null;
  if (!node?.value) return undefined;
  const v = Number.parseInt(node.value, 10);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

function getJobOptions(): JobOptions {
  return {
    namingStyle: "slash-title-case",
    includeBreakpoint: true,
    includeState: true,
    useAI: true,
    preservePrefix: false,
    renameSectionsToo: getCheckboxValue("renameSectionsToo", false),
    renameInternalLayers: false,
    addAnnotations: true,
    includeScreenSummary: getCheckboxValue("incSummary", true),
    includeAccessibilityNotes: getCheckboxValue("incA11y", true),
    includeUxNotes: getCheckboxValue("incUx", true),
    tone: getSelectValue("tone", "dev-focused") as JobOptions["tone"],
    promptOverride: getTextValue("promptOverride"),
    useVisionAnalysis: getCheckboxValue("useVision", true),
    includeSections: getCheckboxValue("incSections", true),
    includeNestedFrames: getCheckboxValue("incNested", false),
    processLockedNodes: getCheckboxValue("procLocked", false),
    skipDeepInstances: getCheckboxValue("skipInst", true),
    maxFramesToProcess: getNumberValue("maxFrames"),
  };
}

function getPreflightMsg(): Extract<UIMessage, { type: "run-preflight" }> {
  return {
    type: "run-preflight",
    includeSections: getCheckboxValue("incSections", true),
    includeNested: getCheckboxValue("incNested", false),
    processLockedNodes: getCheckboxValue("procLocked", false),
    skipDeepInstances: getCheckboxValue("skipInst", true),
  };
}

function setTab(name: string) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.tab === name);
  });
  document.querySelectorAll("[data-panel]").forEach((p) => {
    p.classList.toggle(
      "hidden",
      (p as HTMLElement).dataset.panel !== name
    );
  });
}

function renderPreflightSummary() {
  const host = document.getElementById("scanSummary");
  if (!host || !lastPreflight) return;
  const r = lastPreflight.report;
  host.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Frames</div><div class="stat-value">${r.selectedFrameCount}</div></div>
      <div class="stat-card"><div class="stat-label">Descendants</div><div class="stat-value">${r.estimatedDescendantCount}</div></div>
      <div class="stat-card"><div class="stat-label">Text chars</div><div class="stat-value">${r.totalVisibleTextChars}</div></div>
      <div class="stat-card"><div class="stat-label">AI ready</div><div class="stat-value">${r.aiAllowed ? "✓" : "✗"}</div></div>
    </div>
  `;
}

function updateProgressLabel(text: string) {
  progressCurrentLabel = text;
  if (!progressStartedAt) progressStartedAt = Date.now();
  const label = document.getElementById("progressLabel");
  if (label) label.textContent = text;
  renderProgressDetail(lastProgressState ?? undefined);
}

function setProgress(p: ProgressState) {
  lastProgressState = p;
  const bar = document.querySelector(".progress-bar > div") as HTMLElement | null;
  if (bar) {
    const pct =
      p.totalFrames > 0
        ? Math.round((100 * p.processedFrames) / p.totalFrames)
        : 0;
    bar.style.width = `${pct}%`;
  }
  const spinner = document.getElementById("progressSpinner");
  if (spinner) {
    spinner.classList.toggle("hidden", p.stage === "done" || p.stage === "error");
  }
  if (p.stage === "done" || p.stage === "error") {
    progressStartedAt = 0;
    stopProgressTicker();
  } else if (!progressStartedAt) {
    progressStartedAt = Date.now();
    startProgressTicker();
  } else {
    startProgressTicker();
  }
  renderProgressDetail(p);
}

function formatEtaSeconds(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "estimating…";
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.ceil(s % 60);
  return `${m}m ${rem}s`;
}

function formatElapsedSeconds(s: number): string {
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

function expectedWaitHint(p: ProgressState): string {
  const usingVision = getCheckboxValue("useVision", true);
  if (p.stage === "extracting") return "usually 45s-90s per frame";
  if (p.stage === "generating-ai") {
    return usingVision
      ? "usually 20-90s per frame (provider load dependent)"
      : "usually 10-45s per frame";
  }
  if (p.stage === "applying") return "usually under 10s";
  if (p.stage === "done") return "complete";
  return "estimating";
}

function startProgressTicker(): void {
  if (progressTicker !== null) return;
  progressTicker = window.setInterval(() => {
    renderProgressDetail(lastProgressState ?? undefined);
  }, 1000);
}

function stopProgressTicker(): void {
  if (progressTicker === null) return;
  window.clearInterval(progressTicker);
  progressTicker = null;
}

function renderProgressDetail(p?: ProgressState): void {
  const detail = document.getElementById("progressDetail");
  const meta = document.getElementById("progressMeta");
  const timer = document.getElementById("progressTimer");
  if (!detail || !meta || !timer) return;
  if (!p) {
    detail.textContent = "Waiting to start…";
    meta.textContent = progressCurrentLabel;
    timer.textContent = "Elapsed 00:00";
    return;
  }
  const processed = Math.max(0, p.processedFrames);
  const total = Math.max(1, p.totalFrames);
  const elapsedSec = progressStartedAt
    ? (Date.now() - progressStartedAt) / 1000
    : 0;
  const rate = processed > 0 && elapsedSec > 0 ? processed / elapsedSec : 0;
  const remaining = Math.max(0, total - processed);
  const etaSec = rate > 0 ? remaining / rate : 0;
  const pct = Math.min(100, Math.round((processed / total) * 100));
  const stageText =
    p.stage === "extracting"
      ? "Exporting screenshots"
      : p.stage === "generating-ai"
        ? "Analyzing with AI"
        : p.stage === "applying"
          ? "Applying annotations"
          : p.stage === "done"
            ? "Completed"
            : p.stage;
  detail.textContent = `Now: ${stageText}`;
  meta.textContent = `${processed}/${total} (${pct}%) • ETA ${formatEtaSeconds(etaSec)}`;
  timer.textContent = `Elapsed ${formatElapsedSeconds(elapsedSec)} • Typical ${expectedWaitHint(p)}`;
}

async function saveApiKey(key: string) {
  try {
    await (parent as typeof parent & {
      clientStorage?: { setAsync(k: string, v: string): Promise<void> };
    }).clientStorage?.setAsync(API_KEY_STORAGE, key);
  } catch {
    // Ignore storage errors silently.
  }
}

async function loadApiKey(): Promise<string> {
  try {
    const v = await (parent as typeof parent & {
      clientStorage?: { getAsync(k: string): Promise<string | undefined> };
    }).clientStorage?.getAsync(API_KEY_STORAGE);
    return v || "";
  } catch {
    return "";
  }
}

async function clearApiKey() {
  try {
    await (parent as typeof parent & {
      clientStorage?: { deleteAsync(k: string): Promise<void> };
    }).clientStorage?.deleteAsync(API_KEY_STORAGE);
  } finally {
    apiKey = "";
    const input = document.getElementById("apiKey") as HTMLInputElement | null;
    if (input) input.value = "";
    const status = document.getElementById("keyStatus");
    if (status) status.textContent = "No key saved. Add your Anthropic key.";
  }
}

async function ensurePreflightReady(): Promise<{
  report: PreflightReport;
  summaries: FrameSummary[];
} | null> {
  if (lastPreflight?.summaries?.length) return lastPreflight;
  updateProgressLabel("⚡ Scanning selection…");
  postToPlugin(getPreflightMsg());
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingPreflightResolver = null;
      resolve(null);
    }, 10000);
    pendingPreflightResolver = (value) => {
      clearTimeout(timeout);
      pendingPreflightResolver = null;
      resolve(value);
    };
  });
}

async function runAiAnalysis(useVision: boolean): Promise<number> {
  aiCancelled = false;
  aiSuggestions = {};
  visionScreenshots = {};
  visionScreenshotErrors = {};

  const preflight = await ensurePreflightReady();
  const summaries = preflight?.summaries ?? lastPreflight?.summaries;
  if (!summaries?.length) {
    alert("No frames found in selection. Select at least one frame/section and try again.");
    return 0;
  }
  if (!apiKey.trim()) {
    setTab("settings");
    alert("Add an Anthropic API key in Settings first.");
    return 0;
  }

  updateProgressLabel("🔌 Testing API connection…");
  setProgress({
    totalFrames: summaries.length,
    processedFrames: 0,
    currentBatch: 1,
    totalBatches: Math.ceil(summaries.length / 10),
    stage: "generating-ai",
    canCancel: true,
  });
  const connTest = await testAnthropicConnection(apiKey.trim());
  if (!connTest.ok) {
    alert(`API connection failed:\n\n${connTest.error}`);
    updateProgressLabel("⚠️ Connection failed");
    return 0;
  }
  updateProgressLabel("✓ Connected. Starting analysis…");

  const opts = getJobOptions();
  let i = 0;
  let firstSuccess = false;
  const errors: string[] = [];
  lastAiErrors = [];

  for (const s of summaries) {
    if (aiCancelled) break;
    const frameName = s.name.slice(0, 50);
    let res;

    if (useVision) {
      updateProgressLabel(`📸 Exporting screenshot: "${frameName}"…`);
      setProgress({
        totalFrames: summaries.length,
        processedFrames: i,
        currentBatch: Math.ceil((i + 1) / 10),
        totalBatches: Math.ceil(summaries.length / 10),
        stage: "extracting",
        canCancel: true,
      });
      postToPlugin({ type: "request-screenshot", frameId: s.id } as never);
      const timeout = Date.now() + 45000;
      let lastError = "";
      let gotScreenshot = false;
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (visionScreenshots[s.id]) {
            gotScreenshot = true;
            clearInterval(check);
            resolve();
          } else if (visionScreenshotErrors[s.id]) {
            lastError = visionScreenshotErrors[s.id];
            clearInterval(check);
            resolve();
          } else if (aiCancelled) {
            lastError = "Cancelled by user";
            clearInterval(check);
            resolve();
          } else if (Date.now() > timeout) {
            lastError = "Screenshot export timeout (45s)";
            clearInterval(check);
            resolve();
          }
        }, 150);
      });

      if (!gotScreenshot || !visionScreenshots[s.id]) {
        errors.push(`Screenshot failed for "${s.name}": ${lastError || "not received"}`);
        updateProgressLabel(`⚠️ Screenshot failed, using text-only for "${frameName}"…`);
        res = await callClaudeForFrame({
          apiKey: apiKey.trim(),
          payload: s.payload,
          tone: opts.tone,
          promptOverride: opts.promptOverride,
        });
      } else {
        updateProgressLabel(`🤖 Vision analysis: "${frameName}"…`);
        res = await callClaudeVision({
          apiKey: apiKey.trim(),
          frameName: s.name,
          width: s.width,
          height: s.height,
          screenshotBase64: visionScreenshots[s.id],
          tone: opts.tone,
          promptOverride: opts.promptOverride,
        });
        if (!res.ok && /HTTP 529|overloaded/i.test(res.error)) {
          updateProgressLabel(`🔁 Vision overloaded, retrying text-only for "${frameName}"…`);
          res = await callClaudeForFrame({
            apiKey: apiKey.trim(),
            payload: s.payload,
            tone: opts.tone,
            promptOverride: opts.promptOverride,
          });
          if (res.ok) {
            delete visionScreenshots[s.id];
          }
        }
      }
    } else {
      updateProgressLabel(`🤖 Text analysis: "${frameName}"…`);
      res = await callClaudeForFrame({
        apiKey: apiKey.trim(),
        payload: s.payload,
        tone: opts.tone,
        promptOverride: opts.promptOverride,
      });
    }

    if (res.ok) {
      aiSuggestions[s.id] = res.suggestion;
      if (!firstSuccess) {
        firstSuccess = true;
        await saveApiKey(apiKey.trim());
      }
    } else {
      errors.push(`"${s.name}": ${res.error}`);
    }

    i++;
    setProgress({
      totalFrames: summaries.length,
      processedFrames: i,
      currentBatch: Math.ceil(i / 10),
      totalBatches: Math.ceil(summaries.length / 10),
      stage: "generating-ai",
      canCancel: true,
    });
  }

  const successCount = Object.keys(aiSuggestions).length;
  updateProgressLabel(
    errors.length
      ? `⚠️ Analysis finished: ${successCount}/${summaries.length}`
      : `✓ Analysis complete: ${successCount}/${summaries.length}`
  );
  setProgress({
    totalFrames: summaries.length,
    processedFrames: summaries.length,
    currentBatch: 1,
    totalBatches: 1,
    stage: "done",
    canCancel: false,
  });
  renderAnalysisResults(summaries, errors);
  lastAiErrors = [...errors];
  return successCount;
}

async function runAnalyzeThenApply(): Promise<void> {
  const useVision = getCheckboxValue("useVision", true);
  const includeRename = getCheckboxValue("runAiRename", true);
  const allowFallback = getCheckboxValue("allowLocalFallback", false);
  const analyzed = await runAiAnalysis(useVision);
  const opts = { ...getJobOptions(), addAnnotations: true, useAI: true };

  if (analyzed > 0) {
    updateProgressLabel("📝 Applying AI annotations to canvas…");
    postToPlugin({
      type: "run-job",
      mode: includeRename ? "rename-and-annotate-ai" : "annotate-ai",
      options: opts,
      aiSuggestions,
      dryRun: false,
    });
    return;
  }

  if (!allowFallback) {
    updateProgressLabel("⚠️ No AI output generated");
    const firstErr = lastAiErrors[0] ? `\n\nFirst error: ${lastAiErrors[0]}` : "";
    alert(
      "No AI annotations were generated, so nothing was applied.\n\nEnable 'Allow local fallback notes' in Settings if you want non-AI notes when provider/API fails." +
        firstErr
    );
    return;
  }

  updateProgressLabel("📝 AI unavailable, applying local notes fallback…");
  postToPlugin({
    type: "run-job",
    mode: "annotate-local",
    options: opts,
    dryRun: false,
  });
}

function renderAnalysisResults(summaries: FrameSummary[], errors: string[]) {
  const host = document.getElementById("analysisResults");
  if (!host) return;
  host.innerHTML = "";
  const successCount = Object.keys(aiSuggestions).length;
  if (successCount === 0 && errors.length === 0) return;

  const visionCount = Object.keys(visionScreenshots).filter(
    (id) => aiSuggestions[id]
  ).length;
  const intelligenceEntries = Object.values(aiSuggestions)
    .map((s) => s.handoff_intelligence)
    .filter((x): x is NonNullable<typeof x> => !!x);
  const avgOverall = intelligenceEntries.length
    ? Math.round(
        intelligenceEntries.reduce((sum, x) => sum + x.scorecard.overall, 0) /
          intelligenceEntries.length
      )
    : undefined;
  const severityRank = { low: 1, medium: 2, high: 3, critical: 4 } as const;
  let highestSeverity: keyof typeof severityRank | null = null;
  for (const entry of intelligenceEntries) {
    if (
      !highestSeverity ||
      severityRank[entry.severity] > severityRank[highestSeverity]
    ) {
      highestSeverity = entry.severity;
    }
  }
  host.appendChild(
    el("div", {
      class: successCount === summaries.length ? "success-banner" : "warn-banner",
      html: `<strong>${successCount}/${summaries.length} analyzed</strong><br>${visionCount} with vision · ${successCount - visionCount} text-only${
        avgOverall !== undefined
          ? `<br>Handoff score: ${avgOverall}/100${
              highestSeverity ? ` · Highest severity: ${highestSeverity.toUpperCase()}` : ""
            }`
          : ""
      }`,
    })
  );

  const list = el("ul", { class: "list" });
  for (const s of summaries) {
    if (aiSuggestions[s.id]) {
      const method = visionScreenshots[s.id] ? "🔍 Vision" : "💬 Text";
      list.appendChild(el("li", { textContent: `${method}: ${s.name}` }));
    }
  }
  if (errors.length) {
    list.appendChild(el("li", { textContent: `⚠️ ${errors[0]}` }));
  }
  host.appendChild(list);
}

function buildApp() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  app.appendChild(
    el("header", {
      html: `<img src="${sarinaLogo}" class="brand-logo" alt="Sarina logo" /><span>Sarina Handoff Cleanup AI</span>`,
    })
  );

  const tabs = el("div", { class: "tabs" });
  const tabNames: Array<{ id: string; label: string }> = [
    { id: "home", label: "Welcome" },
    { id: "workspace", label: "AI Workspace" },
    { id: "settings", label: "Settings" },
  ];
  for (const t of tabNames) {
    const b = el("button", {
      class: "tab" + (t.id === "home" ? " active" : ""),
      textContent: t.label,
    });
    (b as HTMLElement).dataset.tab = t.id;
    b.addEventListener("click", () => setTab(t.id));
    tabs.appendChild(b);
  }
  app.appendChild(tabs);

  const homePanel = el("div", { class: "panel" });
  (homePanel as HTMLElement).dataset.panel = "home";
  homePanel.innerHTML = `
    <div class="section">
      <img src="${sarinaLogo}" class="welcome-logo-hero" alt="Sarina logo" />
      <div class="onboarding-tip">
        <strong>💡 Quick tip</strong><br>
        Start in <em>Settings</em> to add your API key, then select 1+ frames and run Analyze + Apply from AI Workspace.
      </div>
      <div class="success-banner">
        <strong>Welcome to Sarina Handoff Cleanup AI</strong><br>
        Analyze selected frames with AI, generate styled handoff annotations, and optionally apply AI renaming in one flow.
      </div>
      <div class="section-title">Quick Start</div>
      <ul class="list">
        <li>1) Add your Anthropic API key in Settings</li>
        <li>2) Select frame(s) in Figma</li>
        <li>3) Run "Analyze + Apply" from AI Workspace</li>
      </ul>
      <button class="btn primary" id="goSettings">⚙️ Open Settings</button>
      <button class="btn success" id="goWorkspace">🚀 Open AI Workspace</button>
    </div>
  `;

  const workspacePanel = el("div", { class: "panel hidden" });
  (workspacePanel as HTMLElement).dataset.panel = "workspace";
  workspacePanel.innerHTML = `
    <div class="section">
      <div class="section-title">AI Run</div>
      <div class="toggle"><input type="checkbox" id="useVision" checked /><label for="useVision">Use Vision analysis (screenshot)</label></div>
      <div class="toggle"><input type="checkbox" id="runAiRename" checked /><label for="runAiRename">Also apply AI renaming</label></div>
      <button class="btn primary" id="btnScan">⚡ Scan Selection</button>
      <button class="btn success" id="btnAnalyzeApply">✨ Analyze + Apply Annotations</button>
    </div>
    <div class="section" id="scanSummary"></div>
    <div class="section" id="analysisResults"></div>
    <div class="section progress-wrap">
      <div class="progress-label">
        <span class="progress-status"><span id="progressSpinner" class="spinner hidden"></span><span id="progressLabel">Idle</span></span>
      </div>
      <div class="progress-detail" id="progressDetail">Waiting to start…</div>
      <div class="progress-meta" id="progressMeta">Idle</div>
      <div class="progress-timer" id="progressTimer">Elapsed 00:00</div>
      <div class="progress-bar"><div></div></div>
      <button class="btn danger" id="btnCancel">⏹ Cancel</button>
      <button class="btn" id="btnExport">💾 Export Report</button>
    </div>
  `;

  const settingsPanel = el("div", { class: "panel hidden" });
  (settingsPanel as HTMLElement).dataset.panel = "settings";
  settingsPanel.innerHTML = `
    <div class="section">
      <div class="section-title">API Key</div>
      <div class="info-banner" id="keyStatus">No key saved. Add your Anthropic key. Key is stored locally on this machine only.</div>
      <div class="row"><label>Anthropic API key</label><input type="password" id="apiKey" autocomplete="off" placeholder="sk-ant-..." /></div>
      <button class="btn primary" id="btnTestKey">🔌 Test Connection</button>
      <button class="btn" id="btnClearKey">🗑 Clear Stored Key</button>
    </div>
    <div class="section">
      <div class="section-title">AI Output Preferences</div>
      <div class="toggle"><input type="checkbox" id="incSummary" checked /><label for="incSummary">Include screen summary</label></div>
      <div class="toggle"><input type="checkbox" id="incA11y" checked /><label for="incA11y">Include accessibility notes</label></div>
      <div class="toggle"><input type="checkbox" id="incUx" checked /><label for="incUx">Include UX notes</label></div>
      <div class="toggle"><input type="checkbox" id="allowLocalFallback" /><label for="allowLocalFallback">Allow local fallback notes when AI fails</label></div>
      <div class="row"><label>Tone</label><select id="tone">
        <option value="dev-focused">Dev-focused</option>
        <option value="pm-friendly">PM-friendly</option>
        <option value="concise">Concise</option>
      </select></div>
      <div class="row"><label>Custom instructions (optional)</label><textarea id="promptOverride" placeholder="Add any custom AI guidance..."></textarea></div>
    </div>
    <div class="section">
      <div class="section-title">Selection & Safety</div>
      <div class="toggle"><input type="checkbox" id="incSections" checked /><label for="incSections">Include sections</label></div>
      <div class="toggle"><input type="checkbox" id="incNested" /><label for="incNested">Include nested frames</label></div>
      <div class="toggle"><input type="checkbox" id="skipInst" checked /><label for="skipInst">Skip deep instances</label></div>
      <div class="toggle"><input type="checkbox" id="procLocked" /><label for="procLocked">Process locked nodes</label></div>
      <div class="toggle"><input type="checkbox" id="renameSectionsToo" /><label for="renameSectionsToo">Rename sections too</label></div>
      <div class="row"><label>Max frames (optional cap)</label><input type="number" id="maxFrames" min="1" placeholder="Leave empty for all"/></div>
    </div>
  `;

  app.appendChild(homePanel);
  app.appendChild(workspacePanel);
  app.appendChild(settingsPanel);
  app.appendChild(
    el("footer", {
      class: "app-footer",
      html: 'Made with love by <a href="https://danialkeshani.com" target="_blank" rel="noopener noreferrer">Danial</a> &amp; <a href="https://cubexic.com" target="_blank" rel="noopener noreferrer">Cubex</a>',
    })
  );

  document.getElementById("goSettings")?.addEventListener("click", () => setTab("settings"));
  document.getElementById("goWorkspace")?.addEventListener("click", () => setTab("workspace"));
  document.getElementById("btnScan")?.addEventListener("click", () => postToPlugin(getPreflightMsg()));

  document.getElementById("apiKey")?.addEventListener("input", (e) => {
    apiKey = (e.target as HTMLInputElement).value;
  });
  document.getElementById("btnClearKey")?.addEventListener("click", clearApiKey);
  document.getElementById("btnTestKey")?.addEventListener("click", async () => {
    if (!apiKey.trim()) {
      alert("Enter an API key first.");
      return;
    }
    updateProgressLabel("🔌 Testing connection…");
    const test = await testAnthropicConnection(apiKey.trim());
    if (test.ok) {
      await saveApiKey(apiKey.trim());
      const status = document.getElementById("keyStatus");
      if (status) {
        status.className = "success-banner";
        status.textContent = "✓ Key validated and saved locally.";
      }
      updateProgressLabel("✓ API key validated");
    } else {
      alert(`Connection test failed:\n\n${test.error}`);
      updateProgressLabel("⚠️ Connection failed");
    }
  });

  document.getElementById("btnAnalyzeApply")?.addEventListener("click", async () => {
    await runAnalyzeThenApply();
  });

  document.getElementById("btnCancel")?.addEventListener("click", () => {
    aiCancelled = true;
    postToPlugin({ type: "cancel-job" });
    updateProgressLabel("Cancelled");
    if (lastProgressState) {
      setProgress({ ...lastProgressState, stage: "error", canCancel: false });
    }
  });

  document.getElementById("btnExport")?.addEventListener("click", () => {
    if (!lastReport) {
      alert("Run Analyze + Apply first to create a report.");
      return;
    }
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `handoff-cleanup-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  loadApiKey().then((key) => {
    if (!key) return;
    apiKey = key;
    const input = document.getElementById("apiKey") as HTMLInputElement | null;
    if (input) input.value = key;
    const status = document.getElementById("keyStatus");
    if (status) {
      status.className = "success-banner";
      status.textContent = "✓ Key loaded from local storage.";
    }
  });
}

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginMessage | undefined;
  if (!msg) return;
  if (msg.type === "preflight-result") {
    lastPreflight = { report: msg.report, summaries: msg.frameSummaries };
    if (pendingPreflightResolver) pendingPreflightResolver(lastPreflight);
    renderPreflightSummary();
  } else if (msg.type === "progress") {
    setProgress(msg.payload);
  } else if (msg.type === "job-done") {
    lastReport = msg.report;
    const annotationCreated = msg.report.frames.filter((f) => f.annotationUpdated).length;
    const renameApplied = msg.report.frames.filter((f) => f.renameApplied).length;
    const failed = msg.report.frames.filter((f) => f.errors.length > 0).length;
    updateProgressLabel(
      `✓ Applied: ${annotationCreated} annotations, ${renameApplied} renames${failed ? `, ${failed} errors` : ""}`
    );
    setProgress({
      totalFrames: msg.report.frames.length || 1,
      processedFrames: msg.report.frames.length || 1,
      currentBatch: 1,
      totalBatches: 1,
      stage: failed ? "error" : "done",
      canCancel: false,
    });
    if (failed) {
      const firstError = msg.report.frames.find((f) => f.errors.length)?.errors[0];
      if (firstError) alert(`Completed with errors:\n\n${firstError}`);
    }
  } else if (msg.type === "error") {
    alert(msg.message);
  } else if (msg.type === "shortcut") {
    setTab("workspace");
    postToPlugin(getPreflightMsg());
  } else if (msg.type === "screenshot-result") {
    const payload = msg as { frameId: string; base64?: string; error?: string };
    if (payload.base64) {
      visionScreenshots[payload.frameId] = payload.base64;
    } else if (payload.error) {
      visionScreenshotErrors[payload.frameId] = payload.error;
    }
  }
};

buildApp();
