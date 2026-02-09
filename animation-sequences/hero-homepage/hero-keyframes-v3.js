/**
 * Hero Homepage Animation Keyframe Generator v3
 * 
 * SEQUENCE:
 * 1. ZOOM IN (30 frames) - camera approaches, dimensions static
 * 2. DIMENSION EXPAND (30 frames) - morph 1800×2400 → 3400×5000
 * 3. ORBIT (360 frames base) - fly around with roof changes + pauses
 *    - @ 25%: Apex → Pent (5-frame pause)
 *    - @ 50%: Pent → Hipped (2-frame pause + 15-frame crest morph 2400→3400)
 *    - @ 66%: Hipped → Apex (5-frame pause)
 * 4. ZOOM OUT (30 frames) - camera retreats, dimensions static
 * 5. DIMENSION CONTRACT (30 frames) - morph 3400×5000 → 1800×2400
 * 
 * HARD RULES:
 * - Control panel hidden
 * - No clipping (radius ≥ 10)
 * - 12 fps
 */

const FPS = 12;

// Phase durations
const ZOOM_IN_FRAMES = 30;
const EXPAND_FRAMES = 30;
const ORBIT_BASE_FRAMES = 360;  // Before adding pauses
const ZOOM_OUT_FRAMES = 30;
const CONTRACT_FRAMES = 30;

// Camera settings (safe radius to prevent clipping)
// FIXED RADIUS during orbit - shed stays centered, no apparent movement
const CAMERA = {
  target: { x: 1.7, y: 0.75, z: 1.25 },
  zoomIn: { startRadius: 18, endRadius: 12 },  // Closer start allowed with fixed orbit
  zoomOut: { startRadius: 12, endRadius: 18 },
  orbit: {
    alpha: { start: -2.15, delta: 2 * Math.PI },
    beta: { eyeLevel: 1.25, elevated: 1.0 },
    radius: 12  // FIXED - no oscillation, pure rotation around center
  }
};

// Dimensions
const DIM = {
  start: { w: 1800, d: 2400 },
  max: { w: 3400, d: 5000 }
};

// Roof configurations
const ROOF = {
  apex: { 
    style: 'apex', 
    apex: { heightToEaves_mm: 1850, heightToCrest_mm: 2200 }
  },
  pent: { 
    style: 'pent', 
    pent: { minHeight_mm: 2300, maxHeight_mm: 2500 }
  },
  hipped: (crestHeight) => ({ 
    style: 'hipped', 
    hipped: { heightToEaves_mm: 1850, heightToCrest_mm: crestHeight }
  })
};

// Default door state
const DOOR = [{
  id: 'door1', wall: 'front', type: 'door', enabled: true,
  isOpen: false, x_mm: 500, width_mm: 900, height_mm: 1800,
  style: 'standard', handleSide: 'left'
}];

// Helpers
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function trapezoidalEase(t) {
  if (t < 0.333) return 0.333 * (t / 0.333) ** 2;
  if (t < 0.667) return 0.333 + (t - 0.333);
  const lt = (t - 0.667) / 0.333;
  return 0.667 + 0.333 * (2 * lt - lt * lt);
}

function getOrbitCamera(orbitProgress) {
  const easedT = trapezoidalEase(orbitProgress);
  const orbitAngle = easedT * 2 * Math.PI;
  return {
    alpha: CAMERA.orbit.alpha.start + easedT * CAMERA.orbit.alpha.delta,
    beta: lerp(CAMERA.orbit.beta.eyeLevel, CAMERA.orbit.beta.elevated, 0.5 - 0.5 * Math.cos(orbitAngle)),
    radius: CAMERA.orbit.radius,  // FIXED radius - pure rotation around center
    target: CAMERA.target
  };
}

