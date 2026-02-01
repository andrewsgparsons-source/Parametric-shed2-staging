// Hero Homepage Sequence - Browser Capture Script
// Run this in the browser console to capture all 360 frames

(async function captureSequence() {
  const TOTAL_FRAMES = 360;
  const FPS = 12;
  
  // Camera path from orbit-v3-ISSUED
  const CAMERA_PATH = {
    alpha: { start: -2.15, delta: 6.283185307 },
    radius: { wide: 8.5, close: 5.5 },
    beta: { eyeLevel: 1.25, elevated: 1.0 },
    target: { x: 1.15, y: 0.75, z: 0.80 }
  };
  
  // Trapezoidal easing
  function trapezoidalEase(t) {
    if (t < 0.333) {
      return 2.25 * t * t;
    } else if (t < 0.667) {
      return 1.5 * (t - 0.167);
    } else {
      const t2 = t - 0.667;
      return 0.75 + 1.5 * t2 - 2.25 * t2 * t2;
    }
  }
  
  // Get camera position for frame
  function getCameraForFrame(frame) {
    const t = frame / TOTAL_FRAMES;
    const easedT = trapezoidalEase(t);
    const orbitAngle = easedT * 2 * Math.PI;
    
    return {
      alpha: CAMERA_PATH.alpha.start + easedT * CAMERA_PATH.alpha.delta,
      beta: 1.125 + 0.125 * Math.cos(orbitAngle),
      radius: 7.0 + 1.5 * Math.cos(orbitAngle)
    };
  }
  
  // Ease-in-out for dimension morphing
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  
  function lerp(start, end, t) {
    return Math.round(start + (end - start) * t);
  }
  
  // Visibility order
  const VIS_ORDER_OFF = ['roofParts.covering', 'roofParts.osb', 'cladding', 'openings', 'deck', 'ins', 'base'];
  const VIS_ORDER_ON = ['base', 'ins', 'deck', 'openings', 'cladding', 'roofParts.osb', 'roofParts.covering'];
  
  // Generate config for degree
  function generateConfig(degree) {
    // Dimensions
    let w = 1800, d = 2400;
    if (degree >= 45 && degree <= 135) {
      const t = easeInOut((degree - 45) / 90);
      w = lerp(1800, 2500, t);
      d = lerp(2400, 2500, t);
    } else if (degree > 135 && degree < 190) {
      w = 2500; d = 2500;
    } else if (degree >= 190 && degree <= 300) {
      const t = easeInOut((degree - 190) / 110);
      w = lerp(2500, 1800, t);
      d = lerp(2500, 2400, t);
    }
    
    // Roof style
    const roofStyle = (degree >= 90 && degree < 270) ? 'pent' : 'apex';
    
    // Openings
    const openings = (degree >= 90 && degree < 270) ? [] : [
      { id: "door1", wall: "front", type: "door", enabled: true, x_mm: 500, width_mm: 800, height_mm: 1900, style: "standard", handleSide: "left", isOpen: false },
      { id: "win1", wall: "left", type: "window", enabled: true, x_mm: 800, y_mm: 1050, width_mm: 600, height_mm: 400 }
    ];
    
    // Visibility
    const vis = {
      roof: true, cladding: true, openings: true,
      base: true, ins: true, deck: true,
      roofParts: { osb: true, covering: true }
    };
    
    // Toggle OFF: 45° - 180°
    if (degree >= 45 && degree <= 180) {
      const progress = Math.min(1, (degree - 45) / 135);
      const layersOff = Math.min(7, Math.floor(progress * 7.5));
      for (let i = 0; i < layersOff; i++) {
        const key = VIS_ORDER_OFF[i];
        if (key.includes('.')) {
          const [p, c] = key.split('.');
          vis[p][c] = false;
        } else {
          vis[key] = false;
        }
      }
    }
    
    // Toggle ON: 180° - 280°
    if (degree > 180 && degree <= 280) {
      // Start all off
      VIS_ORDER_OFF.forEach(key => {
        if (key.includes('.')) {
          const [p, c] = key.split('.');
          vis[p][c] = false;
        } else {
          vis[key] = false;
        }
      });
      const progress = (degree - 180) / 100;
      const layersOn = Math.min(7, Math.floor(progress * 7.5));
      for (let i = 0; i < layersOn; i++) {
        const key = VIS_ORDER_ON[i];
        if (key.includes('.')) {
          const [p, c] = key.split('.');
          vis[p][c] = true;
        } else {
          vis[key] = true;
        }
      }
    }
    
    return {
      w, d, dimMode: "frame",
      roof: {
        style: roofStyle,
        apex: { heightToEaves_mm: 1850, heightToCrest_mm: 2200, trussCount: 3, tieBeam: "eaves" },
        pent: { minHeight_mm: 2200, maxHeight_mm: 2500 }
      },
      overhang: { uniform_mm: 75 },
      walls: { variant: "basic", height_mm: 2400, openings },
      frame: { thickness_mm: 50, depth_mm: 75 },
      vis
    };
  }
  
  // Apply config to store
  function applyConfig(config) {
    const store = window.__dbg.store;
    if (!store) throw new Error('Store not found');
    
    // Apply in chunks to trigger rebuilds
    store.setState({ w: config.w, d: config.d });
    store.setState({ dim: { frameW_mm: config.w, frameD_mm: config.d } });
    store.setState({ roof: config.roof });
    store.setState({ walls: config.walls });
    store.setState({ vis: config.vis });
  }
  
  // Set camera position
  function setCamera(cam) {
    const camera = window.__dbg.camera;
    if (!camera) throw new Error('Camera not found');
    camera.alpha = cam.alpha;
    camera.beta = cam.beta;
    camera.radius = cam.radius;
  }
  
  // Hide UI
  function hideUI() {
    document.querySelectorAll('.control-panel, #controlPanel, .boPanel, .lil-gui, [class*="panel"]').forEach(el => {
      el.style.display = 'none';
    });
    const cp = document.getElementById('controlPanel');
    if (cp) cp.style.display = 'none';
  }
  
  // Capture canvas to blob
  async function captureFrame() {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');
    
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
  }
  
  // Download blob
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // Wait for render
  function waitForRender(ms = 100) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Main capture loop
  console.log('🎬 Starting capture sequence...');
  hideUI();
  
  const frames = [];
  
  for (let frame = 1; frame <= TOTAL_FRAMES; frame++) {
    const degree = frame - 1;
    
    // Generate and apply config
    const config = generateConfig(degree);
    applyConfig(config);
    
    // Set camera
    const cam = getCameraForFrame(frame);
    setCamera(cam);
    
    // Wait for render
    await waitForRender(150);
    
    // Capture
    const blob = await captureFrame();
    frames.push({ frame, blob });
    
    if (frame % 30 === 0) {
      console.log(`📸 Captured frame ${frame}/${TOTAL_FRAMES}`);
    }
  }
  
  console.log('✅ Capture complete! Downloading frames...');
  
  // Download all frames
  for (const { frame, blob } of frames) {
    const filename = `frame_${String(frame).padStart(4, '0')}.png`;
    downloadBlob(blob, filename);
    await waitForRender(50); // Small delay between downloads
  }
  
  console.log('🎉 All frames downloaded!');
})();
