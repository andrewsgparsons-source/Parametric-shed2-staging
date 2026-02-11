/**
 * mobile-configurator.js — Split-view mobile layout
 * 
 * Layout:
 *   ┌──────────────────────┐
 *   │   3D Preview (40vh)  │  ← Interactive rotate/zoom
 *   ├──────────────────────┤  ← Drag handle
 *   │ Size │ Roof │ Walls… │  ← Step pills
 *   ├──────────────────────┤
 *   │   Active controls    │  ← Scrollable
 *   │                      │
 *   ├──────────────────────┤
 *   │  [← Back] [Next →]  │  ← Footer nav
 *   └──────────────────────┘
 * 
 * Desktop sidebar wizard is completely separate — this file
 * only runs on mobile via the theme-loader gate.
 */
(function() {
  'use strict';

  var STEPS = [
    { label: 'Size',       section: 'Size & Shape' },
    { label: 'Roof',       section: 'Roof' },
    { label: 'Walls',      section: 'Walls & Openings' },
    { label: 'Appearance', section: 'Appearance' },
    { label: 'Attachments',section: 'Building Attachments' },
    { label: 'Visibility', section: 'Visibility' },
    { label: 'Save',       section: 'Save / Load Design' }
    // Developer section hidden on mobile
  ];

  var activeStep = 0;
  var sections = [];
  var attempts = 0;
  var previewHeight = 40; // vh

  function init() {
    attempts++;
    var panel = document.getElementById('controlPanel');
    if (!panel) {
      if (attempts < 50) setTimeout(init, 500);
      return;
    }

    var wInput = document.getElementById('wInput');
    if (!wInput) {
      if (attempts < 50) setTimeout(init, 500);
      return;
    }

    console.log('[mobile-configurator] Inputs ready after ' + attempts + ' attempts. Building layout...');
    buildLayout(panel);
  }

  function buildLayout(panel) {
    // Find all boSection elements by their summary text
    var allSections = panel.querySelectorAll('details.boSection');
    var byName = {};
    allSections.forEach(function(s) {
      var summary = s.querySelector('summary');
      var name = summary ? summary.textContent.trim() : '';
      if (name) byName[name] = s;
    });

    // Map steps to sections
    sections = STEPS.map(function(step) {
      return byName[step.section] || null;
    });

    // Tag body
    document.body.classList.add('mobile-configurator');
    document.body.classList.add('mobile-panel-collapsed'); // Ensure original mobile UI doesn't interfere

    // Open all sections so content is accessible
    allSections.forEach(function(s) { s.setAttribute('open', ''); });

    // Hide ALL sections initially
    allSections.forEach(function(s) { s.style.display = 'none'; });

    // Create main container
    var container = document.createElement('div');
    container.id = 'mobileConfigurator';

    // === 3D PREVIEW ===
    var preview = document.createElement('div');
    preview.id = 'mcPreview';

    // Move canvas into preview
    var canvas = document.getElementById('renderCanvas');
    if (canvas) {
      preview.appendChild(canvas);
    }

    // Build code overlay
    var buildCodeEl = document.querySelector('.buildCode, [class*="build"]');
    if (buildCodeEl) {
      var bcClone = document.createElement('div');
      bcClone.className = 'mc-build-code';
      bcClone.textContent = buildCodeEl.textContent;
      preview.appendChild(bcClone);
    }

    // Touch hint (first load)
    if (!localStorage.getItem('mc-touch-hint-seen')) {
      var hint = document.createElement('div');
      hint.className = 'mc-touch-hint';
      hint.innerHTML = '👆 Drag to rotate<br>🤏 Pinch to zoom';
      preview.appendChild(hint);

      // Fade and remove after 3 seconds or first touch
      var removeHint = function() {
        hint.classList.add('fade-out');
        setTimeout(function() { hint.remove(); }, 600);
        localStorage.setItem('mc-touch-hint-seen', '1');
      };
      setTimeout(removeHint, 3000);
      canvas.addEventListener('touchstart', removeHint, { once: true });
    }

    container.appendChild(preview);

    // === DRAG HANDLE ===
    var dragHandle = document.createElement('div');
    dragHandle.id = 'mcDragHandle';
    dragHandle.innerHTML = '<div class="mc-handle-bar"></div>';
    container.appendChild(dragHandle);

    // === STEP NAVIGATION ===
    var stepNav = document.createElement('div');
    stepNav.id = 'mcStepNav';

    STEPS.forEach(function(step, i) {
      var pill = document.createElement('button');
      pill.className = 'mc-step-pill' + (i === 0 ? ' active' : '');
      pill.textContent = step.label;
      pill.dataset.step = i;
      pill.addEventListener('click', function() {
        goToStep(i);
      });
      stepNav.appendChild(pill);
    });
    container.appendChild(stepNav);

    // === CONTROLS AREA ===
    var controls = document.createElement('div');
    controls.id = 'mcControls';

    // Move sections into controls area
    sections.forEach(function(section) {
      if (section) controls.appendChild(section);
    });
    container.appendChild(controls);

    // === STEP FOOTER ===
    var footer = document.createElement('div');
    footer.id = 'mcStepFooter';

    var prevBtn = document.createElement('button');
    prevBtn.className = 'mc-footer-btn mc-prev';
    prevBtn.textContent = '← Back';
    prevBtn.addEventListener('click', function() {
      if (activeStep > 0) goToStep(activeStep - 1);
    });

    var nextBtn = document.createElement('button');
    nextBtn.className = 'mc-footer-btn mc-next';
    nextBtn.textContent = 'Next →';
    nextBtn.addEventListener('click', function() {
      if (activeStep < STEPS.length - 1) goToStep(activeStep + 1);
    });

    footer.appendChild(prevBtn);
    footer.appendChild(nextBtn);
    container.appendChild(footer);

    // === INSERT INTO PAGE ===
    document.body.insertBefore(container, document.body.firstChild);

    // Show first step
    goToStep(0);

    // Apply inline styles to guarantee font sizes (CSS specificity can't beat inline)
    try {
      applyMobileStyles(container);
    } catch (e) {
      console.error('[mobile-configurator] applyMobileStyles FAILED:', e);
      // Fallback: inject a style tag with brute force
      var fallbackStyle = document.createElement('style');
      fallbackStyle.textContent = '#mobileConfigurator label, #mobileConfigurator span, #mobileConfigurator div, #mobileConfigurator p, #mobileConfigurator .boSubhead, #mobileConfigurator .check, #mobileConfigurator .hint, #mobileConfigurator .boTitle, #mobileConfigurator .boTitle2 { font-size: 16px !important; } #mobileConfigurator input, #mobileConfigurator select { font-size: 18px !important; }';
      document.head.appendChild(fallbackStyle);
    }

    // Also schedule a delayed re-apply in case elements weren't ready
    setTimeout(function() { try { applyMobileStyles(container); } catch(e) {} }, 2000);
    setTimeout(function() { try { applyMobileStyles(container); } catch(e) {} }, 4000);

    // Resize engine after layout change
    setTimeout(resizeEngine, 100);
    setTimeout(resizeEngine, 500);
    setTimeout(resizeEngine, 1500);

    // === DRAG HANDLE LOGIC ===
    initDragHandle(dragHandle, preview);

    // === KEYBOARD: scroll controls into view when input focused ===
    controls.addEventListener('focusin', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        setTimeout(function() {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });

    console.log('[mobile-configurator] Layout built! Steps:', sections.length);
  }

  function goToStep(idx) {
    if (idx < 0 || idx >= STEPS.length) return;
    activeStep = idx;

    // Show/hide sections
    sections.forEach(function(s, i) {
      if (s) s.style.display = (i === idx) ? '' : 'none';
    });

    // Update pills
    var pills = document.querySelectorAll('.mc-step-pill');
    pills.forEach(function(pill, i) {
      pill.classList.toggle('active', i === idx);
    });

    // Scroll active pill into view
    var activePill = pills[idx];
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Scroll controls to top
    var controls = document.getElementById('mcControls');
    if (controls) controls.scrollTop = 0;

    // Update footer buttons
    var prevBtn = document.querySelector('.mc-prev');
    var nextBtn = document.querySelector('.mc-next');
    if (prevBtn) {
      prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    }
    if (nextBtn) {
      nextBtn.textContent = idx === STEPS.length - 1 ? '✓ Done' : 'Next →';
    }
  }

  function initDragHandle(handle, preview) {
    var startY = 0;
    var startHeight = 0;
    var isDragging = false;

    handle.addEventListener('touchstart', function(e) {
      isDragging = true;
      startY = e.touches[0].clientY;
      startHeight = preview.offsetHeight;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      var dy = e.touches[0].clientY - startY;
      var newHeight = Math.max(
        window.innerHeight * 0.15,  // min 15vh
        Math.min(
          window.innerHeight * 0.70, // max 70vh
          startHeight + dy
        )
      );
      preview.style.height = newHeight + 'px';
      preview.style.flex = '0 0 ' + newHeight + 'px';
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', function() {
      if (!isDragging) return;
      isDragging = false;
      // Resize engine to match new canvas size
      resizeEngine();
      setTimeout(resizeEngine, 100);
    });

    // Double-tap to toggle between 40% and 15%
    var lastTap = 0;
    handle.addEventListener('touchend', function() {
      var now = Date.now();
      if (now - lastTap < 300) {
        // Double tap
        var currentRatio = preview.offsetHeight / window.innerHeight;
        var targetVh = currentRatio > 0.3 ? 15 : 40;
        preview.style.height = targetVh + 'vh';
        preview.style.flex = '0 0 ' + targetVh + 'vh';
        setTimeout(resizeEngine, 50);
        setTimeout(resizeEngine, 300);
      }
      lastTap = now;
    });
  }

  function applyMobileStyles(container) {
    // Inline styles ALWAYS beat CSS — no specificity issues possible
    var mc = {
      text: '#1A1A1A',
      muted: '#8A8A8A',
      primary: '#2D5016',
      primaryLight: '#E8F0E2',
      border: '#E0D5C8',
      bg: '#FFFFFF',
      radius: '8px'
    };

    // Labels
    container.querySelectorAll('label').forEach(function(el) {
      el.style.setProperty('font-size', '16px', 'important');
      el.style.setProperty('font-weight', '600', 'important');
      el.style.setProperty('color', mc.text, 'important');
    });

    // Subheadings
    container.querySelectorAll('.boSubhead').forEach(function(el) {
      el.style.setProperty('font-size', '18px', 'important');
      el.style.setProperty('font-weight', '700', 'important');
      el.style.setProperty('color', mc.primary, 'important');
      el.style.setProperty('text-transform', 'uppercase', 'important');
      el.style.setProperty('letter-spacing', '0.03em', 'important');
      el.style.setProperty('border-bottom', '2px solid ' + mc.primaryLight, 'important');
      el.style.setProperty('padding-bottom', '6px', 'important');
      el.style.setProperty('margin-bottom', '12px', 'important');
    });

    // Inputs and selects
    container.querySelectorAll('input[type="number"], input[type="text"], select').forEach(function(el) {
      el.style.setProperty('font-size', '18px', 'important');
      el.style.setProperty('padding', '12px 14px', 'important');
      el.style.setProperty('min-height', '48px', 'important');
      el.style.setProperty('border', '1.5px solid ' + mc.border, 'important');
      el.style.setProperty('border-radius', mc.radius, 'important');
      el.style.setProperty('color', mc.text, 'important');
      el.style.setProperty('background', mc.bg, 'important');
      el.style.setProperty('box-sizing', 'border-box', 'important');
    });

    // Buttons (not step pills or footer)
    container.querySelectorAll('#mcControls button').forEach(function(el) {
      el.style.setProperty('font-size', '16px', 'important');
      el.style.setProperty('font-weight', '600', 'important');
      el.style.setProperty('padding', '12px 16px', 'important');
      el.style.setProperty('min-height', '48px', 'important');
      el.style.setProperty('border-radius', mc.radius, 'important');
    });

    // Checkboxes and radios
    container.querySelectorAll('.check').forEach(function(el) {
      el.style.setProperty('font-size', '16px', 'important');
      el.style.setProperty('padding', '10px 0', 'important');
      el.style.setProperty('min-height', '44px', 'important');
      el.style.setProperty('gap', '10px', 'important');
    });

    container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function(el) {
      el.style.setProperty('width', '24px', 'important');
      el.style.setProperty('height', '24px', 'important');
    });

    // Hints
    container.querySelectorAll('.hint, p.hint').forEach(function(el) {
      el.style.setProperty('font-size', '14px', 'important');
      el.style.setProperty('color', mc.muted, 'important');
    });

    // Titles
    container.querySelectorAll('.boTitle, .boTitle2').forEach(function(el) {
      el.style.setProperty('font-size', '17px', 'important');
      el.style.setProperty('color', mc.text, 'important');
    });

    // All spans and divs that might contain text
    container.querySelectorAll('#mcControls span, #mcControls div').forEach(function(el) {
      var current = window.getComputedStyle(el).fontSize;
      var px = parseFloat(current);
      if (px < 14) {
        el.style.setProperty('font-size', '15px', 'important');
      }
    });

    var labelCount = container.querySelectorAll('label').length;
    var inputCount = container.querySelectorAll('input, select').length;
    var subheadCount = container.querySelectorAll('.boSubhead').length;
    console.log('[mobile-configurator] Inline styles applied — labels:' + labelCount + ' inputs:' + inputCount + ' subheads:' + subheadCount);
    
    // VISUAL DEBUG: mark container border so we know function ran
    container.style.setProperty('border-top', '4px solid red', 'important');
  }

  function resizeEngine() {
    try {
      var engine = (window.__dbg && window.__dbg.engine) ? window.__dbg.engine :
                   (typeof BABYLON !== 'undefined' && BABYLON.Engine && BABYLON.Engine.Instances ? BABYLON.Engine.Instances[0] : null);
      if (engine && typeof engine.resize === 'function') {
        engine.resize();
      }
    } catch (e) {
      console.warn('[mobile-configurator] resizeEngine error:', e);
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
  } else {
    setTimeout(init, 1500);
  }
})();
