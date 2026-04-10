# PROJECT CONTEXT - BSC Configurator (Parametric Shed)

**Project:** Bespoke Shed Company 3D Configurator  
**Repository:** https://github.com/andrewsgparsons-source/Parametric-shed2-staging  
**Live:** http://localhost:8080 (via `npx pm2 start shed-configurator`)  
**Tech Stack:** Babylon.js, JavaScript, GitHub Pages hosting

---

## Purpose

Interactive 3D configurator allowing customers to design bespoke garden buildings (sheds, offices, workshops) and get instant pricing. Makes complex parametric design accessible to non-technical users.

---

## Architecture Overview

### Core Files

**HTML/Entry:**
- `docs/index.html` — Main configurator page
- `docs/theme-loader.js` — Detects mobile, loads appropriate theme
- `docs/mobile-theme.html` — Mobile-optimized version

**3D Engine:**
- `docs/js/main.js` — Babylon.js scene setup, camera, lights
- `docs/js/shed.js` — Main shed class, orchestrates all components
- `docs/js/components/` — Modular building components:
  - `floor.js` — Base floor structure
  - `walls.js` — Wall geometry, door/window cutouts
  - `roof.js` — Roof types (apex, pent, etc.)
  - `doors.js` — Door styles and placement
  - `windows.js` — Window types and positioning
  - `cladding.js` — External cladding materials
  - `trim.js` — Corner trims, fascias

**UI/Controls:**
- `docs/js/ui.js` — Control panel, sliders, dropdowns
- `docs/css/style.css` — Desktop styling
- `docs/css/mobile.css` — Mobile-specific styles

**State Management:**
- `docs/js/state.js` — Configuration state, URL encoding/decoding
- `docs/js/bom.js` — Bill of materials calculation
- `docs/js/pricing.js` — Dynamic pricing logic

**Animation System:**
- `animation-sequences/` — Keyframe definitions for video capture
- `docs/js/animation.js` — Animation player

**Build Management:**
- `docs/build.txt` — Current git commit hash (shown in UI)
- Updated manually after staging commits: `git rev-parse --short HEAD > docs/build.txt`

---

## Conventions & Patterns

### Coordinate System
- Babylon.js uses: +Y up, +X right, +Z forward
- Shed dimensions: `width_mm` (X), `depth_mm` (Z), `height_mm` (Y)
- Origin: Center of floor base

### Naming Convention
- Mesh names: `${componentType}_${index}` (e.g., `wall_0`, `door_1`)
- Material names: `${type}Material` (e.g., `claddingMaterial`)
- State keys: `${component}_${property}` (e.g., `door_width_mm`)

### State Management
- All configuration stored in single `state` object
- Changes trigger: `shed.updateFromState()` → rebuilds affected components
- State encoded in URL for sharing: `?config=base64encodedJSON`

### Units
- All dimensions stored in millimeters (`_mm` suffix)
- UI displays in meters or feet (user preference)
- BOM/pricing uses meters for material calculations

### Component Pattern
Each component module exports:
```javascript
{
  create(scene, state) { /* build geometry */ },
  update(meshes, state) { /* modify existing */ },
  dispose(meshes) { /* cleanup */ }
}
```

---

## Working Modes

### Development Mode
- Edit files in `docs/` directory
- Test locally: `npx pm2 start shed-configurator` (serves on port 8080)
- Browser: `http://localhost:8080`

### Staging Deployment
1. Make changes in `docs/`
2. Test locally
3. Commit to `main` branch
4. Update build code: `git rev-parse --short HEAD > docs/build.txt`
5. Push to GitHub → auto-deploys to GitHub Pages
6. Live at: https://andrewsgparsons-source.github.io/Parametric-shed2-staging/

### Production (When Ready)
- Will deploy to: my3dbuild.co.uk/configurator (or subdomain)
- Currently staging-only

---

## Animation Workflow

See `docs/ANIMATION-CAPTURE-PIPELINE.md` for full details.

**Quick overview:**
1. Define sequence in `animation-sequences/sequence-name.json`
2. Load sequence via URL: `?sequence=sequence-name`
3. Capture frames using remote browser control
4. Compile to video with ffmpeg