function generateKeyframes() {
  const keyframes = [];
  let frame = 0;

  // ============================================
  // PHASE 1: ZOOM IN (30 frames)
  // ============================================
  for (let i = 0; i < ZOOM_IN_FRAMES; i++) {
    const t = easeInOut(i / (ZOOM_IN_FRAMES - 1));
    keyframes.push({
      frame: frame++,
      phase: 'zoom-in',
      camera: {
        alpha: CAMERA.orbit.alpha.start,
        beta: CAMERA.orbit.beta.eyeLevel,
        radius: lerp(CAMERA.zoomIn.startRadius, CAMERA.zoomIn.endRadius, t),
        target: CAMERA.target
      },
      state: {
        dim: { frameW_mm: DIM.start.w, frameD_mm: DIM.start.d },
        roof: ROOF.apex,
        walls: { openings: DOOR }
      }
    });
  }

  // ============================================
  // PHASE 2: DIMENSION EXPAND (30 frames)
  // ============================================
  const expandCamera = {
    alpha: CAMERA.orbit.alpha.start,
    beta: CAMERA.orbit.beta.eyeLevel,
    radius: CAMERA.zoomIn.endRadius,
    target: CAMERA.target
  };

  for (let i = 0; i < EXPAND_FRAMES; i++) {
    const t = i / (EXPAND_FRAMES - 1);
    keyframes.push({
      frame: frame++,
      phase: 'expand',
      camera: expandCamera,
      state: {
        dim: { 
          frameW_mm: Math.round(lerp(DIM.start.w, DIM.max.w, t)),
          frameD_mm: Math.round(lerp(DIM.start.d, DIM.max.d, t))
        },
        roof: ROOF.apex,
        walls: { openings: DOOR }
      }
    });
  }

  // ============================================
  // PHASE 3: ORBIT WITH ROOF CHANGES
  // ============================================
  
  // Roof change schedule (as fraction of orbit)
  // @ 25%: Apex → Pent (5-frame pause)
  // @ 50%: Pent → Hipped (2-frame pause + 15-frame morph)
  // @ 66%: Hipped → Apex (5-frame pause)
  
  const PENT_AT = 0.25;
  const HIPPED_AT = 0.50;
  const APEX_AT = 0.66;
  
  const STANDARD_PAUSE = 5;
  const HIPPED_PAUSE = 2;
  const HIPPED_MORPH_FRAMES = 15;
  const HIPPED_CREST_START = 2400;
  const HIPPED_CREST_END = 3400;

  let currentRoof = 'apex';
  let orbitFrame = 0;
  
  while (orbitFrame < ORBIT_BASE_FRAMES) {
    const orbitProgress = orbitFrame / ORBIT_BASE_FRAMES;
    const camera = getOrbitCamera(orbitProgress);
    
    // Check for roof changes
    if (currentRoof === 'apex' && orbitProgress >= PENT_AT && orbitProgress < PENT_AT + 0.01) {
      // APEX → PENT: 5-frame pause
      currentRoof = 'pent';
      
      // Frame 1: make the change
      keyframes.push({
        frame: frame++,
        phase: 'orbit-change',
        orbitFrame,
        change: 'apex->pent',
        camera,
        state: {
          dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
          roof: ROOF.pent,
          walls: { openings: DOOR }
        }
      });
      
      // Frames 2-5: hold
      for (let h = 0; h < STANDARD_PAUSE - 1; h++) {
        keyframes.push({
          frame: frame++,
          phase: 'orbit-hold',
          orbitFrame,
          camera,
          state: {
            dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
            roof: ROOF.pent,
            walls: { openings: DOOR }
          }
        });
      }
      orbitFrame++;
      
    } else if (currentRoof === 'pent' && orbitProgress >= HIPPED_AT && orbitProgress < HIPPED_AT + 0.01) {
      // PENT → HIPPED: 2-frame pause, then 15-frame crest morph
      currentRoof = 'hipped';
      
      // 2-frame pause at crest 2400
      for (let h = 0; h < HIPPED_PAUSE; h++) {
        keyframes.push({
          frame: frame++,
          phase: h === 0 ? 'orbit-change' : 'orbit-hold',
          orbitFrame,
          change: h === 0 ? 'pent->hipped' : undefined,
          camera,
          state: {
            dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
            roof: ROOF.hipped(HIPPED_CREST_START),
            walls: { openings: DOOR }
          }
        });
      }
      
      // 15-frame crest morph
      for (let m = 0; m < HIPPED_MORPH_FRAMES; m++) {
        const morphT = (m + 1) / HIPPED_MORPH_FRAMES;
        const morphProgress = (orbitFrame + morphT) / ORBIT_BASE_FRAMES;
        const morphCamera = getOrbitCamera(morphProgress);
        const crest = Math.round(lerp(HIPPED_CREST_START, HIPPED_CREST_END, morphT));
        
        keyframes.push({
          frame: frame++,
          phase: 'orbit-morph',
          orbitFrame: orbitFrame + morphT,
          morphProgress: morphT,
          camera: morphCamera,
          state: {
            dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
            roof: ROOF.hipped(crest),
            walls: { openings: DOOR }
          }
        });
      }
      orbitFrame++;
      
    } else if (currentRoof === 'hipped' && orbitProgress >= APEX_AT && orbitProgress < APEX_AT + 0.01) {
      // HIPPED → APEX: 5-frame pause
      currentRoof = 'apex-final';
      
      // Frame 1: make the change
      keyframes.push({
        frame: frame++,
        phase: 'orbit-change',
        orbitFrame,
        change: 'hipped->apex',
        camera,
        state: {
          dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
          roof: ROOF.apex,
          walls: { openings: DOOR }
        }
      });
      
      // Frames 2-5: hold
      for (let h = 0; h < STANDARD_PAUSE - 1; h++) {
        keyframes.push({
          frame: frame++,
          phase: 'orbit-hold',
          orbitFrame,
          camera,
          state: {
            dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
            roof: ROOF.apex,
            walls: { openings: DOOR }
          }
        });
      }
      orbitFrame++;
      
    } else {
      // Normal orbit frame
      const roof = currentRoof === 'hipped' ? ROOF.hipped(HIPPED_CREST_END) : 
                   currentRoof === 'pent' ? ROOF.pent : ROOF.apex;
      
      keyframes.push({
        frame: frame++,
        phase: 'orbit',
        orbitFrame,
        camera,
        state: {
          dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
          roof,
          walls: { openings: DOOR }
        }
      });
      orbitFrame++;
    }
  }

  // ============================================
  // PHASE 4: ZOOM OUT (30 frames)
  // ============================================
  const finalOrbitCamera = getOrbitCamera(1.0);
  
  for (let i = 0; i < ZOOM_OUT_FRAMES; i++) {
    const t = easeInOut(i / (ZOOM_OUT_FRAMES - 1));
    keyframes.push({
      frame: frame++,
      phase: 'zoom-out',
      camera: {
        alpha: finalOrbitCamera.alpha,
        beta: CAMERA.orbit.beta.eyeLevel,
        radius: lerp(CAMERA.zoomOut.startRadius, CAMERA.zoomOut.endRadius, t),
        target: CAMERA.target
      },
      state: {
        dim: { frameW_mm: DIM.max.w, frameD_mm: DIM.max.d },
        roof: ROOF.apex,
        walls: { openings: DOOR }
      }
    });
  }

  // ============================================
  // PHASE 5: DIMENSION CONTRACT (30 frames)
  // ============================================
  const contractCamera = {
    alpha: finalOrbitCamera.alpha,
    beta: CAMERA.orbit.beta.eyeLevel,
    radius: CAMERA.zoomOut.endRadius,
    target: CAMERA.target
  };

  for (let i = 0; i < CONTRACT_FRAMES; i++) {
    const t = i / (CONTRACT_FRAMES - 1);
    keyframes.push({
      frame: frame++,
      phase: 'contract',
      camera: contractCamera,
      state: {
        dim: { 
          frameW_mm: Math.round(lerp(DIM.max.w, DIM.start.w, t)),
          frameD_mm: Math.round(lerp(DIM.max.d, DIM.start.d, t))
        },
        roof: ROOF.apex,
        walls: { openings: DOOR }
      }
    });
  }

  return keyframes;
}

// Generate and output
const keyframes = generateKeyframes();
console.log(JSON.stringify(keyframes, null, 2));

// Summary to stderr
const phases = {};
keyframes.forEach(k => { phases[k.phase] = (phases[k.phase] || 0) + 1; });

console.error(`\n=== v3 Summary ===`);
console.error(`Total frames: ${keyframes.length}`);
console.error(`Duration: ${(keyframes.length / FPS).toFixed(1)}s @ ${FPS}fps`);
console.error(`\nPhases:`);
Object.entries(phases).forEach(([p, c]) => console.error(`  ${p}: ${c} frames`));
