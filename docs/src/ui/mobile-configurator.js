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
    { label: 'BOM',        section: '__bom__' },
    { label: 'Save',       section: 'Save / Load Design' },
    { label: 'Dev',        section: 'Developer' }
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

  function fixDevPanel() {
    var developerBox = document.getElementById('developerBox');
    var devPanel = document.getElementById('devPanel');
    var devCheck = document.getElementById('devModeCheck');
    
    // (debug banner removed)

    if (!devPanel) {
      console.warn('[mobile-configurator] devPanel not found');
      return;
    }

    // Force devPanel visible — bypass the checkbox toggle on mobile
    devPanel.style.setProperty('display', 'block', 'important');

    // Also hide the "Show Dev Tools" checkbox row since it's always visible now
    if (devCheck) {
      var row = devCheck.closest('.row');
      if (row) row.style.display = 'none';
    }

    // Ensure nested boSection details are open with visible summaries
    devPanel.querySelectorAll('details.boSection').forEach(function(d) {
      d.style.setProperty('display', 'block', 'important');
      d.setAttribute('open', '');
      var sum = d.querySelector(':scope > summary');
      if (sum) {
        sum.style.setProperty('display', 'block', 'important');
        sum.style.setProperty('cursor', 'pointer', 'important');
        sum.style.setProperty('font-size', '12px', 'important');
        sum.style.setProperty('font-weight', '700', 'important');
        sum.style.setProperty('padding', '8px', 'important');
        sum.style.setProperty('background', '#f5f5f5', 'important');
      }
    });

    // (debug output removed)
  }

  function buildLayout(panel) {
    // Find only TOP-LEVEL boSection elements (direct children of the form),
    // NOT nested ones inside devPanel (Attachment Visibility, Profile Editor)
    var form = panel.querySelector('form[aria-label="Build options"]');
    var allSections = form
      ? form.querySelectorAll(':scope > details.boSection')
      : panel.querySelectorAll('details.boSection');
    var byName = {};
    allSections.forEach(function(s) {
      var summary = s.querySelector(':scope > summary');
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

    // Open all top-level sections so content is accessible
    allSections.forEach(function(s) { s.setAttribute('open', ''); });

    // Hide all top-level sections initially (nested ones inside devPanel are untouched)
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
      fallbackStyle.textContent = '#mobileConfigurator label, #mobileConfigurator span, #mobileConfigurator p, #mobileConfigurator .check, #mobileConfigurator .boTitle, #mobileConfigurator .boTitle2 { font-size: 11px !important; } #mobileConfigurator .boSubhead { font-size: 12px !important; } #mobileConfigurator .hint { font-size: 10px !important; } #mobileConfigurator input, #mobileConfigurator select { font-size: 16px !important; }';
      document.head.appendChild(fallbackStyle);
    }

    // Also schedule a delayed re-apply in case elements weren't ready
    // AND re-apply step visibility in case showAllControls() (profiles.js) runs after us
    var reapply = function() {
      try { applyMobileStyles(container); } catch(e) {}
      goToStep(activeStep); // Re-enforce which tab is visible
    };
    setTimeout(reapply, 2000);
    setTimeout(reapply, 4000);
    setTimeout(reapply, 6000); // Extra pass for slow profile loading

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

    // === FIX DEV PANEL ===
    // On mobile, bypass the checkbox toggle entirely — just force devPanel visible
    // and ensure nested sections (Attachment Visibility, Profile Editor) work
    fixDevPanel();
    // Re-apply periodically to win any race with profiles.js / instances.js
    setTimeout(fixDevPanel, 2000);
    setTimeout(fixDevPanel, 4000);
    setTimeout(fixDevPanel, 6000);

    console.log('[mobile-configurator] Layout built! Steps:', sections.length);
  }

  function goToStep(idx) {
    if (idx < 0 || idx >= STEPS.length) return;
    activeStep = idx;

    var isBom = STEPS[idx].section === '__bom__';

    // Hide all sections (use !important to beat any profile system resets)
    sections.forEach(function(s, i) {
      if (s) s.style.setProperty('display', 'none', 'important');
    });

    // Remove any previous BOM content
    var existingBom = document.getElementById('mcBomContent');
    if (existingBom) existingBom.remove();

    if (isBom) {
      // Inject BOM buttons
      var bomDiv = document.createElement('div');
      bomDiv.id = 'mcBomContent';
      bomDiv.style.cssText = 'padding: 16px; background: #fff; margin: 8px; border-radius: 12px; box-shadow: 0 2px 12px rgba(45,80,22,0.08);';
      bomDiv.innerHTML = '<p style="font-size:10px;color:#5C5C5C;margin:0 0 10px 0;">View detailed cutting lists and material schedules for your shed design.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<button class="mc-bom-btn" data-view="base" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🏗️ Base</button>' +
        '<button class="mc-bom-btn" data-view="walls" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🧱 Walls</button>' +
        '<button class="mc-bom-btn" data-view="roof" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🏚️ Roof</button>' +
        '<button class="mc-bom-btn" data-view="openings" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🚪 Openings</button>' +
        '<button class="mc-bom-btn" data-view="shelving" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">📐 Shelving</button>' +
        '</div>';
      var controls = document.getElementById('mcControls');
      if (controls) controls.appendChild(bomDiv);

      // Wire BOM buttons to switch view
      bomDiv.querySelectorAll('.mc-bom-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var viewSelect = document.getElementById('viewSelect');
          if (viewSelect) {
            viewSelect.value = btn.dataset.view;
            viewSelect.dispatchEvent(new Event('change'));
          }
        });
      });
    } else {
      // Show active section (use !important to beat profile system and other resets)
      if (sections[idx]) sections[idx].style.setProperty('display', 'block', 'important');
    }

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
      el.style.setProperty('font-size', '11px', 'important');
      el.style.setProperty('font-weight', '600', 'important');
      el.style.setProperty('color', mc.text, 'important');
    });

    // Subheadings
    container.querySelectorAll('.boSubhead').forEach(function(el) {
      el.style.setProperty('font-size', '12px', 'important');
      el.style.setProperty('font-weight', '700', 'important');
      el.style.setProperty('color', mc.primary, 'important');
      el.style.setProperty('text-transform', 'uppercase', 'important');
      el.style.setProperty('letter-spacing', '0.03em', 'important');
      el.style.setProperty('border-bottom', '2px solid ' + mc.primaryLight, 'important');
      el.style.setProperty('padding-bottom', '4px', 'important');
      el.style.setProperty('margin-bottom', '8px', 'important');
    });

    // Inputs and selects — 16px minimum for iOS (prevents auto-zoom), reduced padding
    container.querySelectorAll('input[type="number"], input[type="text"], select').forEach(function(el) {
      el.style.setProperty('font-size', '16px', 'important');
      el.style.setProperty('padding', '7px 9px', 'important');
      el.style.setProperty('min-height', '34px', 'important');
      el.style.setProperty('border', '1px solid ' + mc.border, 'important');
      el.style.setProperty('border-radius', mc.radius, 'important');
      el.style.setProperty('color', mc.text, 'important');
      el.style.setProperty('background', mc.bg, 'important');
      el.style.setProperty('box-sizing', 'border-box', 'important');
    });

    // Buttons (not step pills or footer)
    container.querySelectorAll('#mcControls button').forEach(function(el) {
      el.style.setProperty('font-size', '11px', 'important');
      el.style.setProperty('font-weight', '600', 'important');
      el.style.setProperty('padding', '7px 11px', 'important');
      el.style.setProperty('min-height', '34px', 'important');
      el.style.setProperty('border-radius', mc.radius, 'important');
    });

    // Checkboxes and radios — text labels
    container.querySelectorAll('.check').forEach(function(el) {
      el.style.setProperty('font-size', '11px', 'important');
      el.style.setProperty('padding', '5px 0', 'important');
      el.style.setProperty('min-height', '30px', 'important');
      el.style.setProperty('gap', '6px', 'important');
    });

    container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function(el) {
      el.style.setProperty('width', '18px', 'important');
      el.style.setProperty('height', '18px', 'important');
    });

    // Hints
    container.querySelectorAll('.hint, p.hint').forEach(function(el) {
      el.style.setProperty('font-size', '10px', 'important');
      el.style.setProperty('color', mc.muted, 'important');
    });

    // Titles
    container.querySelectorAll('.boTitle, .boTitle2').forEach(function(el) {
      el.style.setProperty('font-size', '12px', 'important');
      el.style.setProperty('color', mc.text, 'important');
    });

    // All spans and divs — no inflation, just normalise small text
    container.querySelectorAll('#mcControls span, #mcControls div').forEach(function(el) {
      var current = window.getComputedStyle(el).fontSize;
      var px = parseFloat(current);
      if (px > 14) {
        el.style.setProperty('font-size', '11px', 'important');
      }
    });

    console.log('[mobile-configurator] Inline styles applied');
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
