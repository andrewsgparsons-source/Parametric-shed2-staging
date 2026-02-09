const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const BASE_DIR = __dirname;
const CONFIGS_DIR = path.join(BASE_DIR, 'configs');
const FRAMES_DIR = path.join(BASE_DIR, 'frames');

// Camera from orbit-v3-ISSUED.json
function getCameraForFrame(frame) {
  const t = (frame - 1) / 359;
  // Trapezoidal easing
  let easedT;
  if (t < 0.333) {
    easedT = 1.5 * t * t / 0.333;
  } else if (t < 0.667) {
    easedT = 0.5 + (t - 0.333) / 0.334 * 0.334;
  } else {
    const outT = (t - 0.667) / 0.333;
    easedT = 0.667 + 0.333 * (2 * outT - outT * outT);
  }
  
  const orbitAngle = easedT * 2 * Math.PI;
  return {
    alpha: -2.15 + easedT * 2 * Math.PI,
    beta: 1.125 + 0.125 * Math.cos(orbitAngle),
    radius: 7.0 + 1.5 * Math.cos(orbitAngle)
  };
}

async function main() {
  console.log('Connecting to Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null
  });

  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('Parametric-shed2-staging'));
  if (!page) page = await browser.newPage();
  
  if (!fs.existsSync(FRAMES_DIR)) {
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
  }

  // Clear old frames
  const oldFrames = fs.readdirSync(FRAMES_DIR).filter(f => f.startsWith('frame_'));
  oldFrames.forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));
  console.log(`Cleared ${oldFrames.length} old frames`);

  console.log('Starting capture...');
  const startTime = Date.now();
  
  for (let frame = 1; frame <= 360; frame++) {
    // Load config
    const config = JSON.parse(fs.readFileSync(
      path.join(CONFIGS_DIR, `config-frame-${String(frame).padStart(3, '0')}.json`), 'utf8'
    ));
    
    // Navigate
    const state64 = Buffer.from(JSON.stringify(config)).toString('base64');
    const url = `https://andrewsgparsons-source.github.io/Parametric-shed2-staging/?profile=test&state=${state64}#view=3d`;
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.log(`Frame ${frame}: navigation timeout, retrying...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    
    // Wait for Babylon to render
    await new Promise(r => setTimeout(r, 400));
    
    // Hide UI
    await page.evaluate(() => {
      ['controls', 'dbgBootLabel', 'ui-layer', 'mobileOpenBtn', 'statusOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.cssText = 'display: none !important';
      });
    });
    
    // Set camera
    const cam = getCameraForFrame(frame);
    await page.evaluate((c) => {
      const camera = BABYLON.Engine.LastCreatedEngine?.scenes[0]?.activeCamera;
      if (camera) {
        camera.alpha = c.alpha;
        camera.beta = c.beta;
        camera.radius = c.radius;
      }
    }, cam);
    
    await new Promise(r => setTimeout(r, 100));
    
    // Screenshot
    await page.screenshot({ 
      path: path.join(FRAMES_DIR, `frame_${String(frame).padStart(4, '0')}.png`)
    });
    
    if (frame === 1 || frame % 20 === 0 || frame === 360) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (frame / elapsed).toFixed(1);
      console.log(`Frame ${frame}/360 (${elapsed}s, ${rate} fps) - w=${config.w} d=${config.d} roof=${config.roof.style}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\\nDone! 360 frames in ${totalTime}s`);
  await browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
