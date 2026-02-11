/**
 * sidebar-wizard.js — Left sidebar wizard with summary dashboard + vertical steps
 * 
 * Layout:
 *   [LEFT SIDEBAR ~380px]          [3D VIEW]
 *   ┌─────────────────────┐
 *   │ Summary Dashboard    │
 *   │ (live config values) │
 *   ├─────────────────────┤
 *   │ ① Size & Shape       │
 *   │ ② Roof               │
 *   │ ③ Appearance          │
 *   │ ④ Walls & Openings   │
 *   │ ⑤ Attachments        │
 *   │ ⑥ Save & Share       │
 *   │ ⑦ Developer          │
 *   ├─────────────────────┤
 *   │ [Active step content]│
 *   └─────────────────────┘
 */
(function() {
  'use strict';

  const STEPS = [
    { num: 1, label: 'Size & Shape',     section: 'Size & Shape',        icon: '📐' },
    { num: 2, label: 'Roof',             section: 'Roof',                icon: '🏠' },
    { num: 3, label: 'Appearance',       section: 'Appearance',          icon: '🎨' },
    { num: 4, label: 'Walls & Openings', section: 'Walls & Openings',   icon: '🚪' },
    { num: 5, label: 'Attachments',      section: 'Building Attachments', icon: '🔗' },
    { num: 6, label: 'Save & Share',     section: 'Save / Load Design',  icon: '💾' },
    { num: 7, label: 'Developer',        section: 'Developer',           icon: '⚙️' }
  ];

  let currentStep = 0;
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

    // Build the sidebar wrapper
    const sidebar = document.createElement('div');
    sidebar.id = 'sidebarWizard';
    sidebar.innerHTML = buildSidebarHTML();
    document.body.appendChild(sidebar);

    // Move the original controls into the sidebar content area
    const controls = document.getElementById('controls');
    const contentArea = document.getElementById('swContent');

    if (controls && contentArea) {
      // Hide original panel chrome
      controls.classList.add('sw-embedded');
      contentArea.appendChild(controls);
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

    // Hide section summaries (we have our own step navigation)
    sections.forEach(s => {
      const summary = s.querySelector('summary');
      if (summary) summary.style.display = 'none';
    });

    // Wire up step clicks
    document.querySelectorAll('.sw-step').forEach(step => {
      step.addEventListener('click', () => {
        goToStep(parseInt(step.dataset.step));
      });
    });

    // Initial state
    goToStep(0);
    updateDashboard();

    // Live update dashboard on changes
    document.addEventListener('change', () => setTimeout(updateDashboard, 50));
    document.addEventListener('input', () => setTimeout(updateDashboard, 100));

    console.log('[sidebar-wizard] Sidebar active! Sections:', sections.length);
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
          <button class="sw-step${i === 0 ? ' active' : ''}" data-step="${i}">
            <span class="sw-step-num">${s.num}</span>
            <span class="sw-step-label">${s.label}</span>
          </button>
        `).join('')}
      </div>

      <div class="sw-content" id="swContent">
        <!-- Original #controls gets moved here -->
      </div>
    `;
  }

  function goToStep(i) {
    if (i < 0 || i >= sections.length) return;
    currentStep = i;

    // Show only active section
    sections.forEach((s, j) => {
      s.style.display = j === i ? '' : 'none';
    });

    // Hide non-mapped sections
    const panel = document.getElementById('controlPanel');
    if (panel) {
      const allSections = panel.querySelectorAll('details.boSection');
      allSections.forEach(s => {
        const name = s.querySelector('summary')?.textContent?.trim();
        const matchedIndex = STEPS.findIndex(step => step.section === name);
        if (matchedIndex === -1) {
          s.style.display = 'none';
        }
      });
    }

    // Update step buttons
    document.querySelectorAll('.sw-step').forEach((btn, j) => {
      btn.classList.toggle('active', j === i);
      btn.classList.toggle('completed', j < i);
    });

    // Scroll content to top
    const content = document.getElementById('swContent');
    if (content) content.scrollTop = 0;
  }

  function updateDashboard() {
    const w = document.getElementById('wInput')?.value || '?';
    const d = document.getElementById('dInput')?.value || '?';
    const roofSel = document.getElementById('roofStyle');
    const cladSel = document.getElementById('claddingStyle');
    const roof = roofSel ? (roofSel.options[roofSel.selectedIndex]?.text || '?').replace(/ \(.*\)/, '') : '?';
    const clad = cladSel ? (cladSel.options[cladSel.selectedIndex]?.text || '?') : '?';

    // Count doors and windows
    const doorCount = document.querySelectorAll('[id^="doorCard_"]').length ||
                      document.querySelectorAll('.door-entry, .door-card').length || 
                      (document.querySelector('[data-doors]')?.dataset?.doors) || '1';
    const winCount = document.querySelectorAll('[id^="winCard_"]').length ||
                     document.querySelectorAll('.window-entry, .window-card').length ||
                     (document.querySelector('[data-windows]')?.dataset?.windows) || '1';

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
