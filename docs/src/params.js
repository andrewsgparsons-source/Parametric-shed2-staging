// FILE: docs/src/params.js

/** BASE constants (from reference single-file) */
export const CONFIG = {
  grid: { size: 500, h: 50 },
  timber: { w: 50, d: 100 },
  insulation: { w: 1200, d: 2400, h: 50 },
  decking: { w: 1220, d: 2440, h: 18 },
  spacing: 400
};

/** Walls + Dimension Mode defaults + Base visibility */
export const DEFAULTS = {
  w: 1800,
  d: 2400,
  vis: {
    base: true,
    frame: true,
    ins: false,
    deck: true,
    wallsEnabled: true,
    walls: { front: true, back: true, left: true, right: true },
    cladding: true,
    roof: true
  },
  dimMode: "frame",
  dimGap_mm: 50,
  dim: {
    frameW_mm: 1800,
    frameD_mm: 2400
  },
  overhang: {
    uniform_mm: 75,
    front_mm: null,
    back_mm: null,
    left_mm: null,
    right_mm: null
  },
  dimInputs: {
    baseW_mm: 1750,
    baseD_mm: 2350,
    frameW_mm: 1800,
    frameD_mm: 2400,
    roofW_mm: 1950,
    roofD_mm: 2550
  },
  roof: {
    style: "apex",
    apex: {
      trussCount: 3,
      heightToEaves_mm: 1850,
      heightToCrest_mm: 2200
    },
    pent: {
      minHeight_mm: 2300,
      maxHeight_mm: 2500
    }
  },
  walls: {
    variant: "basic",
    height_mm: 2400,
    insulated: {
      section: { w: 50, h: 75 },
      spacing: 400
    },
    basic: {
      section: { w: 50, h: 75 },
      spacing: null
    },
    openings: [
      {
        id: "door1",
        wall: "front",
        type: "door",
        enabled: true,
        x_mm: 500,
        width_mm: 800,
        height_mm: 1900
      },
      {
        id: "win1",
        wall: "left",
        type: "window",
        enabled: true,
        x_mm: 800,
        y_mm: 1050,
        width_mm: 600,
        height_mm: 400
      }
    ],
    invalidDoorIds: [],
    invalidWindowIds: []
  },
  frame: {
    thickness_mm: 50,
    depth_mm: 75
  },
  // Cladding appearance
  cladding: {
    style: "shiplap"  // "shiplap" | "overlap" | "loglap"
  },
  // Multi-section support (building attachments)
  sections: {
    enabled: false,  // When false, legacy single-building mode is used
    main: {
      id: "main",
      type: "rectangular",
      dimensions: null,  // Uses state.dim when null
      roof: null,        // Uses state.roof when null
      walls: null        // Uses state.walls when null
    },
    attachments: []  // Array of attachment objects (see ATTACHMENT_DEFAULTS below)
  },
  // Internal divider panels
  dividers: {
    items: []  // Array of divider objects
    // Divider object structure:
    // {
    //   id: "div1",
    //   enabled: true,
    //   axis: "x",              // "x" = front-to-back, "z" = left-to-right
    //   position_mm: 1200,      // Position along perpendicular axis
    //   coveringLeft: "none",   // "osb" | "cladding" | "none"
    //   coveringRight: "none",  // "osb" | "cladding" | "none"
    //   openings: []            // Array of door openings within divider
    // }
  }
};

/** Return current variant key (compat) */
export function selectWallsProfile(state) {
  const v = state?.walls?.variant || "insulated";
  return v;
}

/** Resolve per-side overhangs; blanks fall back to uniform. */
function resolveOverhangSides(ovh) {
  const uni = clampNonNeg(num(ovh?.uniform_mm, 0));

  // Treat "" as unset (same as null/undefined), but preserve explicit 0 ("0"/0)
  const isUnset = (v) => v == null || v === "";

  const l = isUnset(ovh?.left_mm)  ? uni : clampNonNeg(num(ovh.left_mm, 0));
  const r = isUnset(ovh?.right_mm) ? uni : clampNonNeg(num(ovh.right_mm, 0));
  const f = isUnset(ovh?.front_mm) ? uni : clampNonNeg(num(ovh.front_mm, 0));
  const b = isUnset(ovh?.back_mm)  ? uni : clampNonNeg(num(ovh.back_mm, 0));

  return { l_mm: l, r_mm: r, f_mm: f, b_mm: b };
}

/**
 * Dimension resolver implementing Base/Frame/Roof with a single canonical FRAME size.
 * Returns outer dims for base/frame/roof plus resolved overhangs.
 */
