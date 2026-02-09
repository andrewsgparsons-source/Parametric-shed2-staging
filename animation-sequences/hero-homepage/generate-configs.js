// Hero Homepage Sequence - Config Generator
// Generates all intermediate configs for the 360° animation

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = __dirname;

// Easing function (ease-in-out)
function easeInOut(t) {
  return t < 0.5 
    ? 2 * t * t 
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Linear interpolation
function lerp(start, end, t) {
  return Math.round(start + (end - start) * t);
}

// Base configs
const DEFAULT_CONFIG = {
  w: 1800,
  d: 2400,
  dimMode: "frame",
  roof: {
    style: "apex",
    apex: { heightToEaves_mm: 1850, heightToCrest_mm: 2200, trussCount: 3, tieBeam: "eaves" },
    pent: { minHeight_mm: 2300, maxHeight_mm: 2500 }
  },
  overhang: { uniform_mm: 75 },
  walls: {
    variant: "basic",
    height_mm: 2400,
    openings: [
      { id: "door1", wall: "front", type: "door", enabled: true, x_mm: 500, width_mm: 800, height_mm: 1900, style: "standard", handleSide: "left", isOpen: false },
      { id: "win1", wall: "left", type: "window", enabled: true, x_mm: 800, y_mm: 1050, width_mm: 600, height_mm: 400 }
    ]
  },
  frame: { thickness_mm: 50, depth_mm: 75 },
  vis: {
    roof: true,
    cladding: true,
    openings: true,
    base: true,
    ins: true,
    deck: true,
    roofParts: { osb: true, covering: true }
  }
};

// Visibility toggle order (outer to inner for OFF)
const VIS_ORDER_OFF = ['roofParts.covering', 'roofParts.osb', 'cladding', 'openings', 'deck', 'ins', 'base'];
const VIS_ORDER_ON = ['base', 'ins', 'deck', 'openings', 'cladding', 'roofParts.osb', 'roofParts.covering'];

// Key degree points
const KEYPOINTS = {
  start: 0,
  dimMorphStart1: 45,
  roofToPent: 90,
  dimMorphEnd1: 135,
  midpoint: 180,
  dimMorphStart2: 190,
  roofToApex: 270,
  visFullyOn: 280,
  dimMorphEnd2: 300,
  end: 360
};

// Generate visibility state based on degree
function getVisState(degree) {
  const vis = {
    roof: true,
    cladding: true,
    openings: true,
    base: true,
    ins: true,
    deck: true,
    roofParts: { osb: true, covering: true }
  };
  
  // Toggle OFF phase: 45° - 180° (135° span, 7 layers)
  if (degree >= 45 && degree <= 180) {
    const progress = (degree - 45) / 135;
    const layersOff = Math.floor(progress * 7);
    
    for (let i = 0; i < layersOff && i < VIS_ORDER_OFF.length; i++) {
      const key = VIS_ORDER_OFF[i];
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        vis[parent][child] = false;
      } else {
        vis[key] = false;
      }
    }
    
    // At 180°, all off
    if (degree >= 180) {
      VIS_ORDER_OFF.forEach(key => {
        if (key.includes('.')) {
          const [parent, child] = key.split('.');
          vis[parent][child] = false;
        } else {
          vis[key] = false;
        }
      });
    }
  }
  
  // Toggle ON phase: 180° - 280° (100° span, 7 layers)
  if (degree > 180 && degree <= 280) {
    // Start with all off
    VIS_ORDER_OFF.forEach(key => {
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        vis[parent][child] = false;
      } else {
        vis[key] = false;
      }
    });
    
    const progress = (degree - 180) / 100;
    const layersOn = Math.floor(progress * 7);
    
    for (let i = 0; i < layersOn && i < VIS_ORDER_ON.length; i++) {
      const key = VIS_ORDER_ON[i];
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        vis[parent][child] = true;
      } else {
        vis[key] = true;
      }
    }
  }
  
  // After 280°, all back on
  if (degree > 280) {
    // All true (default)
  }
  
  return vis;
}

