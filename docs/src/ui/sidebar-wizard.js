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

  const STEPS = [
    { num: 1, label: 'Size & Shape',     section: 'Size & Shape' },
    { num: 2, label: 'Roof',             section: 'Roof' },
    { num: 3, label: 'Appearance',       section: 'Appearance' },
    { num: 4, label: 'Walls & Openings', section: 'Walls & Openings' },
    { num: 5, label: 'Attachments',      section: 'Building Attachments' },
    { num: 6, label: 'Save & Share',     section: 'Save / Load Design' },
    { num: 7, label: 'Developer',        section: 'Developer' }
  ];

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
    // Find sections by summary text
    const allSections = panel.querySelectorAll('details.boSection');
    const byName = {};
    allSections.forEach(s => {
      const name = s.querySelector('summary')?.textContent?.trim();
      if (name) byName[name] = s;
    });

    sections = STEPS.map(step => byName[step.section]).filter(Boolean);

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
    flyout.innerHTML = '<div class="sw-flyout-header"><span class="sw-flyout-title" id="swFlyoutTitle"></span><button class="sw-flyout-close" id="swFlyoutClose">✕</button></div><div class="sw-flyout-body" id="swFlyoutBody"></div>';

    // Insert sidebar and flyout at the start of #controls
    controls.insertBefore(flyout, controls.firstChild);
    controls.insertBefore(sidebar, controls.firstChild);

    // Move #controlPanel into the flyout body
    const controlPanel = document.getElementById('controlPanel');
    const flyoutBody = document.getElementById('swFlyoutBody');
    if (controlPanel && flyoutBody) {
      flyoutBody.appendChild(controlPanel);
    }

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
        <div class="sw-title">🏠 Design Your Shed</div>
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

  function openFlyout(idx) {
    if (idx < 0 || idx >= sections.length) return;

    // Hide all sections
    sections.forEach(s => { s.style.display = 'none'; });

    // Show active section
    sections[idx].style.display = '';
    activeStep = idx;

    // Update flyout title
    document.getElementById('swFlyoutTitle').textContent = STEPS[idx].label;

    // Show flyout
    const flyout = document.getElementById('swFlyout');
    flyout.classList.add('open');

    // Scroll flyout body to top
    document.getElementById('swFlyoutBody').scrollTop = 0;

    // Update step buttons
    document.querySelectorAll('.sw-step').forEach((btn, j) => {
      btn.classList.toggle('active', j === idx);
    });
  }

  function closeFlyout() {
    activeStep = -1;

    // Hide all sections
    sections.forEach(s => { s.style.display = 'none'; });

    // Hide flyout
    const flyout = document.getElementById('swFlyout');
    flyout.classList.remove('open');

    // Update step buttons
    document.querySelectorAll('.sw-step').forEach(btn => {
      btn.classList.remove('active');
    });
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
