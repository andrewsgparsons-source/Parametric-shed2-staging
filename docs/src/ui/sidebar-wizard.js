/**
 * sidebar-wizard.js — Left sidebar with summary dashboard + vertical steps
 * Each step has a ▸ arrow that opens a flyout panel to the right.
 * Only one flyout open at a time. Click arrow again to close.
 * 
 * Layout:
 *   [SIDEBAR 340px]  [FLYOUT 400px]   [3D VIEW]
 *   ┌──────────────┐┌──────────────┐
 *   │ Header       ││ Step content │
 *   │ Dashboard    ││ (scrollable) │
 *   │              ││              │
 *   │ ① Size    ▸  ││              │
 *   │ ② Roof    ▸  ││              │
 *   │ ③ Appear  ▸  ││              │
 *   │ ④ Walls   ▸  ││              │
 *   │ ⑤ Attach  ▸  ││              │
 *   │ ⑥ Save    ▸  ││              │
 *   │ ⑦ Dev     ▸  ││              │
 *   └──────────────┘└──────────────┘
 */
(function() {
  'use strict';

  var ALL_STEPS = [
    { num: 1, label: 'Size & Shape',       section: 'Size & Shape' },
    { num: 2, label: 'Roof',               section: 'Roof' },
    { num: 3, label: 'Appearance',         section: 'Appearance' },
    { num: 4, label: 'Walls & Openings',   section: 'Walls & Openings' },
    { num: 5, label: 'Attachments',        section: 'Building Attachments' },
    { num: 6, label: 'Visibility',         section: 'Visibility' },
    { num: 7, label: 'Bill of Materials',  section: '__bom__' },
    { num: 8, label: 'Save & Share',       section: 'Save / Load Design' },
    { num: 9, label: 'Developer',          section: 'Developer', adminOnly: true }
  ];

  // Filter out admin-only steps for public visitors
  var urlParams = new URLSearchParams(window.location.search);
  var isAdmin = urlParams.get('profile') === 'admin';
  var STEPS = isAdmin ? ALL_STEPS : ALL_STEPS.filter(function(s) { return !s.adminOnly; });

  let activeStep = -1; // -1 = none open
  let sections = [];
  let attempts = 0;

  function init() {
    attempts++;
    if (document.getElementById('sidebarWizard')) return;

    const panel = document.getElementById('controlPanel');
    if (!panel) { if (attempts < 50) setTimeout(init, 500); return; }

    const widthInput = document.getElementById('wInput');
    if (!widthInput) {
      if (attempts < 50) setTimeout(init, 500);
      return;
    }

    console.log('[sidebar-wizard] Inputs ready after', attempts, 'attempts. Building sidebar...');
    buildSidebar(panel);
  }

  function buildSidebar(panel) {
    // Find only TOP-LEVEL boSection elements (direct children of the form),
    // NOT nested ones inside devPanel (Attachment Visibility, Profile Editor)
    const form = panel.querySelector('form[aria-label="Build options"]');
    const allSections = form
      ? form.querySelectorAll(':scope > details.boSection')
      : panel.querySelectorAll('details.boSection');
    const byName = {};
    allSections.forEach(s => {
      const name = s.querySelector('summary')?.textContent?.trim();
      if (name) byName[name] = s;
    });

    // Map steps to sections (null for virtual steps like BOM)
    sections = STEPS.map(step => byName[step.section] || null);

    // Tag body
    document.body.classList.add('sidebar-wizard-mode');

    // Open all sections so content renders
    allSections.forEach(s => s.setAttribute('open', ''));

    // Hide ALL sections initially
    allSections.forEach(s => { s.style.display = 'none'; });

    // Hide section summaries (we have our own step navigation)
    allSections.forEach(s => {
      const summary = s.querySelector('summary');
      if (summary) summary.style.display = 'none';
    });

    // Strategy: inject sidebar + flyout INSIDE #controls so the app doesn't remove them
    const controls = document.getElementById('controls');
    controls.classList.add('sw-embedded');

    // Build sidebar and flyout as siblings inside controls
    const sidebar = document.createElement('div');
    sidebar.id = 'sidebarWizard';
    sidebar.innerHTML = buildSidebarHTML();

    const flyout = document.createElement('div');
    flyout.id = 'swFlyout';
    flyout.className = 'sw-flyout';
    flyout.innerHTML = '<div class="sw-flyout-header"><span class="sw-flyout-title" id="swFlyoutTitle"></span><div class="sw-scene-views" id="swSceneViews"><span class="sw-scene-views-label">Select Scene View</span><div class="sw-scene-views-row"><button class="sw-view-btn" data-snap="snapPlanBtn" title="Plan view">Plan</button><button class="sw-view-btn" data-snap="snapFrontBtn" title="Front view">Front</button></div><div class="sw-scene-views-row"><button class="sw-view-btn" data-snap="snapBackBtn" title="Back view">Back</button><button class="sw-view-btn" data-snap="snapLeftBtn" title="Left view">Left</button><button class="sw-view-btn" data-snap="snapRightBtn" title="Right view">Right</button></div></div><button class="sw-flyout-close" id="swFlyoutClose">✕</button></div><div class="sw-flyout-body" id="swFlyoutBody"></div>';

    // Insert sidebar and flyout at the start of #controls
    controls.insertBefore(flyout, controls.firstChild);
    controls.insertBefore(sidebar, controls.firstChild);

    // Move #controlPanel into the flyout body
    const controlPanel = document.getElementById('controlPanel');
    const flyoutBody = document.getElementById('swFlyoutBody');
    if (controlPanel && flyoutBody) {
      flyoutBody.appendChild(controlPanel);
    }

    // Sidebar wizard is desktop-only (theme-loader skips loading on mobile)

    // Hide original panel chrome elements
    const hideSelectors = [
      '#mobileOpenBtn', '#mobileCloseBtn', '.designButton',
      '#controls .resize-handle', '#controls .drag-handle',
      '#statusOverlay'
    ];
    hideSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
    });

    // Hide the "Controls" details summary + header row
    const cpanel = document.getElementById('controlPanel');
    if (cpanel) {
      Array.from(cpanel.children).forEach(child => {
        if (child.tagName === 'DETAILS' && !child.classList.contains('boSection')) {
          child.setAttribute('open', '');
          const sum = child.querySelector(':scope > summary');
          if (sum) sum.style.display = 'none';
          child.querySelectorAll('.panelHeader, .drag-handle').forEach(h => h.style.display = 'none');
        }
      });

      // Hide "Design your shed" heading
      const heading = cpanel.querySelector('h2, h3');
      if (heading && heading.textContent.toLowerCase().includes('design')) {
        const parent = heading.closest('div, header');
        if (parent) parent.style.display = 'none';
      }
    }

    // Wire up step clicks
    document.querySelectorAll('.sw-step').forEach(step => {
      step.addEventListener('click', () => {
        const idx = parseInt(step.dataset.step);
        toggleStep(idx);
      });
    });

    // Wire up flyout close button
    document.getElementById('swFlyoutClose').addEventListener('click', () => {
      closeFlyout();
    });

    // Wire up scene view buttons — trigger the original snap buttons
    document.querySelectorAll('.sw-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const origBtn = document.getElementById(btn.dataset.snap);
        if (origBtn) origBtn.click();
      });
    });

    // Wire up dashboard bubbles as shortcuts to flyouts
    const dashMap = {
      dashSize: 0,      // → Size & Shape
      dashRoof: 1,      // → Roof
      dashCladding: 2,  // → Appearance
      dashDoors: 3,     // → Walls & Openings
      dashWindows: 3    // → Walls & Openings
    };
    Object.entries(dashMap).forEach(function([id, stepIdx]) {
      const el = document.getElementById(id);
      if (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function() { toggleStep(stepIdx); });
      }
    });

    // Initial state — all closed
    updateDashboard();

    // Trigger Babylon.js engine resize so the 3D view adjusts
    setTimeout(resizeEngine, 100);
    setTimeout(resizeEngine, 1000);

    // (mobile resize not needed — sidebar wizard is desktop-only)

    // Live update dashboard on changes
    document.addEventListener('change', () => setTimeout(updateDashboard, 50));
    document.addEventListener('input', () => setTimeout(updateDashboard, 100));

    console.log('[sidebar-wizard] Sidebar active! Sections:', sections.length);

    // Guard: re-attach sidebar if something removes it from DOM
    setInterval(function() {
      if (!document.getElementById('sidebarWizard') && sidebar) {
        console.log('[sidebar-wizard] Re-attaching sidebar (was removed from DOM)');
        document.body.insertBefore(sidebar, document.body.firstChild);
      }
    }, 500);
  }

  function buildSidebarHTML() {
    return `
      <div class="sw-header">
        <div class="sw-title">🏠 Design Your
          <select id="buildingTypeSelect" class="sw-type-select">
            <option value="shed">Shed</option>
            <option value="gazebo">Gazebo</option>
            <option value="summerhouse">Summer House</option>
            <option value="gardenroom">Garden Room</option>
            <option value="garage">Garage</option>
            <option value="workshop">Workshop</option>
            <option value="leanto">Lean-to</option>
            <option value="fieldshelter">Field Shelter</option>
          </select>
        </div>
      </div>

      <div class="sw-dashboard" id="swDashboard">
        <div class="sw-dash-row">
          <div class="sw-dash-item" id="dashSize">
            <span class="sw-dash-label">Size</span>
            <span class="sw-dash-value">—</span>
          </div>
          <div class="sw-dash-item" id="dashRoof">
            <span class="sw-dash-label">Roof</span>
            <span class="sw-dash-value">—</span>
          </div>
        </div>
        <div class="sw-dash-row">
          <div class="sw-dash-item" id="dashCladding">
            <span class="sw-dash-label">Cladding</span>
            <span class="sw-dash-value">—</span>
          </div>
          <div class="sw-dash-item" id="dashDoors">
            <span class="sw-dash-label">Doors</span>
            <span class="sw-dash-value">—</span>
          </div>
          <div class="sw-dash-item" id="dashWindows">
            <span class="sw-dash-label">Windows</span>
            <span class="sw-dash-value">—</span>
          </div>
        </div>
      </div>

      <div class="sw-steps" id="swSteps">
        ${STEPS.map((s, i) => `
          <button class="sw-step" data-step="${i}">
            <span class="sw-step-num">${s.num}</span>
            <span class="sw-step-label">${s.label}</span>
            <span class="sw-step-arrow">▸</span>
          </button>
        `).join('')}
      </div>

      <div id="priceCard" style="display:none; padding: 0 12px 12px;"></div>

    `;
  }

  function toggleStep(idx) {
    if (idx === activeStep) {
      // Close current
      closeFlyout();
    } else {
      // Open new (closes previous automatically)
      openFlyout(idx);
    }
  }

  function resizeEngine() {
    try {
      const engine = window.__dbg && window.__dbg.engine ? window.__dbg.engine :
                     (typeof BABYLON !== 'undefined' && BABYLON.Engine && BABYLON.Engine.Instances ? BABYLON.Engine.Instances[0] : null);
      if (engine && typeof engine.resize === 'function') engine.resize();
    } catch (e) {}
  }

  function openFlyout(idx) {
    if (idx < 0 || idx >= sections.length) return;

    // Handle BOM step (virtual — no section, shows custom content)
    const isBom = STEPS[idx].section === '__bom__';

    // Hide all sections
    sections.forEach(s => { if (s) s.style.display = 'none'; });

    // Remove any previous BOM content
    const existingBom = document.getElementById('swBomContent');
    if (existingBom) existingBom.remove();

    if (isBom) {
      // Inject BOM buttons into flyout body
      const bomDiv = document.createElement('div');
      bomDiv.id = 'swBomContent';
      bomDiv.className = 'sw-bom-content';
      bomDiv.innerHTML = `
        <p class="sw-bom-desc">View detailed cutting lists and material schedules for your shed design.</p>
        <div class="sw-bom-grid">
          <button class="sw-bom-btn" data-view="base">🏗️ Base</button>
          <button class="sw-bom-btn" data-view="walls">🧱 Walls</button>
          <button class="sw-bom-btn" data-view="roof">🏚️ Roof</button>
          <button class="sw-bom-btn" data-view="openings">🚪 Openings</button>
          <button class="sw-bom-btn" data-view="shelving">📐 Shelving</button>
          <button class="sw-bom-btn sw-bom-pricing" data-view="pricing">💰 Pricing</button>
        </div>
      `;
      document.getElementById('swFlyoutBody').appendChild(bomDiv);

      // Wire BOM buttons
      bomDiv.querySelectorAll('.sw-bom-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (btn.dataset.view === 'pricing') {
            // Show pricing breakdown in flyout
            var pricingDiv = document.getElementById('bomPricingBreakdown');
            if (!pricingDiv) {
              pricingDiv = document.createElement('div');
              pricingDiv.id = 'bomPricingBreakdown';
              pricingDiv.style.cssText = 'padding:12px 0;';
              bomDiv.appendChild(pricingDiv);
            }
            // Toggle visibility
            if (pricingDiv.style.display === 'none' || !pricingDiv.innerHTML) {
              pricingDiv.style.display = '';
              // Fire custom event for index.js to handle
              window.dispatchEvent(new CustomEvent('renderPricingBreakdown', { detail: { containerId: 'bomPricingBreakdown' } }));
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

    activeStep = idx;

    // Update flyout title
    document.getElementById('swFlyoutTitle').textContent = STEPS[idx].label;

    // Show scene view buttons for steps 1-6 (indices 0-5), hide for BOM/Save/Developer
    var sceneViews = document.getElementById('swSceneViews');
    if (sceneViews) sceneViews.style.display = idx <= 5 ? '' : 'none';

    // Show flyout
    const flyout = document.getElementById('swFlyout');
    flyout.classList.add('open');

    // Scroll flyout body to top
    document.getElementById('swFlyoutBody').scrollTop = 0;

    // Update step buttons
    document.querySelectorAll('.sw-step').forEach((btn, j) => {
      btn.classList.toggle('active', j === idx);
    });

    // Resize engine after flyout animation
    setTimeout(resizeEngine, 350);
  }

  function closeFlyout() {
    activeStep = -1;

    // Hide all sections
    sections.forEach(s => { if (s) s.style.display = 'none'; });

    // Remove BOM content if present
    const bomContent = document.getElementById('swBomContent');
    if (bomContent) bomContent.remove();

    // Hide flyout
    const flyout = document.getElementById('swFlyout');
    flyout.classList.remove('open');

    // Update step buttons
    document.querySelectorAll('.sw-step').forEach(btn => {
      btn.classList.remove('active');
    });

    // Resize engine after flyout animation
    setTimeout(resizeEngine, 350);
  }

  function updateDashboard() {
    const w = document.getElementById('wInput')?.value || '?';
    const d = document.getElementById('dInput')?.value || '?';
    const roofSel = document.getElementById('roofStyle');
    const cladSel = document.getElementById('claddingStyle');
    const roof = roofSel ? (roofSel.options[roofSel.selectedIndex]?.text || '?').replace(/ \(.*\)/, '') : '?';
    const clad = cladSel ? (cladSel.options[cladSel.selectedIndex]?.text || '?') : '?';

    const doorCount = document.querySelectorAll('[id^="doorCard_"]').length ||
                      document.querySelectorAll('.door-entry, .door-card').length || '1';
    const winCount = document.querySelectorAll('[id^="winCard_"]').length ||
                     document.querySelectorAll('.window-entry, .window-card').length || '1';

    setDashValue('dashSize', w + ' × ' + d + 'mm');
    setDashValue('dashRoof', roof);
    setDashValue('dashCladding', clad);
    setDashValue('dashDoors', doorCount);
    setDashValue('dashWindows', winCount);
  }

  function setDashValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
      const valEl = el.querySelector('.sw-dash-value');
      if (valEl) valEl.textContent = value;
    }
  }

  // Start
  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2000))
    : setTimeout(init, 2000);
})();
