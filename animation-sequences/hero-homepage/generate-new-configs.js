const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'configs');

// Base config from frame 1
const baseConfig = {
  "w": 1800,
  "d": 2400,
  "dimMode": "frame",
  "roof": {
    "style": "apex",
    "apex": {
      "heightToEaves_mm": 1850,
      "heightToCrest_mm": 2200,
      "trussCount": 3,
      "tieBeam": "eaves"
    },
    "pent": {
      "minHeight_mm": 2200,
      "maxHeight_mm": 2500
    }
  },
  "overhang": { "uniform_mm": 75 },
  "walls": {
    "variant": "basic",
    "height_mm": 2400,
    "openings": [
      {
        "id": "door1",
        "wall": "front",
        "type": "door",
        "enabled": true,
        "x_mm": 500,
        "width_mm": 800,
        "height_mm": 1900,
        "style": "standard",
        "handleSide": "left",
        "isOpen": false
      },
      {
        "id": "win1",
        "wall": "left",
        "type": "window",
        "enabled": true,
        "x_mm": 800,
        "y_mm": 1050,
        "width_mm": 600,
        "height_mm": 400
      }
    ]
  },
  "frame": { "thickness_mm": 50, "depth_mm": 75 },
  "vis": {
    "roof": true,
    "cladding": true,
    "openings": true,
    "base": true,  // Always ON
    "ins": true,
    "deck": true,
    "grids": true,
    "roofParts": { "osb": true, "covering": true }
  }
};

// Spec
const SPEC = {
  startDim: { w: 1800, d: 2400 },
  peakDim: { w: 4000, d: 4000 },
  peakFrame: 136,
  returnFrame: 301,
  
  // Visibility track 1 (other vis, NOT cladding) - sequential
  visOff: {
    deck: 45,
    ins: 60,
    grids: 75,
    roofParts: 91,
    openings: 105
  },
  visOn: {
    openings: 225,
    roofParts: 240,
    grids: 255,
    ins: 271,
    deck: 280
  },
  
  // Visibility track 2 (cladding) - separate
  claddingOff: 160,
  claddingOn: 210,
  
  // Roof
  pentStart: 91,
  pentEnd: 270
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function generateConfig(frame) {
  const config = JSON.parse(JSON.stringify(baseConfig));
  
  // --- DIMENSIONS ---
  let w, d;
  if (frame <= SPEC.peakFrame) {
    // Morphing up: 1 → 136
    const t = Math.max(0, (frame - 1) / (SPEC.peakFrame - 1));
    w = Math.round(lerp(SPEC.startDim.w, SPEC.peakDim.w, t));
    d = Math.round(lerp(SPEC.startDim.d, SPEC.peakDim.d, t));
  } else if (frame <= SPEC.returnFrame) {
    // Stay at peak: 136 → 301
    w = SPEC.peakDim.w;
    d = SPEC.peakDim.d;
  } else {
    // Morphing down: 301 → 360
    const t = (frame - SPEC.returnFrame) / (360 - SPEC.returnFrame);
    w = Math.round(lerp(SPEC.peakDim.w, SPEC.startDim.w, t));
    d = Math.round(lerp(SPEC.peakDim.d, SPEC.startDim.d, t));
  }
  config.w = w;
  config.d = d;
  
  // --- ROOF STYLE ---
  if (frame >= SPEC.pentStart && frame <= SPEC.pentEnd) {
    config.roof.style = "pent";
  } else {
    config.roof.style = "apex";
  }
  
  // --- VISIBILITY TRACK 1: Other vis (NOT cladding) ---
  // Base always ON
  config.vis.base = true;
  
  // Deck
  if (frame >= SPEC.visOff.deck && frame < SPEC.visOn.deck) {
    config.vis.deck = false;
  } else {
    config.vis.deck = true;
  }
  
  // Insulation
  if (frame >= SPEC.visOff.ins && frame < SPEC.visOn.ins) {
    config.vis.ins = false;
  } else {
    config.vis.ins = true;
  }
  
  // Grids
  if (frame >= SPEC.visOff.grids && frame < SPEC.visOn.grids) {
    config.vis.grids = false;
  } else {
    config.vis.grids = true;
  }
  
  // Roof parts
  if (frame >= SPEC.visOff.roofParts && frame < SPEC.visOn.roofParts) {
    config.vis.roofParts = { osb: false, covering: false };
  } else {
    config.vis.roofParts = { osb: true, covering: true };
  }
  
  // Openings
  if (frame >= SPEC.visOff.openings && frame < SPEC.visOn.openings) {
    config.vis.openings = false;
    config.walls.openings = []; // Remove openings
  } else {
    config.vis.openings = true;
    // Restore openings
    config.walls.openings = [
      {
        "id": "door1",
        "wall": "front",
        "type": "door",
        "enabled": true,
        "x_mm": 500,
        "width_mm": 800,
        "height_mm": 1900,
        "style": "standard",
        "handleSide": "left",
        "isOpen": false
      },
      {
        "id": "win1",
        "wall": "left",
        "type": "window",
        "enabled": true,
        "x_mm": 800,
        "y_mm": 1050,
        "width_mm": 600,
        "height_mm": 400
      }
    ];
  }
  
  // --- VISIBILITY TRACK 2: Cladding (separate) ---
  if (frame >= SPEC.claddingOff && frame < SPEC.claddingOn) {
    config.vis.cladding = false;
  } else {
    config.vis.cladding = true;
  }
  
  // --- ROOF visibility (part of other vis) ---
  config.vis.roof = true; // Roof mesh always visible, just parts toggle
  
  return config;
}

// Generate all 360 configs
console.log('Generating 360 config files...');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

for (let frame = 1; frame <= 360; frame++) {
  const config = generateConfig(frame);
  const filename = `config-frame-${String(frame).padStart(3, '0')}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(config, null, 2));
  
  if (frame % 45 === 0 || frame === 1 || frame === 360) {
    console.log(`Frame ${frame}: w=${config.w}, d=${config.d}, roof=${config.roof.style}, cladding=${config.vis.cladding}, deck=${config.vis.deck}`);
  }
}

console.log('Done! Generated 360 config files.');
