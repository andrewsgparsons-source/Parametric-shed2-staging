const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_URL = 'http://172.27.112.1:9222';
const OUTPUT_DIR = '/home/ser/clawd/Parametric-shed2-staging/animation-sequences/showcase/frames';
const CONFIGS_FILE = '/home/ser/clawd/Parametric-shed2-staging/animation-sequences/progressive-configs.json';

const FRAMES_PER_CONFIG = 18;
const START_ALPHA = 4.2;
const ALPHA_PER_FRAME = 0.0175;
const BETA = 1.25;
const RADIUS = 22;

async function main() {
  console.log('Connecting to Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null
  });

  // Load configs
  const configs = JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf8'));
  console.log(`Loaded ${configs.length} configurations`);

  // Get or create capture tab
  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('Parametric-shed2-staging') && !p.url().includes('admin'));
  
  if (!page) {
    console.log('Creating new tab...');
    page = await browser.newPage();
  }
  
  console.log(`Using tab: ${page.url()}`);

  // Ensure output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let frameNum = 1;
  let currentAlpha = START_ALPHA;

  for (let configIdx = 0; configIdx < configs.length; configIdx++) {
    const config = configs[configIdx];
    console.log(`\nConfig ${configIdx + 1}/20: ${config.desc}`);

    // Navigate to config URL
    const url = `https://andrewsgparsons-source.github.io/Parametric-shed2-staging/?profile=test&state=${config.base64}#view=3d`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for render
    await new Promise(r => setTimeout(r, 1000));

    // Hide UI
    await page.evaluate(() => {
      ['controls', 'dbgBootLabel', 'ui-layer', 'mobileOpenBtn', 'statusOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.cssText = 'display: none !important';
      });
    });

    // Capture frames for this config
    for (let f = 0; f < FRAMES_PER_CONFIG; f++) {
      // Set camera
      await page.evaluate((alpha, beta, radius) => {
        const cam = BABYLON.Engine.LastCreatedEngine?.scenes[0]?.activeCamera;
        if (cam) {
          cam.alpha = alpha;
          cam.beta = beta;
          cam.radius = radius;
        }
      }, currentAlpha, BETA, RADIUS);

      // Wait for render
      await new Promise(r => setTimeout(r, 50));

      // Screenshot
      const framePath = path.join(OUTPUT_DIR, `frame_${String(frameNum).padStart(4, '0')}.png`);
      await page.screenshot({ path: framePath });
      
      if (f === 0 || f === FRAMES_PER_CONFIG - 1) {
        console.log(`  Frame ${frameNum}: alpha=${currentAlpha.toFixed(3)}`);
      }

      currentAlpha += ALPHA_PER_FRAME;
      frameNum++;
    }
  }

  console.log(`\nCapture complete! ${frameNum - 1} frames saved to ${OUTPUT_DIR}`);
  await browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
