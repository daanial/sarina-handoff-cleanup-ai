/** Shared types between plugin main and UI (each bundle includes a copy). */

export const PLUGIN_VERSION = "0.1.0";

export type JobMode =
  | "audit"
  | "rename-local"
  | "rename-ai"
  | "annotate-local"
  | "annotate-ai"
  /** Rename + annotate using local heuristics only (no Claude on canvas side). */
  | "rename-and-annotate-local"
  | "rename-and-annotate-ai";

export type ProgressStage =
  | "extracting"
  | "generating-ai"
  | "previewing"
  | "applying"
  | "done"
  | "error";

export type ProgressState = {
  totalFrames: number;
  processedFrames: number;
  currentBatch: number;
  totalBatches: number;
  stage: ProgressStage;
  canCancel: boolean;
};

export type PreflightReport = {
  selectedFrameIds: string[];
  selectedFrameCount: number;
  estimatedDescendantCount: number;
  totalVisibleTextChars: number;
  textNodeCount: number;
  instanceNodeCount: number;
  hiddenNodeCount: number;
  lockedNodeCount: number;
  containsTooManyNodes: boolean;
  aiAllowed: boolean;
  warnings: string[];
  downgradeSuggestions: string[];
};

export type RenameOptions = {
  namingStyle: "slash-title-case" | "sentence-case" | "kebab-case";
  includeBreakpoint: boolean;
  includeState: boolean;
  useAI: boolean;
  preservePrefix: boolean;
  renameSectionsToo: boolean;
  renameInternalLayers: boolean;
};

export type AnnotationTone = "concise" | "dev-focused" | "pm-friendly";

export type AnnotationOptions = {
  addAnnotations: boolean;
  includeScreenSummary: boolean;
  includeAccessibilityNotes: boolean;
  includeUxNotes: boolean;
  tone: AnnotationTone;
  promptOverride: string;
  useVisionAnalysis: boolean;
};

export type JobScopeOptions = {
  includeSections: boolean;
  includeNestedFrames: boolean;
  processLockedNodes: boolean;
  /** When true, skip traversing inside INSTANCE subtrees beyond the instance root (lighter preflight). */
  skipDeepInstances: boolean;
};

export type JobOptions = RenameOptions &
  AnnotationOptions &
  JobScopeOptions & {
    /** Max top-level frames to process when user picks “first N” downgrade */
    maxFramesToProcess?: number;
  };

export type AIFrameSuggestion = {
  short_frame_name: string;
  screen_summary: string;
  annotation_bullets: string[];
  ux_notes: string[];
  accessibility_note?: string;
  layout_issues?: string[];
  contrast_warnings?: string[];
  consistency_notes?: string[];
  handoff_intelligence?: HandoffIntelligence;
};

export type SeverityLevel = "critical" | "high" | "medium" | "low";

export type HandoffScorecard = {
  ux: number;
  accessibility: number;
  consistency: number;
  devReadiness: number;
  overall: number;
};

export type ActionableRecommendation = {
  title: string;
  action: string;
  impact: string;
  effort: "low" | "medium" | "high";
  severity: SeverityLevel;
};

export type HandoffIntelligence = {
  severity: SeverityLevel;
  scorecard: HandoffScorecard;
  top_risks: string[];
  actionable_recommendations: ActionableRecommendation[];
};

export type ClaudeFramePayload = {
  frameName: string;
  frameSize: { width: number; height: number };
  textSnippets: string[];
  childSummary: {
    buttons: number;
    inputs: number;
    textLayers: number;
    images: number;
    components: number;
  };
  visibleLabels: string[];
};

export type FrameSummary = {
  id: string;
  name: string;
  type: "FRAME" | "SECTION";
  width: number;
  height: number;
  estimatedDescendants: number;
  visibleTextChars: number;
  payload: ClaudeFramePayload;
  localSuggestedName: string;
};

export type FrameChangeEntry = {
  frameId: string;
  oldName: string;
  newName?: string;
  renameApplied: boolean;
  annotationId?: string;
  annotationUpdated: boolean;
  intelligence?: HandoffIntelligence;
  errors: string[];
};

export type ChangeReport = {
  pluginVersion: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  mode: JobMode;
  cancelled: boolean;
  frames: FrameChangeEntry[];
};

/** UI → plugin main */
export type UIMessage =
  | {
      type: "run-preflight";
      includeSections: boolean;
      includeNested: boolean;
      processLockedNodes: boolean;
      skipDeepInstances: boolean;
    }
  | {
      type: "run-job";
      mode: JobMode;
      options: JobOptions;
      aiSuggestions?: Record<string, AIFrameSuggestion>;
      dryRun: boolean;
    }
  | { type: "cancel-job" }
  | { type: "request-screenshot"; frameId: string }
  | { type: "close" };

/** plugin main → UI */
export type PluginMessage =
  | {
      type: "preflight-result";
      report: PreflightReport;
      frameSummaries: FrameSummary[];
    }
  | { type: "progress"; payload: ProgressState }
  | { type: "job-done"; report: ChangeReport }
  | { type: "error"; message: string }
  | { type: "shortcut"; command: string }
  | { type: "screenshot-result"; frameId: string; base64?: string; error?: string };

export type AnnotationMeta = {
  sourceFrameId: string;
  pluginVersion: string;
  generatedBy: "local" | "claude";
  generatedAt: string;
};

export const PLUGIN_DATA_KEYS = {
  annotationMeta: "handoffCleanupMeta",
  frameAnnotationId: "handoffCleanupAnnotationId",
} as const;
