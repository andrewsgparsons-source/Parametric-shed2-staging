/**
 * tour-runner.js — Comprehensive guided walkthrough of the configurator
 * 
 * Walks through configurator controls with a pointing hand,
 * changing values so the building transforms in real time.
 * Custom dropdowns (CustomSelect) open visually to show all options.
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

  // ── Simulated Mouse Cursor ────────────────────────────────────
  // SVG cursor that looks like a real mouse pointer
  const CURSOR_SVG = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g filter="url(#shadow)">
      <path d="M6 3L6 22.5L10.8 17.7L14.4 25.5L17.4 24L13.8 16.2L20.4 16.2L6 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
    </g>
    <defs><filter id="shadow" x="0" y="0" width="28" height="32" filterUnits="userSpaceOnUse">
      <feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-opacity="0.35"/>
    </filter></defs>
  </svg>`;

  let cursorEl = null;
  let cursorX = 0, cursorY = 0;
  let lastHoverEl = null;

  function createCursor() {
    if (cursorEl) cursorEl.remove();
    cursorEl = document.createElement('div');
    cursorEl.id = 'tourCursor';
    cursorEl.innerHTML = CURSOR_SVG;
    cursorEl.style.cssText = `
      position: fixed; z-index: 2147483647; pointer-events: none;
      opacity: 0; transition: opacity 0.3s;
      will-change: transform;
    `;
    document.body.appendChild(cursorEl);
    cursorX = window.innerWidth / 2;
    cursorY = window.innerHeight / 2;
    cursorEl.style.transform = 'translate(' + cursorX + 'px, ' + cursorY + 'px)';
  }

  function showCursor() { if (cursorEl) cursorEl.style.opacity = '1'; }
  function hideCursor() { if (cursorEl) cursorEl.style.opacity = '0'; }

  // Dispatch a synthetic mouse event at the current cursor position
  function dispatchMouse(type, x, y) {
    var el = document.elementFromPoint(x + 4, y + 2); // offset to arrow tip
    if (!el) return;
    var opts = { bubbles: true, cancelable: true, clientX: x + 4, clientY: y + 2, view: window };

    // Handle mouseenter/mouseleave when target changes
    if (type === 'mousemove' && el !== lastHoverEl) {
      if (lastHoverEl) {
        lastHoverEl.dispatchEvent(new MouseEvent('mouseleave', opts));
        lastHoverEl.dispatchEvent(new MouseEvent('mouseout', opts));
      }
      el.dispatchEvent(new MouseEvent('mouseenter', opts));
      el.dispatchEvent(new MouseEvent('mouseover', opts));
      lastHoverEl = el;
    }
    el.dispatchEvent(new MouseEvent(type, opts));
  }

  // Smoothly glide cursor to a position, dispatching mousemove along the way
  function glideTo(x, y, durationMs) {
    return new Promise(resolve => {
      const startX = cursorX, startY = cursorY;
      const start = performance.now();
      const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
      let lastDispatch = 0;
      function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const et = ease(t);
        cursorX = startX + (x - startX) * et;
        cursorY = startY + (y - startY) * et;
        if (cursorEl) cursorEl.style.transform = 'translate(' + cursorX + 'px, ' + cursorY + 'px)';
        // Dispatch mousemove every ~50ms so hover states update
        if (now - lastDispatch > 50) {
          dispatchMouse('mousemove', cursorX, cursorY);
          lastDispatch = now;
        }
        if (t < 1) requestAnimationFrame(tick);
        else {
          dispatchMouse('mousemove', cursorX, cursorY);
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  // Glide cursor to centre of an element
  async function moveTo(element, durationMs) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 4;
    const y = rect.top + rect.height / 2 - 2;
    showCursor();
    await glideTo(x, y, durationMs || 600);
  }

  // Glide to element then dispatch full click sequence
  async function moveAndClick(element, durationMs) {
    if (!element) return;
    await moveTo(element, durationMs || 600);
    // Dispatch real mousedown/mouseup/click
    dispatchMouse('mousedown', cursorX, cursorY);
    // Visual press effect
    if (cursorEl) {
      var cx = cursorX, cy = cursorY;
      cursorEl.style.transform = 'translate(' + cx + 'px, ' + cy + 'px) scale(0.85)';
    }
    await wait(100);
    dispatchMouse('mouseup', cursorX, cursorY);
    if (cursorEl) {
      cursorEl.style.transform = 'translate(' + cursorX + 'px, ' + cursorY + 'px) scale(1)';
    }
    await wait(50);
    dispatchMouse('click', cursorX, cursorY);
  }

  // Legacy names
  function hideHand() { hideCursor(); }
  function showHand() { showCursor(); }

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
        z-index: 2147483647; text-align: center; max-width: 90vw;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2); transition: opacity 0.4s;
      `;
      document.body.appendChild(captionEl);
    }
    let html = `<div style="font-size:15px;font-weight:700;line-height:1.3;">${text}</div>`;
    if (subtext) html += `<div style="font-size:12px;font-weight:400;opacity:0.85;margin-top:3px;">${subtext}</div>`;
    captionEl.innerHTML = html;
    captionEl.style.opacity = '1';
  }

  function hideCaption() { if (captionEl) captionEl.style.opacity = '0'; }

  // ── Skip button ─────────────────────────────────────────────
  let skipClicked = false;

  function createSkipButton() {
    const btn = document.createElement('button');
    btn.id = 'tourSkip';
    btn.textContent = 'Skip Tour ✕';
    btn.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
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
  let progressEl = null, progressBarEl = null;

  function createProgress(total) {
    progressEl = document.createElement('div');
    progressEl.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;height:4px;background:rgba(0,0,0,0.1);z-index:2147483647;';
    progressBarEl = document.createElement('div');
    progressBarEl.style.cssText = 'height:100%;width:0%;background:#4CAF50;transition:width 0.5s ease;';
    progressEl.appendChild(progressBarEl);
    document.body.appendChild(progressEl);
  }

  function updateProgress(current, total) {
    if (progressBarEl) progressBarEl.style.width = ((current / total) * 100) + '%';
  }

  // ── Mobile panel control ────────────────────────────────────
  async function panelUp() { if (mc) { mc.setPreviewHeight(25); await wait(400); } }
  async function panelDown() { if (mc) { mc.setPreviewHeight(70); await wait(400); } }

  // ── UI chrome ───────────────────────────────────────────────
  function hideChrome() {
    ['#buildBadge', '.help-btn', '#tipsContainer', '.startup-tips-overlay'].forEach(sel => {
      const el = document.querySelector(sel); if (el) el.style.display = 'none';
    });
  }
  function showChrome() {
    ['#buildBadge', '.help-btn'].forEach(sel => {
      const el = document.querySelector(sel); if (el) el.style.display = '';
    });
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

  function setCheckbox(id, checked) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.checked !== checked) el.click();
  }

  // Smooth dimension animation — animates width & depth over time
  async function animateDimensions(toW, toD, durationMs) {
    const state = store.getState();
    const fromW = (state.dim && state.dim.frameW_mm) || 1800;
    const fromD = (state.dim && state.dim.frameD_mm) || 2400;
    const steps = 20;
    const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    for (let i = 0; i <= steps; i++) {
      const t = ease(i / steps);
      const w = Math.round(fromW + (toW - fromW) * t);
      const d = Math.round(fromD + (toD - fromD) * t);
      store.setState({ dim: { frameW_mm: w, frameD_mm: d }, dimInputs: { frameW_mm: w, frameD_mm: d } });
      const wEl = document.getElementById('wInput');
      const dEl = document.getElementById('dInput');
      if (wEl) wEl.value = w;
      if (dEl) dEl.value = d;
      await wait(durationMs / steps);
    }
  }

  // ── Highlight ───────────────────────────────────────────────
  function highlight(el) { if (el) el.classList.add('tour-highlight'); }
  function unhighlight(el) { if (el) el.classList.remove('tour-highlight'); }
  function unhighlightAll() { document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight')); }

  // ── Sidebar control (desktop) ─────────────────────────────────
  function openSidebarSection(idx) {
    const stepBtns = document.querySelectorAll('.sw-step');
    if (stepBtns[idx]) stepBtns[idx].click();
  }

  function closeSidebar() {
    const closeBtn = document.querySelector('#swFlyout .sw-flyout-close');
    if (closeBtn) { closeBtn.click(); return; }
    const active = document.querySelector('.sw-step.active');
    if (active) active.click();
  }

  // ── Custom dropdown helpers ─────────────────────────────────
  // Cursor glides to dropdown, opens it, glides to target option, clicks
  async function tourDropdownSelect(selectId, value, pauseMs) {
    if (window.CustomSelect) {
      // If the select has no ID, give it one so CustomSelect can track it
      var sel = document.getElementById(selectId);
      if (!sel) {
        console.warn('[TOUR] Select not found:', selectId);
        setSelectValue(selectId, value);
        return;
      }
      // Ensure it's enhanced (dynamic selects may not be)
      if (!sel.dataset.csEnhanced) {
        window.CustomSelect.enhance(sel);
        await wait(200);
      }
      // 1. Open the dropdown
      window.CustomSelect.open(selectId);
      await wait(600);

      // 2. Find the target option, glide cursor to it
      var dropdown = document.querySelector('.cs-dropdown[data-cs-for="' + selectId + '"]');
      if (dropdown) {
        var targetOption = dropdown.querySelector('[data-value="' + value + '"]');
        if (targetOption) {
          await moveTo(targetOption, 500);
          highlight(targetOption);
          await wait(pauseMs || 1500);
          // 3. Click the option via dispatched events
          await moveAndClick(targetOption, 200);
          unhighlight(targetOption);
          // Fallback: ensure selection happened
          await wait(200);
          var sel = document.getElementById(selectId);
          if (sel && sel.value !== value) {
            targetOption.click();
          }
          await wait(300);
        }
      }
    } else {
      setSelectValue(selectId, value);
      await wait(300);
    }
  }

  // ── Sidebar step: cursor glides to button, clicks it ─────────
  async function tourClickSidebarStep(idx) {
    var stepBtns = document.querySelectorAll('.sw-step');
    if (!stepBtns[idx]) return;
    var btn = stepBtns[idx];
    highlight(btn);
    await moveAndClick(btn, 700);
    // Fallback: if synthetic click didn't trigger the flyout, force it
    await wait(200);
    var flyout = document.getElementById('swFlyout');
    if (flyout && !flyout.classList.contains('open')) {
      btn.click();
    }
    await wait(400);
    unhighlight(btn);
  }

  // ── Inject CSS ──────────────────────────────────────────────
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    #tourCursor { will-change: transform, opacity; }
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


  // ══════════════════════════════════════════════════════════════
  //  TOUR STEPS
  // ══════════════════════════════════════════════════════════════
  const tourSteps = [

    // ── 1. Welcome — orbit the default shed ──
    {
      caption: 'Welcome to My3DBuild',
      sub: 'Design your own garden building in minutes',
      action: async () => {
        hideHand();
        // Set building position once — centred in available viewport (right of sidebar)
        if (camera.targetScreenOffset) camera.targetScreenOffset.x = 0.65;
        setSelectValue('buildingTypeSelect', 'shed');
        await wait(500);
        await moveCamera(-PI * 0.18, PI * 0.34, 7.5, 2000);
      },
      admire: 2000
    },

    // ── 2. Hand points at "Size & Shape" button, then clicks it ──
    {
      caption: 'Size & Shape',
      sub: 'Let\'s set the building dimensions',
      action: async () => {
        await tourClickSidebarStep(0);
        await moveCamera(-PI * 0.3, PI * 0.42, 6.5, 1200);
      },
      admire: 1000
    },

    // ── 3. Cursor glides to Width, animates to 2500 ──
    {
      caption: 'Setting Width',
      sub: 'Width → 2500mm',
      action: async () => {
        const wEl = document.getElementById('wInput');
        if (wEl) {
          await moveAndClick(wEl, 600);
          highlight(wEl);
        }
        await wait(500);
        await animateDimensions(2500, 2400, 1500);
        await wait(500);
        unhighlightAll();
      },
      admire: 1000
    },

    // ── 4. Cursor glides to Depth, animates to 3500 ──
    {
      caption: 'Setting Depth',
      sub: 'Depth → 3500mm',
      action: async () => {
        const dEl = document.getElementById('dInput');
        if (dEl) {
          await moveAndClick(dEl, 600);
          highlight(dEl);
        }
        await wait(500);
        await animateDimensions(2500, 3500, 1500);
        await wait(500);
        unhighlightAll();
      },
      admire: 1000
    },

    // ── 5. Cursor glides to Roof Type dropdown, opens it, glides to Pent, clicks ──
    {
      caption: 'Roof Type',
      sub: 'Selecting Pent (single pitch)',
      action: async () => {
        // Cursor glides to the roof type dropdown
        const wrapper = document.querySelector('[data-cs-for="roofStyle"]');
        const display = wrapper && wrapper.querySelector('.cs-display');
        if (display) {
          await moveAndClick(display, 600);
          highlight(display);
          await wait(400);
        }
        unhighlightAll();
        // Opens dropdown, cursor glides to Pent, clicks it
        await tourDropdownSelect('roofStyle', 'pent', 1500);
        await wait(300);
      },
      admire: 2000,
      cameraAfter: [-PI * 0.25, PI * 0.4, 7, 1500]
    },

    // ── 5b. Shift building slightly left after pent roof ──
    {
      caption: 'Pent Roof',
      sub: 'Getting a better angle on the single-pitch roof',
      action: async () => {
        await moveCamera(-PI * 0.22, PI * 0.38, 7, 1200);
      },
      admire: 1500
    },

    // ── 6. Cursor clicks "Customise View", then glides to Cladding checkbox ──
    {
      caption: 'Customise View',
      sub: 'Strip the cladding to see the timber frame',
      action: async () => {
        await tourClickSidebarStep(6);
        // Cursor glides to the Cladding checkbox and unchecks it
        const claddingCb = document.getElementById('vCladding');
        if (claddingCb) {
          const target = claddingCb.closest('label') || claddingCb.parentElement || claddingCb;
          highlight(target);
          await moveAndClick(target, 600);
          await wait(300);
          if (claddingCb.checked) claddingCb.click();
          await wait(500);
          unhighlightAll();
        }
        // Orbit to show exposed frame — keep building shifted left
        await moveCamera(-PI * 0.2, PI * 0.4, 7, 1500);
      },
      admire: 2000
    },

    // ── 7. Cursor clicks "Base", glides to dropdown, opens, selects Concrete ──
    {
      caption: 'Base Type',
      sub: 'Choose your foundation — now visible without cladding',
      action: async () => {
        await tourClickSidebarStep(1);
        // Cursor glides to base type dropdown
        const wrapper = document.querySelector('[data-cs-for="baseType"]');
        const display = wrapper && wrapper.querySelector('.cs-display');
        if (display) {
          await moveAndClick(display, 600);
          highlight(display);
          await wait(400);
        }
        unhighlightAll();
        // Opens dropdown, cursor glides to Concrete Base Only, clicks
        await tourDropdownSelect('baseType', 'concrete-only', 1500);
        await wait(300);
      },
      admire: 1500
    },

    // ── 8. Walls & Openings — open the section ──
    {
      caption: 'Walls & Openings',
      sub: 'Customise your doors, windows and more',
      action: async () => {
        await tourClickSidebarStep(2);
        await wait(600);
        // Expand the Doors accordion
        const doorBtn = Array.from(document.querySelectorAll('button, [role="button"], summary')).find(b => b.textContent.includes('Door'));
        if (doorBtn) {
          await moveAndClick(doorBtn, 600);
          await wait(400);
        }
      },
      admire: 1500
    },

    // ── 9. Move door to left wall ──
    {
      caption: 'Move the Door',
      sub: 'Door → Right wall',
      action: async () => {
        // Find the door wall select (first select in the doors area)
        const doorSelects = document.querySelectorAll('#controlPanel select');
        let doorWallSel = null;
        for (const sel of doorSelects) {
          if (sel.id === 'attachmentWall') continue;
          const opts = Array.from(sel.options).map(o => o.value);
          if (opts.includes('front') && opts.includes('left') && opts.includes('back')) {
            doorWallSel = sel;
            break;
          }
        }
        if (doorWallSel) {
          if (!doorWallSel.id) doorWallSel.id = 'tour-door-wall-' + Date.now();
          await tourDropdownSelect(doorWallSel.id, 'right', 1500);
          await wait(500);
        }
        await moveCamera(PI * 0.7, PI * 0.38, 7, 1500);
      },
      admire: 1500
    },

    // ── 9b. Right view — show the door on the right wall ──
    {
      caption: 'Right View',
      sub: 'Viewing the door on the right wall',
      action: async () => {
        const rightBtn = document.querySelector('[data-snap="snapRightBtn"]');
        if (rightBtn) {
          await moveAndClick(rightBtn, 600);
          await wait(1000);
        }
        // Nudge building slightly left to centre it
      },
      admire: 2000
    },

    // ── 10. Change door style to Stable ──
    {
      caption: 'Door Style',
      sub: 'Choosing Stable door',
      action: async () => {
        const doorStyleSelects = document.querySelectorAll('#controlPanel select');
        let doorStyleSel = null;
        for (const sel of doorStyleSelects) {
          const opts = Array.from(sel.options).map(o => o.value);
          if (opts.includes('standard') && opts.includes('stable')) {
            doorStyleSel = sel;
            break;
          }
        }
        if (doorStyleSel) {
          if (!doorStyleSel.id) doorStyleSel.id = 'tour-door-style-' + Date.now();
          await tourDropdownSelect(doorStyleSel.id, 'stable', 1500);
          await wait(500);
        }
      },
      admire: 1500
    },

    // ── 11. Expand Windows, move window to front ──
    {
      caption: 'Windows',
      sub: 'Window → Front wall',
      action: async () => {
        // Click Windows accordion
        const winBtn = Array.from(document.querySelectorAll('button, [role="button"], summary')).find(b => b.textContent.includes('Window'));
        if (winBtn) {
          await moveAndClick(winBtn, 600);
          await wait(400);
        }
        // Find the window wall select (in the visible Windows section, not Attachments)
        // The attachmentWall select is in a collapsed section and must be skipped
        const allSelects = document.querySelectorAll('#controlPanel select');
        let winWallSel = null;
        let doorWallFound = false;
        for (const sel of allSelects) {
          if (sel.id === 'attachmentWall') continue; // Never target the Attachments wall select
          const opts = Array.from(sel.options).map(o => o.value);
          if (opts.includes('front') && opts.includes('left') && opts.includes('back')) {
            if (!doorWallFound) { doorWallFound = true; continue; } // Skip the first (door wall)
            winWallSel = sel;
            break;
          }
        }
        if (winWallSel) {
          if (!winWallSel.id) winWallSel.id = 'tour-win-wall-' + Date.now();
          await tourDropdownSelect(winWallSel.id, 'front', 1500);
          await wait(500);
        }
        await moveCamera(-PI * 0.15, PI * 0.4, 7, 1500);
      },
      admire: 1500
    },

    // ── 12. Front view — show the building head-on, centred ──
    {
      caption: 'Front View',
      sub: 'Viewing from the front',
      action: async () => {
        // Click the "Front" scene view button in the wizard header
        const frontBtn = document.querySelector('[data-snap="snapFrontBtn"]');
        if (frontBtn) {
          await moveAndClick(frontBtn, 600);
          await wait(1000);
        }
        // Nudge camera target left so the building appears more central
      },
      admire: 2500
    },
  ];


  // ══════════════════════════════════════════════════════════════
  //  MAIN TOUR LOOP
  // ══════════════════════════════════════════════════════════════
  console.log('[TOUR] Starting guided tour — ' + tourSteps.length + ' steps');

  createCursor();
  const skipBtn = createSkipButton();
  createProgress(tourSteps.length);
  hideChrome();

  // Dismiss startup tips
  const tipsBtn = document.querySelector('.tips-dismiss, .startup-tips-close, [class*="skip"]');
  if (tipsBtn) tipsBtn.click();
  await wait(500);

  if (isMobile) await panelDown();

  for (let i = 0; i < tourSteps.length; i++) {
    if (skipClicked) break;

    const step = tourSteps[i];
    updateProgress(i, tourSteps.length);
    showCaption(step.caption, step.sub || '');

    // Mobile panel management
    if (isMobile && step.mobileStep !== undefined) {
      await panelUp();
      mc.goToStep(step.mobileStep);
      await wait(500);
    } else if (isMobile) {
      await panelDown();
      await wait(200);
    }

    // Run action
    if (step.action) await step.action();
    if (skipClicked) break;

    // Post-action
    hideHand();
    unhighlightAll();
    if (isMobile) await panelDown();
    if (step.cameraAfter) await moveCamera(step.cameraAfter[0], step.cameraAfter[1], step.cameraAfter[2], step.cameraAfter[3] || 1500);

    await wait(step.admire || 2000);
    if (skipClicked) break;
  }

  // ── CLEANUP ─────────────────────────────────────────────────
  updateProgress(tourSteps.length, tourSteps.length);
  hideCaption();
  hideHand();
  unhighlightAll();
  showChrome();

  await wait(500);
  if (cursorEl) cursorEl.remove();
  if (captionEl) captionEl.remove();
  if (skipBtn) skipBtn.remove();
  if (progressEl) progressEl.remove();
  styleTag.remove();

  if (isMobile) mc.setPreviewHeight(40);

  // Completion message
  const complete = document.createElement('div');
  complete.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(45,80,22,0.95); color: white; padding: 24px 36px;
    border-radius: 20px; font-family: system-ui; text-align: center;
    z-index: 2147483647; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;
  complete.innerHTML = `
    <div style="font-size:28px;margin-bottom:8px;">🏠</div>
    <div style="font-size:18px;font-weight:700;">Tour Complete!</div>
    <div style="font-size:14px;opacity:0.85;margin-top:6px;">Now it's your turn — design your own building</div>
  `;
  document.body.appendChild(complete);
  await wait(3000);
  complete.style.transition = 'opacity 0.5s';
  complete.style.opacity = '0';
  await wait(500);
  complete.remove();

  console.log('[TOUR] Complete!');
})();
