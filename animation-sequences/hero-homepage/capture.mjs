/**
 * Hero Animation Capture Script
 * Uses CDP to capture frames from the configurator
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CDP_URL = 'ws://172.27.112.1:9222/devtools/page/9B6035E27B83AB91E73573F63AA0A4DB';
const KEYFRAMES_FILE = path.join(__dirname, 'keyframes.json');
const OUTPUT_DIR = path.join(__dirname, 'frames');
const DELAY_BETWEEN_FRAMES = 150; // ms to wait for render

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load keyframes
const keyframes = JSON.parse(fs.readFileSync(KEYFRAMES_FILE, 'utf8'));
console.log(`Loaded ${keyframes.length} keyframes`);

let socket;
let messageId = 1;
let currentFrame = 0;

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
      // Hide control panel
      var panel = document.querySelector('.controls-panel');
      if (panel) panel.style.display = 'none';
      
      // Hide build code
      var build = document.querySelector('.build-code, [class*="build"]');
      if (build) build.style.display = 'none';
      
      // Hide any other UI elements
      document.querySelectorAll('.ui-overlay, .debug-panel, #camControl').forEach(el => el.style.display = 'none');
      
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
      
      // Update roof style
      if (newState.roof && newState.roof.style) {
        var currentRoof = store.getState().roof || {};
        store.setState({ roof: Object.assign({}, currentRoof, { style: newState.roof.style }) });
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
  
  console.log('Starting capture...');
  const startTime = Date.now();
  
  for (const keyframe of keyframes) {
    const filename = await processFrame(keyframe);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const eta = (((Date.now() - startTime) / (keyframe.frame + 1)) * (keyframes.length - keyframe.frame - 1) / 1000).toFixed(0);
    
    process.stdout.write(`\rFrame ${keyframe.frame + 1}/${keyframes.length} | Elapsed: ${elapsed}s | ETA: ${eta}s    `);
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
