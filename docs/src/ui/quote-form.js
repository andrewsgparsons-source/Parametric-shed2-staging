/**
 * quote-form.js — Screen 5: Lead Capture / Quote Request Form
 * 
 * Modal form that appears when "Get a Detailed Quote" is clicked in Screen 4.
 * 
 * Features:
 *   - Form fields: Name, Email, Postcode, Phone (optional), Budget, Site status
 *   - Real-time validation (green ticks, not red errors)
 *   - Honeypot spam field (no CAPTCHA)
 *   - GDPR consent checkbox
 *   - Auto-attaches: design state, screenshot, price estimate, timestamp, device
 *   - Submits to Firebase Realtime Database
 *   - On success → shows Screen 6 (confirmation)
 * 
 * INTEGRATION POINTS:
 *   - Called from design-summary.js via dynamic import
 *   - Posts to: https://dashboards-5c2fb-default-rtdb.europe-west1.firebasedatabase.app/leads.json
 *   - CSS: uses design-summary.css (shared styles)
 * 
 * USAGE:
 *   import { showQuoteForm } from './ui/quote-form.js';
 *   showQuoteForm({
 *     screenshot: 'data:image/jpeg;base64,...',
 *     state: { ... },
 *     priceEstimate: { low, high, ... },
 *     emailOnly: false  // true for "Email Me a Copy" path
 *   });
 */

// Firebase Realtime Database endpoint
var FIREBASE_URL = 'https://dashboards-5c2fb-default-rtdb.europe-west1.firebasedatabase.app';

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

/** Detect device type */
function getDeviceType() {
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'mobile';
  if (/Tablet|iPad/i.test(navigator.userAgent)) return 'tablet';
  return 'desktop';
}

/** Base64-encode a string (safely handles Unicode) */
function toBase64(str) {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    return btoa(str);
  }
}

/** Simple email validation */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** UK postcode validation (loose) */
function isValidPostcode(pc) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(pc.trim());
}

/** Generate a reference number: BSC-YYYY-NNNN */
function generateRefNumber() {
  var year = new Date().getFullYear();
  // Use a timestamp-based number to ensure uniqueness (will be sequential from Firebase later)
  var seq = Math.floor(Date.now() / 1000) % 10000;
  var padded = ('0000' + seq).slice(-4);
  return 'BSC-' + year + '-' + padded;
}

// ---------------------------------------------------------------------------
// Main: Build & Show
// ---------------------------------------------------------------------------

var overlayEl = null;
var formContext = null;  // { screenshot, state, priceEstimate, emailOnly }

/**
 * Show the Quote Form overlay (Screen 5).
 * @param {Object} opts - { screenshot, state, priceEstimate, emailOnly }
 */
