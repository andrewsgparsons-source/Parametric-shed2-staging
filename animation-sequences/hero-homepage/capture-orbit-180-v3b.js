const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const FRAMES_DIR = path.join(__dirname, 'frames-orbit-180-v3b');

// NEW starting camera position
const START = {
  alpha: 4.076333253372242,
  target: { x: 2.051918843874351, y: 0.9827458108046727, z: 2.055585583611853 }
};

// V3-style zoom: wide at start/end, close at middle
function getCameraForFrame(frame) {
  const t = frame / 180;
  const alpha = START.alpha + t * 2 * Math.PI;
  const orbitAngle = t * 2 * Math.PI;
  
  const radius = 7.0 + 1.5 * Math.cos(orbitAngle);
  const beta = 1.125 + 0.125 * Math.cos(orbitAngle);
  
  return { alpha, beta, radius, target: START.target };
}

async function main() {
  console.log('=== ORBIT 180 V3 ZOOM - NEW START ===');
  console.log('Connecting to Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null
  });

  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('Parametric-shed2-staging'));
  if (!page) { console.error('No tab!'); process.exit(1); }
  
  if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });
  const oldFrames = fs.readdirSync(FRAMES_DIR).filter(f => f.startsWith('frame_'));
  oldFrames.forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));

  console.log(`Start alpha: ${START.alpha.toFixed(2)}`);
  console.log('Starting capture...');
  const startTime = Date.now();
  
  for (let frame = 0; frame < 180; frame++) {
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
        if (c.target) camera.setTarget(new BABYLON.Vector3(c.target.x, c.target.y, c.target.z));
      }
    }, cam);
    
    await new Promise(r => setTimeout(r, 100));
    await page.screenshot({ path: path.join(FRAMES_DIR, `frame_${String(frame).padStart(4, '0')}.png`) });
    
    if (frame === 0 || frame % 20 === 0 || frame === 179) {
      console.log(`Frame ${frame}/180 (${((Date.now() - startTime) / 1000).toFixed(0)}s) - radius=${cam.radius.toFixed(2)}`);
    }
  }

  console.log(`\nDone! 180 frames in ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  await browser.disconnect();
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
