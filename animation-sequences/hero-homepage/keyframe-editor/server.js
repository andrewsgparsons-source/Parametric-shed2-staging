const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));  // Increased for large sequence data
app.use(express.static(__dirname));

const CHROME_URL = 'http://172.27.112.1:9222';
const SEQUENCE_FILE = path.join(__dirname, 'sequence-data.json');

// Camera orbit calculation (V3 zoom: wide→close→wide)
const START_ALPHA = 4.076333253372242;
const TARGET = { x: 2.051918843874351, y: 0.9827458108046727, z: 2.055585583611853 };

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

let browser = null;

async function getPage() {
  try {
    if (!browser || !browser.isConnected()) {
      console.log('Connecting to Chrome...');
      browser = await puppeteer.connect({ browserURL: CHROME_URL, defaultViewport: null });
    }
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('Parametric-shed2-staging') || p.url().includes(':8080'));
    if (!page) {
      console.log('No configurator tab found (looking for Parametric-shed2-staging or :8080)');
    }
    return page;
  } catch (err) {
    console.log('Error connecting:', err.message);
    browser = null;
    throw err;
  }
}

// Get current config from configurator
app.get('/api/config', async (req, res) => {
  try {
    const p = await getPage();
    const config = await p.evaluate(() => {
      // Try multiple methods to get config
      if (window.app && window.app.getState) return window.app.getState();
      if (window.app && window.app.state) return window.app.state;
      if (window.getState) return window.getState();
      if (window.state) return window.state;
      // Try to get from global shed object
      if (window.shed && window.shed.config) return window.shed.config;
      // Fallback: try to get from URL
      const url = new URL(window.location.href);
      const state = url.searchParams.get('state');
      if (state) {
        try { return JSON.parse(atob(state)); } catch(e) {}
      }
      // Last resort: scrape from UI
      return null;
    });
    res.json({ ok: true, config });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Set camera position for a frame
app.post('/api/camera', async (req, res) => {
  try {
    const { frame } = req.body;
    const cam = getCameraForFrame(frame);
    const p = await getPage();
    await p.evaluate((c) => {
      const camera = BABYLON.Engine.LastCreatedEngine?.scenes[0]?.activeCamera;
      if (camera) {
        camera.alpha = c.alpha;
        camera.beta = c.beta;
        camera.radius = c.radius;
        if (c.target) camera.setTarget(new BABYLON.Vector3(c.target.x, c.target.y, c.target.z));
      }
    }, cam);
    res.json({ ok: true, camera: cam });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Toggle control panel visibility
app.post('/api/panel', async (req, res) => {
  console.log('Panel toggle request:', req.body);
  try {
    const { visible } = req.body;
    const p = await getPage();
    if (!p) {
      return res.json({ ok: false, error: 'No configurator tab found' });
    }
    const result = await p.evaluate((show) => {
      const panel = document.getElementById('controls');
      if (panel) {
        panel.style.display = show ? '' : 'none';
        return 'Panel set to: ' + (show ? 'visible' : 'hidden');
      }
      return 'Panel not found';
    }, visible);
    console.log('Panel result:', result);
    res.json({ ok: true, visible, result });
  } catch (err) {
    console.log('Panel error:', err.message);
    res.json({ ok: false, error: err.message });
  }
});

// Load config into configurator
app.post('/api/config/load', async (req, res) => {
  try {
    const { config } = req.body;
    const p = await getPage();
    const state64 = Buffer.from(JSON.stringify(config)).toString('base64');
    const url = `https://andrewsgparsons-source.github.io/Parametric-shed2-staging/?profile&state=${state64}#view=3d`;
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Load sequence data
app.get('/api/sequence', (req, res) => {
  try {
    if (fs.existsSync(SEQUENCE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SEQUENCE_FILE, 'utf8'));
      res.json({ ok: true, sequence: data });
    } else {
      res.json({ ok: true, sequence: null });
    }
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Save sequence data
app.post('/api/sequence', (req, res) => {
  try {
    const { sequence } = req.body;
    fs.writeFileSync(SEQUENCE_FILE, JSON.stringify(sequence, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Debug: list available globals
app.get('/api/debug', async (req, res) => {
  try {
    const p = await getPage();
    const info = await p.evaluate(() => {
      const globals = [];
      if (window.app) globals.push('app: ' + Object.keys(window.app).join(', '));
      if (window.shed) globals.push('shed: ' + Object.keys(window.shed).join(', '));
      if (window.state) globals.push('state exists');
      if (window.config) globals.push('config exists');
      if (window.BABYLON) globals.push('BABYLON exists');
      return globals;
    });
    res.json({ ok: true, info });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Initialize sequence with current config for all frames
app.post('/api/sequence/init', async (req, res) => {
  try {
    const p = await getPage();
    const config = await p.evaluate(() => {
      // Try multiple methods
      if (window.app && window.app.getState) return window.app.getState();
      if (window.app && window.app.state) return JSON.parse(JSON.stringify(window.app.state));
      if (window.getState) return window.getState();
      // URL state
      const url = new URL(window.location.href);
      const state = url.searchParams.get('state');
      if (state) {
        try { return JSON.parse(atob(state)); } catch(e) {}
      }
      return null;
    });
    
    if (!config) {
      return res.json({ ok: false, error: 'Could not get current config. Try loading a config with state= in URL.' });
    }
    
    const sequence = {
      totalFrames: 180,
      fps: 12,
      cameraPath: 'v3-zoom',
      startAlpha: START_ALPHA,
      target: TARGET,
      frames: {}
    };
    
    // Set same config for all frames
    for (let i = 0; i < 180; i++) {
      sequence.frames[i] = { ...config };
    }
    
    fs.writeFileSync(SEQUENCE_FILE, JSON.stringify(sequence, null, 2));
    res.json({ ok: true, sequence });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Direct file download (bypasses client-side blob issues)
app.get('/api/sequence/download', (req, res) => {
  try {
    if (fs.existsSync(SEQUENCE_FILE)) {
      res.setHeader('Content-Disposition', 'attachment; filename=sequence-data.json');
      res.setHeader('Content-Type', 'application/json');
      res.sendFile(SEQUENCE_FILE);
    } else {
      res.status(404).json({ error: 'No sequence file found. Save first.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3456;
app.listen(PORT, () => {
  console.log(`Keyframe Editor running at http://localhost:${PORT}`);
  console.log('Open this URL in your browser to edit the sequence.');
});
