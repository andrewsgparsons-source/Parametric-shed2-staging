# UI Branch Reference — Parked Ideas

These branches were developed on 2026-02-11 as alternative UI concepts. Andrew chose **ui-comparison** as the primary UI. These remain available on the repo for future reference.

## Current (Live)
- **`main`** — The promoted ui-comparison branch. Clean developer panel with improved layout.

## Parked Branches

### `ui-wizard` (commit 1471080)
- **Concept:** Step-by-step wizard flow (like Studio Shed)
- **Colour scheme:** Earth tones — forest green (#2D5016), warm wood (#D4A574), cream (#FFF8F0)
- **Features:** Sticky summary bar, 6-step tabs, footer nav (Back/Next), live summary
- **Status:** First draft — functional but content area needs height tuning

### `ui-polished` (commit 2e03846)
- **Concept:** Improved developer panel with professional feel
- **Colour scheme:** Cool sophistication — slate (#334155), teal accent (#0D9488), light grey (#F8FAFC)
- **Features:** Refined existing panel layout, better spacing, visual hierarchy
- **Status:** First draft complete

### `ui-wild` (commit 7d6015d)
- **Concept:** Dark mode with vibrant accents — best of wizard + polished + spice
- **Colour scheme:** Charcoal (#1A1A2E), electric blue (#00D4FF), warm gold (#FFB800)
- **Features:** Dark theme, high contrast, bold accent colours
- **Status:** First draft complete

### `ui-baseline` 
- **Concept:** Untouched snapshot of the original UI before any changes
- **Purpose:** Reference point / rollback safety net

## Key Research Applied
All branches drew from:
- `research/configurator-ui-audit.md` — current UI strengths/weaknesses
- `research/competitor-ui-teardown.md` — Tesla, Studio Shed, Porsche patterns
- `research/design-tokens-draft.md` — systematic design values
- `research/ai-native-ui-patterns.md` — modern UI paradigms

## How to Revisit
```bash
git checkout ui-wizard   # or ui-polished, ui-wild, ui-baseline
npx pm2 restart shed-configurator
# View at localhost:8080
```
