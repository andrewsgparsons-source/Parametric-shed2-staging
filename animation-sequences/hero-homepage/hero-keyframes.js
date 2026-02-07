/**
 * Hero Homepage Animation Keyframe Generator
 * 
 * Spec (2026-02-07):
 * - Camera: v7/orbit-v3 path (zoom in → orbit → zoom out)
 * - Duration: 360 frames @ 12fps = 30 seconds
 * - Dimensions: 1800×2400 → 3400×5000 → 1800×2400 (triangle wave)
 * - Roof: Apex → Pent (25%) → Hipped (50%) → Apex (66%)
 * - Door: closed throughout
 */

const TOTAL_FRAMES = 360;
const FPS = 12;

// Camera path from orbit-v3-ISSUED
const CAMERA = {
  alpha: { start: -2.15, delta: 2 * Math.PI }, // Full 360° rotation
  beta: { eyeLevel: 1.25, elevated: 1.0 },      // 1.125 + 0.125 * cos(angle)
  radius: { wide: 8.5, close: 5.5 },            // 7.0 + 1.5 * cos(angle)
  target: { x: 1.15, y: 0.75, z: 0.80 }
};

// Dimension keyframes
const DIM = {
  start: { w: 1800, d: 2400 },
  mid:   { w: 3400, d: 5000 },
  end:   { w: 1800, d: 2400 }
};

// Roof style changes (frame numbers)
const ROOF_CHANGES = [
  { frame: 0,   style: 'apex' },
  { frame: 90,  style: 'pent' },   // 25%
  { frame: 180, style: 'hipped' }, // 50%
  { frame: 240, style: 'apex' }    // 66%
];

/**
 * Trapezoidal easing for camera orbit
 */
function trapezoidalEase(t) {
  if (t < 0.333) {
    // Accelerate (quadratic in)
    const localT = t / 0.333;
    return 0.333 * localT * localT;
  } else if (t < 0.667) {
    // Constant speed (linear)
    return 0.333 + (t - 0.333);
  } else {
    // Decelerate (quadratic out)
    const localT = (t - 0.667) / 0.333;
    return 0.667 + 0.333 * (2 * localT - localT * localT);
  }
}

/**
 * Get camera position for frame
 */
function getCameraForFrame(frame) {
  const t = frame / TOTAL_FRAMES;
  const easedT = trapezoidalEase(t);
  const orbitAngle = easedT * 2 * Math.PI; // 0 to 2π
  
  return {
    alpha: CAMERA.alpha.start + easedT * CAMERA.alpha.delta,
    beta: 1.125 + 0.125 * Math.cos(orbitAngle),
    radius: 7.0 + 1.5 * Math.cos(orbitAngle),
    target: CAMERA.target
  };
}

/**
 * Get dimensions for frame (triangle wave interpolation)
 */
function getDimensionsForFrame(frame) {
  const midFrame = TOTAL_FRAMES / 2; // 180
  
  let t;
  if (frame <= midFrame) {
    // First half: expand
    t = frame / midFrame;
    return {
      w: Math.round(DIM.start.w + t * (DIM.mid.w - DIM.start.w)),
      d: Math.round(DIM.start.d + t * (DIM.mid.d - DIM.start.d))
    };
  } else {
    // Second half: contract
    t = (frame - midFrame) / midFrame;
    return {
      w: Math.round(DIM.mid.w + t * (DIM.end.w - DIM.mid.w)),
      d: Math.round(DIM.mid.d + t * (DIM.end.d - DIM.mid.d))
    };
  }
}

/**
 * Get roof style for frame
 */
function getRoofStyleForFrame(frame) {
  let style = 'apex';
  for (const change of ROOF_CHANGES) {
    if (frame >= change.frame) {
      style = change.style;
    }
  }
  return style;
}

/**
 * Generate all keyframes
 */
function generateKeyframes() {
  const keyframes = [];
  
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const camera = getCameraForFrame(frame);
    const dim = getDimensionsForFrame(frame);
    const roofStyle = getRoofStyleForFrame(frame);
    
    keyframes.push({
      frame,
      camera,
      state: {
        dim: {
          frameW_mm: dim.w,
          frameD_mm: dim.d
        },
        roof: {
          style: roofStyle
        },
        walls: {
          openings: [
            {
              id: 'door1',
              wall: 'front',
              type: 'door',
              enabled: true,
              isOpen: false, // Door stays closed
              x_mm: 500,
              width_mm: 900,
              height_mm: 1900,
              style: 'standard',
              handleSide: 'left'
            }
          ]
        }
      }
    });
  }
  
  return keyframes;
}

// Generate and output
const keyframes = generateKeyframes();
console.log(JSON.stringify(keyframes, null, 2));
