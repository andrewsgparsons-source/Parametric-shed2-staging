/**
 * Share Link — Creates short, shareable links via Cloudflare Worker
 * 
 * Captures a screenshot of the 3D view, sends it with the config URL
 * to the shed-share Worker, and copies the short link to clipboard.
 * 
 * ZERO changes to existing code — this is a standalone module.
 */

import { generateViewerUrl } from "./profiles.js";

var WORKER_URL = "https://shed-share.andrewsgparsons.workers.dev";

/**
 * Create a short share link with screenshot and customer name
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
  var state = store.getState();
  var viewerUrl = generateViewerUrl(state);

  // 3. Capture screenshot via Babylon.js Tools (handles preserveDrawingBuffer)
  if (onHint) onHint("Capturing screenshot…");

  captureScreenshot(canvas, function(screenshot) {
    postToWorker(name, viewerUrl, screenshot, onHint);
  });
}

function captureScreenshot(canvas, callback) {
  // Try BABYLON.Tools.CreateScreenshot if available (handles buffer correctly)
  if (window.BABYLON && BABYLON.Tools && BABYLON.Tools.CreateScreenshotUsingRenderTarget) {
    var engine = canvas.__babylonEngine || (canvas.getContext && null);
    // Fallback: use the engine from global debug object
    if (!engine && window.__dbg && window.__dbg.engine) {
      engine = window.__dbg.engine;
    }
    if (!engine && window.__dbg && window.__dbg.scene) {
      engine = window.__dbg.scene.getEngine();
    }

    if (engine) {
      var scene = engine.scenes && engine.scenes[0];
      var camera = scene && scene.activeCamera;
      if (scene && camera) {
        var width = Math.min(canvas.width, 1200);
        var height = Math.round(canvas.height * (width / canvas.width));
        BABYLON.Tools.CreateScreenshotUsingRenderTarget(engine, camera, { width: width, height: height }, function(dataUrl) {
          if (dataUrl && dataUrl.indexOf("data:image") === 0) {
            // Convert to JPEG for smaller size
            var img = new Image();
            img.onload = function() {
              var tempCanvas = document.createElement("canvas");
              tempCanvas.width = width;
              tempCanvas.height = height;
              var ctx = tempCanvas.getContext("2d");
              ctx.drawImage(img, 0, 0);
              var jpegUrl = tempCanvas.toDataURL("image/jpeg", 0.7);
              callback(jpegUrl.split(",")[1]);
            };
            img.onerror = function() { callback(null); };
            img.src = dataUrl;
          } else {
            callback(null);
          }
        });
        return;
      }
    }
  }

  // Fallback: try canvas.toDataURL directly (may be blank without preserveDrawingBuffer)
  try {
    var dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    if (dataUrl && dataUrl.length > 100) {
      callback(dataUrl.split(",")[1]);
    } else {
      callback(null);
    }
  } catch (err) {
    console.warn("[share-link] Could not capture screenshot:", err);
    callback(null);
  }
}

function postToWorker(name, viewerUrl, screenshot, onHint) {
  // 4. POST to Worker
  var payload = {
    name: name,
    url: viewerUrl
  };
  if (screenshot) {
    payload.screenshot = screenshot;
  }

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

      // 5. Deliver the short link to the user
      var shareUrl = data.shareUrl;
      deliverLink(shareUrl, name, onHint);
    })
    .catch(function(err) {
      console.error("[share-link] Error:", err);
      if (onHint) onHint("Network error — check connection");
    });
}

function deliverLink(shareUrl, customerName, onHint) {
  // On mobile: use native Share API (opens WhatsApp/share sheet directly)
  if (navigator.share) {
    navigator.share({
      title: customerName + "'s Garden Building",
      text: "Take a look at your custom garden building design:",
      url: shareUrl
    }).then(function() {
      if (onHint) onHint("✅ Shared!");
    }).catch(function(err) {
      // User cancelled share sheet — show the URL instead
      if (err.name !== "AbortError") {
        console.warn("[share-link] Share failed:", err);
      }
      showCopyableLink(shareUrl, onHint);
    });
    return;
  }

  // Desktop: try clipboard, then fallback to showing the link
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl)
      .then(function() {
        if (onHint) onHint("✅ Link copied! " + shareUrl);
      })
      .catch(function() {
        showCopyableLink(shareUrl, onHint);
      });
  } else {
    showCopyableLink(shareUrl, onHint);
  }
}

function showCopyableLink(shareUrl, onHint) {
  // Show a dialog with the URL in a selectable text field
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;";
  overlay.innerHTML =
    '<div style="background:white;border-radius:16px;padding:24px;max-width:400px;width:100%;text-align:center;font-family:Inter,sans-serif;">' +
      '<div style="font-size:24px;margin-bottom:8px;">📱</div>' +
      '<h3 style="margin:0 0 12px;font-size:16px;">Share Link Ready!</h3>' +
      '<input id="shareLinkInput" type="text" value="' + shareUrl + '" readonly ' +
        'style="width:100%;padding:10px;border:1.5px solid #E7E0D8;border-radius:8px;font-size:14px;text-align:center;box-sizing:border-box;" />' +
      '<p style="margin:8px 0 16px;color:#57534E;font-size:13px;">Tap the link above, select all, then copy</p>' +
      '<button id="shareLinkClose" style="padding:10px 24px;border-radius:8px;border:none;background:#25D366;color:white;font-size:14px;font-weight:600;cursor:pointer;">Done</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var input = document.getElementById("shareLinkInput");
  input.addEventListener("focus", function() { this.select(); });
  input.focus();
  input.select();

  document.getElementById("shareLinkClose").addEventListener("click", function() {
    overlay.remove();
  });
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) overlay.remove();
  });

  if (onHint) onHint("✅ Link created! " + shareUrl);
}
