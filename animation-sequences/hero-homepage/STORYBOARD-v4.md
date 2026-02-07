# Hero Homepage Animation - Storyboard v4

**Created:** 2026-02-07 12:24 GMT  
**Status:** Approved baseline for further iteration  
**Video:** `hero-v4.mp4` (504 frames, 42s @ 12fps)

---

## Sequence Overview

| Phase | Frames | Duration | Description |
|-------|--------|----------|-------------|
| 1. Zoom In | 0-29 | 2.5s | Camera approaches shed |
| 2. Expand | 30-59 | 2.5s | Dimensions morph 1800×2400 → 3400×5000 |
| 3. Orbit | 60-443 | 32s | 360° rotation with roof changes |
| 4. Zoom Out | 444-473 | 2.5s | Camera retreats |
| 5. Contract | 474-503 | 2.5s | Dimensions morph back to 1800×2400 |

**Total:** 504 frames / 42 seconds

---

## Camera Settings

```javascript
target: { x: 1.7, y: 0.75, z: 1.25 }  // Center of model

// Zoom phases
zoomIn:  { startRadius: 18, endRadius: 12 }
zoomOut: { startRadius: 12, endRadius: 18 }

// Orbit (FIXED radius - shed stays centered)
orbit: {
  alpha: { start: -2.15, delta: 2π },  // Full 360°
  beta:  { eyeLevel: 1.25, elevated: 1.0 },  // Elevation dip mid-orbit
  radius: 12  // FIXED - no oscillation
}
```

**Key insight:** Fixed radius during orbit prevents the "shed coming closer" effect. Camera rotates around a central axis.

---

## Phase Details

### Phase 1: Zoom In (frames 0-29)
- Camera radius: 18 → 12 (eased)
- Dimensions: static at 1800×2400
- Roof: Apex
- Door: Closed

### Phase 2: Dimension Expand (frames 30-59)
- Camera: stationary at radius 12
- Dimensions morph: 1800×2400 → 3400×5000
- Roof: Apex
- Door: Closed

### Phase 3: Orbit with Roof Changes (frames 60-443)

Camera rotates 360° with fixed radius 12. Beta oscillates for elevation dip.

#### Roof Change Schedule:

| Orbit % | Frame ~  | Change | Pause | Notes |
|---------|----------|--------|-------|-------|
| 25% | 150 | Apex → Pent | 5 frames | Standard pause |
| 50% | 240 | Pent → Hipped | 2 frames + 15 morph | Crest 2400→3400 |
| 66% | 298 | Hipped → Apex | 5 frames | Standard pause |

**Hipped roof morph:** 
- 2-frame pause at crest height 2400mm
- 15-frame morph: crest 2400 → 3400mm (steps of ~67mm)

### Phase 4: Zoom Out (frames 444-473)
- Camera radius: 12 → 18 (eased)
- Dimensions: static at 3400×5000
- Roof: Apex
- Door: Closed

### Phase 5: Dimension Contract (frames 474-503)
- Camera: stationary at radius 18
- Dimensions morph: 3400×5000 → 1800×2400
- Roof: Apex
- Door: Closed

---

## Hard Rules

1. **HIDE CONTROL PANEL** - No UI visible. Selector: `#controlPanel`
2. **NO CLIPPING** - Radius ≥ 10 during orbit
3. **5-FRAME PAUSE** - Around state changes (change on frame 1, hold 4)
4. **FIXED ORBIT RADIUS** - Shed stays centered during rotation
5. **12 FPS** - Standard frame rate

---

## Files

| File | Purpose |
|------|---------|
| `hero-keyframes-v3.js` | Keyframe generator (v4 uses same generator) |
| `keyframes-v3.json` | Generated keyframe data (504 frames) |
| `capture-v3.mjs` | CDP capture script |
| `frames-v4/` | PNG frames directory |
| `hero-v4.mp4` | Encoded video |

---

## Roof Configurations

```javascript
apex: { 
  style: 'apex', 
  apex: { heightToEaves_mm: 1850, heightToCrest_mm: 2200 }
}

pent: { 
  style: 'pent', 
  pent: { minHeight_mm: 2300, maxHeight_mm: 2500 }
}

hipped: { 
  style: 'hipped', 
  hipped: { heightToEaves_mm: 1850, heightToCrest_mm: 2400-3400 }
}
```

---

## Iteration History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-02-07 | Initial capture, control panel visible |
| v2 | 2026-02-07 | Fixed hideUI selector, increased radius |
| v3 | 2026-02-07 | Added v7 camera (zoom in/out), 5-frame pauses, hipped morph |
| v4 | 2026-02-07 | Fixed orbit radius - shed stays centered |

---

## Next Steps (pending Andrew's direction)

- [ ] Further camera adjustments?
- [ ] Different pause durations?
- [ ] Additional parametric changes?
- [ ] Door open/close animation?
