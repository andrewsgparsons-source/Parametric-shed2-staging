/**
 * tour-runner.js — Comprehensive guided walkthrough of the configurator
 * 
 * Walks through every customer-facing control with a cartoon pointing hand,
 * actually changing values so the building transforms in real time.
 *
 * On mobile: slides the control panel up to show controls, then down to
 * maximise the 3D view between steps.
 *
 * Trigger: configurator.html?tour
 */
(async function() {
  'use strict';

  const dbg = window.__dbg;
  if (!dbg || !dbg.store || !dbg.camera || !dbg.scene) {
    console.warn('[TOUR] Configurator not ready');
    return;
  }

  const store = dbg.store;
  const camera = dbg.camera;
  const mc = window.__mobileConfigurator;
  const isMobile = !!mc;
  const PI = Math.PI;

  // ── Helpers ──────────────────────────────────────────────────
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function animate(target, prop, from, to, durationMs) {
    return new Promise(resolve => {
      const start = performance.now();
      const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        target[prop] = from + (to - from) * ease(t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  async function moveCamera(alpha, beta, radius, durationMs) {
    await Promise.all([
      animate(camera, 'alpha', camera.alpha, alpha, durationMs),
      animate(camera, 'beta', camera.beta, beta, durationMs),
      animate(camera, 'radius', camera.radius, radius, durationMs)
    ]);
  }

  // ── Cartoon Hand ────────────────────────────────────────────
  // SVG pointing hand — simple, friendly, works at any size
  const HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56">
    <g transform="rotate(-15 32 32)">
      <!-- Finger -->
      <rect x="26" y="4" width="12" height="32" rx="6" fill="#FFD93D" stroke="#E8A800" stroke-width="1.5"/>
      <!-- Palm -->
      <rect x="16" y="30" width="32" height="22" rx="8" fill="#FFD93D" stroke="#E8A800" stroke-width="1.5"/>
      <!-- Thumb -->
      <rect x="8" y="28" width="14" height="10" rx="5" fill="#FFD93D" stroke="#E8A800" stroke-width="1.5"/>
      <!-- Fingernail -->
      <rect x="28" y="5" width="8" height="6" rx="4" fill="#FFF3B0" opacity="0.7"/>
    </g>
  </svg>`;

  let handEl = null;

  function createHand() {
    if (handEl) handEl.remove();
    handEl = document.createElement('div');
    handEl.id = 'tourHand';
    handEl.innerHTML = HAND_SVG;
    handEl.style.cssText = `
      position: fixed;
      z-index: 999990;
      pointer-events: none;
      filter: drop-shadow(0 3px 8px rgba(0,0,0,0.3));
      transition: left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.3s;
      opacity: 0;
      transform: translate(-10px, -10px);
    `;
    document.body.appendChild(handEl);
    return handEl;
  }

  function showHand() {
    if (handEl) handEl.style.opacity = '1';
  }

  function hideHand() {
    if (handEl) handEl.style.opacity = '0';
  }

  // Point the hand at a DOM element with a bobbing animation
  function pointAt(element) {
    if (!handEl || !element) return;
    const rect = element.getBoundingClientRect();
    // Point to the right side of the element, vertically centred
    const x = rect.right + 4;
    const y = rect.top + rect.height / 2 - 20;
    handEl.style.left = x + 'px';
    handEl.style.top = y + 'px';
    showHand();
    // Add a gentle bobbing animation
    handEl.style.animation = 'tourHandBob 0.8s ease-in-out infinite';
  }

  // Point at an element by selector
  function pointAtSelector(sel) {
    const el = document.querySelector(sel);
    if (el) pointAt(el);
    return el;
  }

  // ── Caption ─────────────────────────────────────────────────
  let captionEl = null;

  function showCaption(text, subtext) {
    if (!captionEl) {
      captionEl = document.createElement('div');
      captionEl.id = 'tourCaption';
      captionEl.style.cssText = `
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        background: rgba(45,80,22,0.92); color: white; padding: 10px 20px;
        border-radius: 16px; font-family: system-ui, sans-serif;
        z-index: 999991; text-align: center; max-width: 90vw;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        transition: opacity 0.4s;
      `;
      document.body.appendChild(captionEl);
    }
    let html = `<div style="font-size:15px;font-weight:700;line-height:1.3;">${text}</div>`;
    if (subtext) {
      html += `<div style="font-size:12px;font-weight:400;opacity:0.85;margin-top:3px;">${subtext}</div>`;
    }
    captionEl.innerHTML = html;
    captionEl.style.opacity = '1';
  }

  function hideCaption() {
    if (captionEl) captionEl.style.opacity = '0';
  }

  // ── Skip button ─────────────────────────────────────────────
  let skipClicked = false;

  function createSkipButton() {
    const btn = document.createElement('button');
    btn.id = 'tourSkip';
    btn.textContent = 'Skip Tour ✕';
    btn.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 999992;
      background: rgba(0,0,0,0.6); color: white; border: none;
      padding: 8px 16px; border-radius: 20px; font-family: system-ui;
      font-size: 13px; font-weight: 600; cursor: pointer;
      backdrop-filter: blur(4px);
    `;
    btn.addEventListener('click', () => { skipClicked = true; });
    document.body.appendChild(btn);
    return btn;
  }

  // ── Progress bar ────────────────────────────────────────────
  let progressEl = null;
  let progressBarEl = null;

  function createProgress(total) {
    progressEl = document.createElement('div');
    progressEl.style.cssText = `
      position: fixed; bottom: 0; left: 0; width: 100%; height: 4px;
      background: rgba(0,0,0,0.1); z-index: 999991;
    `;
    progressBarEl = document.createElement('div');
    progressBarEl.style.cssText = `
      height: 100%; width: 0%; background: #4CAF50;
      transition: width 0.5s ease;
    `;
    progressEl.appendChild(progressBarEl);
    document.body.appendChild(progressEl);
  }

  function updateProgress(current, total) {
    if (progressBarEl) {
      progressBarEl.style.width = ((current / total) * 100) + '%';
    }
  }

  // ── Mobile panel control ────────────────────────────────────
  // Slides the controls panel up (showing controls) or down (maximising 3D view)
  async function panelUp() {
    if (mc) {
      mc.setPreviewHeight(25); // Small preview = more room for controls
      await wait(400);
    }
  }

  async function panelDown() {
    if (mc) {
      mc.setPreviewHeight(70); // Big preview = maximise 3D view
      await wait(400);
    }
  }

  // ── UI chrome ───────────────────────────────────────────────
  function hideChrome() {
    const hide = sel => { const el = document.querySelector(sel); if (el) el.style.display = 'none'; };
    hide('#buildBadge');
    hide('.help-btn');
    hide('#tipsContainer');
    hide('.startup-tips-overlay');
  }

  function showChrome() {
    const show = sel => { const el = document.querySelector(sel); if (el) el.style.display = ''; };
    show('#buildBadge');
    show('.help-btn');
  }

  // ── Value changers ──────────────────────────────────────────
  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickButton(selector) {
    const el = document.querySelector(selector);
    if (el) el.click();
  }

  function setCheckbox(id, checked) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.checked !== checked) el.click();
  }

  // Smooth dimension animation
  async function animateDimensions(fromW, fromD, toW, toD, durationMs) {
    const steps = 20;
    const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    for (let i = 0; i <= steps; i++) {
      const t = ease(i / steps);
      const w = Math.round(fromW + (toW - fromW) * t);
      const d = Math.round(fromD + (toD - fromD) * t);
      store.setState({
        dim: { frameW_mm: w, frameD_mm: d },
        dimInputs: { frameW_mm: w, frameD_mm: d }
      });
      // Sync the actual input elements
      const wEl = document.getElementById('wInput');
      const dEl = document.getElementById('dInput');
      if (wEl) wEl.value = w;
      if (dEl) dEl.value = d;
      await wait(durationMs / steps);
    }
  }

  // ── Inject CSS animation for hand bob ───────────────────────
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    @keyframes tourHandBob {
      0%, 100% { transform: translate(-10px, -10px) translateY(0); }
      50% { transform: translate(-10px, -10px) translateY(-6px); }
    }
    #tourHand { will-change: left, top, opacity; }
    .tour-highlight {
      outline: 3px solid #4CAF50 !important;
      outline-offset: 3px;
      border-radius: 6px;
      animation: tourPulse 1.2s ease-in-out infinite;
    }
    @keyframes tourPulse {
      0%, 100% { outline-color: #4CAF50; }
      50% { outline-color: #81C784; }
    }
  `;
  document.head.appendChild(styleTag);

  // Highlight an element with a green outline
  function highlight(el) {
    if (el) el.classList.add('tour-highlight');
  }
  function unhighlight(el) {
    if (el) el.classList.remove('tour-highlight');
  }
  function unhighlightAll() {
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  }

  // ── TOUR STEP DEFINITIONS ────────────────────────────────────
  // Each step: { caption, sub?, mobileStep (index), target (selector), action (async fn), cameraAfter? }
  const tourSteps = [
    // === STEP 0: INTRO ===
    {
      caption: 'Welcome to My3DBuild',
      sub: 'Design your own garden building in minutes',
      action: async () => {
        hideHand();
        // Set initial state: basic shed
        setSelectValue('buildingTypeSelect', 'shed');
        await wait(500);
        // Nice starting angle
        await moveCamera(-PI * 0.45, PI * 0.35, 7, 1500);
      },
      admire: 2000
    },

    // === SIZE & SHAPE (Mobile step 0) ===
    {
      caption: 'Choose your building type',
      sub: 'Start with a shed, garden room, workshop or more',
      mobileStep: 0,
      target: '#buildingTypeSelect, .mc-type-select',
      action: async () => {
        const sel = document.querySelector('#buildingTypeSelect, .mc-type-select');
        highlight(sel);
        pointAt(sel);
        await wait(2000);
        // Change to garden room
        setSelectValue('buildingTypeSelect', 'gardenroom-pent');
        if (sel) sel.value = 'gardenroom-pent';
        await wait(1500);
        unhighlight(sel);
      },
      admire: 2500,
      cameraAfter: [-PI * 0.5, PI * 0.32, 7.5]
    },
    {
      caption: 'Set your width',
      sub: 'Drag or type to resize',
      mobileStep: 0,
      target: '#wInput',
      action: async () => {
        const el = document.getElementById('wInput');
        highlight(el);
        pointAt(el);
        await wait(1000);
        const s = store.getState();
        const w0 = s.dim?.frameW_mm || 3000;
        const d0 = s.dim?.frameD_mm || 4000;
        await animateDimensions(w0, d0, 4000, d0, 2000);
        await wait(500);
        unhighlight(el);
      },
      admire: 2000,
      cameraAfter: [-PI * 0.55, PI * 0.3, 8]
    },
    {
      caption: 'Set your depth',
      sub: 'The building stretches in real time',
      mobileStep: 0,
      target: '#dInput',
      action: async () => {
        const el = document.getElementById('dInput');
        highlight(el);
        pointAt(el);
        await wait(1000);
        const s = store.getState();
        const w0 = s.dim?.frameW_mm || 4000;
        const d0 = s.dim?.frameD_mm || 4000;
        await animateDimensions(w0, d0, w0, 5000, 2000);
        await wait(500);
        unhighlight(el);
      },
      admire: 2000,
      cameraAfter: [-PI * 0.4, PI * 0.28, 8.5]
    },

    // === WALLS & OPENINGS (Mobile step 2) ===
    {
      caption: 'Add doors to your building',
      sub: 'Tap to add and position them on any wall',
      mobileStep: 2,
      target: '#doorsGroup',
      action: async () => {
        // Open the doors group
        const doorsGroup = document.getElementById('doorsGroup');
        if (doorsGroup && !doorsGroup.open) doorsGroup.setAttribute('open', '');
        await wait(300);
        // Find and click "Add Door" button
        const addBtn = doorsGroup?.querySelector('button, .openings-add-btn, [data-action="add"]');
        highlight(doorsGroup);
        pointAt(addBtn || doorsGroup);
        await wait(1500);
        if (addBtn) addBtn.click();
        await wait(1000);
        unhighlight(doorsGroup);
      },
      admire: 2500,
      cameraAfter: [-PI * 0.25, PI * 0.35, 6]
    },
    {
      caption: 'Add windows for natural light',
      sub: 'Position and size them freely',
      mobileStep: 2,
      target: '#windowsGroup',
      action: async () => {
        const winGroup = document.getElementById('windowsGroup');
        if (winGroup && !winGroup.open) winGroup.setAttribute('open', '');
        await wait(300);
        const addBtn = winGroup?.querySelector('button, .openings-add-btn, [data-action="add"]');
        highlight(winGroup);
        pointAt(addBtn || winGroup);
        await wait(1500);
        if (addBtn) addBtn.click();
        await wait(1000);
        unhighlight(winGroup);
      },
      admire: 2500,
      cameraAfter: [-PI * 0.1, PI * 0.35, 6]
    },

    // === ROOF (Mobile step 3) ===
    {
      caption: 'Roof options',
      sub: 'Adjust height, overhangs and skylights',
      mobileStep: 3,
      target: '#roofHeightsGroup',
      action: async () => {
        const group = document.getElementById('roofHeightsGroup');
        if (group && !group.open) group.setAttribute('open', '');
        highlight(group);
        pointAt(group);
        await wait(2500);
        unhighlight(group);
      },
      admire: 2000,
      cameraAfter: [-PI * 0.4, PI * 0.18, 8]
    },
    {
      caption: 'Add skylights',
      sub: 'Let in overhead light',
      mobileStep: 3,
      target: '#skylightsGroupRoof',
      action: async () => {
        const group = document.getElementById('skylightsGroupRoof');
        if (group && !group.open) group.setAttribute('open', '');
        await wait(300);
        const addBtn = group?.querySelector('button, .openings-add-btn, [data-action="add"]');
        highlight(group);
        pointAt(addBtn || group);
        await wait(1500);
        if (addBtn) addBtn.click();
        await wait(1000);
        unhighlight(group);
      },
      admire: 2500,
      cameraAfter: [-PI * 0.35, PI * 0.15, 7]
    },

    // === APPEARANCE (Mobile step 4) ===
    {
      caption: 'Choose your cladding style',
      sub: 'Shiplap, featheredge, tongue & groove and more',
      mobileStep: 4,
      target: '#claddingStyle',
      action: async () => {
        const el = document.getElementById('claddingStyle');
        highlight(el);
        pointAt(el);
        await wait(1500);
        // Cycle through a couple of cladding options
        const options = el ? Array.from(el.options) : [];
        if (options.length > 1) {
          setSelectValue('claddingStyle', options[1].value);
          await wait(1200);
          if (options.length > 2) {
            setSelectValue('claddingStyle', options[2].value);
            await wait(1200);
          }
        }
        unhighlight(el);
      },
      admire: 2000,
      cameraAfter: [-PI * 0.3, PI * 0.35, 6.5]
    },
    {
      caption: 'Pick your colour',
      sub: 'See it change instantly on the 3D model',
      mobileStep: 4,
      target: '#claddingColour',
      action: async () => {
        const el = document.getElementById('claddingColour');
        highlight(el);
        pointAt(el);
        await wait(1500);
        const options = el ? Array.from(el.options) : [];
        // Cycle a few colours
        for (let i = 1; i < Math.min(4, options.length); i++) {
          setSelectValue('claddingColour', options[i].value);
          await wait(800);
        }
        unhighlight(el);
      },
      admire: 2500,
      cameraAfter: [-PI * 0.5, PI * 0.3, 7]
    },
    {
      caption: 'Roof covering',
      sub: 'Felt, tiles, or metal roofing',
      mobileStep: 4,
      target: '#roofCovering',
      action: async () => {
        const el = document.getElementById('roofCovering');
        if (!el) return;
        highlight(el);
        pointAt(el);
        await wait(1500);
        const options = Array.from(el.options);
        if (options.length > 1) {
          setSelectValue('roofCovering', options[1].value);
          await wait(1000);
        }
        unhighlight(el);
      },
      admire: 2000,
      cameraAfter: [-PI * 0.4, PI * 0.2, 7.5]
    },

    // === FINAL ORBIT ===
    {
      caption: 'Your design is ready',
      sub: 'Rotate to see it from every angle, then get a quote',
      action: async () => {
        hideHand();
        // Cinematic orbit
        await moveCamera(-PI * 0.5, PI * 0.3, 7, 1500);
        await wait(300);
        await moveCamera(-PI * 0.5 - PI * 1.2, PI * 0.28, 7, 5000);
      },
      admire: 1000
    }
  ];

  // ── MAIN TOUR LOOP ──────────────────────────────────────────
  console.log('[TOUR] Starting guided tour — ' + tourSteps.length + ' steps');

  // Setup
  createHand();
  const skipBtn = createSkipButton();
  createProgress(tourSteps.length);
  hideChrome();

  // Dismiss any startup tips
  const tipsBtn = document.querySelector('.tips-dismiss, .startup-tips-close');
  if (tipsBtn) tipsBtn.click();
  await wait(500);

  // Initial camera position
  if (isMobile) await panelDown();

  let lastMobileStep = -1;

  for (let i = 0; i < tourSteps.length; i++) {
    if (skipClicked) break;

    const step = tourSteps[i];
    updateProgress(i, tourSteps.length);

    // Show caption
    showCaption(step.caption, step.sub || '');

    // If this step has a mobile step and it's different, switch to it
    if (isMobile && step.mobileStep !== undefined && step.mobileStep !== lastMobileStep) {
      await panelUp();
      await wait(300);
      mc.goToStep(step.mobileStep);
      lastMobileStep = step.mobileStep;
      await wait(500);
    } else if (isMobile && step.mobileStep !== undefined) {
      // Same mobile step but different control — panel should be up
      await panelUp();
      await wait(200);
    } else if (isMobile && step.mobileStep === undefined) {
      // No controls needed (intro/outro) — panel down
      await panelDown();
      await wait(200);
    }

    // Scroll target into view and point at it
    if (step.target) {
      const targetEl = document.querySelector(step.target);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(300);
      }
    }

    // Run the step action
    if (step.action) {
      await step.action();
    }

    if (skipClicked) break;

    // Admire phase: panel down, orbit a bit
    hideHand();
    unhighlightAll();

    if (isMobile) await panelDown();

    if (step.cameraAfter) {
      await moveCamera(step.cameraAfter[0], step.cameraAfter[1], step.cameraAfter[2], 1500);
    }

    // Pause to admire
    await wait(step.admire || 2000);

    if (skipClicked) break;
  }

  // ── CLEANUP ─────────────────────────────────────────────────
  updateProgress(tourSteps.length, tourSteps.length);
  hideCaption();
  hideHand();
  unhighlightAll();
  showChrome();

  // Remove tour UI elements after fade
  await wait(500);
  if (handEl) handEl.remove();
  if (captionEl) captionEl.remove();
  if (skipBtn) skipBtn.remove();
  if (progressEl) progressEl.remove();
  styleTag.remove();

  // Reset panel to normal position
  if (isMobile) mc.setPreviewHeight(40);

  // Show a "tour complete" message briefly
  const complete = document.createElement('div');
  complete.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(45,80,22,0.95); color: white; padding: 24px 36px;
    border-radius: 20px; font-family: system-ui; text-align: center;
    z-index: 999999; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;
  complete.innerHTML = `
    <div style="font-size:28px;margin-bottom:8px;">🏠</div>
    <div style="font-size:18px;font-weight:700;">Tour Complete!</div>
    <div style="font-size:14px;opacity:0.85;margin-top:6px;">Now it's your turn — design your own building</div>
  `;
  document.body.appendChild(complete);
  await wait(3000);
  complete.style.opacity = '0';
  complete.style.transition = 'opacity 0.5s';
  await wait(500);
  complete.remove();

  console.log('[TOUR] Complete!');
})();
