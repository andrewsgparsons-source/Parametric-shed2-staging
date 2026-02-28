/**
 * startup-tips.js — First-visit onboarding tips
 * Shows 4 quick tips highlighting key UI elements.
 * Remembers dismissal in localStorage. "?" button to replay.
 * Works on both mobile (mobile-configurator) and desktop (sidebar-wizard).
 */
(function() {
  'use strict';

  var STORAGE_KEY = 'my3dbuild-tips-seen';
  var currentStep = 0;
  var overlay = null;
  var card = null;
  var backdrop = null;
  var highlightedEl = null;
  var tips = [];
  var attempts = 0;

  // Detect layout
  function isMobile() {
    return !!document.getElementById('mobileConfigurator');
  }

  function getTips() {
    var mobile = isMobile();
    return [
      {
        icon: '🏠',
        title: 'Choose Your Building Type',
        body: 'Use this dropdown to select what you\'re designing — shed, summer house, garden room, garage, and more.',
        target: mobile ? '#mcTypeBar' : '.sw-header',
        position: 'below'
      },
      {
        icon: '👆',
        title: 'Interact with the 3D Model',
        body: mobile
          ? 'Drag to rotate, pinch to zoom. Double-tap the handle bar to resize the preview.'
          : 'Click and drag to rotate the model. Scroll to zoom in and out. Use the view buttons (Plan, Front, Back, etc.) for quick angles.',
        target: mobile ? '#mcPreview' : '#renderCanvas',
        position: mobile ? 'below' : 'center'
      },
      {
        icon: '🔧',
        title: 'Customise Step by Step',
        body: mobile
          ? 'Tap the tabs to move between sections — Size, Roof, Walls, Appearance and more. Use Back/Next to navigate.'
          : 'Click any step to open its controls. Adjust dimensions, roof style, cladding, doors, windows — everything updates live.',
        target: mobile ? '#mcStepNav' : '#swSteps',
        position: mobile ? 'below' : 'right'
      },
      {
        icon: '💬',
        title: 'Get a Quote',
        body: 'When you\'re happy with your design, tap "Get a Quote" to send us the details. The price estimate updates as you make changes.',
        target: '.price-card, #priceEstimateCard, [class*=priceCard], [class*=price-estimate]',
        position: 'below',
        fallbackPosition: { top: '80px', right: '20px' }
      }
    ];
  }

  function init() {
    attempts++;
    // Wait for the UI to be ready
    var ready = document.getElementById('mobileConfigurator') || document.getElementById('sidebarWizard');
    if (!ready) {
      if (attempts < 40) setTimeout(init, 500);
      return;
    }

    tips = getTips();

    // Always add the help button
    addHelpButton();

    // Show tips on first visit
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTimeout(function() { startTips(); }, 1000);
    }
  }

  function addHelpButton() {
    if (document.getElementById('tipsHelpBtn')) return;
    console.log('[startup-tips] Adding help button');
    var btn = document.createElement('button');
    btn.id = 'tipsHelpBtn';
    btn.className = 'tips-help-btn';
    btn.textContent = '?';
    btn.title = 'Show tips';
    btn.addEventListener('click', function() {
      startTips();
    });
    // Use the tips container
    var container = document.getElementById('tipsContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'tipsContainer';
      document.body.appendChild(container);
    }
    container.appendChild(btn);
    console.log('[startup-tips] help button appended');
  }

  function startTips() {
    console.log('[startup-tips] startTips() called');
    currentStep = 0;
    tips = getTips();
    console.log('[startup-tips] tips:', tips.length, 'items');
    createOverlay();
    console.log('[startup-tips] overlay created, showing step 0');
    showStep(0);
  }

  function createOverlay() {
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.className = 'tips-overlay';
    overlay.id = 'tipsOverlay';

    backdrop = document.createElement('div');
    backdrop.className = 'tips-backdrop';
    backdrop.addEventListener('click', function(e) {
      // Click on backdrop = dismiss
      if (e.target === backdrop) dismiss();
    });
    overlay.appendChild(backdrop);

    card = document.createElement('div');
    card.className = 'tips-card';
    overlay.appendChild(card);

    // Use a dedicated container that survives DOM manipulation by other scripts
    var container = document.getElementById('tipsContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'tipsContainer';
      document.body.appendChild(container);
    }
    container.appendChild(overlay);
    console.log('[startup-tips] overlay appended to #tipsContainer');

    // Activate with slight delay for CSS transition
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        overlay.classList.add('active');
      });
    });
  }

  function showStep(idx) {
    if (idx < 0 || idx >= tips.length) {
      dismiss();
      return;
    }

    currentStep = idx;
    var tip = tips[idx];

    // Remove previous highlight
    if (highlightedEl) {
      highlightedEl.classList.remove('tips-highlight');
      highlightedEl = null;
    }

    // Find and highlight target
    var targetEl = null;
    if (tip.target) {
      var selectors = tip.target.split(',');
      for (var i = 0; i < selectors.length; i++) {
        targetEl = document.querySelector(selectors[i].trim());
        if (targetEl) break;
      }
    }

    if (targetEl) {
      targetEl.classList.add('tips-highlight');
      highlightedEl = targetEl;
    }

    // Build card content
    var dotsHtml = '';
    for (var d = 0; d < tips.length; d++) {
      dotsHtml += '<div class="tips-dot' + (d === idx ? ' active' : '') + '"></div>';
    }

    var isLast = idx === tips.length - 1;
    card.innerHTML =
      '<div class="tips-card-icon">' + tip.icon + '</div>' +
      '<div class="tips-card-title">' + tip.title + '</div>' +
      '<div class="tips-card-body">' + tip.body + '</div>' +
      '<div class="tips-card-footer">' +
        '<div class="tips-dots">' + dotsHtml + '</div>' +
        '<button class="tips-next-btn" id="tipsNextBtn">' + (isLast ? 'Got it!' : 'Next →') + '</button>' +
      '</div>' +
      (idx === 0 ? '<button class="tips-skip" id="tipsSkipBtn">Skip tips</button>' : '');

    // Wire buttons
    document.getElementById('tipsNextBtn').addEventListener('click', function() {
      if (isLast) {
        dismiss();
      } else {
        showStep(idx + 1);
      }
    });

    var skipBtn = document.getElementById('tipsSkipBtn');
    if (skipBtn) {
      skipBtn.addEventListener('click', function() {
        dismiss();
      });
    }

    // Position card near the target element
    positionCard(targetEl, tip);
  }

  function positionCard(targetEl, tip) {
    if (!targetEl) {
      // Fallback: center of screen
      card.style.top = '50%';
      card.style.left = '50%';
      card.style.transform = 'translate(-50%, -50%)';
      return;
    }

    card.style.transform = '';
    var rect = targetEl.getBoundingClientRect();
    var cardWidth = 320;
    var cardHeight = 200; // approximate
    var margin = 16;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    if (tip.position === 'center') {
      // Center over the canvas area
      card.style.top = Math.max(margin, rect.top + rect.height / 2 - cardHeight / 2) + 'px';
      card.style.left = Math.max(margin, Math.min(vw - cardWidth - margin, rect.left + rect.width / 2 - cardWidth / 2)) + 'px';
    } else if (tip.position === 'below') {
      card.style.top = Math.min(vh - cardHeight - margin, rect.bottom + margin) + 'px';
      card.style.left = Math.max(margin, Math.min(vw - cardWidth - margin, rect.left + rect.width / 2 - cardWidth / 2)) + 'px';
    } else if (tip.position === 'right') {
      card.style.top = Math.max(margin, rect.top) + 'px';
      card.style.left = Math.min(vw - cardWidth - margin, rect.right + margin) + 'px';
    } else {
      // Default: below
      card.style.top = Math.min(vh - cardHeight - margin, rect.bottom + margin) + 'px';
      card.style.left = Math.max(margin, Math.min(vw - cardWidth - margin, rect.left)) + 'px';
    }

    // Ensure card is visible on screen
    var cardRect = card.getBoundingClientRect();
    if (cardRect.bottom > vh) {
      card.style.top = Math.max(margin, rect.top - cardHeight - margin) + 'px';
    }
    if (cardRect.right > vw) {
      card.style.left = (vw - cardWidth - margin) + 'px';
    }
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');

    if (highlightedEl) {
      highlightedEl.classList.remove('tips-highlight');
      highlightedEl = null;
    }

    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(function() {
        if (overlay) overlay.remove();
        overlay = null;
      }, 300);
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 3000); });
  } else {
    setTimeout(init, 3000);
  }
})();
