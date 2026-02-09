# 🚨 HIPPED WALLS FIX - BREADCRUMB FILE

**Created:** 2026-02-02
**Status:** The code IS already wired up - debugging needed to see why it's not working

## The Problem
Walls are not respecting the "height at eaves" parameter for hipped roofs.

## Where The Code Lives

### 1. walls.js - The Height Calculation (lines 81-97)
```javascript
// In build3D() function:
} else if (roofStyle === "hipped") {
    const hippedH = resolveHippedHeightsMm(state);
    console.log(`[WALLS_HIPPED_DEBUG] hippedH=`, hippedH);
    if (hippedH && Number.isFinite(hippedH.eaves_mm)) {
      const minWallH_mm = Math.max(100, 2 * 50 + 1);
      height = Math.max(minWallH_mm, Math.floor(hippedH.eaves_mm - WALL_RISE_MM));
      console.log(`[WALLS-HIPPED] Height to Eaves: ${hippedH.eaves_mm}mm, ...`);
    }
}
```

### 2. walls.js - resolveHippedHeightsMm() function (line 4455)
```javascript
function resolveHippedHeightsMm(state) {
  const hipped = state && state.roof && state.roof.hipped ? state.roof.hipped : null;
  // Looks for: hipped.heightToEaves_mm, hipped.eavesHeight_mm, etc.
  // Falls back to apex values, then defaults (1850 eaves / 2400 crest)
}
```

### 3. index.js - UI Wiring (lines 3790-3802, 3935)
```javascript
// When roof style changes to hipped:
if (v === "hipped") {
  store.setState({ roof: { style: v, hipped: { heightToEaves_mm: eavesVal, heightToCrest_mm: crestVal } } });
}

// When height inputs change:
store.setState({ roof: { hipped: { heightToEaves_mm: eaves, heightToCrest_mm: crest } } });
```

### 4. index.html - Input IDs
- Eaves input: `id="roofHippedEaveHeight"` (line 269)
- Crest input: `id="roofHippedCrestHeight"` (line 274)

## Debug Steps
1. Open browser console
2. Select "Hipped (4 slopes)" from Roof Type dropdown
3. Look for console logs:
   - `[ROOF_STYLE_CHANGE] Initializing hipped heights: eaves=..., crest=...`
   - `[WALLS_HEIGHT_DEBUG] roofStyle="hipped", state.roof.style=...`
   - `[WALLS_HIPPED_DEBUG] hippedH=...`
   - `[WALLS-HIPPED] Height to Eaves: ...`

4. If `hippedH` shows null/undefined values, the state isn't being set correctly
5. Check `window.__dbg.store.getState().roof` to see actual state

## Quick Console Test
```javascript
// In browser console:
const s = window.__dbg.store.getState();
console.log('roof state:', s.roof);
console.log('hipped heights:', s.roof?.hipped);

// Force a rebuild with explicit heights:
window.__dbg.store.setState({
  roof: { 
    style: 'hipped', 
    hipped: { heightToEaves_mm: 2000, heightToCrest_mm: 2400 } 
  }
});
```

## Files Modified
- `/docs/src/elements/walls.js` - Core height logic
- `/docs/src/index.js` - UI wiring
- `/docs/index.html` - Input elements

## WALL_RISE_MM = 168
This is the floor frame rise applied externally via shiftWallMeshes().
Wall frame height = eaves_mm - 168mm
