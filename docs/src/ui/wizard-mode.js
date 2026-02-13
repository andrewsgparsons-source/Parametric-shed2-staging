/**
 * wizard-mode.js — CSS-driven wizard overlay for the configurator
 * Instead of moving DOM elements, this hides the original panel and
 * uses CSS to show one section at a time inside a fixed bottom panel.
 * The original panel's position is preserved for the app's data bindings.
 */
(function() {
  'use strict';

  const STEPS = [
    { label: 'Size & Shape',       section: 'Size & Shape' },
    { label: 'Walls & Openings',   section: 'Walls & Openings' },
    { label: 'Roof',               section: 'Roof' },
    { label: 'Appearance',         section: 'Appearance' },
    { label: 'Attachments',        section: 'Building Attachments' },
    { label: 'Save & Share',       section: 'Save / Load Design' }
  ];

  let currentStep = 0;
  let sections = [];  // References to boSection elements
  let attempts = 0;

  function init() {
    attempts++;
    if (document.getElementById('wizardPanel')) return;

    const panel = document.getElementById('controlPanel');
    if (!panel) { if (attempts < 50) setTimeout(init, 500); return; }

    // Wait for index.js to populate the form — check for wInput (width)
    const widthInput = document.getElementById('wInput');
    if (!widthInput) {
      if (attempts < 50) setTimeout(init, 500);
      return;
    }

    console.log('[wizard] Inputs ready after', attempts, 'attempts. Building wizard...');
    buildWizard(panel);
  }

  function buildWizard(panel) {
    // Find sections by summary text
    const allSections = panel.querySelectorAll('details.boSection');
    const byName = {};
    allSections.forEach(s => {
      const name = s.querySelector('summary')?.textContent?.trim();
      if (name) byName[name] = s;
    });

    sections = STEPS.map(step => byName[step.section]).filter(Boolean);

    // Tag the panel so CSS can style it
    panel.classList.add('wizard-active');
    document.body.classList.add('wizard-mode');

    // Move the controls panel to be a fixed bottom panel
    const controls = document.getElementById('controls');
    if (controls) {
      controls.classList.add('wizard-controls');
    }

    // Open all sections (so content is always rendered)
    allSections.forEach(s => s.setAttribute('open', ''));

    // Hide non-wizard sections  
    allSections.forEach(s => {
      const name = s.querySelector('summary')?.textContent?.trim();
      const isWizardSection = STEPS.some(step => step.section === name);
      if (!isWizardSection) {
        s.classList.add('wizard-hidden-section');
      }
    });

    // Build navigation bar (prepended to controls)
    const navBar = document.createElement('div');
    navBar.id = 'wizNavBar';
    navBar.innerHTML = buildNavHTML();
    controls.insertBefore(navBar, controls.firstChild);

    // Build footer
    const footer = document.createElement('div');
    footer.id = 'wizFooter';
    footer.innerHTML = '<button class="wiz-btn" id="wizPrev" disabled>\u2190 Back</button>' +
      '<div class="wiz-summary" id="wizSummary"></div>' +
      '<button class="wiz-btn primary" id="wizNext">Next \u2192</button>';
    controls.appendChild(footer);

    // Sticky summary bar
    const bar = document.createElement('div');
    bar.className = 'wiz-sticky-summary';
    bar.id = 'wizStickyBar';
    bar.innerHTML = '<div class="summary-item"><span class="summary-label">SIZE</span><span class="summary-value" id="stickySize">-</span></div>' +
      '<div class="summary-divider"></div>' +
      '<div class="summary-item"><span class="summary-label">ROOF</span><span class="summary-value" id="stickyRoof">-</span></div>' +
      '<div class="summary-divider"></div>' +
      '<div class="summary-item"><span class="summary-label">CLADDING</span><span class="summary-value" id="stickyClad">-</span></div>';
    document.body.appendChild(bar);

    // Fake wizard panel marker (for init guard)
    const marker = document.createElement('div');
    marker.id = 'wizardPanel';
    marker.style.display = 'none';
    document.body.appendChild(marker);

    // Hide mobile button, panel header/chrome
    const mobileBtn = document.getElementById('mobileOpenBtn');
    if (mobileBtn) mobileBtn.style.display = 'none';
    
    // Hide the "Controls (toggle)" details HEADER but keep content visible
    const cpanel = document.getElementById('controlPanel');
    if (cpanel) {
      Array.from(cpanel.children).forEach(child => {
        if (child.tagName === 'DETAILS' && !child.classList.contains('boSection')) {
          // Don't hide the whole details — just its summary
          child.setAttribute('open', '');
          const sum = child.querySelector(':scope > summary');
          if (sum) sum.style.display = 'none';
          // Also hide any header rows inside
          child.querySelectorAll('.panelHeader, .drag-handle').forEach(h => h.style.display = 'none');
        }
      });
    }
    
    // Hide close button, resize handles
    const closeBtn = document.getElementById('mobileCloseBtn');
    if (closeBtn) closeBtn.style.display = 'none';
    document.querySelectorAll('#controls .resize-handle').forEach(h => h.style.display = 'none');
    
    // Hide "Design your shed" heading
    const heading = cpanel?.querySelector('h2, h3');
    if (heading && heading.textContent.toLowerCase().includes('design')) {
      heading.closest('div, header')?.style && (heading.closest('div, header').style.display = 'none');
    }

    // Hide summaries inside wizard sections (we have tab navigation)
    sections.forEach(s => {
      const summary = s.querySelector('summary');
      if (summary) summary.style.display = 'none';
    });

    // Wire up
    document.getElementById('wizPrev').addEventListener('click', () => goToStep(currentStep - 1));
    document.getElementById('wizNext').addEventListener('click', () => {
      if (currentStep < STEPS.length - 1) goToStep(currentStep + 1);
    });

    // Tab click handlers
    document.querySelectorAll('.wiz-step-tab').forEach(tab => {
      tab.addEventListener('click', () => goToStep(parseInt(tab.dataset.step)));
    });

    // Initial state
    goToStep(0);
    updateSummary();

    document.addEventListener('change', () => setTimeout(updateSummary, 50));
    document.addEventListener('input', () => setTimeout(updateSummary, 100));

    console.log('[wizard] Wizard active! Sections:', sections.length);
  }

  function buildNavHTML() {
    return '<div class="wiz-steps-nav">' +
      STEPS.map((step, i) =>
        '<button class="wiz-step-tab' + (i === 0 ? ' active' : '') + '" data-step="' + i + '">' +
        '<span class="step-num">' + (i + 1) + '</span>' + step.label +
        '</button>'
      ).join('') +
      '</div>';
  }

  function goToStep(i) {
    if (i < 0 || i >= sections.length) return;
    currentStep = i;

    // Show only active section
    sections.forEach((s, j) => {
      s.style.display = j === i ? '' : 'none';
    });

    // Update tabs
    document.querySelectorAll('.wiz-step-tab').forEach((t, j) => {
      t.classList.toggle('active', j === i);
      t.classList.toggle('completed', j < i);
    });

    // Update nav buttons
    document.getElementById('wizPrev').disabled = i === 0;
    document.getElementById('wizNext').textContent = i === STEPS.length - 1 ? '\u2713 Done' : 'Next \u2192';

    updateSummary();
  }

  function updateSummary() {
    const w = document.getElementById('wInput')?.value || '?';
    const d = document.getElementById('dInput')?.value || '?';
    const roofSel = document.getElementById('roofStyle');
    const cladSel = document.getElementById('claddingStyle');
    const roof = roofSel ? (roofSel.options[roofSel.selectedIndex]?.text || '?') : '?';
    const clad = cladSel ? (cladSel.options[cladSel.selectedIndex]?.text || '?') : '?';

    const s = document.getElementById('wizSummary');
    if (s) s.innerHTML = '<strong>' + w + '</strong> \u00d7 <strong>' + d + '</strong>mm \u00b7 ' + roof + ' \u00b7 ' + clad;

    const clean = t => t.replace(/ \(.*\)/, '');
    const el = id => document.getElementById(id);
    if (el('stickySize')) el('stickySize').textContent = w + ' \u00d7 ' + d;
    if (el('stickyRoof')) el('stickyRoof').textContent = clean(roof);
    if (el('stickyClad')) el('stickyClad').textContent = clad;
  }

  // Start
  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2000))
    : setTimeout(init, 2000);
})();