// Generate dimensions based on degree (with easing)
function getDimensions(degree) {
  let w = 1800, d = 2400;
  
  // Morph 1: 45° - 135° (growing)
  if (degree >= 45 && degree <= 135) {
    const t = easeInOut((degree - 45) / 90);
    w = lerp(1800, 2500, t);
    d = lerp(2400, 2500, t);
  }
  
  // Holding at 2500x2500: 135° - 190°
  if (degree > 135 && degree < 190) {
    w = 2500;
    d = 2500;
  }
  
  // Morph 2: 190° - 300° (shrinking)
  if (degree >= 190 && degree <= 300) {
    const t = easeInOut((degree - 190) / 110);
    w = lerp(2500, 1800, t);
    d = lerp(2500, 2400, t);
  }
  
  // After 300°, back to default
  if (degree > 300) {
    w = 1800;
    d = 2400;
  }
  
  return { w, d };
}

// Get roof style based on degree
function getRoofStyle(degree) {
  if (degree >= 90 && degree < 270) {
    return 'pent';
  }
  return 'apex';
}

// Get openings based on degree (removed during pent phase)
function getOpenings(degree) {
  if (degree >= 90 && degree < 270) {
    return []; // No openings during pent phase
  }
  return [
    { id: "door1", wall: "front", type: "door", enabled: true, x_mm: 500, width_mm: 800, height_mm: 1900, style: "standard", handleSide: "left", isOpen: false },
    { id: "win1", wall: "left", type: "window", enabled: true, x_mm: 800, y_mm: 1050, width_mm: 600, height_mm: 400 }
  ];
}

// Generate config for a specific degree
function generateConfig(degree) {
  const { w, d } = getDimensions(degree);
  const roofStyle = getRoofStyle(degree);
  const vis = getVisState(degree);
  const openings = getOpenings(degree);
  
  return {
    w,
    d,
    dimMode: "frame",
    roof: {
      style: roofStyle,
      apex: { heightToEaves_mm: 1850, heightToCrest_mm: 2200, trussCount: 3, tieBeam: "eaves" },
      pent: { minHeight_mm: 2200, maxHeight_mm: 2500 }
    },
    overhang: { uniform_mm: 75 },
    walls: {
      variant: "basic",
      height_mm: 2400,
      openings
    },
    frame: { thickness_mm: 50, depth_mm: 75 },
    vis
  };
}

// Generate all configs for key frames
function generateAllConfigs() {
  const configs = [];
  
  // Generate config for every degree (0-359)
  for (let deg = 0; deg < 360; deg++) {
    const config = generateConfig(deg);
    const filename = `config-frame-${String(deg + 1).padStart(3, '0')}.json`;
    const filepath = path.join(OUTPUT_DIR, 'configs', filename);
    
    configs.push({
      frame: deg + 1,
      degree: deg,
      filename,
      config
    });
  }
  
  return configs;
}

// Write configs to files
function writeConfigs(configs) {
  const configDir = path.join(OUTPUT_DIR, 'configs');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  configs.forEach(({ filename, config }) => {
    const filepath = path.join(configDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(config, null, 2));
  });
  
  console.log(`Written ${configs.length} config files to ${configDir}`);
  return configs;
}

// Generate sequence metadata
function generateSequence(configs) {
  const sequence = {
    name: "Hero Homepage Sequence",
    description: "360° camera orbit with morphing shed configurations",
    fps: 12,
    totalFrames: 360,
    duration: "30 seconds",
    cameraPath: "orbit-v3-ISSUED.json",
    keyframes: [
      { frame: 1, degree: 0, description: "Start - Default apex shed, full visibility" },
      { frame: 46, degree: 45, description: "Begin dimension morph, begin visibility toggle off" },
      { frame: 91, degree: 90, description: "Roof switches to pent, openings removed" },
      { frame: 136, degree: 135, description: "Dimensions reach 2500×2500" },
      { frame: 181, degree: 180, description: "Midpoint - Frame only, pent, max size" },
      { frame: 191, degree: 190, description: "Begin dimension morph back" },
      { frame: 271, degree: 270, description: "Roof switches to apex, openings restored" },
      { frame: 281, degree: 280, description: "Visibility fully restored" },
      { frame: 301, degree: 300, description: "Dimensions back to default" },
      { frame: 360, degree: 359, description: "End - loops to start" }
    ],
    configFiles: configs.map(c => ({ frame: c.frame, degree: c.degree, file: `configs/${c.filename}` }))
  };
  
  const seqPath = path.join(OUTPUT_DIR, 'sequence.json');
  fs.writeFileSync(seqPath, JSON.stringify(sequence, null, 2));
  console.log(`Written sequence.json`);
  
  return sequence;
}

// Main
const configs = generateAllConfigs();
writeConfigs(configs);
generateSequence(configs);

console.log('Config generation complete!');
