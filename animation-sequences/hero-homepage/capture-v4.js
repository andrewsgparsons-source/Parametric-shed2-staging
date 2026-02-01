const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const BASE_DIR = __dirname;
const CONFIGS_DIR = path.join(BASE_DIR, 'configs');
const FRAMES_DIR = path.join(BASE_DIR, 'frames-v4');

// Camera from orbit-v4-ISSUED.json - REVERSED ZOOM
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
    // V4: INVERTED - close at start/end, wide at middle
    beta: 1.125 - 0.125 * Math.cos(orbitAngle),
    radius: 7.0 - 1.5 * Math.cos(orbitAngle)
  };
}

async function main() {
  console.log('=== ORBIT V4 CAPTURE (Reversed Zoom) ===');
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

  // Log v4 camera positions
  const cam1 = getCameraForFrame(1);
  const cam180 = getCameraForFrame(180);
  const cam360 = getCameraForFrame(360);
  console.log(`Camera check - Frame 1: radius=${cam1.radius.toFixed(2)} (should be ~5.5)`);
  console.log(`Camera check - Frame 180: radius=${cam180.radius.toFixed(2)} (should be ~8.5)`);
  console.log(`Camera check - Frame 360: radius=${cam360.radius.toFixed(2)} (should be ~5.5)`);

  console.log('Starting capture...');
  const startTime = Date.now();
  
  for (let frame = 1; frame <= 360; frame++) {
    const config = JSON.parse(fs.readFileSync(
      path.join(CONFIGS_DIR, `config-frame-${String(frame).padStart(3, '0')}.json`), 'utf8'
    ));
    
    const state64 = Buffer.from(JSON.stringify(config)).toString('base64');
    const url = `https://andrewsgparsons-source.github.io/Parametric-shed2-staging/?profile=test&state=${state64}#view=3d`;
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.log(`Frame ${frame}: retry...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    
    await new Promise(r => setTimeout(r, 400));
    
    await page.evaluate(() => {
      ['controls', 'dbgBootLabel', 'ui-layer', 'mobileOpenBtn', 'statusOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.cssText = 'display: none !important';
      });
    });
    
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
    
    await page.screenshot({ 
      path: path.join(FRAMES_DIR, `frame_${String(frame).padStart(4, '0')}.png`)
    });
    
    if (frame === 1 || frame % 20 === 0 || frame === 360) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`Frame ${frame}/360 (${elapsed}s) - radius=${cam.radius.toFixed(2)}, w=${config.w}, roof=${config.roof.style}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\nDone! 360 frames in ${totalTime}s`);
  console.log(`Frames saved to: ${FRAMES_DIR}`);
  await browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
