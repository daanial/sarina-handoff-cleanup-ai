# Version 0.2.0 - Major Improvements

## What Changed

### 1. 🔍 Vision AI Analysis
**The big feature**: Claude Vision API integration for screenshot-based analysis.

- **How it works**: Exports each frame as JPEG (max 1500px width, auto-downscaled), base64 encodes, sends to Claude Vision API with specialized prompts
- **What it analyzes**:
  - Layout & spacing issues (uneven spacing, misalignment, weak hierarchy)
  - Accessibility (color contrast WCAG, font sizes, touch targets)
  - UX patterns (CTA clarity, navigation, forms, error/empty states)
  - Consistency (design token gaps, style deviations)
- **Where**: Annotations tab → 🔍 Analyze (Vision) button
- **Cost**: ~1,500-2,500 tokens per frame (2-3× text-only mode)
- **Toggle**: "Use Vision Analysis" checkbox with cost warning banner

### 2. ⚡ Per-Tab Actions
No more "everything in Apply tab" — each tab has immediate actions:

**Selection Tab**
- ⚡ Scan Selection → runs preflight, shows stats grid (frames, descendants, text chars, AI eligibility)

**Rename Tab**
- 👁 Preview Renames → shows diff table (current vs local vs AI) without full preflight
- Options: naming style, breakpoint suffix, state suffix, AI toggle, preserve prefix, rename sections

**Annotations Tab**
- 💬 Analyze (Text) → text-only Claude analysis (~600 tokens/frame)
- 🔍 Analyze (Vision) → screenshot + Claude Vision (~1,500-2,500 tokens/frame)
- Options: add cards, summary, a11y, UX, tone, vision toggle, custom instructions

**Apply Tab**
- Bulk operations: Preview (dry run), Rename (local/AI), Annotate (local/AI), Both (local/AI)
- Progress bar, Cancel, Export report

### 3. 🎨 Redesigned UI
**Dark theme with soft gradients**:
- Background: `linear-gradient(135deg, #1a1d2e 0%, #16192b 100%)`
- Panel colors: `#1e2233` with hover states
- Accent: `#6366f1` (indigo) with gradient on progress bar
- Professional spacing: 16px panel padding, 12px row gaps, 10px section margins
- Typography: Inter font, 13px base, 12px labels, 11px small text
- Stats grid: 2-column card layout with large values
- Icon: 🎨 emoji in header
- Smooth transitions: 0.2s ease on buttons, 0.3s on progress bar

### 4. 🔐 API Key Persistence
**Saves after first successful call**:
- Uses `figma.clientStorage` (local to user's machine, not synced)
- Auto-loads on plugin open
- Success banner: "✓ Key loaded from local storage"
- Info banner: "Key stored locally on this machine only"
- 🗑 Clear Stored Key button
- Never persists until first successful API response (validates key works first)

### 5. 📝 Enhanced Annotations
**Richer AI analysis output**:
- New fields in `AIFrameSuggestion`:
  - `layout_issues[]`: spacing, alignment, hierarchy problems
  - `contrast_warnings[]`: WCAG contrast, readability issues
  - `consistency_notes[]`: design token gaps, style deviations
- Emoji prefixes in annotation cards:
  - ⚠️ Layout: ...
  - ♿️ A11y: ...
  - 🎨 Consistency: ...
- Increased bullet limit: 6 → 10 to accommodate vision insights

## New Files

- `src/figma/screenshot.ts` - JPEG export with downscaling (max 1500px)
- `src/ai/vision-prompts.ts` - Comprehensive vision analysis prompt template
- `IMPROVEMENTS.md` - This file

## Updated Files

### Core Logic
- `src/types.ts` - Added `useVisionAnalysis`, vision-specific AI fields, screenshot messages
- `src/code.ts` - Screenshot request handler, `clientStorage` exposure
- `src/figma/annotations.ts` - Emoji bullet prefixes, 10-bullet limit

### AI Integration
- `src/ai/anthropic.ts` - New `callClaudeVision()` with image content block
- `src/ai/schemas.ts` - Parse `layout_issues`, `contrast_warnings`, `consistency_notes`

### UI
- `src/ui.css` - Complete redesign: gradients, professional spacing, stat cards, cost estimate styling
- `src/ui.ts` - Per-tab actions, vision analysis flow, `clientStorage` load/save/clear, screenshot request/response handling

### Build & Docs
- `esbuild.config.mjs` - Inlines CSS + JS into `dist/ui.html` for `showUI(__html__)`
- `README.md` - Full feature documentation, vision coverage, cost estimates

## Usage Flow (NEW)

### Text-Only Analysis (Original)
1. Select frames
2. Selection tab → ⚡ Scan Selection
3. Annotations tab → 💬 Analyze (Text)
4. Apply tab → 🤖 Annotate (AI)

### Vision Analysis (NEW)
1. Select frames
2. Selection tab → ⚡ Scan Selection
3. Annotations tab → Enable "Use Vision Analysis" (cost warning appears)
4. Annotations tab → 🔍 Analyze (Vision)
   - Plugin exports each frame as JPEG
   - UI sends base64 + prompt to Claude Vision
   - Progress bar shows per-frame analysis
5. Apply tab → 🤖 Annotate (AI)
   - Annotation cards show layout/a11y/consistency insights with emoji prefixes

## Technical Details

### Screenshot Export
- Format: JPEG (smaller than PNG for large frames)
- Quality: 0.8 (visual quality vs size balance)
- Max width: 1500px (downscales maintaining aspect ratio)
- Encoding: base64 (for Claude API image content block)
- Error handling: Returns `{ ok: false, error }` if export fails

### Vision Prompt Structure
```
System: "You are a senior product designer and accessibility expert..."
User: [image] + "Frame: Dashboard (1200×800px)\n\nAnalyze the screenshot..."
```

Schema enforces:
- `short_frame_name`: max 6 words
- `screen_summary`: max 140 chars
- `annotation_bullets`: 3-5 items, each max 120 chars
- `layout_issues`: 0-4 items, each max 120 chars
- `contrast_warnings`: 0-3 items, each max 120 chars
- `ux_notes`: 0-4 items, each max 120 chars
- `consistency_notes`: 0-3 items, each max 120 chars
- `accessibility_note`: optional, max 120 chars

### Cost Estimation
- Text-only: ~600 tokens (prompt + payload + response)
- Vision: ~1,500-2,500 tokens depending on image size
- Formula: `(base64Length * 3/4 / 1MB) * 1500 tokens/MB + 600 text tokens`

### clientStorage Flow
1. User enters API key
2. First AI call succeeds → `figma.clientStorage.setAsync(key)`
3. Plugin reopens → `figma.clientStorage.getAsync()` → auto-fills input
4. User clicks Clear → `figma.clientStorage.deleteAsync()` → input blanks

## Breaking Changes

None — fully backward compatible. Existing workflows (text-only, no key persistence) still work exactly as before.

## What's Next (Future)

- Export vision analysis to structured handoff doc (Markdown/Notion)
- Batch vision analysis with smart caching (don't re-analyze unchanged frames)
- Custom rule templates per project (saved in `figma.clientStorage`)
- Figma Dev Mode integration (code snippets + annotations)
- Multi-language support for prompts

## Metrics

**Bundle sizes**:
- `dist/code.js`: 77.2 KB (was 62 KB) — added screenshot export + vision handler
- `dist/ui.js`: 31.0 KB (was 22 KB) — added vision flow + clientStorage + redesigned UI
- `dist/ui.html`: 39 KB (inlined CSS+JS)

**Lint**: Clean ✓
**Build time**: ~60ms (esbuild watch mode)
