const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const OUTPUT_DIR = '/home/ser/clawd/animation-frames/demo-sequence';
const SEQUENCE_FILE = '/home/ser/clawd/Parametric-shed2-staging/animation-sequences/hero-homepage/keyframe-editor/sequence-data.json';

// Camera calculation
const START_ALPHA = 4.076333253372242;
const TARGET = { x: 2.05, y: 0.98, z: 2.06 };

function getCameraForFrame(frame) {
  const t = frame / 180;
  const orbitAngle = t * 2 * Math.PI;
  return {
    alpha: START_ALPHA + t * 2 * Math.PI,
    beta: 1.125 + 0.125 * Math.cos(orbitAngle),
    radius: 7.0 + 1.5 * Math.cos(orbitAngle),
    target: TARGET
  };
}

async function main() {
  const sequence = JSON.parse(fs.readFileSync(SEQUENCE_FILE, 'utf8'));
  
  console.log('Connecting to Chrome...');
  const browser = await puppeteer.connect({ browserURL: CHROME_URL, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes(':8080'));
  
  if (!page) {
    console.log('No configurator tab found!');
    process.exit(1);
  }
  
  console.log('Found configurator tab');
  
  // Hide the control panel
  await page.evaluate(() => {
    const panel = document.getElementById('controls');
    if (panel) panel.style.display = 'none';
  });
  
  let lastConfig = null;
  
  for (let frame = 0; frame < 180; frame++) {
    const config = sequence.frames[frame];
    const cam = getCameraForFrame(frame);
    
    // Only reload if config changed
    const configStr = JSON.stringify(config);
    if (configStr !== lastConfig) {
      const state64 = Buffer.from(configStr).toString('base64');
      const url = `http://172.27.115.228:8080/?profile=builder&state=${state64}#view=3d`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
      await page.evaluate(() => {
        const panel = document.getElementById('controls');
        if (panel) panel.style.display = 'none';
      });
      await new Promise(r => setTimeout(r, 300));
      lastConfig = configStr;
    }
    
    // Set camera
    await page.evaluate((c) => {
      const camera = BABYLON.Engine.LastCreatedEngine?.scenes[0]?.activeCamera;
      if (camera) {
        camera.alpha = c.alpha;
        camera.beta = c.beta;
        camera.radius = c.radius;
        if (c.target) camera.setTarget(new BABYLON.Vector3(c.target.x, c.target.y, c.target.z));
      }
    }, cam);
    
    await new Promise(r => setTimeout(r, 50));
    
    // Screenshot
    const filename = path.join(OUTPUT_DIR, `frame-${String(frame).padStart(4, '0')}.png`);
    await page.screenshot({ path: filename, type: 'png' });
    
    if (frame % 10 === 0) console.log(`Frame ${frame}/180`);
  }
  
  console.log('Done capturing frames!');
  await browser.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