export function showQuoteForm(opts) {
  ensureCSS();
  hideQuoteForm();

  formContext = opts || {};
  var emailOnly = !!formContext.emailOnly;

  var html = '';

  // Close button
  html += '<button class="cf-close-btn" id="cfFormClose" aria-label="Close form">&times;</button>';

  // Header
  html += '<div class="cf-form-header">';
  if (emailOnly) {
    html += '<h2 class="cf-form-title">Email Me a Copy</h2>';
    html += '<p class="cf-form-subtitle">We\'ll send your design details straight to your inbox.</p>';
  } else {
    html += '<h2 class="cf-form-title">Get a Detailed Quote</h2>';
    html += '<p class="cf-form-subtitle">I\'ll personally review your design and come back to you within 48 hours.</p>';
  }
  html += '</div>';

  // Form body
  html += '<div class="cf-form-body">';
  html += '<form id="cfQuoteForm" novalidate autocomplete="on">';

  // Status message area
  html += '<div class="cf-form-status" id="cfFormStatus"></div>';

  // Name
  html += formGroup('cfName', 'Your Name', 'text', '', true, 'John Smith', 'name');

  // Email
  html += formGroup('cfEmail', 'Email Address', 'email', '', true, 'john@example.com', 'email');

  if (!emailOnly) {
    // Postcode
    html += formGroup('cfPostcode', 'Postcode', 'text', '', true, 'SP1 1AA', 'postal-code');

    // Phone (optional)
    html += formGroup('cfPhone', 'Phone Number', 'tel', 'optional', false, '07700 900000', 'tel');

    // Budget + Site status (side by side)
    html += '<div class="cf-form-row">';
    html += '<div class="cf-form-group">';
    html += '<label class="cf-form-label" for="cfBudget">Budget Range</label>';
    html += '<select class="cf-form-select" id="cfBudget" name="budget" autocomplete="off">';
    html += '<option value="">— Select —</option>';
    html += '<option value="under-5k">Under £5,000</option>';
    html += '<option value="5k-10k">£5,000 – £10,000</option>';
    html += '<option value="10k-20k">£10,000 – £20,000</option>';
    html += '<option value="20k-plus">£20,000+</option>';
    html += '</select>';
    html += '</div>';

    html += '<div class="cf-form-group">';
    html += '<label class="cf-form-label" for="cfSiteStatus">Site Status</label>';
    html += '<select class="cf-form-select" id="cfSiteStatus" name="siteStatus" autocomplete="off">';
    html += '<option value="">— Select —</option>';
    html += '<option value="clear">Clear &amp; ready</option>';
    html += '<option value="needs-groundwork">Needs groundwork</option>';
    html += '<option value="not-sure">Not sure</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>'; // .cf-form-row
  }

  // Honeypot field (invisible to real users, bots fill it)
  html += '<div class="cf-hp-field" aria-hidden="true">';
  html += '<label for="cfWebsite">Website</label>';
  html += '<input type="text" id="cfWebsite" name="website" tabindex="-1" autocomplete="off" />';
  html += '</div>';

  // GDPR consent
  html += '<div class="cf-consent-row">';
  html += '<input type="checkbox" id="cfConsent" name="consent" />';
  html += '<label class="cf-consent-text" for="cfConsent">';
  html += 'I agree to Bespoke Shed Company processing my data to provide a quote. ';
  html += 'We\'ll only contact you about this enquiry. ';
  html += '<a href="https://bespokeshedcompany.co.uk/privacy" target="_blank" rel="noopener">Privacy Policy</a>';
  html += '</label>';
  html += '</div>';

  // Submit button
  if (emailOnly) {
    html += '<button type="submit" class="cf-btn cf-btn-primary" id="cfSubmitBtn">Send Me a Copy</button>';
  } else {
    html += '<button type="submit" class="cf-btn cf-btn-primary" id="cfSubmitBtn">Request Formal Quote</button>';
  }

  html += '</form>';
  html += '</div>'; // .cf-form-body

  // Create overlay
  overlayEl = document.createElement('div');
  overlayEl.className = 'cf-overlay';
  overlayEl.id = 'cfFormOverlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-label', emailOnly ? 'Email Me a Copy' : 'Quote Request Form');

  var modal = document.createElement('div');
  modal.className = 'cf-modal';
  modal.innerHTML = html;
  overlayEl.appendChild(modal);
  document.body.appendChild(overlayEl);

  // Animate in
  requestAnimationFrame(function() {
    overlayEl.classList.add('cf-visible');
  });

  // Wire events
  wireFormEvents(modal);

  // Focus first input
  setTimeout(function() {
    var first = modal.querySelector('#cfName');
    if (first) first.focus();
  }, 400);

  return overlayEl;
}

/** Build a form group with label, input, and validation tick */
function formGroup(id, label, type, optionalText, required, placeholder, autocomplete) {
  var html = '<div class="cf-form-group">';
  html += '<label class="cf-form-label" for="' + id + '">' + label;
  if (optionalText) html += ' <span class="cf-optional">(' + optionalText + ')</span>';
  html += '</label>';
  html += '<input class="cf-form-input" type="' + type + '" id="' + id + '" name="' + id + '"';
  if (required) html += ' required';
  if (placeholder) html += ' placeholder="' + placeholder + '"';
  if (autocomplete) html += ' autocomplete="' + autocomplete + '"';
  html += ' />';
  html += '<span class="cf-tick" id="' + id + 'Tick">✓</span>';
  html += '</div>';
  return html;
}

function wireFormEvents(modal) {
  // Close button
  var closeBtn = modal.querySelector('#cfFormClose');
  if (closeBtn) closeBtn.addEventListener('click', hideQuoteForm);

  // Click outside
  overlayEl.addEventListener('click', function(e) {
    if (e.target === overlayEl) hideQuoteForm();
  });

  // Escape key
  document.addEventListener('keydown', onFormEscKey);

  // Real-time validation
  var nameInput = modal.querySelector('#cfName');
  var emailInput = modal.querySelector('#cfEmail');
  var postcodeInput = modal.querySelector('#cfPostcode');
  var phoneInput = modal.querySelector('#cfPhone');

  if (nameInput) nameInput.addEventListener('input', function() {
    toggleTick('cfNameTick', nameInput.value.trim().length >= 2);
  });

  if (emailInput) emailInput.addEventListener('input', function() {
    toggleTick('cfEmailTick', isValidEmail(emailInput.value.trim()));
  });

  if (postcodeInput) postcodeInput.addEventListener('input', function() {
    toggleTick('cfPostcodeTick', isValidPostcode(postcodeInput.value));
  });

  if (phoneInput) phoneInput.addEventListener('input', function() {
    // Phone is optional — tick if it looks like a number or is empty
    var val = phoneInput.value.trim();
    toggleTick('cfPhoneTick', val === '' || /^[\d\s+()-]{7,}$/.test(val));
  });

  // Form submission
  var form = modal.querySelector('#cfQuoteForm');
  if (form) form.addEventListener('submit', handleSubmit);
}

