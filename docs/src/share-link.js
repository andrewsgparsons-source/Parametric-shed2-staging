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

      // 5. Copy short link to clipboard
      var shareUrl = data.shareUrl;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl)
          .then(function() {
            if (onHint) onHint("✅ Link copied! " + shareUrl);
          })
          .catch(function() {
            fallbackCopy(shareUrl, onHint);
          });
      } else {
        fallbackCopy(shareUrl, onHint);
      }
    })
    .catch(function(err) {
      console.error("[share-link] Error:", err);
      if (onHint) onHint("Network error — check connection");
    });
}

function fallbackCopy(text, onHint) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "0";
  ta.style.top = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    if (onHint) onHint("✅ Link copied! " + text);
  } catch (e) {
    if (onHint) onHint("Link: " + text + " (copy manually)");
  }
  document.body.removeChild(ta);
}
