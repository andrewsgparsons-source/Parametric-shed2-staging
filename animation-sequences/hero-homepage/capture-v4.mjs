/**
 * Hero Animation Capture Script v2
 * Uses CDP to capture frames from the configurator
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use viewer tab for clean capture (no admin controls)
const CDP_URL = 'ws://172.27.112.1:9222/devtools/page/787ACDE5F47757BA5F332E249579FC54';
const KEYFRAMES_FILE = path.join(__dirname, 'keyframes-v4.json');
const OUTPUT_DIR = path.join(__dirname, 'frames-v4');
const DELAY_BETWEEN_FRAMES = 200; // ms to wait for render (increased for larger model)

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load keyframes
const keyframes = JSON.parse(fs.readFileSync(KEYFRAMES_FILE, 'utf8'));
console.log(`Loaded ${keyframes.length} keyframes`);

let socket;
let messageId = 1;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        socket.off('message', handler);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
      }
    };
    socket.on('message', handler);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function hideUI() {
  await send('Runtime.evaluate', {
    expression: `
      // CRITICAL: Hide the main control panel (aside#controlPanel)
      var mainPanel = document.getElementById('controlPanel');
      if (mainPanel) mainPanel.style.display = 'none';
      
      // Hide build code / version display
      var build = document.querySelector('.build-code, .version, [class*="build"]');
      if (build) build.style.display = 'none';
      
      // Hide camera controls and any debug UI
      var camControl = document.getElementById('camControl');
      if (camControl) camControl.style.display = 'none';
      
      // Hide any other UI overlays
      var uiElements = document.querySelectorAll('.ui-overlay, .debug-panel, .fullscreen-btn, button.fullscreen');
      uiElements.forEach(function(el) { 
        if (el && el.style) el.style.display = 'none'; 
      });
      
      'UI hidden'
    `
  });
}

async function setCamera(camera) {
  await send('Runtime.evaluate', {
    expression: `
      var cam = window.__dbg.camera;
      cam.alpha = ${camera.alpha};
      cam.beta = ${camera.beta};
      cam.radius = ${camera.radius};
      cam.target.x = ${camera.target.x};
      cam.target.y = ${camera.target.y};
      cam.target.z = ${camera.target.z};
      'Camera set'
    `
  });
}

async function applyState(state) {
  const stateJson = JSON.stringify(state);
  await send('Runtime.evaluate', {
    expression: `
      var newState = ${stateJson};
      var store = window.__dbg.store;
      
      // Update dimensions
      if (newState.dim) {
        store.setState({ dim: Object.assign({}, store.getState().dim, newState.dim) });
      }
      
      // Update roof
      if (newState.roof) {
        var currentRoof = store.getState().roof || {};
        var newRoof = Object.assign({}, currentRoof, { style: newState.roof.style });
        
        // Copy roof-specific params
        if (newState.roof.apex) newRoof.apex = newState.roof.apex;
        if (newState.roof.pent) newRoof.pent = newState.roof.pent;
        if (newState.roof.hipped) newRoof.hipped = newState.roof.hipped;
        
        store.setState({ roof: newRoof });
      }
      
      // Update openings (door state)
      if (newState.walls && newState.walls.openings) {
        var currentWalls = store.getState().walls || {};
        store.setState({ walls: Object.assign({}, currentWalls, { openings: newState.walls.openings }) });
      }
      
      'State applied'
    `
  });
}

async function forceRender() {
  await send('Runtime.evaluate', {
    expression: `
      window.__dbg.scene.render();
      'Rendered'
    `
  });
}

async function captureFrame(frameNum) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const filename = path.join(OUTPUT_DIR, `frame_${String(frameNum).padStart(4, '0')}.png`);
  fs.writeFileSync(filename, Buffer.from(result.data, 'base64'));
  return filename;
}

async function processFrame(keyframe) {
  // Set camera
  await setCamera(keyframe.camera);
  
  // Apply state changes
  await applyState(keyframe.state);
  
  // Wait for render
  await new Promise(r => setTimeout(r, DELAY_BETWEEN_FRAMES));
  
  // Force render
  await forceRender();
  
  // Ensure UI is still hidden
  await hideUI();
  
  // Small additional delay
  await new Promise(r => setTimeout(r, 50));
  
  // Capture
  const filename = await captureFrame(keyframe.frame);
  return filename;
}

async function run() {
  console.log('Connecting to Chrome...');
  
  socket = new WebSocket(CDP_URL);
  
  await new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });
  
  console.log('Connected. Hiding UI...');
  await hideUI();
  
  console.log('Starting capture of', keyframes.length, 'frames...');
  const startTime = Date.now();
  
  for (const keyframe of keyframes) {
    const filename = await processFrame(keyframe);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const eta = (((Date.now() - startTime) / (keyframe.frame + 1)) * (keyframes.length - keyframe.frame - 1) / 1000).toFixed(0);
    
    process.stdout.write(`\rFrame ${keyframe.frame + 1}/${keyframes.length} [${keyframe.phase}] | Elapsed: ${elapsed}s | ETA: ${eta}s    `);
  }
  
  console.log('\n\nCapture complete!');
  console.log(`Frames saved to: ${OUTPUT_DIR}`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  
  socket.close();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
