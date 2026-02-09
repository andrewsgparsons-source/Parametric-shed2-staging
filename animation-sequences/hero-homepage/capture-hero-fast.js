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
  deltaAlpha: 2 * Math.PI,
  target: { x: 1.15, y: 0.75, z: 0.80 }
};

function trapezoidalEase(t) {
  if (t < 0.333) {
    return 1.5 * t * t / 0.333;
  } else if (t < 0.667) {
    const linearT = (t - 0.333) / 0.334;
    return 0.333 * 1.5 + linearT * 0.334;
  } else {
    const outT = (t - 0.667) / 0.333;
    return 0.667 + 0.333 * (2 * outT - outT * outT);
  }
}

function getCameraForFrame(frame) {
  const t = (frame - 1) / 359;
  const easedT = trapezoidalEase(t);
  const orbitAngle = easedT * 2 * Math.PI;
  
  return {
    alpha: CAMERA.startAlpha + easedT * CAMERA.deltaAlpha,
    beta: 1.125 + 0.125 * Math.cos(orbitAngle),
    radius: 7.0 + 1.5 * Math.cos(orbitAngle),
    target: CAMERA.target
  };
}

async function main() {
  console.log('Connecting to Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null
  });

  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('Parametric-shed2-staging') && !p.url().includes('admin'));
  
  if (!page) {
    page = await browser.newPage();
  }
  
  // Ensure output directory
  if (!fs.existsSync(FRAMES_DIR)) {
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
  }

  // Load first frame to initialize
  const config1 = JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, 'config-frame-001.json'), 'utf8'));
  const base64State = Buffer.from(JSON.stringify(config1)).toString('base64');
  const url = `https://andrewsgparsons-source.github.io/Parametric-shed2-staging/?profile=test&state=${base64State}#view=3d`;
  
  console.log('Loading initial page...');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  
  // Inject update function
  await page.evaluate(() => {
    window.updateShed = (config) => {
      if (window.app && window.app.loadState) {
        window.app.loadState(config);
      } else if (window.loadState) {
        window.loadState(config);
      }
    };
    window.setCam = (alpha, beta, radius, target) => {
      const camera = BABYLON.Engine.LastCreatedEngine?.scenes[0]?.activeCamera;
      if (camera) {
        camera.alpha = alpha;
        camera.beta = beta;
        camera.radius = radius;
        if (target && camera.setTarget) {
          camera.setTarget(new BABYLON.Vector3(target.x, target.y, target.z));
        }
      }
    };
    window.hideUI = () => {
      ['controls', 'dbgBootLabel', 'ui-layer', 'mobileOpenBtn', 'statusOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.cssText = 'display: none !important';
      });
    };
  });

  console.log('Starting capture of 360 frames...');
  
  for (let frame = 1; frame <= 360; frame++) {
    // Load config
    const configPath = path.join(CONFIGS_DIR, `config-frame-${String(frame).padStart(3, '0')}.json`);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Update shed via URL navigation (more reliable than JS update)
    const stateJson = JSON.stringify(config);
    const state64 = Buffer.from(stateJson).toString('base64');
    const frameUrl = `https://andrewsgparsons-source.github.io/Parametric-shed2-staging/?profile=test&state=${state64}#view=3d`;
    
    // Use page.evaluate to update URL hash (faster than full navigation)
    await page.evaluate((state64) => {
      const url = new URL(window.location.href);
      url.searchParams.set('state', state64);
      window.history.replaceState(null, '', url.toString());
      // Trigger state reload
      if (window.app && window.app.loadStateFromURL) {
        window.app.loadStateFromURL();
      }
    }, state64);
    
    // Wait and hide UI
    await new Promise(r => setTimeout(r, 150));
    await page.evaluate(() => window.hideUI());
    
    // Set camera
    const cam = getCameraForFrame(frame);
    await page.evaluate((c) => window.setCam(c.alpha, c.beta, c.radius, c.target), cam);
    await new Promise(r => setTimeout(r, 50));
    
    // Screenshot
    const framePath = path.join(FRAMES_DIR, `frame_${String(frame).padStart(4, '0')}.png`);
    await page.screenshot({ path: framePath });
    
    if (frame === 1 || frame % 30 === 0 || frame === 360) {
      console.log(`Frame ${frame}/360: w=${config.w}, d=${config.d}, roof=${config.roof.style}`);
    }
  }

  console.log('\\nCapture complete! 360 frames saved to', FRAMES_DIR);
  await browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
