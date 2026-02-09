const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const FRAMES_DIR = path.join(__dirname, 'frames-orbit-180');

// Starting camera position (from current browser state)
const START = {
  alpha: -2.219511745571499,
  beta: 1.2008662866840838,
  radius: 7.610297681723195,
  target: { x: 1.2573284545473558, y: 0.6474410147932372, z: 2.509787095189755 }
};

// V4-style zoom: close at start/end, wide at middle
// Adapt to 180 frames (full 360° in half the frames)
function getCameraForFrame(frame) {
  // t goes from 0 to 1 over 180 frames (frame 0 and 180 are same position)
  const t = frame / 180;
  
  // Full 360° rotation
  const alpha = START.alpha + t * 2 * Math.PI;
  
  // Orbit angle for zoom oscillation (one full cycle)
  const orbitAngle = t * 2 * Math.PI;
  
  // V4 zoom pattern: close at start/end, wide at middle
  // radius = center - amplitude * cos(angle)
  // At t=0: cos(0)=1, radius = 7.0 - 1.5 = 5.5 (close)
  // At t=0.5: cos(π)=-1, radius = 7.0 + 1.5 = 8.5 (wide)
  // At t=1: cos(2π)=1, radius = 7.0 - 1.5 = 5.5 (close)
  const radius = 7.0 - 1.5 * Math.cos(orbitAngle);
  
  // Beta oscillation (elevated at start/end, eye-level at middle)
  const beta = 1.125 - 0.125 * Math.cos(orbitAngle);
  
  return { alpha, beta, radius, target: START.target };
}

async function main() {
  console.log('=== ORBIT 180 CAPTURE ===');
  console.log('Connecting to Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null
  });

  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('Parametric-shed2-staging'));
  if (!page) {
    console.error('No Parametric-shed2-staging tab found!');
    process.exit(1);
  }
  
  console.log(`Using tab: ${page.url().substring(0, 60)}...`);
  
  if (!fs.existsSync(FRAMES_DIR)) {
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
  }

  // Clear old frames
  const oldFrames = fs.readdirSync(FRAMES_DIR).filter(f => f.startsWith('frame_'));
  oldFrames.forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));
  console.log(`Cleared ${oldFrames.length} old frames`);

  // Camera position check
  const cam0 = getCameraForFrame(0);
  const cam90 = getCameraForFrame(90);
  const cam180 = getCameraForFrame(180);
  console.log(`Frame 0: alpha=${cam0.alpha.toFixed(2)}, radius=${cam0.radius.toFixed(2)}`);
  console.log(`Frame 90: alpha=${cam90.alpha.toFixed(2)}, radius=${cam90.radius.toFixed(2)}`);
  console.log(`Frame 180: alpha=${cam180.alpha.toFixed(2)}, radius=${cam180.radius.toFixed(2)}`);

  console.log('Starting capture...');
  const startTime = Date.now();
  
  for (let frame = 0; frame < 180; frame++) {
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
        if (c.target) {
          camera.setTarget(new BABYLON.Vector3(c.target.x, c.target.y, c.target.z));
        }
      }
    }, cam);
    
    await new Promise(r => setTimeout(r, 100));
    
    // Screenshot
    await page.screenshot({ 
      path: path.join(FRAMES_DIR, `frame_${String(frame).padStart(4, '0')}.png`)
    });
    
    if (frame === 0 || frame % 20 === 0 || frame === 179) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`Frame ${frame}/180 (${elapsed}s) - alpha=${cam.alpha.toFixed(2)}, radius=${cam.radius.toFixed(2)}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\nDone! 180 frames in ${totalTime}s`);
  console.log(`Frames saved to: ${FRAMES_DIR}`);
  await browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
