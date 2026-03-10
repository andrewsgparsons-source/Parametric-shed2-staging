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
    { label: 'Size',       section: 'Size & Shape',        profileKey: 'sizeShape' },
    { label: 'Base',       section: 'Base',                profileKey: 'base' },
    { label: 'Walls',      section: 'Walls & Openings',    profileKey: 'wallsOpenings' },
    { label: 'Roof',       section: 'Roof',                profileKey: 'roof' },
    { label: 'Appearance', section: 'Appearance',           profileKey: 'appearance' },
    { label: 'Attachments',section: 'Building Attachments', profileKey: 'buildingAttachments' },
    { label: 'Customise View', section: 'Visibility',        profileKey: 'visibility' },
    { label: 'BOM',        section: '__bom__',              profileKey: 'display', adminOnly: true },
    { label: 'Save',       section: 'Save / Load Design',  profileKey: 'saveLoad' },
    { label: 'Dev',        section: 'Developer',            profileKey: 'developer', adminOnly: true }
  ];

  // Filter out admin-only steps for non-admin users
  var urlParams = new URLSearchParams(window.location.search);
  var isAdmin = urlParams.get('profile') === 'admin';
  if (!isAdmin) {
    STEPS = STEPS.filter(function(s) { return !s.adminOnly; });
  }

  var activeStep = 0;
  var sections = [];
  var hiddenSteps = []; // indices of steps hidden by profile
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
    console.log('[mobile-configurator] PRE-BUILD devPanel exists:', !!document.getElementById('devPanel'), 'developerBox children:', document.getElementById('developerBox')?.children.length);
    buildLayout(panel);
    console.log('[mobile-configurator] POST-BUILD devPanel exists:', !!document.getElementById('devPanel'), 'developerBox children:', document.getElementById('developerBox')?.children.length);
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

    // === PRICE STRIP (compact, above drag handle) ===
    var priceStrip = document.createElement('div');
    priceStrip.id = 'mcPriceStrip';
    priceStrip.innerHTML = '<div class="mc-price-cta-row"><span class="mc-price-cta">💬 Get a Quote</span></div>' +
      '<div class="mc-price-range-row"><span class="mc-price-range"></span></div>';
    container.appendChild(priceStrip);

    // Wire price strip CTA
    priceStrip.querySelector('.mc-price-cta').addEventListener('click', function() {
      import('./ui/design-summary.js').then(function(mod) {
        mod.showDesignSummary();
      }).catch(function(err) {
        console.error('[mobile] Failed to load design summary:', err);
      });
    });

    // Update price strip when pricing changes
    function updatePriceStrip() {
      var rangeEl = priceStrip.querySelector('.mc-price-range');
      if (!rangeEl) return;
      try {
        var badge = document.getElementById('priceBadge');
        if (badge) {
          // Extract from the hidden badge
          var nums = badge.textContent.match(/£[\d,]+/g);
          if (nums && nums.length >= 2) {
            rangeEl.textContent = nums[0] + ' — ' + nums[1];
            return;
          } else if (nums && nums.length === 1) {
            rangeEl.textContent = nums[0];
            return;
          }
        }
        rangeEl.textContent = '';
      } catch(e) { rangeEl.textContent = ''; }
    }
    // Poll for price updates (pricing module loads async)
    setInterval(updatePriceStrip, 2000);
    setTimeout(updatePriceStrip, 1500);
    setTimeout(updatePriceStrip, 3000);

    // === DRAG HANDLE ===
    var dragHandle = document.createElement('div');
    dragHandle.id = 'mcDragHandle';
    dragHandle.innerHTML = '<span class="mc-handle-arrow" data-dir="up">▲</span>' +
      '<div class="mc-handle-bar"></div>' +
      '<span class="mc-handle-arrow" data-dir="down">▼</span>';
    container.appendChild(dragHandle);

    // === BUILDING TYPE SELECTOR ===
    var typeBar = document.createElement('div');
    typeBar.id = 'mcTypeBar';
    typeBar.innerHTML = '<span class="mc-type-label">Design Your</span>' +
      '<select id="buildingTypeSelect" class="mc-type-select">' +
        '<option value="shed">Shed</option>' +
        '<option value="summerhouse">Summer House</option>' +
        '<option value="gardenroom-pent">Garden Room (Pent)</option>' +
        '<option value="gardenroom-apex">Garden Room (Apex)</option>' +
        '<option value="garage">Garage</option>' +
        '<option value="workshop">Workshop</option>' +
        '<option value="leanto">Lean-to</option>' +
        '<option value="fieldshelter">Field Shelter</option>' +
        '<option value="gazebo">Gazebo</option>' +
      '</select>';

    container.appendChild(typeBar);

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
      // Find previous visible step
      for (var i = activeStep - 1; i >= 0; i--) {
        if (hiddenSteps.indexOf(i) < 0) { goToStep(i); return; }
      }
    });

    var nextBtn = document.createElement('button');
    nextBtn.className = 'mc-footer-btn mc-next';
    nextBtn.textContent = 'Next →';
    nextBtn.addEventListener('click', function() {
      // Find next visible step
      for (var i = activeStep + 1; i < STEPS.length; i++) {
        if (hiddenSteps.indexOf(i) < 0) { goToStep(i); return; }
      }
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
    setTimeout(function() { try { applyMobileStyles(container); } catch(e) {} }, 2000);
    setTimeout(function() { try { applyMobileStyles(container); } catch(e) {} }, 4000);

    // Resize engine after layout change
    setTimeout(resizeEngine, 100);
    setTimeout(resizeEngine, 500);
    setTimeout(resizeEngine, 1500);

    // Center camera on model after mobile layout is built
    setTimeout(function() {
      if (typeof window.__centerCameraOnModel === 'function') {
        window.__centerCameraOnModel();
      }
    }, 2000);
    setTimeout(function() {
      if (typeof window.__centerCameraOnModel === 'function') {
        window.__centerCameraOnModel();
      }
    }, 3500);

    // === DRAG HANDLE LOGIC ===
    initDragHandle(dragHandle, preview);

    // === SCROLL HINT: show arrow when controls overflow ===
    var scrollHint = document.createElement('div');
    scrollHint.className = 'mc-scroll-hint';
    scrollHint.textContent = '▼ scroll';
    controls.style.position = 'relative';
    controls.appendChild(scrollHint);

    function updateScrollHint() {
      var atBottom = controls.scrollHeight - controls.scrollTop - controls.clientHeight < 20;
      var hasOverflow = controls.scrollHeight > controls.clientHeight + 10;
      scrollHint.style.display = (hasOverflow && !atBottom) ? 'block' : 'none';
    }
    controls.addEventListener('scroll', updateScrollHint);
    setTimeout(updateScrollHint, 500);
    setTimeout(updateScrollHint, 2000);

    // Also update scroll hint when switching steps
    var _origGoToStep = goToStep;

    // === KEYBOARD: scroll controls into view when input focused ===
    controls.addEventListener('focusin', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        setTimeout(function() {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });

    console.log('[mobile-configurator] Layout built! Steps:', sections.length);

    // Hide pricing display dropdown for customer view
    if (!isAdmin) {
      var priceBadgeModeRow = document.getElementById('priceBadgeModeRow');
      if (priceBadgeModeRow) {
        priceBadgeModeRow.style.display = 'none';
        console.log('[mobile-configurator] Hidden priceBadgeModeRow for customer view');
      }
    }

    // Check profile restrictions and update pill visibility
    // Runs after layout built, and again whenever profile changes
    updatePillVisibility();

    // Listen for profile changes (profiles.js dispatches this)
    document.addEventListener('profile-applied', function(e) {
      console.log('[mobile-configurator] profile-applied event:', e.detail);
      updatePillVisibility();
    });

    // Also poll briefly in case profile loads async after us
    setTimeout(updatePillVisibility, 3000);
    setTimeout(updatePillVisibility, 6000);
  }

  /**
   * Check which steps should be hidden based on current profile,
   * and show/hide the corresponding pills.
   *
   * Profile data can come from:
   *   1. URL ?pc= param (compact format: { h: ["sectionKey", ...], c: {...} })
   *   2. localStorage shedProfilesData (full format: { sections: { key: { visible: false } } })
   *   3. profiles.json fetch (full format, same as #2)
   */
  function updatePillVisibility() {
    hiddenSteps = [];

    // Read current profile name from URL
    var profileName = null;
    try {
      var params = new URLSearchParams(window.location.search || '');
      profileName = params.get('profile');
    } catch (e) {}

    if (!profileName || profileName === 'admin') return; // admin = show everything

    // Collect hidden section keys from all available sources
    var hiddenKeys = [];

    // Source 1: Embedded compact profile in URL (?pc= param)
    // Format: { h: ["saveLoad", "developer"], c: { ... } }
    try {
      var params2 = new URLSearchParams(window.location.search || '');
      var pc = params2.get('pc');
      if (pc) {
        var decoded = decodeURIComponent(escape(atob(pc)));
        var compact = JSON.parse(decoded);
        if (compact.h && Array.isArray(compact.h)) {
          hiddenKeys = hiddenKeys.concat(compact.h);
          console.log('[mobile-configurator] Hidden sections from URL pc:', compact.h);
        }
      }
    } catch (e) {
      console.warn('[mobile-configurator] Failed to parse pc param:', e);
    }

    // Source 2: localStorage (full profile format)
    if (hiddenKeys.length === 0) {
      try {
        var stored = localStorage.getItem('shedProfilesData');
        if (stored) {
          var data = JSON.parse(stored);
          var profiles = data.profiles || data;
          var profileData = profiles[profileName];
          if (profileData && profileData.sections) {
            Object.keys(profileData.sections).forEach(function(key) {
              if (profileData.sections[key].visible === false) {
                hiddenKeys.push(key);
              }
            });
            console.log('[mobile-configurator] Hidden sections from localStorage:', hiddenKeys);
          }
        }
      } catch (e) {}
    }

    // Source 3: Fetch profiles.json as last resort
    if (hiddenKeys.length === 0 && profileName) {
      fetch('./profiles.json')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var profiles = data.profiles || data;
          var profileData = profiles[profileName];
          if (profileData && profileData.sections) {
            var keys = [];
            Object.keys(profileData.sections).forEach(function(key) {
              if (profileData.sections[key].visible === false) {
                keys.push(key);
              }
            });
            if (keys.length > 0) {
              console.log('[mobile-configurator] Hidden sections from profiles.json:', keys);
              applyHiddenKeys(keys);
            }
          }
        })
        .catch(function() {});
    }

    if (hiddenKeys.length > 0) {
      applyHiddenKeys(hiddenKeys);
    }
  }

  /**
   * Apply hidden section keys — hide pills and update navigation
   */
  function applyHiddenKeys(hiddenKeys) {
    hiddenSteps = [];
    var pills = document.querySelectorAll('.mc-step-pill');

    STEPS.forEach(function(step, i) {
      if (!step.profileKey) return; // BOM has no profile key

      if (hiddenKeys.indexOf(step.profileKey) >= 0) {
        hiddenSteps.push(i);
        if (pills[i]) pills[i].style.display = 'none';
      } else {
        if (pills[i]) pills[i].style.display = '';
      }
    });

    // If current step is hidden, jump to first visible step
    if (hiddenSteps.indexOf(activeStep) >= 0) {
      for (var i = 0; i < STEPS.length; i++) {
        if (hiddenSteps.indexOf(i) < 0) { goToStep(i); break; }
      }
    }

    console.log('[mobile-configurator] Pills updated, hidden steps:', hiddenSteps.length);
  }

  function goToStep(idx) {
    if (idx < 0 || idx >= STEPS.length) return;

    // Skip hidden steps
    if (hiddenSteps.indexOf(idx) >= 0) return;

    activeStep = idx;

    var isBom = STEPS[idx].section === '__bom__';
    var isDev = STEPS[idx].section === 'Developer';

    // Hide all sections
    sections.forEach(function(s, i) {
      if (s) s.style.display = 'none';
    });

    // Remove any previous injected content
    var existingBom = document.getElementById('mcBomContent');
    if (existingBom) existingBom.remove();
    var existingDev = document.getElementById('mcDevContent');
    if (existingDev) existingDev.remove();

    if (isDev) {
      // === MOBILE DEV TOOLS — parallel UI, bypasses devPanel entirely ===
      var devDiv = document.createElement('div');
      devDiv.id = 'mcDevContent';
      devDiv.style.cssText = 'padding: 16px; background: #fff; margin: 8px; border-radius: 12px; box-shadow: 0 2px 12px rgba(45,80,22,0.08);';

      // Copy State button
      var copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 Copy State to Clipboard';
      copyBtn.style.cssText = 'width:100%;padding:12px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:8px;';
      copyBtn.addEventListener('click', function() {
        // Reuse the existing copyStateBtn handler if available
        var origBtn = document.getElementById('copyStateBtn');
        if (origBtn) {
          origBtn.click();
          copyBtn.textContent = '✅ Copied!';
          setTimeout(function() { copyBtn.textContent = '📋 Copy State to Clipboard'; }, 2000);
        }
      });
      devDiv.appendChild(copyBtn);

      var copyHint = document.createElement('p');
      copyHint.textContent = 'Copy current state JSON for adding to presets file.';
      copyHint.style.cssText = 'font-size:10px;color:#8A8A8A;margin:0 0 16px 0;';
      devDiv.appendChild(copyHint);

      // Profile section
      var profileHeading = document.createElement('div');
      profileHeading.textContent = 'PROFILE EDITOR';
      profileHeading.style.cssText = 'font-size:11px;font-weight:700;color:#2D5016;text-transform:uppercase;letter-spacing:0.03em;border-bottom:2px solid #E8F0E2;padding-bottom:4px;margin-bottom:12px;';
      devDiv.appendChild(profileHeading);

      // Profile selector row
      var profileRow = document.createElement('div');
      profileRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';

      // Use the SAME IDs as the original (now-nuked) devPanel elements
      // so profile-editor.js can find and populate them
      var profileSelect = document.createElement('select');
      profileSelect.id = 'profileEditorSelect';
      profileSelect.style.cssText = 'flex:1;min-width:100px;padding:7px 9px;font-size:14px;border:1px solid #E0D5C8;border-radius:8px;';

      function populateMobileProfileSelect(profiles) {
        profileSelect.innerHTML = '';
        Object.keys(profiles).forEach(function(name) {
          var profile = profiles[name];
          var opt = document.createElement('option');
          opt.value = name;
          opt.textContent = (profile && profile.label) ? profile.label : name;
          profileSelect.appendChild(opt);
        });
        if (profiles['admin']) profileSelect.value = 'admin';
      }

      // Try localStorage first (data shape: { profiles: { admin: {...}, ... } })
      var populated = false;
      try {
        var stored = localStorage.getItem('shedProfilesData');
        if (stored) {
          var data = JSON.parse(stored);
          var profiles = data.profiles || data;
          if (Object.keys(profiles).length > 0) {
            populateMobileProfileSelect(profiles);
            populated = true;
          }
        }
      } catch (e) {
        console.warn('[mobile-configurator] localStorage profiles parse error:', e);
      }

      // Fallback: fetch profiles.json directly (same source profiles.js uses)
      if (!populated) {
        fetch('./profiles.json')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var profiles = data.profiles || data;
            populateMobileProfileSelect(profiles);
            console.log('[mobile-configurator] Populated profiles from profiles.json');
          })
          .catch(function(e) {
            console.warn('[mobile-configurator] Could not fetch profiles.json:', e);
          });
      }

      // Change handler — profile-editor.js wires its own 'change' listener
      // on #profileEditorSelect during wireEditorEvents(), so if re-render
      // runs, that listener will handle profile switching automatically.
      // As a fallback for initial load, dispatch the event:
      profileSelect.addEventListener('change', function() {
        // profile-editor.js listens for this event on #profileEditorSelect
        console.log('[mobile-configurator] Profile select changed to:', profileSelect.value);
      });

      profileRow.appendChild(profileSelect);
      devDiv.appendChild(profileRow);

      // Profile action buttons
      var btnGrid = document.createElement('div');
      btnGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;';

      var profileActions = [
        { id: 'profileNewBtn', label: '➕ New' },
        { id: 'profileRenameBtn', label: '✏️ Rename' },
        { id: 'profileDeleteBtn', label: '🗑️ Delete' },
        { id: 'profileImportBtn', label: '📥 Import' },
        { id: 'profileExportBtn', label: '📤 Export' },
        { id: 'profileResetBtn', label: '🔄 Reset' }
      ];
      profileActions.forEach(function(action) {
        var btn = document.createElement('button');
        btn.textContent = action.label;
        btn.style.cssText = 'padding:10px 4px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;';
        btn.addEventListener('click', function() {
          var origBtn = document.getElementById(action.id);
          if (origBtn) origBtn.click();
        });
        btnGrid.appendChild(btn);
      });
      devDiv.appendChild(btnGrid);

      // Active profile hint — use same ID so profile-editor.js can update it
      var activeHint = document.createElement('p');
      activeHint.id = 'profileActiveHint';
      activeHint.style.cssText = 'font-size:10px;color:#8A8A8A;margin:4px 0 12px 0;';
      devDiv.appendChild(activeHint);

      // Profile controls container — same ID as the nuked original
      // profile-editor.js renders section checkboxes into this
      var profileControls = document.createElement('div');
      profileControls.id = 'profileControlsContainer';
      profileControls.style.cssText = 'max-height:50vh;overflow-y:auto;';
      devDiv.appendChild(profileControls);

      var controls = document.getElementById('mcControls');
      if (controls) controls.appendChild(devDiv);

      // Trigger profile-editor.js to re-render into our new containers
      if (typeof window._mcRerenderProfiles === 'function') {
        window._mcRerenderProfiles();
      }
    } else if (isBom) {
      // Inject BOM buttons
      var bomDiv = document.createElement('div');
      bomDiv.id = 'mcBomContent';
      bomDiv.style.cssText = 'padding: 16px; background: #fff; margin: 8px; border-radius: 12px; box-shadow: 0 2px 12px rgba(45,80,22,0.08);';
      // Build BOM buttons HTML - hide Pricing button in customer view
      var bomButtonsHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<button class="mc-bom-btn" data-view="base" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🏗️ Base</button>' +
        '<button class="mc-bom-btn" data-view="walls" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🧱 Walls</button>' +
        '<button class="mc-bom-btn" data-view="roof" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🏚️ Roof</button>' +
        '<button class="mc-bom-btn" data-view="openings" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">🚪 Openings</button>' +
        '<button class="mc-bom-btn" data-view="shelving" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">📐 Shelving</button>';
      
      // Only show Pricing button in admin view
      if (isAdmin) {
        bomButtonsHtml += '<button class="mc-bom-btn mc-bom-pricing" data-view="pricing" style="padding:10px;border:1px solid #E0D5C8;border-radius:8px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;">💰 Pricing</button>';
      }
      bomButtonsHtml += '</div>';
      
      bomDiv.innerHTML = '<p style="font-size:10px;color:#5C5C5C;margin:0 0 10px 0;">View detailed cutting lists and material schedules for your shed design.</p>' + bomButtonsHtml;
      var controls = document.getElementById('mcControls');
      if (controls) controls.appendChild(bomDiv);

      // Wire BOM buttons to switch view
      bomDiv.querySelectorAll('.mc-bom-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (btn.dataset.view === 'pricing') {
            // Show pricing breakdown inline
            var pricingDiv = document.getElementById('mcBomPricingBreakdown');
            if (!pricingDiv) {
              pricingDiv = document.createElement('div');
              pricingDiv.id = 'mcBomPricingBreakdown';
              pricingDiv.style.cssText = 'padding:12px 0;';
              bomDiv.appendChild(pricingDiv);
            }
            // Toggle visibility
            if (pricingDiv.style.display === 'none' || !pricingDiv.innerHTML) {
              pricingDiv.style.display = '';
              window.dispatchEvent(new CustomEvent('renderPricingBreakdown', { detail: { containerId: 'mcBomPricingBreakdown' } }));
            } else {
              pricingDiv.style.display = 'none';
            }
            return;
          }
          var viewSelect = document.getElementById('viewSelect');
          if (viewSelect) {
            viewSelect.value = btn.dataset.view;
            viewSelect.dispatchEvent(new Event('change'));
          }
        });
      });
    } else {
      // Show active section
      if (sections[idx]) sections[idx].style.display = '';
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
    if (controls) {
      controls.scrollTop = 0;
      // Update scroll hint after step change
      setTimeout(function() {
        var hint = controls.querySelector('.mc-scroll-hint');
        if (hint) {
          var hasOverflow = controls.scrollHeight > controls.clientHeight + 10;
          hint.style.display = hasOverflow ? 'block' : 'none';
        }
      }, 100);
    }

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

    // Preset heights for arrow buttons (vh)
    var presets = [20, 40, 55, 70];

    function setPreviewVh(vh) {
      preview.style.height = vh + 'vh';
      preview.style.flex = '0 0 ' + vh + 'vh';
      preview.style.transition = 'height 0.25s ease, flex 0.25s ease';
      setTimeout(function() { preview.style.transition = ''; }, 300);
      setTimeout(resizeEngine, 50);
      setTimeout(resizeEngine, 300);
    }

    function getCurrentVh() {
      return (preview.offsetHeight / window.innerHeight) * 100;
    }

    // Arrow buttons: step through presets
    handle.querySelectorAll('.mc-handle-arrow').forEach(function(arrow) {
      arrow.addEventListener('click', function(e) {
        e.stopPropagation();
        var dir = arrow.dataset.dir;
        var curVh = getCurrentVh();

        if (dir === 'up') {
          // ▲ = move bar up = preview smaller, more controls visible
          for (var j = presets.length - 1; j >= 0; j--) {
            if (presets[j] < curVh - 3) {
              setPreviewVh(presets[j]);
              return;
            }
          }
          setPreviewVh(presets[0]);
        } else {
          // ▼ = move bar down = preview bigger, more 3D visible
          for (var i = 0; i < presets.length; i++) {
            if (presets[i] > curVh + 3) {
              setPreviewVh(presets[i]);
              return;
            }
          }
          setPreviewVh(presets[presets.length - 1]);
        }
      });
      // Prevent touch from triggering drag
      arrow.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
    });

    // Drag to resize
    handle.addEventListener('touchstart', function(e) {
      if (e.target.classList.contains('mc-handle-arrow')) return;
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
          window.innerHeight * 0.80, // max 80vh
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
      resizeEngine();
      setTimeout(resizeEngine, 100);
    });

    // Double-tap bar to toggle between 55% and 20%
    var lastTap = 0;
    handle.querySelector('.mc-handle-bar').addEventListener('touchend', function() {
      var now = Date.now();
      if (now - lastTap < 300) {
        var currentRatio = getCurrentVh();
        var targetVh = currentRatio > 35 ? 20 : 55;
        setPreviewVh(targetVh);
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

  // === Expose API for tour/demo scripts ===
  window.__mobileConfigurator = {
    goToStep: function(idx) { goToStep(idx); },
    getActiveStep: function() { return activeStep; },
    getSteps: function() { return STEPS.filter(function(s, i) { return hiddenSteps.indexOf(i) < 0 && !s.adminOnly; }); },
    getStepCount: function() { return STEPS.filter(function(s, i) { return hiddenSteps.indexOf(i) < 0 && !s.adminOnly; }).length; },
    setPreviewHeight: function(vh) {
      var preview = document.getElementById('mcPreview');
      if (preview) {
        preview.style.height = vh + 'vh';
        preview.style.flex = '0 0 ' + vh + 'vh';
        setTimeout(resizeEngine, 50);
        setTimeout(resizeEngine, 300);
      }
    }
  };

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
  } else {
    setTimeout(init, 1500);
  }
})();
