# Sarina Handoff Cleanup AI

Professional Figma plugin for developer handoff: audit selection, rename frames intelligently (local + AI), add rich annotation nodes with Vision AI analysis, batch apply with progress tracking, and export JSON reports.

## Features

### 🎨 Smart Frame Renaming
- **Local heuristics**: Detects UI patterns (Login, Dashboard, Settings, etc.), adds breakpoint suffixes (Mobile/Tablet/Desktop), and applies consistent naming styles
- **AI-powered**: Claude suggests semantic frame names based on content analysis
- **Live preview**: See proposed names before applying

### 🔍 Vision AI Analysis (NEW)
- **Screenshot analysis**: Sends JPEG screenshots (max 1500px, auto-downscaled) to Claude Vision API
- **Deep insights**: Analyzes layout/spacing issues, accessibility (contrast, text size), UX patterns (CTAs, navigation, forms), and design consistency
- **Cost-aware**: Opt-in per run with token estimate (~1,500-2,500 tokens/frame vs ~600 text-only)

### 📝 Rich Annotations
- Creates `[HC] Annotation` cards on canvas linked to source frames via `setPluginData`
- Includes: screen summary, handoff bullets, layout warnings (⚠️), a11y checks (♿️), consistency notes (🎨)
- Updates existing annotations on re-run (no duplicates)

### ⚡ Per-Tab Actions
- **Selection**: Scan selection → preflight stats (frames, descendants, AI eligibility)
- **Rename**: Preview renames → diff table (current vs local vs AI)
- **Annotations**: Analyze with AI → text or vision mode
- **Apply**: Bulk operations → rename/annotate/both (local or AI)

### 🔐 API Key Persistence
- Saved to `figma.clientStorage` after first successful call
- Auto-loads on plugin open
- Clear button for security
- "Key stored locally on this machine only" banner

## Setup

1. Get a plugin ID from Figma:
   - **Plugins → Development → New plugin…** → copy the `id` from generated `manifest.json`
   - Paste into [manifest.json](manifest.json) replacing `1628512025178676656` (or your current ID)
2. `npm install`
3. `npm run build`
4. Figma → **Plugins → Development → Import plugin from manifest** → select this folder's `manifest.json`

## Development

```bash
npm run dev
```

Watches `src/` and rebuilds on change. Reload the plugin in Figma after builds.

**Note**: The build inlines CSS + JS into `dist/ui.html` because `figma.showUI(__html__, …)` loads from a string (no file URL), so external `<script src="./ui.js">` won't resolve.

## AI Usage

1. Enter your **Anthropic API key** in the Apply tab (or it auto-loads if saved)
2. Select frames → **Selection tab** → ⚡ Scan Selection
3. Choose analysis mode:
   - **Text-only** (~600 tokens/frame): Uses text content extracted from layers
   - **Vision** (~1,500-2,500 tokens/frame): Sends screenshot + analyzes visuals
4. **Annotations tab** → 💬 Analyze (Text) or 🔍 Analyze (Vision)
5. **Apply tab** → Apply actions

Key saved after first successful call. Clear with 🗑 button if needed.

## Safety Limits

- Max **50** selected frames/sections
- Max **2,000** descendants for annotations + AI; **10,000** for rename-only
- Max **12k** visible text chars for AI text payload
- Batches of **10** frames with progress + cancel
- Vision screenshots: max **1500px** width, JPEG 0.8 quality

## Vision Analysis Coverage

When enabled, Claude Vision examines:
- **Layout/spacing**: Uneven spacing, misalignment, weak hierarchy
- **Accessibility**: Color contrast (WCAG), font sizes, touch targets
- **UX patterns**: CTA clarity, navigation structure, form usability, error/empty states
- **Consistency**: Design token gaps, style deviations (buttons, spacing, colors, typography)

Results appear as emoji-tagged bullets in annotation cards:
- ⚠️ Layout issues
- ♿️ A11y warnings
- 🎨 Consistency notes

## Figma Publish Listing Copy

**Tagline**
AI-powered handoff notes and smart renaming in one click.

**Short Description**
Analyze selected frames with AI, generate polished handoff annotations, and apply smarter naming in one guided flow.

**Full Description**
Sarina Handoff Cleanup AI turns selected frames into clean, developer-ready handoff documentation.

What you can do:
- Generate AI annotation cards with layout, UX, and accessibility recommendations
- Apply AI-powered frame renaming for cleaner structure and easier collaboration
- Run a guided Analyze + Apply workflow with progress, status, and exportable reports
- Keep everything inside Figma with a focused, lightweight UI

Built for designers and product teams that want faster, clearer handoff without manual cleanup.


## About Sarina

**In loving memory of Sarina Esmailzadeh.**

She was a  16-year-old teenager, she was a YouTube content creator posting videos about normal teenage life—family trips, making food—alongside her keen observations on the situation of Iranian women and Iranians under authoritarian rule.

In September 2022, she was murdered by Iranian authorities while protesting in the name of "Women, Life, Freedom," moved by the death of Mahsa Amini. She was killed by severe beating with batons to the head by IRGC security forces WNcri. Authorities falsely claimed she died by suicide, which human rights organizations strongly condemned.

Her death—along with at least 43 other children killed by authorities—represents the crackdown on a fearless generation of Iranian youth demanding freedom and dignity.
