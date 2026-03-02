# Material & Colour System Reference

## Overview

All materials are created during `boot()` in `renderer/babylon.js` and stored on the `scene` object as shared singletons. Element builders (`walls.js`, `roof.js`, `doors.js`, etc.) reference these via `scene._materialName`.

## Lighting Setup

- **Hemispheric light** pointing UP: `(0, 1, 0)`
  - Top-facing surfaces get full diffuse
  - Bottom-facing surfaces (soffits, floor undersides) get `groundColor: (0.35, 0.35, 0.35)` — this is why downward-facing surfaces need higher emissive to not look grey
- **No directional light** — all lighting is ambient/hemispheric

## Material Registry

### Structural Materials (in `materials` object)
| Name | Property | Colour (RGB) | Used For |
|------|----------|------|----------|
| timber | `materials.timber` | (0.72, 0.50, 0.28) | Frame studs, plates, rafters |
| plate | `materials.plate` | (0.65, 0.45, 0.25) | Top/bottom plates |
| base | `materials.base` | (0.2, 0.2, 0.2) | Base grids |
| guide | `materials.guide` | (0.7, 0.7, 0.7) α=0.5 | Transparent guides |

### Exterior Wood Materials (on `scene`)
Created via `createExteriorWoodMat()` — warm wood colour with subtle emissive self-illumination.

| Name | Property | Base Colour | Emissive | Used For |
|------|----------|------------|----------|----------|
| claddingMat | `scene._claddingMat` | (0.85, 0.64, 0.42) | scale(0.15) | Wall cladding boards |
| claddingMatLight | `scene._claddingMatLight` | (0.85, 0.64, 0.42) | scale(0.15) | Cladding fallback, general wood |
| soffitMat | `scene._soffitMat` | (0.85, 0.64, 0.42) | scale(0.35) | Soffit boards (higher emissive for downward-facing) |
| doorMat | `scene._doorMat` | (0.85, 0.64, 0.42) | scale(0.15) | Door panels |
| fasciaMat | `scene._fasciaMat` | (0.85, 0.64, 0.42) | scale(0.15) | Fascia boards (timber styles) |
| cornerMat | `scene._cornerMat` | (0.85, 0.64, 0.42) | scale(0.15) | Corner boards (timber styles) |

### Budget/Steel Materials
Created lazily via `scene.getCladdingMaterial(style, colourKey)` and cached in `scene._steelCladdingMats` / `scene._compositeCladdingMats`.

| Style | Finish | Specular |
|-------|--------|----------|
| box-profile | Metallic | (0.35, 0.35, 0.35) power 32 |
| corrugated | Metallic | (0.35, 0.35, 0.35) power 32 |
| composite-panel | Matte | (0.08, 0.08, 0.08) power 4 |
| composite-slatted | Matte | (0.08, 0.08, 0.08) power 4 |

### Budget Colour Palette (`scene._budgetColours`)
| Key | RGB | Hex |
|-----|-----|-----|
| pale-blue | (0.482, 0.655, 0.737) | #7BA7BC |
| sage-green | (0.357, 0.482, 0.369) | #5B7B5E |
| anthracite | (0.220, 0.243, 0.259) | #383E42 |
| goosewing-grey | (0.616, 0.643, 0.659) | #9DA4A8 |
| vandyke-brown | (0.353, 0.239, 0.169) | #5A3D2B |
| charcoal | (0.200, 0.200, 0.200) | — |
| stone-grey | (0.600, 0.580, 0.540) | — |
| natural-wood | (uses exteriorWoodColor) | — |

### Special Materials
| Name | Property | Used For |
|------|----------|----------|
| galvanisedGreyMat | `scene._galvanisedGreyMat` | Budget fascia, barge boards, corner flashings |

## How Colour Gets Applied — The Full Pipeline

### 1. Boot (`babylon.js`)
- Creates all base materials as scene singletons
- `exteriorWoodColor` = `(0.85, 0.64, 0.42)` — the canonical wood colour

### 2. State
- `state.cladding.style` — "shiplap", "overlap", "box-profile", "corrugated", "composite-panel", "composite-slatted"
- `state.cladding.colour` — colour key from budget palette (e.g. "sage-green", "natural-wood")
- For timber styles (shiplap, overlap, loglap): colour is always natural-wood

### 3. Wall Cladding (`walls.js`)
```
mat = scene._claddingMatLight          // default
if (budget style && colour set):
  mat = scene.getCladdingMaterial(style, colour)  // returns cached coloured material
```
- `ensureCladdingMaterialOnMeshes()` runs post-build to fix any meshes that lost their material
- `scheduleFollowUpFinalisers()` runs for 10 frames post-render to catch late additions

### 4. Roof Soffits (`roof.js`)
```
soffitMat = scene._soffitMat || scene._claddingMatLight
```
- Uses dedicated soffit material with higher emissive (0.35 vs 0.15)
- This compensates for hemispheric ground lighting making downward faces dark

### 5. Fascia & Trim
- Timber styles: `scene._fasciaMat` (wood colour)
- Budget styles: `scene._galvanisedGreyMat` (metallic grey)

### 6. Material Fixups (Safety Net)
`ensureCladdingMaterialOnMeshes()` in walls.js scans ALL meshes and fixes:
- `clad-*` → cladding material (skips budget-styled)
- `corner-board-*` → galvanised grey (budget) or wood (timber)
- `roof-fascia*`, `roof-barge*` → galvanised grey (budget only)
- `*-clad-*` or `metadata.type === "cladding"` → cladding material
- `roof-soffit*` or `metadata.part === "soffit"` → soffit material

## Known Issues & Gotchas

1. **Initial-load material stripping**: On first page load, Babylon.js 8.53 can strip materials from parented meshes during scene construction. The follow-up finalisers in walls.js catch this, but there may be a 1-2 frame flash of grey.

2. **Hemispheric ground colour**: Set to (0.35, 0.35, 0.35). Any surface facing downward gets lit primarily by this grey. Materials for downward surfaces need higher emissive to compensate.

3. **Material disposal**: `disposeAll()` uses `mesh.dispose(false, false)` which keeps materials alive. But if a material gets caught in a CSG operation's dispose chain, it can vanish from `scene.materials`. Always check `scene._materialRef` exists before assuming it's valid.

4. **Budget colour + timber style**: `getCladdingMaterial()` returns `scene._claddingMat` (wood) for ALL timber styles regardless of colour key. Colour only applies to steel/composite styles.

5. **Cache busting chain**: Changing any material file requires: `babylon.js?_v=N` → `index.js import` → `index.html script tag`. Miss one link = stale code.
