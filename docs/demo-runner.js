/**
 * demo-runner.js — Auto-play demo for social media recording
 * 
 * Records a ~30s design journey: pick type → resize → doors/windows → orbit.
 * 
 * EASIEST WAY: Just add ?demo to the URL:
 *   configurator.html?demo
 * 
 * The demo starts after a 3-second countdown. Hit record before you tap the link!
 * 
 * Alternative: paste into browser console:
 *   fetch('/demo-runner.js').then(r=>r.text()).then(eval)
 */
(async function() {
  'use strict';

  const dbg = window.__dbg;
  if (!dbg || !dbg.store || !dbg.camera || !dbg.scene) {
    alert('Demo runner: configurator not ready. Wait for page to load.');
    return;
  }

  const store = dbg.store;
  const camera = dbg.camera;
  const scene = dbg.scene;

  // ── Helpers ──────────────────────────────────────────────────
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const PI = Math.PI;

  // Smooth animate a numeric property
  function animate(target, prop, from, to, durationMs, easing) {
    return new Promise(resolve => {
      const start = performance.now();
      const ease = easing || (t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t);
      function tick(now) {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / durationMs);
        target[prop] = from + (to - from) * ease(t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  // Animate camera smoothly
  async function moveCamera(alpha, beta, radius, durationMs) {
    await Promise.all([
      animate(camera, 'alpha', camera.alpha, alpha, durationMs),
      animate(camera, 'beta', camera.beta, beta, durationMs),
      animate(camera, 'radius', camera.radius, radius, durationMs)
    ]);
  }

  // Change building type via dropdown (triggers full preset)
  function setBuildingType(typeValue) {
    const sel = document.getElementById('buildingTypeSelect');
    if (sel) {
      sel.value = typeValue;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Set dimensions via store
  function setDimensions(w, d) {
    store.setState({
      dim: { frameW_mm: w, frameD_mm: d },
      dimInputs: { frameW_mm: w, frameD_mm: d }
    });
  }

  // Smooth dimension animation
  async function animateDimensions(fromW, fromD, toW, toD, durationMs, steps) {
    const n = steps || 20;
    const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    for (let i = 0; i <= n; i++) {
      const t = ease(i / n);
      setDimensions(
        Math.round(fromW + (toW - fromW) * t),
        Math.round(fromD + (toD - fromD) * t)
      );
      await wait(durationMs / n);
    }
  }

  // Hide UI chrome for cleaner recording
  function hideChrome() {
    const hide = sel => { const el = document.querySelector(sel); if (el) el.style.display = 'none'; };
    hide('#buildBadge');           // BUILD: xxxxx badge
    hide('.help-btn');             // ? button
    hide('#tipsContainer');        // Startup tips
    hide('.startup-tips-overlay'); // Tips overlay
    // Hide price range on mobile (it overlaps the 3D view)
    const priceEl = document.querySelector('.price-range-badge, .estimate-badge');
    if (priceEl) priceEl.style.display = 'none';
  }

  // Show UI chrome again
  function showChrome() {
    const show = sel => { const el = document.querySelector(sel); if (el) el.style.display = ''; };
    show('#buildBadge');
    show('.help-btn');
    show('.price-range-badge, .estimate-badge');
  }

  // Create countdown overlay
  function showCountdown(seconds) {
    return new Promise(async resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:system-ui;';
      const num = document.createElement('div');
      num.style.cssText = 'font-size:100px;font-weight:900;color:white;text-shadow:0 4px 20px rgba(0,0,0,0.5);transition:transform 0.3s,opacity 0.3s;';
      overlay.appendChild(num);
      document.body.appendChild(overlay);

      for (let i = seconds; i >= 1; i--) {
        num.textContent = i;
        num.style.transform = 'scale(1.3)';
        num.style.opacity = '1';
        await wait(150);
        num.style.transform = 'scale(1)';
        await wait(850);
      }
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s';
      await wait(300);
      overlay.remove();
      resolve();
    });
  }

  // Show a subtle caption at the bottom of screen
  function showCaption(text, durationMs) {
    const cap = document.createElement('div');
    cap.style.cssText = `
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); color: white; padding: 10px 24px;
      border-radius: 20px; font-family: system-ui; font-size: 15px;
      font-weight: 600; z-index: 999998; letter-spacing: 0.02em;
      opacity: 0; transition: opacity 0.4s;
    `;
    cap.textContent = text;
    document.body.appendChild(cap);
    requestAnimationFrame(() => { cap.style.opacity = '1'; });
    setTimeout(() => {
      cap.style.opacity = '0';
      setTimeout(() => cap.remove(), 400);
    }, durationMs || 2500);
    return cap;
  }

  // ── DEMO SEQUENCE ─────────────────────────────────────────────
  console.log('[DEMO] Starting countdown...');
  await showCountdown(3);

  hideChrome();
  console.log('[DEMO] Go!');

  // ── SET INITIAL STATE: Start on a basic shed ──
  setBuildingType('shed');
  camera.alpha = -PI * 0.75;
  camera.beta = PI * 0.32;
  camera.radius = 5.5;
  await wait(300);

  // ── STEP 1: Show the shed, gentle orbit (3s) ──
  showCaption('Choose your building type', 2800);
  await moveCamera(-PI * 0.6, PI * 0.32, 5, 2800);

  // ── STEP 2: Switch to Garden Room (4s) ──
  console.log('[DEMO] Switch to Garden Room');
  setBuildingType('gardenroom-pent');
  await wait(300);
  showCaption('Garden Room', 2000);
  await moveCamera(-PI * 0.7, PI * 0.28, 6.5, 3000);
  await wait(500);

  // ── STEP 3: Resize the building (4s) ──
  console.log('[DEMO] Resize');
  showCaption('Set your dimensions', 3000);

  const s = store.getState();
  const w0 = s.dim?.frameW_mm || 2000;
  const d0 = s.dim?.frameD_mm || 2601;

  // Widen it
  await Promise.all([
    animateDimensions(w0, d0, 3200, d0, 1800, 12),
    moveCamera(-PI * 0.6, PI * 0.3, 7, 1800)
  ]);
  await wait(200);

  // Deepen it
  await Promise.all([
    animateDimensions(3200, d0, 3200, 3800, 1800, 12),
    moveCamera(-PI * 0.5, PI * 0.28, 7.5, 1800)
  ]);
  await wait(400);

  // ── STEP 4: Orbit to show doors and windows (5s) ──
  console.log('[DEMO] Show doors/windows');
  showCaption('Doors & windows update in real time', 3500);

  // Swing around to the front to show the glazed door and windows
  await moveCamera(-PI * 0.25, PI * 0.38, 6, 2500);
  await wait(1000);

  // Pan to the side to show side windows
  await moveCamera(-PI * 0.05, PI * 0.36, 5.5, 2000);
  await wait(500);

  // ── STEP 5: Look at the roof with skylights (4s) ──
  console.log('[DEMO] Show roof');
  showCaption('Skylights & roof details', 3000);

  // Rise up to show the roof from above
  await moveCamera(-PI * 0.35, PI * 0.18, 7, 2500);
  await wait(1500);

  // ── STEP 6: Final hero orbit (7s) ──
  console.log('[DEMO] Hero orbit');
  showCaption('Design it your way', 3500);

  // Settle to a nice angle then do a slow panoramic orbit
  await moveCamera(-PI * 0.55, PI * 0.3, 6.5, 1500);
  await wait(200);

  // Slow 270° orbit for the cinematic finish
  const finalAlpha = camera.alpha;
  await moveCamera(finalAlpha - PI * 1.5, PI * 0.3, 6.5, 5500);

  // ── END ──
  showChrome();
  console.log('[DEMO] Complete!');
})();
