// Generate URLs for all 360 frames of the hero sequence
const fs = require('fs');

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(start, end, t) {
  return Math.round(start + (end - start) * t);
}

const VIS_ORDER_OFF = ['roofParts.covering', 'roofParts.osb', 'cladding', 'openings', 'deck', 'ins', 'base'];
const VIS_ORDER_ON = ['base', 'ins', 'deck', 'openings', 'cladding', 'roofParts.osb', 'roofParts.covering'];

function generateConfig(degree) {
  let w = 1800, d = 2400;
  if (degree >= 45 && degree <= 135) {
    const t = easeInOut((degree - 45) / 90);
    w = lerp(1800, 2500, t);
    d = lerp(2400, 2500, t);
  } else if (degree > 135 && degree < 190) {
    w = 2500; d = 2500;
  } else if (degree >= 190 && degree <= 300) {
    const t = easeInOut((degree - 190) / 110);
    w = lerp(2500, 1800, t);
    d = lerp(2500, 2400, t);
  }
  
  const roofStyle = (degree >= 90 && degree < 270) ? 'pent' : 'apex';
  
  const openings = (degree >= 90 && degree < 270) ? [] : [
    { id: "door1", wall: "front", type: "door", enabled: true, x_mm: 500, width_mm: 800, height_mm: 1900, style: "standard", handleSide: "left", isOpen: false },
    { id: "win1", wall: "left", type: "window", enabled: true, x_mm: 800, y_mm: 1050, width_mm: 600, height_mm: 400 }
  ];
  
  const vis = {
    roof: true, cladding: true, openings: true,
    base: true, ins: true, deck: true,
    roofParts: { osb: true, covering: true }
  };
  
  if (degree >= 45 && degree <= 180) {
    const progress = Math.min(1, (degree - 45) / 135);
    const layersOff = Math.min(7, Math.floor(progress * 7.5));
    for (let i = 0; i < layersOff; i++) {
      const key = VIS_ORDER_OFF[i];
      if (key.includes('.')) {
        const [p, c] = key.split('.');
        vis[p][c] = false;
      } else {
        vis[key] = false;
      }
    }
  }
  
  if (degree > 180 && degree <= 280) {
    VIS_ORDER_OFF.forEach(key => {
      if (key.includes('.')) {
        const [p, c] = key.split('.');
        vis[p][c] = false;
      } else {
        vis[key] = false;
      }
    });
    const progress = (degree - 180) / 100;
    const layersOn = Math.min(7, Math.floor(progress * 7.5));
    for (let i = 0; i < layersOn; i++) {
      const key = VIS_ORDER_ON[i];
      if (key.includes('.')) {
        const [p, c] = key.split('.');
        vis[p][c] = true;
      } else {
        vis[key] = true;
      }
    }
  }
  
  return {
    w, d, dimMode: "frame",
    roof: {
      style: roofStyle,
      apex: { heightToEaves_mm: 1850, heightToCrest_mm: 2200, trussCount: 3, tieBeam: "eaves" },
      pent: { minHeight_mm: 2200, maxHeight_mm: 2500 }
    },
    overhang: { uniform_mm: 75 },
    walls: { variant: "basic", height_mm: 2400, openings },
    frame: { thickness_mm: 50, depth_mm: 75 },
    vis
  };
}

// Camera path
function getCameraForFrame(frame) {
  const TOTAL = 360;
  const t = (frame - 1) / TOTAL;
  
  // Trapezoidal easing
  let easedT;
  if (t < 0.333) {
    easedT = 2.25 * t * t;
  } else if (t < 0.667) {
    easedT = 1.5 * (t - 0.167);
  } else {
    const t2 = t - 0.667;
    easedT = 0.75 + 1.5 * t2 - 2.25 * t2 * t2;
  }
  
  const orbitAngle = easedT * 2 * Math.PI;
  
  return {
    alpha: -2.15 + easedT * 6.283185307,
    beta: 1.125 + 0.125 * Math.cos(orbitAngle),
    radius: 7.0 + 1.5 * Math.cos(orbitAngle)
  };
}

const BASE_URL = 'https://andrewsgparsons-source.github.io/Parametric-shed2-staging/';

const urls = [];

for (let frame = 1; frame <= 360; frame++) {
  const degree = frame - 1;
  const config = generateConfig(degree);
  const cam = getCameraForFrame(frame);
  
  const json = JSON.stringify(config);
  const base64 = Buffer.from(json).toString('base64');
  const url = `${BASE_URL}?profile=test&state=${base64}`;
  
  urls.push({
    frame,
    degree,
    url,
    camera: cam
  });
}

// Write to file
fs.writeFileSync(__dirname + '/frame-urls.json', JSON.stringify(urls, null, 2));
console.log('Generated 360 frame URLs to frame-urls.json');

// Also output first few for verification
console.log('\nFirst 3 frames:');
urls.slice(0, 3).forEach(u => {
  console.log(`Frame ${u.frame}: alpha=${u.camera.alpha.toFixed(2)}, beta=${u.camera.beta.toFixed(2)}, radius=${u.camera.radius.toFixed(2)}`);
});

console.log('\nFrame 90 (roof change):');
const f90 = urls[89];
console.log(`Frame 90: alpha=${f90.camera.alpha.toFixed(2)}, roof should be pent`);

console.log('\nFrame 180 (midpoint):');
const f180 = urls[179];
console.log(`Frame 180: alpha=${f180.camera.alpha.toFixed(2)}, frame-only view`);
