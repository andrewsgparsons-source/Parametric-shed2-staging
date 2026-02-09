const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const BASE_DIR = __dirname;
const CONFIGS_DIR = path.join(BASE_DIR, 'configs');
const FRAMES_DIR = path.join(BASE_DIR, 'frames');

// Camera path from orbit-v3-ISSUED.json
const CAMERA = {
  startAlpha: -2.15,
  deltaAlpha: 2 * Math.PI, // Full 360°
  radiusWide: 8.5,
  radiusClose: 5.5,
  betaEyeLevel: 1.25,
  betaElevated: 1.0,
  target: { x: 1.15, y: 0.75, z: 0.80 }
};

// Trapezoidal easing
function trapezoidalEase(t) {
  // Simplified: accelerate first third, constant middle third, decelerate last third
  if (t < 0.333) {
    // Quadratic ease in
    return 1.5 * t * t / 0.333;
  } else if (t < 0.667) {
    // Linear
    const linearT = (t - 0.333) / 0.334;
    return 0.333 * 1.5 + linearT * 0.334;
  } else {
    // Quadratic ease out
    const outT = (t - 0.667) / 0.333;
    return 0.667 + 0.333 * (2 * outT - outT * outT);
  }
}

function getCameraForFrame(frame) {
  const t = (frame - 1) / 359; // 0 to 1
  const easedT = trapezoidalEase(t);
  
  const orbitAngle = easedT * 2 * Math.PI;
  
  const alpha = CAMERA.startAlpha + easedT * CAMERA.deltaAlpha;
  const radius = 7.0 + 1.5 * Math.cos(orbitAngle);
  const beta = 1.125 + 0.125 * Math.cos(orbitAngle);
  
  return { alpha, beta, radius, target: CAMERA.target };
}

async function main() {
  console.log('Connecting to Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null
  });

  // Find or create capture tab
  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('Parametric-shed2-staging') && !p.url().includes('admin'));
  
  if (!page) {
    console.log('Creating new tab...');
    page = await browser.newPage();
  }
  
  console.log(`Using tab: ${page.url().substring(0, 80)}...`);

  // Ensure output directory
  if (!fs.existsSync(FRAMES_DIR)) {
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
  }

  console.log('Starting capture of 360 frames...');
  
  for (let frame = 1; frame <= 360; frame++) {
    // Load config
    const configPath = path.join(CONFIGS_DIR, `config-frame-${String(frame).padStart(3, '0')}.json`);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Create base64 state
    const stateJson = JSON.stringify(config);
    const base64State = Buffer.from(stateJson).toString('base64');
    
    // Navigate to URL with state
    const url = `https://andrewsgparsons-source.github.io/Parametric-shed2-staging/?profile=test&state=${base64State}#view=3d`;
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 500)); // Wait for render
    
    // Hide UI
    await page.evaluate(() => {
      ['controls', 'dbgBootLabel', 'ui-layer', 'mobileOpenBtn', 'statusOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.cssText = 'display: none !important';
      });
    });
    
    // Set camera position
    const cam = getCameraForFrame(frame);
    await page.evaluate((cam) => {
      const camera = BABYLON.Engine.LastCreatedEngine?.scenes[0]?.activeCamera;
      if (camera) {
        camera.alpha = cam.alpha;
        camera.beta = cam.beta;
        camera.radius = cam.radius;
        if (cam.target && camera.setTarget) {
          camera.setTarget(new BABYLON.Vector3(cam.target.x, cam.target.y, cam.target.z));
        }
      }
    }, cam);
    
    await new Promise(r => setTimeout(r, 100)); // Wait for camera update
    
    // Capture screenshot
    const framePath = path.join(FRAMES_DIR, `frame_${String(frame).padStart(4, '0')}.png`);
    await page.screenshot({ path: framePath });
    
    if (frame === 1 || frame % 30 === 0 || frame === 360) {
      console.log(`Frame ${frame}/360: w=${config.w}, d=${config.d}, alpha=${cam.alpha.toFixed(2)}`);
    }
  }

  console.log('\\nCapture complete! 360 frames saved.');
  await browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