**Standards:**
- 12 fps (Andrew's preferred)
- Rotation: ~0.035 rad/frame (feels right)
- ALWAYS hide control panel before capture
- Check zoom to prevent clipping

---

## Testing & Quality Assurance

### Red/Green TDD (MANDATORY)

**All changes MUST use red/green test-driven development** to prevent drift and unwanted changes.

**One-line prompt for agents:**
```
Use red/green TDD
```

**What this means:**
1. Agent writes test FIRST (before implementing feature)
2. Runs test and watches it FAIL (RED - proves test works)
3. Implements the feature
4. Runs ALL tests (old + new) and watches them PASS (GREEN)

**Why this matters:**
- Prevents drift (new features won't break old functionality)
- Tests accumulate automatically (you don't write them manually)
- Agent catches breaking changes before they're committed
- Over time, builds a comprehensive test suite organically

**Test Location:**
- Tests should live in `tests/` directory (create if doesn't exist)
- Use simple test framework (e.g., browser-based assertions)
- Agent decides test structure - you just request "use red/green TDD"

**Key Rule:**
If making changes to core components (shed.js, state.js, any component in components/), ALWAYS include "use red/green TDD" in the prompt.

---

## Key Constraints (Hard Rules)

**From truth layer work (Q3 2026 priority):**
- Door width ≤ wall width (prevent impossible designs)
- Roof pitch ≥ 15° (structural requirement)
- Window placement doesn't overlap doors
- Min/max dimensions per building code

*Note: Currently not all constraints enforced in code - manual checking needed. Truth layer will automate this.*

---

## Browser Access

**For visual testing/screenshots:**
- Andrew's Windows Chrome with remote debugging
- Use `profile="windows"` in browser tool (NOT "chrome" or "clawd")
- WSL sandbox browser doesn't render WebGL properly
- Connection: `http://172.27.112.1:9222`

---

## Deployment Checklist

Before committing to staging:
- [ ] Test on desktop browser (full feature set)
- [ ] Test on mobile (UI responsiveness)
- [ ] Update `docs/build.txt` with commit hash
- [ ] Check console for errors
- [ ] Verify state encoding/decoding works
- [ ] Test BOM calculation accuracy

---

## Common Tasks

### Add New Component
1. Create `docs/js/components/newcomponent.js`
2. Follow component pattern (create, update, dispose)
3. Import in `main.js`
4. Add to `shed.js` orchestration
5. Add UI controls in `ui.js`
6. Update state management in `state.js`

### Change Material/Texture
1. Edit material definitions in relevant component
2. Check WebGL compatibility (some textures fail on mobile)
3. Test on both desktop and mobile

### Fix Mobile Issue
1. Check `theme-loader.js` detection logic
2. Edit `mobile-theme.html` or `mobile.css`
3. Test on actual device (not just browser DevTools)

---

## Known Issues / Quirks

- **Mobile WebGL:** Some advanced materials don't render on mobile → use simpler fallbacks
- **URL Length:** Complex configurations create very long URLs → consider compression
- **Animation Clipping:** Must manually set zoom to prevent 3D extending outside viewport
- **Build Code:** Must manually update after commits (not automated yet)

---

## Future Work (Queued)

**Q2 2026:**
- Conversion tracking (landing → start → quote → deposit)
- Deliverables quality improvement (BOM, PDF output)
- Basic constraint validation

**Q3 2026:**
- Truth layer implementation (automated constraint checking)
- Version stamping (BOM consistency)
- Pricing stability improvements

---

## Resources

- **Babylon.js Docs:** https://doc.babylonjs.com/
- **GitHub Repo:** https://github.com/andrewsgparsons-source/Parametric-shed2-staging
- **Project Board:** https://andrewsgparsons-source.github.io/shed-project-board/
- **Animation Guide:** `docs/ANIMATION-CAPTURE-PIPELINE.md`
- **Shed Link Builder:** `docs/SHED-LINK-BUILDER.md`

---

**Last Updated:** 2026-03-18  
**Maintained By:** James (AI assistant) + Andrew
