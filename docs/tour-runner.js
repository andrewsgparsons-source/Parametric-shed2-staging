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

  // ── Pointing Hand ────────────────────────────────────────────
  // Use native emoji — universally recognisable, no ambiguity
  const HAND_HTML = `<span style="font-size:48px;line-height:1;">👆</span>`;

  let handEl = null;

  function createHand() {
    if (handEl) handEl.remove();
    handEl = document.createElement('div');
    handEl.id = 'tourHand';
    handEl.innerHTML = HAND_HTML;
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

  // ── Sidebar control (desktop) ─────────────────────────────────
  // The sidebar wizard exposes openFlyout(idx) for each section:
  // 0=Size&Shape, 1=Base, 2=Walls&Openings, 3=Roof, 4=Appearance, 5=Attachments, 6=Customise View, 7=Save&Share
  function openSidebarSection(idx) {
    // Click the step button in the sidebar wizard
    const stepBtns = document.querySelectorAll('.sw-step');
    if (stepBtns[idx]) {
      stepBtns[idx].click();
    }
  }

  function closeSidebar() {
    // Click the active step to toggle it closed, or click the X
    const closeBtn = document.querySelector('#swFlyout .sw-flyout-close, .sw-close');
    if (closeBtn) { closeBtn.click(); return; }
    const active = document.querySelector('.sw-step.active');
    if (active) active.click();
  }

  // ── TOUR STEP DEFINITIONS ────────────────────────────────────
  // Built step-by-step from Andrew's screenshots.
  // Default camera: alpha=-PI/4, beta=PI/3, radius=8, target=(1.5,0,2)
  const tourSteps = [

    // === STEP 1: LIFT & ROTATE ===
    // From default view, smooth rotate left and lift to show back-left corner at eye level
    {
      caption: 'Welcome to My3DBuild',
      sub: 'Design your own garden building in minutes',
      action: async () => {
        hideHand();
        // Ensure we start on shed with default state
        setSelectValue('buildingTypeSelect', 'shed');
        await wait(500);
        // Smooth lift & rotate left — show back-left corner, eye level
        // Default is alpha=-PI/4 (~-0.785), beta=PI/3 (~1.047), radius=8
        // Target: rotated left to see side/back, slightly lower beta for eye level
        await moveCamera(-PI * 0.15, PI * 0.38, 7.5, 2000);
      },
      admire: 2500
    },

    // === STEP 2: OPEN SIZE & SHAPE, ZOOM IN ===
    // Open the sidebar section, rotate back to front-right, zoom in so shed fills screen
    {
      caption: 'Size & Shape',
      sub: 'Set your dimensions, roof type and frame',
      action: async () => {
        hideHand();
        // Open Size & Shape section in sidebar
        if (!isMobile) openSidebarSection(0);
        await wait(600);
        // Rotate to front-right view and zoom in — shed fills more screen
        await moveCamera(-PI * 0.28, PI * 0.35, 6, 2000);
      },
      admire: 3000
    },

    // === MORE STEPS TO COME ===
    // (Waiting for Andrew's screenshots for each subsequent stage)
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
