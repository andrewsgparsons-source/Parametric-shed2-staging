# Conversion Flow — Integration Guide

## Overview

These files implement **Screens 4–6** of the configurator conversion funnel:

| File | Screen | Purpose |
|------|--------|---------|
| `design-summary.js` | 4 — Design Summary | Modal showing specs, price range, CTAs |
| `quote-form.js` | 5 — Lead Capture | Quote request form → Firebase |
| `quote-confirmation.js` | 6 — Confirmation | Thank-you with ref number & next steps |
| `design-summary.css` | — | Shared CSS for all three screens |

## Architecture

```
design-summary.js  ──"Get a Detailed Quote"──▶  quote-form.js  ──success──▶  quote-confirmation.js
       │                                              │
       ├── "Save My Design" ──▶ existing share-link   │
       └── "Email Me a Copy" ──▶ quote-form.js        └──▶ Firebase POST: /leads.json
                                  (emailOnly mode)
```

Each screen dynamically imports the next (`import('./quote-form.js')`) to keep initial load fast.

## How to Wire In

### Step 1: Load the CSS

Add to `index.html` (in `<head>`):

```html
<link rel="stylesheet" href="./src/ui/design-summary.css" />
```

Or: the JS files auto-load the CSS on first use (via `ensureCSS()`), so this step is technically optional — but preloading avoids a flash of unstyled content.

### Step 2: Add a trigger button

The summary can be triggered from anywhere. Likely places:

**Option A: Add "Get Quote" button to the wizard's final step (sidebar-wizard.js)**
```javascript
// In sidebar-wizard.js, after the Save & Share step, add:
var quoteBtn = document.createElement('button');
quoteBtn.textContent = '💬 Get a Quote';
quoteBtn.className = 'sw-step';
quoteBtn.addEventListener('click', function() {
  import('./design-summary.js').then(function(mod) {
    mod.showDesignSummary();
  });
});
```

**Option B: Add a floating CTA button**
```html
<!-- In index.html, before </body> -->
<button id="getQuoteBtn" style="
  position: fixed; bottom: 20px; right: 20px; z-index: 9000;
  padding: 14px 24px; border-radius: 12px; border: none;
  background: #4a7c3f; color: #fff; font-size: 15px; font-weight: 600;
  cursor: pointer; box-shadow: 0 4px 14px rgba(74,124,63,0.35);
">
  Get a Quote →
</button>
<script type="module">
  document.getElementById('getQuoteBtn').addEventListener('click', function() {
    import('./src/ui/design-summary.js').then(function(mod) {
      mod.showDesignSummary();
    });
  });
</script>
```

**Option C: Trigger from the wizard "Done" button (wizard-mode.js)**
```javascript
// When user clicks "Done" on the last wizard step:
document.getElementById('wizNext').addEventListener('click', function() {
  if (currentStep === STEPS.length - 1) {
    import('./design-summary.js').then(function(mod) {
      mod.showDesignSummary();
    });
  }
});
```

### Step 3: Ensure pricing is loaded

The price table must be loaded before showing the summary. This is already handled by `index.html`:
```html
<script type="module">
  import { loadPriceTable } from './src/pricing.js';
  loadPriceTable();
</script>
```

If the price table isn't loaded, the summary will still show but without the price range.

### Step 4: Customer profile visibility

You may want to only show the conversion flow for customer profiles, not admin:
```javascript
var params = new URLSearchParams(window.location.search);
var profile = params.get('profile');
if (profile === 'customer') {
  // Show "Get a Quote" button
}
```

## Dependencies

| Dependency | Where | Notes |
|------------|-------|-------|
| `window.__dbg.store` | State store | Created by `index.js` — always available after boot |
| `estimatePrice()` | From `pricing.js` | Imported as ES module — needs price table loaded |
| `renderCanvas` | The Babylon.js canvas | Used for screenshot capture |
| Firebase RTDB | External service | POST to `/leads.json` — no auth required for writes |

## Firebase Data Structure

Each lead is stored at `/leads/{firebase-push-id}`:

```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "postcode": "SP1 1AA",
  "phone": "07700 900000",
  "budget": "5k-10k",
  "siteStatus": "clear",
  "consent": true,
  "designState": "<base64-encoded JSON>",
  "screenshot": "data:image/jpeg;base64,...",
  "priceEstimate": { "low": 7000, "high": 11000 },
  "refNumber": "BSC-2025-0047",
  "timestamp": "2025-02-25T14:30:00.000Z",
  "deviceType": "desktop",
  "userAgent": "...",
  "pageUrl": "https://...",
  "source": "quote-request",
  "status": "new",
  "followedUp": false
}
```

## Reference Numbers

Format: `BSC-YYYY-NNNN` (e.g., BSC-2025-0047)

Currently generated client-side using timestamp modulo. For true sequential numbering:

1. Add a Firebase counter at `/meta/leadCounter`
2. Use a Firebase transaction to atomically increment
3. Or: use the Firebase push ID ordering (they sort chronologically)

## Exported Functions

### `design-summary.js`
- `showDesignSummary()` — Opens Screen 4
- `hideDesignSummary()` — Closes Screen 4
- `getLastScreenshot()` — Returns the last captured screenshot data URL

### `quote-form.js`
- `showQuoteForm(opts)` — Opens Screen 5
  - `opts.screenshot` — Data URL of the 3D screenshot
  - `opts.state` — Current design state object
  - `opts.priceEstimate` — Result from `estimatePrice()`
  - `opts.emailOnly` — `true` for "Email Me a Copy" variant
- `hideQuoteForm()` — Closes Screen 5

### `quote-confirmation.js`
- `showConfirmation(opts)` — Opens Screen 6
  - `opts.refNumber` — The BSC-YYYY-NNNN reference
  - `opts.name` — Customer name
  - `opts.email` — Customer email
  - `opts.screenshot` — Design screenshot
  - `opts.state` — Design state
  - `opts.priceEstimate` — Price estimate
  - `opts.firebaseKey` — Firebase push ID
  - `opts.emailOnly` — Whether this was an "email copy" request
- `hideConfirmation()` — Closes Screen 6

## Future Enhancements (Phase 2+)

- [ ] Telegram notification to Andrew on new lead
- [ ] Automated confirmation email to customer (SendGrid/Resend)
- [ ] Sequential reference numbers via Firebase counter
- [ ] Analytics tracking (which screen do users drop off?)
- [ ] "Email Me a Copy" sends actual email with design link
- [ ] Onboarding quiz answers attached to lead data
