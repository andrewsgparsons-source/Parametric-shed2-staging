const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const FRAMES_DIR = path.join(__dirname, 'frames-orbit-180-v3');

// Starting camera position
const START = {
  alpha: -2.219511745571499,
  target: { x: 1.2573284545473558, y: 0.6474410147932372, z: 2.509787095189755 }
};

// V3-style zoom: wide at start/end, close at middle
function getCameraForFrame(frame) {
  const t = frame / 180;
  const alpha = START.alpha + t * 2 * Math.PI;
  const orbitAngle = t * 2 * Math.PI;
  
  // V3 zoom: wide at start/end, close at middle
  // At t=0: cos(0)=1, radius = 7.0 + 1.5 = 8.5 (wide)
  // At t=0.5: cos(π)=-1, radius = 7.0 - 1.5 = 5.5 (close)
  // At t=1: cos(2π)=1, radius = 7.0 + 1.5 = 8.5 (wide)
  const radius = 7.0 + 1.5 * Math.cos(orbitAngle);
  const beta = 1.125 + 0.125 * Math.cos(orbitAngle);
  
  return { alpha, beta, radius, target: START.target };
}

async function main() {
  console.log('=== ORBIT 180 V3 ZOOM (wide→close→wide) ===');
  console.log('Connecting to Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null
  });

  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('Parametric-shed2-staging'));
  if (!page) {
    console.error('No tab found!');
    process.exit(1);
  }
  
  if (!fs.existsSync(FRAMES_DIR)) {
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
  }

  const oldFrames = fs.readdirSync(FRAMES_DIR).filter(f => f.startsWith('frame_'));
  oldFrames.forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));

  const cam0 = getCameraForFrame(0);
  const cam90 = getCameraForFrame(90);
  console.log(`Frame 0: radius=${cam0.radius.toFixed(2)} (wide)`);
  console.log(`Frame 90: radius=${cam90.radius.toFixed(2)} (close)`);

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
        if (c.target) {
          camera.setTarget(new BABYLON.Vector3(c.target.x, c.target.y, c.target.z));
        }
      }
    }, cam);
    
    await new Promise(r => setTimeout(r, 100));
    
    await page.screenshot({ 
      path: path.join(FRAMES_DIR, `frame_${String(frame).padStart(4, '0')}.png`)
    });
    
    if (frame === 0 || frame % 20 === 0 || frame === 179) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`Frame ${frame}/180 (${elapsed}s) - radius=${cam.radius.toFixed(2)}`);
    }
  }

  console.log(`\nDone! 180 frames in ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  await browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
