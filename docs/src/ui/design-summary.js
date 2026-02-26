/**
 * design-summary.js — Screen 4: Design Summary Overlay
 * 
 * Shows a modal with:
 *   - Auto-captured 3D screenshot from the canvas
 *   - Key specs (dimensions, roof style, wall type, cladding, doors, windows)
 *   - Price estimate RANGE only (low–high, no breakdown, no margins)
 *   - Three CTA buttons for conversion flow
 * 
 * INTEGRATION POINTS:
 *   - State store:  window.__dbg.store  (created by index.js)
 *   - Pricing:      import { estimatePrice } from '../pricing.js'
 *   - Canvas:       document.getElementById('renderCanvas')
 *   - CSS:          Loads ./design-summary.css (or include it in your build)
 * 
 * USAGE:
 *   import { showDesignSummary } from './ui/design-summary.js';
 *   showDesignSummary();   // opens the overlay
 * 
 * DEPENDENCIES:
 *   - pricing.js must have loaded the price table first (loadPriceTable())
 *   - state.js store must be initialised at window.__dbg.store
 */

import { estimatePrice } from '../pricing.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure the CSS file is loaded (idempotent) */
function ensureCSS() {
  if (document.getElementById('cf-design-summary-css')) return;
  var link = document.createElement('link');
  link.id = 'cf-design-summary-css';
  link.rel = 'stylesheet';
  link.href = './src/ui/design-summary.css';
  document.head.appendChild(link);
}

/** Capture a JPEG screenshot from the Babylon.js canvas */
function captureScreenshot() {
  try {
    var canvas = document.getElementById('renderCanvas');
    if (!canvas) return null;
    // Babylon.js uses preserveDrawingBuffer=false by default,
    // so we need to render a frame first. If the engine is available, do so.
    var engine = window.__dbg && window.__dbg.engine;
    var scene = window.__dbg && window.__dbg.scene;
    if (engine && scene) {
      scene.render();
    }
    var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return (dataUrl && dataUrl.length > 100) ? dataUrl : null;
  } catch (e) {
    console.warn('[design-summary] Screenshot capture failed:', e);
    return null;
  }
}

/** Get the current state from the store */
function getState() {
  var store = window.__dbg && window.__dbg.store;
  if (store && typeof store.getState === 'function') return store.getState();
  return null;
}

/** Format mm to a nice display (e.g. "3000mm" or "3.0m") */
function fmtMm(mm) {
  if (!mm && mm !== 0) return '—';
  if (mm >= 1000) return (mm / 1000).toFixed(1).replace(/\.0$/, '') + 'm';
  return mm + 'mm';
}

/** Friendly labels for roof styles */
function roofLabel(style) {
  var map = {
    apex: 'Apex (Gabled)',
    pent: 'Pent (Single Pitch)',
    hipped: 'Hipped (4 Slopes)'
  };
  return map[style] || style || '—';
}

/** Friendly labels for cladding styles */
function claddingLabel(style) {
  var map = {
    shiplap: 'Shiplap',
    overlap: 'Overlap (Featheredge)',
    'feather_edge': 'Featheredge',
    'featherEdge': 'Featheredge',
    'composite-panel': 'Composite (Woodgrain)'
  };
  return map[style] || style || '—';
}

/** Friendly labels for wall variant */
function wallVariantLabel(variant) {
  if (variant === 'insulated') return 'Insulated';
  if (variant === 'basic') return 'Basic (Uninsulated)';
  return variant || '—';
}

/** Count openings from state */
function countOpenings(state, type) {
  var openings = state && state.walls && state.walls.openings;
  if (!Array.isArray(openings)) return type === 'door' ? 1 : 0;
  return openings.filter(function(o) {
    if (!o || !o.enabled) return false;
    var t = (o.type || '').toLowerCase();
    if (type === 'door') return t.includes('door');
    if (type === 'window') return t.includes('window') && t !== 'skylight';
    return false;
  }).length || (type === 'door' ? 1 : 0);
}

/** Format currency */
function fmtPrice(n) {
  return '£' + n.toLocaleString('en-GB');
}

// ---------------------------------------------------------------------------
// Main: Build & Show
// ---------------------------------------------------------------------------

var overlayEl = null;
var currentScreenshot = null;  // stored for passing to quote form

/**
 * Show the Design Summary overlay (Screen 4).
 * Returns a reference to the overlay element.
 */