export function resolveDims(state) {
  const G = clampNonNeg(num(state?.dimGap_mm, DEFAULTS.dimGap_mm));
  const ovh = resolveOverhangSides(state?.overhang || DEFAULTS.overhang);

  const sumX = ovh.l_mm + ovh.r_mm;
  const sumZ = ovh.f_mm + ovh.b_mm;

  const pair = (w, d) => ({ w_mm: clampPosInt(num(w, 1)), d_mm: clampPosInt(num(d, 1)) });

  // Canonical: frame dims
  let frameW = null;
  let frameD = null;

  if (state && state.dim && state.dim.frameW_mm != null && state.dim.frameD_mm != null) {
    frameW = num(state.dim.frameW_mm, null);
    frameD = num(state.dim.frameD_mm, null);
  }

  // Fallback (legacy): derive frame dims from per-mode input fields if canonical not present.
  if (frameW == null || frameD == null) {
    const mode = (state?.dimMode || "base");
    const inputs = state?.dimInputs || DEFAULTS.dimInputs;

    if (mode === "frame") {
      frameW = num(inputs.frameW_mm, DEFAULTS.dimInputs.frameW_mm);
      frameD = num(inputs.frameD_mm, DEFAULTS.dimInputs.frameD_mm);
    } else if (mode === "roof") {
      const roofW = num(inputs.roofW_mm, DEFAULTS.dimInputs.roofW_mm);
      const roofD = num(inputs.roofD_mm, DEFAULTS.dimInputs.roofD_mm);
      frameW = Math.max(1, roofW - sumX);
      frameD = Math.max(1, roofD - sumZ);
    } else { // base
      const baseW = num(inputs.baseW_mm, DEFAULTS.dimInputs.baseW_mm);
      const baseD = num(inputs.baseD_mm, DEFAULTS.dimInputs.baseD_mm);
      frameW = baseW + G;
      frameD = baseD + G;
    }
  }

  const frame = pair(frameW, frameD);
  const base = pair(Math.max(1, frame.w_mm - G), Math.max(1, frame.d_mm - G));
  const roof = pair(frame.w_mm + sumX, frame.d_mm + sumZ);

  return { base, frame, roof, overhang: ovh };
}

/**
 * Default structure for a building attachment (sub-building)
 * Each attachment is a complete building with its own base, walls, openings, and roof
 */
export const ATTACHMENT_DEFAULTS = {
  // Identity
  id: "",              // Unique ID (e.g., "att-1705000000000-123")
  enabled: true,

  // Connection to main building
  attachTo: {
    wall: "left",         // Which wall of main building: "front" | "back" | "left" | "right"
    offsetFromCenter_mm: 0  // Offset from center of that wall (positive = towards right/back)
  },

  // Dimensions (width is along the attached wall, depth is outward)
  dimensions: {
    width_mm: 1800,       // Along the attached wall
    depth_mm: 1200        // Outward from main building
  },

  // Base and floor
  base: {
    levelOffset_mm: 0,    // Relative to main building base (+ = higher, - = lower)
    enabled: true         // Whether to show base/floor for this attachment
  },

  // Walls (3 walls - the wall facing main building is always absent)
  walls: {
    variant: "basic",     // "basic" | "insulated" - inherits from main if null
    height_mm: null,      // Inherits from main building if null
    // Which walls are present (one wall is always missing - the one touching main building)
    // For left/right attachments: front, back, outer are present (inner is missing)
    // For front/back attachments: left, right, outer are present (inner is missing)
    openings: []          // Doors and windows on this attachment's walls
  },

  // Roof
  roof: {
    type: "pent",         // "pent" | "apex" | "overhang"
    // If "overhang": roof is covered by extended overhang from main building (no separate roof)
    // If "pent": single slope roof going outward (high at main building, low at outer edge)
    // If "apex": gabled roof with ridge parallel to attached wall
    pent: {
      highHeight_mm: null,   // Total height from ground at main building (null = use max based on main fascia)
      lowHeight_mm: null,    // Total height from ground at outer edge (null = highHeight - 300)
      // Overhangs for pent roof (matching main building overhang structure)
      overhang: {
        eaves_mm: 75,        // Overhang at outer (low) edge
        vergeLeft_mm: 75,    // Overhang on left side (perpendicular to slope)
        vergeRight_mm: 75    // Overhang on right side (perpendicular to slope)
        // Note: No ridge overhang - attachment connects to main building there
      }
    },
    apex: {
      eaveHeight_mm: 1850,
      crestHeight_mm: 2200,
      trussCount: 2
    },
    overhang: {
      extension_mm: 0     // How far to extend main building's overhang (only if type="overhang")
    }
  }
};

/**
 * Create a new attachment with default values
 * @param {string} wall - Wall to attach to
 * @returns {object} New attachment object
 */
export function createAttachment(wall = "left") {
  return {
    ...JSON.parse(JSON.stringify(ATTACHMENT_DEFAULTS)),
    id: "att-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    attachTo: {
      wall: wall,
      offsetFromCenter_mm: 0
    }
  };
}

/** Utilities */
function num(v, def) { const n = Number(v); return Number.isFinite(n) ? n : def; }
function clampNonNeg(n) { return Math.max(0, Math.floor(n)); }
function clampPosInt(n) { return Math.max(1, Math.floor(n)); }