/** Show/hide validation tick */
function toggleTick(tickId, valid) {
  var tick = document.getElementById(tickId);
  if (!tick) return;
  if (valid) {
    tick.classList.add('cf-show');
  } else {
    tick.classList.remove('cf-show');
  }
  // Also update input border
  var input = tick.previousElementSibling;
  if (input) {
    if (valid) input.classList.add('cf-valid');
    else input.classList.remove('cf-valid');
  }
}

function onFormEscKey(e) {
  if (e.key === 'Escape') hideQuoteForm();
}

// ---------------------------------------------------------------------------
// Form Submission
// ---------------------------------------------------------------------------

function handleSubmit(e) {
  e.preventDefault();

  var emailOnly = !!(formContext && formContext.emailOnly);

  // Check honeypot
  var honeypot = document.getElementById('cfWebsite');
  if (honeypot && honeypot.value) {
    // Bot detected — silently pretend success
    console.log('[quote-form] Honeypot triggered — ignoring submission');
    showFakeSuccess();
    return;
  }

  // Gather values
  var name = (document.getElementById('cfName')?.value || '').trim();
  var email = (document.getElementById('cfEmail')?.value || '').trim();
  var postcode = emailOnly ? '' : (document.getElementById('cfPostcode')?.value || '').trim();
  var phone = emailOnly ? '' : (document.getElementById('cfPhone')?.value || '').trim();
  var budget = emailOnly ? '' : (document.getElementById('cfBudget')?.value || '');
  var siteStatus = emailOnly ? '' : (document.getElementById('cfSiteStatus')?.value || '');
  var consent = document.getElementById('cfConsent')?.checked;

  // Validate
  var errors = [];
  if (!name || name.length < 2) errors.push('Name is required');
  if (!isValidEmail(email)) errors.push('Valid email is required');
  if (!emailOnly && !isValidPostcode(postcode)) errors.push('Valid UK postcode is required');
  if (!consent) errors.push('Please agree to the privacy policy');

  if (errors.length > 0) {
    showStatus(errors.join('. ') + '.', 'cf-error');
    return;
  }

  // Prepare payload
  var refNumber = generateRefNumber();
  var stateJson = '';
  try {
    stateJson = toBase64(JSON.stringify(formContext.state || {}));
  } catch (e) {
    stateJson = '';
  }

  var payload = {
    // Lead info
    name: name,
    email: email,
    postcode: postcode || null,
    phone: phone || null,
    budget: budget || null,
    siteStatus: siteStatus || null,
    consent: true,
    
    // Design data
    designState: stateJson,
    screenshot: formContext.screenshot || null,
    priceEstimate: formContext.priceEstimate ? {
      low: formContext.priceEstimate.low,
      high: formContext.priceEstimate.high
    } : null,
    
    // Metadata
    refNumber: refNumber,
    timestamp: new Date().toISOString(),
    deviceType: getDeviceType(),
    userAgent: navigator.userAgent,
    pageUrl: window.location.href,
    source: emailOnly ? 'email-copy' : 'quote-request',
    
    // Status tracking
    status: 'new',
    followedUp: false
  };

  // Show loading state
  var submitBtn = document.getElementById('cfSubmitBtn');
  if (submitBtn) {
    submitBtn.classList.add('cf-loading');
    submitBtn.disabled = true;
  }
  showStatus('Sending your request…', 'cf-submitting');

  // POST to Firebase
  fetch(FIREBASE_URL + '/leads.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      console.log('[quote-form] Lead saved:', data.name, 'ref:', refNumber);
      
      // Success → show confirmation (Screen 6)
      hideQuoteForm();
      import('./quote-confirmation.js').then(function(mod) {
        mod.showConfirmation({
          refNumber: refNumber,
          name: name,
          email: email,
          screenshot: formContext.screenshot,
          state: formContext.state,
          priceEstimate: formContext.priceEstimate,
          firebaseKey: data.name,
          emailOnly: emailOnly
        });
      }).catch(function(err) {
        console.error('[quote-form] Failed to load confirmation:', err);
        alert('Your quote request was submitted successfully! Reference: ' + refNumber);
      });
    })
    .catch(function(err) {
      console.error('[quote-form] Submission error:', err);
      showStatus('Something went wrong. Please try again or email us directly.', 'cf-error');
      if (submitBtn) {
        submitBtn.classList.remove('cf-loading');
        submitBtn.disabled = false;
      }
    });
}

/** Show a fake success for honeypot bots */
function showFakeSuccess() {
  hideQuoteForm();
  // Just close — bots don't care about confirmation
}

/** Show form status message */
function showStatus(msg, cssClass) {
  var el = document.getElementById('cfFormStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'cf-form-status ' + cssClass;
}

/**
 * Hide/remove the Quote Form overlay.
 */
export function hideQuoteForm() {
  document.removeEventListener('keydown', onFormEscKey);
  if (!overlayEl) return;
  overlayEl.classList.remove('cf-visible');
  var el = overlayEl;
  overlayEl = null;
  setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 350);
}
