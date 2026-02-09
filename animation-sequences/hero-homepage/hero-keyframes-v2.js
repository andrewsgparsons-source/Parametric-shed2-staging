/**
 * Hero Homepage Animation Keyframe Generator v2
 * 
 * Spec (2026-02-07 10:36):
 * - Frames 0-29: Stationary camera, dimensions morph 1800×2400 → 3400×5000
 * - Frames 30-389: v7 orbit (360 frames), dimensions stay at 3400×5000
 *   - Roof changes: Apex → Pent (25%) → Hipped (50%) → Apex (66%)
 *   - Hipped roof heightToCrest = 3600mm
 * - Frames 390-419: Stationary camera, dimensions morph 3400×5000 → 1800×2400
 * - Camera zoomed out enough to keep 3400×5000 model in view
 * - Control panel always hidden
 */

const EXPAND_FRAMES = 30;    // Frames for dimension expansion
const ORBIT_FRAMES = 360;    // Frames for orbit
const CONTRACT_FRAMES = 30;  // Frames for dimension contraction
const TOTAL_FRAMES = EXPAND_FRAMES + ORBIT_FRAMES + CONTRACT_FRAMES; // 420

const FPS = 12;

// Camera path from orbit-v3-ISSUED (adjusted for larger model)
// Increased radius to keep 3400×5000 model in view
const CAMERA = {
  alpha: { start: -2.15, delta: 2 * Math.PI }, // Full 360° rotation
  beta: { eyeLevel: 1.25, elevated: 1.0 },
  radius: { wide: 14, close: 10 },  // Increased further to prevent clipping at 3400×5000
  target: { x: 1.7, y: 0.75, z: 1.25 }  // Adjusted target for larger model center
};

// Stationary camera position (for expand/contract phases)
const STATIONARY_CAMERA = {
  alpha: -2.15,
  beta: 1.25,
  radius: 14,  // Match wide radius to prevent clipping
  target: { x: 1.7, y: 0.75, z: 1.25 }
};

// Dimension keyframes
const DIM = {
  start: { w: 1800, d: 2400 },
  max:   { w: 3400, d: 5000 }
};

// Roof heights
const ROOF_HEIGHTS = {
  apex: { eaves: 1850, crest: 2200 },
  pent: { min: 2300, max: 2500 },
  hipped: { eaves: 1850, crest: 3600 }  // Hipped crest at 3600 as requested
};

/**
 * Trapezoidal easing for camera orbit
 */
function trapezoidalEase(t) {
  if (t < 0.333) {
    const localT = t / 0.333;
    return 0.333 * localT * localT;
  } else if (t < 0.667) {
    return 0.333 + (t - 0.333);
  } else {
    const localT = (t - 0.667) / 0.333;
    return 0.667 + 0.333 * (2 * localT - localT * localT);
  }
}

/**
 * Linear interpolation
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Get camera for orbit frame (0-359)
 */
function getOrbitCamera(orbitFrame) {
  const t = orbitFrame / ORBIT_FRAMES;
  const easedT = trapezoidalEase(t);
  const orbitAngle = easedT * 2 * Math.PI;
  
  return {
    alpha: CAMERA.alpha.start + easedT * CAMERA.alpha.delta,
    beta: lerp(CAMERA.beta.eyeLevel, CAMERA.beta.elevated, 0.5 - 0.5 * Math.cos(orbitAngle)),
    radius: lerp(CAMERA.radius.wide, CAMERA.radius.close, 0.5 - 0.5 * Math.cos(orbitAngle)),
    target: CAMERA.target
  };
}

/**
 * Get roof style and params for orbit frame
 */
function getRoofForOrbitFrame(orbitFrame) {
  const t = orbitFrame / ORBIT_FRAMES;
  
  if (t < 0.25) {
    return { style: 'apex', apex: { heightToEaves_mm: ROOF_HEIGHTS.apex.eaves, heightToCrest_mm: ROOF_HEIGHTS.apex.crest } };
  } else if (t < 0.50) {
    return { style: 'pent', pent: { minHeight_mm: ROOF_HEIGHTS.pent.min, maxHeight_mm: ROOF_HEIGHTS.pent.max } };
  } else if (t < 0.66) {
    return { style: 'hipped', hipped: { heightToEaves_mm: ROOF_HEIGHTS.hipped.eaves, heightToCrest_mm: ROOF_HEIGHTS.hipped.crest } };
  } else {
    return { style: 'apex', apex: { heightToEaves_mm: ROOF_HEIGHTS.apex.eaves, heightToCrest_mm: ROOF_HEIGHTS.apex.crest } };
  }
}

/**
 * Generate all keyframes
 */
function generateKeyframes() {
  const keyframes = [];
  
  // Phase 1: Expand dimensions (frames 0-29)
  for (let i = 0; i < EXPAND_FRAMES; i++) {
    const t = i / (EXPAND_FRAMES - 1);
    const w = Math.round(lerp(DIM.start.w, DIM.max.w, t));
    const d = Math.round(lerp(DIM.start.d, DIM.max.d, t));
    
    keyframes.push({
      frame: i,
      phase: 'expand',
      camera: STATIONARY_CAMERA,
      state: {
        dim: { frameW_mm: w, frameD_mm: d },
        roof: { style: 'apex', apex: { heightToEaves_mm: ROOF_HEIGHTS.apex.eaves, heightToCrest_mm: ROOF_HEIGHTS.apex.crest } },
        walls: {
          openings: [{
            id: 'door1', wall: 'front', type: 'door', enabled: true,
            isOpen: false, x_mm: 500, width_mm: 900, height_mm: 1800,
            style: 'standard', handleSide: 'left'
          }]
        }
      }
    });
  }
  
  // Phase 2: Orbit (frames 30-389)
  for (let i = 0; i < ORBIT_FRAMES; i++) {
    const globalFrame = EXPAND_FRAMES + i;
    const camera = getOrbitCamera(i);
    const roof = getRoofForOrbitFrame(i);
    
    keyframes.push({
      frame: globalFrame,
      phase: 'orbit',
      orbitFrame: i,
      camera: camera,
      state: {
        dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
        roof: roof,
        walls: {
          openings: [{
            id: 'door1', wall: 'front', type: 'door', enabled: true,
            isOpen: false, x_mm: 500, width_mm: 900, height_mm: 1800,
            style: 'standard', handleSide: 'left'
          }]
        }
      }
    });
  }
  
  // Phase 3: Contract dimensions (frames 390-419)
  for (let i = 0; i < CONTRACT_FRAMES; i++) {
    const globalFrame = EXPAND_FRAMES + ORBIT_FRAMES + i;
    const t = i / (CONTRACT_FRAMES - 1);
    const w = Math.round(lerp(DIM.max.w, DIM.start.w, t));
    const d = Math.round(lerp(DIM.max.d, DIM.start.d, t));
    
    keyframes.push({
      frame: globalFrame,
      phase: 'contract',
      camera: STATIONARY_CAMERA,
      state: {
        dim: { frameW_mm: w, frameD_mm: d },
        roof: { style: 'apex', apex: { heightToEaves_mm: ROOF_HEIGHTS.apex.eaves, heightToCrest_mm: ROOF_HEIGHTS.apex.crest } },
        walls: {
          openings: [{
            id: 'door1', wall: 'front', type: 'door', enabled: true,
            isOpen: false, x_mm: 500, width_mm: 900, height_mm: 1800,
            style: 'standard', handleSide: 'left'
          }]
        }
      }
    });
  }
  
  return keyframes;
}

// Generate and output
const keyframes = generateKeyframes();
console.log(JSON.stringify(keyframes, null, 2));
