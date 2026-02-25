/**
 * quote-confirmation.js — Screen 6: Confirmation & Reassurance
 * 
 * Shows after successful form submission (Screen 5).
 * 
 * Displays:
 *   - Thank-you message (personal tone — Andrew, not a corporation)
 *   - Design screenshot
 *   - Reference number (BSC-YYYY-NNNN)
 *   - Share link
 *   - "What happens next" steps
 *   - Button to close and return to configurator
 * 
 * INTEGRATION POINTS:
 *   - Called from quote-form.js after successful Firebase POST
 *   - CSS: uses design-summary.css (shared styles)
 *   - Share link: uses the existing Cloudflare worker for share URLs
 * 
 * USAGE:
 *   import { showConfirmation } from './ui/quote-confirmation.js';
 *   showConfirmation({
 *     refNumber: 'BSC-2025-0047',
 *     name: 'John',
 *     email: 'john@example.com',
 *     screenshot: 'data:image/jpeg;base64,...',
 *     state: { ... },
 *     priceEstimate: { low, high },
 *     firebaseKey: '-Nxx123...',
 *     emailOnly: false
 *   });
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure CSS is loaded */
function ensureCSS() {
  if (document.getElementById('cf-design-summary-css')) return;
  var link = document.createElement('link');
  link.id = 'cf-design-summary-css';
  link.rel = 'stylesheet';
  link.href = './src/ui/design-summary.css';
  document.head.appendChild(link);
}

/** Copy text to clipboard with fallback */
function copyToClipboard(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      if (onDone) onDone(true);
    }).catch(function() {
      fallbackCopy(text);
      if (onDone) onDone(true);
    });
  } else {
    fallbackCopy(text);
    if (onDone) onDone(true);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* best effort */ }
  ta.remove();
}

// ---------------------------------------------------------------------------
// Main: Build & Show
// ---------------------------------------------------------------------------

var overlayEl = null;

/**
 * Show the Confirmation overlay (Screen 6).
 * @param {Object} opts - { refNumber, name, email, screenshot, state, priceEstimate, firebaseKey, emailOnly }
 */
export function showConfirmation(opts) {
  ensureCSS();
  hideConfirmation();

  opts = opts || {};
  var emailOnly = !!opts.emailOnly;
  var firstName = (opts.name || '').split(' ')[0] || 'there';

  // Build the share link (current page URL — users can re-open their design)
  var shareLink = window.location.href;

  var html = '';

  // Close button
  html += '<button class="cf-close-btn" id="cfConfirmClose" aria-label="Close">&times;</button>';

  // Body
  html += '<div class="cf-confirm-body">';

  // Success icon
  html += '<div class="cf-confirm-icon">✓</div>';

  // Title & message
  if (emailOnly) {
    html += '<h2 class="cf-confirm-title">On Its Way!</h2>';
    html += '<p class="cf-confirm-message">Thanks, ' + escHtml(firstName) + '. I\'ll email you a copy of your design shortly.</p>';
  } else {
    html += '<h2 class="cf-confirm-title">Quote Request Received</h2>';
    html += '<p class="cf-confirm-message">Thanks, ' + escHtml(firstName) + ' — I\'ve received your design. I\'ll personally review it and get back to you within 48 hours.</p>';
  }

  // Screenshot
  if (opts.screenshot) {
    html += '<img class="cf-confirm-screenshot" src="' + opts.screenshot + '" alt="Your shed design" />';
  }

  // Reference number
  if (opts.refNumber) {
    html += '<div class="cf-ref-number">' + escHtml(opts.refNumber) + '</div>';
  }

  // Share link
  html += '<div class="cf-share-link-row">';
  html += '<input class="cf-share-input" id="cfShareInput" type="text" value="' + escAttr(shareLink) + '" readonly />';
  html += '<button class="cf-share-copy-btn" id="cfShareCopy">📋 Copy Link</button>';
  html += '</div>';

  // What happens next
  if (!emailOnly) {
    html += '<div class="cf-next-steps">';
    html += '<div class="cf-next-steps-title">What Happens Next</div>';
    html += nextStepItem(1, 'I\'ll review your design and check the spec');
    html += nextStepItem(2, 'We\'ll arrange a quick chat or site visit');
    html += nextStepItem(3, 'You\'ll receive a detailed quote with full breakdown');
    html += '</div>';
  }

  // Close button
  html += '<button class="cf-btn cf-btn-secondary" id="cfConfirmDone" style="margin-top: 4px;">';
  html += emailOnly ? 'Back to My Design' : 'Return to Configurator';
  html += '</button>';

  html += '</div>'; // .cf-confirm-body

  // Create overlay
  overlayEl = document.createElement('div');
  overlayEl.className = 'cf-overlay';
  overlayEl.id = 'cfConfirmOverlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('data-cf-protected', 'true');
  overlayEl.setAttribute('aria-label', 'Confirmation');

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

  // Wire events
  wireConfirmEvents(modal);

  return overlayEl;
}

function nextStepItem(num, text) {
  return '<div class="cf-next-step-item">' +
    '<span class="cf-step-num">' + num + '</span>' +
    '<span class="cf-step-text">' + text + '</span>' +
    '</div>';
}

function escHtml(s) {
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wireConfirmEvents(modal) {
  // Close button (X)
  var closeBtn = modal.querySelector('#cfConfirmClose');
  if (closeBtn) closeBtn.addEventListener('click', hideConfirmation);

  // "Return to Configurator" button
  var doneBtn = modal.querySelector('#cfConfirmDone');
  if (doneBtn) doneBtn.addEventListener('click', hideConfirmation);

  // Click outside
  overlayEl.addEventListener('click', function(e) {
    if (e.target === overlayEl) hideConfirmation();
  });

  // Escape key
  document.addEventListener('keydown', onConfirmEscKey);

  // Copy share link
  var copyBtn = modal.querySelector('#cfShareCopy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      var input = document.getElementById('cfShareInput');
      if (input) {
        copyToClipboard(input.value, function() {
          copyBtn.textContent = '✅ Copied!';
          setTimeout(function() { copyBtn.textContent = '📋 Copy Link'; }, 2000);
        });
      }
    });
  }
}

function onConfirmEscKey(e) {
  if (e.key === 'Escape') hideConfirmation();
}

/**
 * Hide/remove the Confirmation overlay.
 */
export function hideConfirmation() {
  document.removeEventListener('keydown', onConfirmEscKey);
  if (!overlayEl) return;
  overlayEl.classList.remove('cf-visible');
  var el = overlayEl;
  overlayEl = null;
  setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 350);
}
