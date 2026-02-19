/**
 * Share Link — Creates short, shareable links via Cloudflare Worker
 * 
 * ZERO changes to existing code — this is a standalone module.
 */

import { generateViewerUrl } from "./profiles.js";

var WORKER_URL = "https://shed-share.andrewsgparsons.workers.dev";

/**
 * Create a short share link with customer name
 * @param {object} store - The state store (must have getState())
 * @param {HTMLCanvasElement} canvas - The Babylon.js canvas for screenshot
 * @param {function} onHint - Callback to show status messages
 */
export function createShareLink(store, canvas, onHint) {
  // 1. Ask for customer name
  var name = prompt("Customer name (for the link):");
  if (!name || !name.trim()) {
    if (onHint) onHint("Cancelled — no name entered");
    return;
  }
  name = name.trim();

  if (onHint) onHint("Creating share link…");

  // 2. Generate the full viewer URL
  var state, viewerUrl, screenshot;
  try {
    state = store.getState();
    viewerUrl = generateViewerUrl(state);
    console.log("[share-link] Generated URL:", viewerUrl);
  } catch (e) {
    console.error("[share-link] Error generating URL:", e);
    if (onHint) onHint("Error generating link: " + e.message);
    return;
  }

  // 3. Try to capture screenshot (best-effort, non-blocking)
  screenshot = quickScreenshot(canvas);

  // 4. POST to Worker
  var payload = { name: name, url: viewerUrl };
  if (screenshot) payload.screenshot = screenshot;

  console.log("[share-link] Posting to worker…", { name: name, urlLength: viewerUrl.length });

  fetch(WORKER_URL + "/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(function(res) {
      console.log("[share-link] Worker response status:", res.status);
      return res.json();
    })
    .then(function(data) {
      console.log("[share-link] Worker response data:", data);
      if (!data.success) {
        if (onHint) onHint("Error: " + (data.error || "Unknown error"));
        return;
      }
      deliverLink(data.shareUrl, name, onHint);
    })
    .catch(function(err) {
      console.error("[share-link] Error:", err);
      if (onHint) onHint("Network error: " + (err.message || "check connection"));
    });
}

/**
 * Quick synchronous screenshot — no async, no Babylon render target.
 * Returns base64 JPEG string or null.
 */
function quickScreenshot(canvas) {
  try {
    var dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    // Check it's not blank (blank canvas returns a very short data URL)
    if (dataUrl && dataUrl.length > 1000) {
      return dataUrl.split(",")[1];
    }
  } catch (e) {
    console.warn("[share-link] Screenshot failed:", e);
  }
  return null;
}

/**
 * Deliver the share link to the user.
 * Always shows a dialog with the link + share/copy buttons.
 */
function deliverLink(shareUrl, customerName, onHint) {
  if (onHint) onHint("✅ Link ready!");

  // Build a dialog with the link and action buttons
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483002;display:flex;align-items:center;justify-content:center;padding:20px;";

  var canShare = !!navigator.share;

  overlay.innerHTML =
    '<div style="background:white;border-radius:16px;padding:24px;max-width:400px;width:100%;text-align:center;font-family:Inter,sans-serif;">' +
      '<div style="font-size:28px;margin-bottom:8px;">✅</div>' +
      '<h3 style="margin:0 0 4px;font-size:16px;">' + escHtml(customerName) + '\'s Link Ready</h3>' +
      '<p style="margin:0 0 12px;color:#57534E;font-size:13px;">Share this with your customer</p>' +
      '<input id="shareLinkInput" type="text" value="' + shareUrl + '" readonly ' +
        'style="width:100%;padding:10px;border:1.5px solid #E7E0D8;border-radius:8px;font-size:13px;text-align:center;box-sizing:border-box;margin-bottom:12px;" />' +
      '<div style="display:flex;gap:8px;justify-content:center;">' +
        (canShare
          ? '<button id="shareLinkShare" style="flex:1;padding:12px;border-radius:8px;border:none;background:#25D366;color:white;font-size:14px;font-weight:600;cursor:pointer;">📱 Share</button>'
          : '') +
        '<button id="shareLinkCopy" style="flex:1;padding:12px;border-radius:8px;border:none;background:#B45309;color:white;font-size:14px;font-weight:600;cursor:pointer;">📋 Copy</button>' +
        '<button id="shareLinkClose" style="padding:12px 16px;border-radius:8px;border:1.5px solid #E7E0D8;background:white;font-size:14px;cursor:pointer;">✕</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  console.log("[share-link] Overlay appended to body");

  // Select URL on focus
  var input = document.getElementById("shareLinkInput");
  input.addEventListener("click", function() { this.select(); });

  // Share button — uses navigator.share() from a DIRECT user click (user gesture preserved)
  var shareBtn = document.getElementById("shareLinkShare");
  if (shareBtn) {
    shareBtn.addEventListener("click", function() {
      navigator.share({
        title: customerName + "'s Garden Building",
        text: "Take a look at your custom garden building design:",
        url: shareUrl
      }).then(function() {
        overlay.remove();
        if (onHint) onHint("✅ Shared!");
      }).catch(function() {
        // User cancelled — that's fine, dialog stays open
      });
    });
  }

  // Copy button
  var copyBtn = document.getElementById("shareLinkCopy");
  copyBtn.addEventListener("click", function() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(function() {
        copyBtn.textContent = "✅ Copied!";
        setTimeout(function() { copyBtn.textContent = "📋 Copy"; }, 2000);
      }).catch(function() {
        input.select();
        document.execCommand("copy");
        copyBtn.textContent = "✅ Copied!";
        setTimeout(function() { copyBtn.textContent = "📋 Copy"; }, 2000);
      });
    } else {
      input.select();
      document.execCommand("copy");
      copyBtn.textContent = "✅ Copied!";
      setTimeout(function() { copyBtn.textContent = "📋 Copy"; }, 2000);
    }
  });

  // Close button + background click-to-close
  // Delay attaching the background close handler to prevent mobile tap-through:
  // When the user taps "OK" on the prompt(), the touch event can pass through
  // and immediately hit the overlay background, closing it instantly.
  document.getElementById("shareLinkClose").addEventListener("click", function() {
    overlay.remove();
  });
  setTimeout(function() {
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }, 400);
}

function escHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}
