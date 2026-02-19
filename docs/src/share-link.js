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
  // 1. Ask for customer name (still within user gesture)
  var name = prompt("Customer name (for the link):");
  if (!name || !name.trim()) {
    if (onHint) onHint("Cancelled — no name entered");
    return;
  }
  name = name.trim();

  // 2. Normalise slug to lowercase (worker stores lowercase, URLs are case-sensitive)
  var slug = name.toLowerCase();

  // 3. We know the share URL pattern — construct it NOW while still in user gesture
  var shareUrl = WORKER_URL + "/s/" + encodeURIComponent(slug);

  // 3. Copy to clipboard IMMEDIATELY (still in user gesture context)
  //    This is the key fix — clipboard API requires user gesture, so do it before any async
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).catch(function() {
      // Fallback: execCommand
      fallbackCopy(shareUrl);
    });
  } else {
    fallbackCopy(shareUrl);
  }

  if (onHint) onHint("📋 Link copied! Creating share link…");

  // 4. Generate the full viewer URL and POST to worker (async, in background)
  var state = store.getState();
  var viewerUrl = generateViewerUrl(state);
  var screenshot = quickScreenshot(canvas);

  var payload = { name: slug, url: viewerUrl };
  if (screenshot) payload.screenshot = screenshot;

  fetch(WORKER_URL + "/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.success) {
        if (onHint) onHint("Error: " + (data.error || "Unknown error"));
        return;
      }
      // 5. On mobile, also open share sheet (best effort — gesture may be lost)
      if (navigator.share && isMobile()) {
        navigator.share({
          title: name + "'s Garden Building",
          text: "Take a look at your custom garden building design:",
          url: data.shareUrl
        }).then(function() {
          if (onHint) onHint("✅ Shared! Link also on clipboard.");
        }).catch(function() {
          if (onHint) onHint("✅ Link copied! " + data.shareUrl);
        });
      } else {
        if (onHint) onHint("✅ Link copied! " + data.shareUrl);
      }
    })
    .catch(function(err) {
      console.error("[share-link] Error:", err);
      if (onHint) onHint("Network error — link may not work. Check connection.");
    });
}

/**
 * Fallback clipboard copy using execCommand
 */
function fallbackCopy(text) {
  var textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try { document.execCommand("copy"); } catch (e) { /* best effort */ }
  textarea.remove();
}

/**
 * Quick synchronous screenshot — no async, no Babylon render target.
 * Returns base64 JPEG string or null.
 */
function quickScreenshot(canvas) {
  try {
    var dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    if (dataUrl && dataUrl.length > 1000) {
      return dataUrl.split(",")[1];
    }
  } catch (e) {
    console.warn("[share-link] Screenshot failed:", e);
  }
  return null;
}

function isMobile() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