export function showDesignSummary() {
  ensureCSS();

  // Remove any existing overlay
  hideDesignSummary();

  var state = getState();
  if (!state) {
    console.warn('[design-summary] No state available — cannot show summary.');
    return null;
  }

  // Capture screenshot
  currentScreenshot = captureScreenshot();

  // Get price estimate
  var est = estimatePrice(state);

  // Extract specs
  var w = (state.dim && state.dim.frameW_mm) || state.w || 0;
  var d = (state.dim && state.dim.frameD_mm) || state.d || 0;
  var roofStyle = (state.roof && state.roof.style) || 'apex';
  var wallVariant = (state.walls && state.walls.variant) || 'insulated';
  var claddingStyle = (state.cladding && (state.cladding.style || state.cladding.profile)) || 'shiplap';
  var doorCount = countOpenings(state, 'door');
  var windowCount = countOpenings(state, 'window');

  // Build HTML
  var html = '';

  // Close button
  html += '<button class="cf-close-btn" id="cfSummaryClose" aria-label="Close summary">&times;</button>';

  // Screenshot
  if (currentScreenshot) {
    html += '<img class="cf-summary-screenshot" src="' + currentScreenshot + '" alt="Your shed design" />';
  }

  // Body
  html += '<div class="cf-summary-body">';
  html += '<h2 class="cf-summary-title">Your Design Summary</h2>';
  html += '<p class="cf-summary-subtitle">Here\'s what you\'ve built so far</p>';

  // Specs grid
  html += '<div class="cf-specs">';
  html += specItem('Dimensions', fmtMm(w) + ' × ' + fmtMm(d));
  html += specItem('Roof Style', roofLabel(roofStyle));
  html += specItem('Wall Type', wallVariantLabel(wallVariant));
  html += specItem('Cladding', claddingLabel(claddingStyle));
  html += specItem('Doors', doorCount + '');
  html += specItem('Windows', windowCount + '');
  html += '</div>';

  // Price range
  if (est) {
    html += '<div class="cf-price-card">';
    html += '<div class="cf-price-label">Typical Build Range</div>';
    html += '<div class="cf-price-range">' + fmtPrice(est.low) + '<span class="cf-price-dash"> — </span>' + fmtPrice(est.high) + '</div>';
    html += '<div class="cf-price-note">Depending on finish, site conditions &amp; access</div>';
    html += '</div>';
  }

  // CTA buttons
  html += '<div class="cf-cta-group">';
  html += '<button class="cf-btn cf-btn-primary" id="cfGetQuote">Get a Detailed Quote</button>';
  html += '<button class="cf-btn cf-btn-secondary" id="cfSaveDesign">💾 Save My Design</button>';
  html += '<button class="cf-btn cf-btn-tertiary" id="cfEmailCopy">✉ Email Me a Copy</button>';
  html += '</div>';

  html += '</div>'; // .cf-summary-body

  // Create overlay
  overlayEl = document.createElement('div');
  overlayEl.className = 'cf-overlay';
  overlayEl.id = 'cfSummaryOverlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-label', 'Design Summary');
  overlayEl.setAttribute('data-cf-protected', 'true');

  var modal = document.createElement('div');
  modal.className = 'cf-modal';
  modal.innerHTML = html;
  overlayEl.appendChild(modal);
  // Append to #cf-root (protected from purgeSidebars in views.js)
  var cfRoot = document.getElementById('cf-root') || document.body;
  cfRoot.appendChild(overlayEl);

  // Animate in
  requestAnimationFrame(function() {
    overlayEl.classList.add('cf-visible');
  });

  // Wire up events
  wireEvents(modal);

  return overlayEl;
}

function specItem(label, value) {
  return '<div class="cf-spec-item">' +
    '<span class="cf-spec-label">' + label + '</span>' +
    '<span class="cf-spec-value">' + value + '</span>' +
    '</div>';
}

function wireEvents(modal) {
  // Close button
  var closeBtn = modal.querySelector('#cfSummaryClose');
  if (closeBtn) closeBtn.addEventListener('click', hideDesignSummary);

  // Click outside modal to close
  overlayEl.addEventListener('click', function(e) {
    if (e.target === overlayEl) hideDesignSummary();
  });

  // Escape key
  document.addEventListener('keydown', onEscKey);

  // Get a Detailed Quote → Screen 5
  var quoteBtn = modal.querySelector('#cfGetQuote');
  if (quoteBtn) {
    quoteBtn.addEventListener('click', function() {
      hideDesignSummary();
      // Dynamically import quote form to keep initial bundle small
      import('./quote-form.js').then(function(mod) {
        mod.showQuoteForm({
          screenshot: currentScreenshot,
          state: getState(),
          priceEstimate: estimatePrice(getState())
        });
      }).catch(function(err) {
        console.error('[design-summary] Failed to load quote form:', err);
      });
    });
  }

  // Save My Design → use existing share link system
  var saveBtn = modal.querySelector('#cfSaveDesign');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      // Trigger the existing share link button if available
      var shareBtn = document.getElementById('shareWhatsAppBtn') || document.getElementById('copyShareLinkBtn');
      if (shareBtn) {
        hideDesignSummary();
        shareBtn.click();
      } else {
        // Fallback: copy the current URL with state
        var url = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function() {
            saveBtn.textContent = '✅ Link Copied!';
            setTimeout(function() { saveBtn.textContent = '💾 Save My Design'; }, 2000);
          });
        }
      }
    });
  }

  // Email Me a Copy → also show quote form but in "email only" mode
  var emailBtn = modal.querySelector('#cfEmailCopy');
  if (emailBtn) {
    emailBtn.addEventListener('click', function() {
      hideDesignSummary();
      import('./quote-form.js').then(function(mod) {
        mod.showQuoteForm({
          screenshot: currentScreenshot,
          state: getState(),
          priceEstimate: estimatePrice(getState()),
          emailOnly: true  // signals lighter form (just name + email)
        });
      }).catch(function(err) {
        console.error('[design-summary] Failed to load quote form:', err);
      });
    });
  }
}

function onEscKey(e) {
  if (e.key === 'Escape') hideDesignSummary();
}

/**
 * Hide/remove the Design Summary overlay.
 */
export function hideDesignSummary() {
  document.removeEventListener('keydown', onEscKey);
  if (!overlayEl) return;
  overlayEl.classList.remove('cf-visible');
  var el = overlayEl;
  overlayEl = null;
  setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 350); // wait for fade-out transition
}

/**
 * Get the last captured screenshot (for passing to other screens).
 */
export function getLastScreenshot() {
  return currentScreenshot;
}
