/**
 * Panel Resize functionality
 * Allows the Controls panel to be resized by dragging handles
 * and maximized/restored via a button.
 */

// State
var isMaximized = false;
var savedDimensions = null;

// Configuration
var MIN_WIDTH = 280;
var MAX_WIDTH = window.innerWidth - 32;
var MIN_HEIGHT = 200;

/**
 * Update the inner content area height to enable proper scrolling
 * @param {HTMLElement} controls - The controls container
 * @param {number} totalHeight - Total panel height in pixels
 */
function updateInnerHeight(controls, totalHeight) {
  var inner = controls.querySelector("#controlPanel > details > .inner");
  var summary = controls.querySelector("#controlPanel > details > summary");

  if (!inner || !summary) return;

  // Calculate available height for inner content
  // Account for summary height, padding, and some buffer
  var summaryHeight = summary.getBoundingClientRect().height;
  var availableHeight = totalHeight - summaryHeight - 20; // 20px buffer for padding/borders

  if (availableHeight > 100) {
    inner.style.maxHeight = availableHeight + "px";
    inner.style.overflowY = "auto";
  }
}

/**
 * Initialize the panel resize functionality
 */
export function initPanelResize() {
  var controls = document.getElementById("controls");
  if (!controls) {
    console.warn("[panel-resize] #controls element not found");
    return;
  }

  // Set up resize handles
  var handles = controls.querySelectorAll(".resize-handle");
  handles.forEach(function(handle) {
    handle.addEventListener("mousedown", onResizeStart);
  });

  // Set up maximize button
  var maxBtn = document.getElementById("panelMaximizeBtn");
  if (maxBtn) {
    maxBtn.addEventListener("click", toggleMaximize);
  }

  // Update max width on window resize
  window.addEventListener("resize", function() {
    MAX_WIDTH = window.innerWidth - 32;
  });
}

/**
 * Handle resize start
 */
function onResizeStart(e) {
  e.preventDefault();
  e.stopPropagation();

  var controls = document.getElementById("controls");
  if (!controls || isMaximized) return;

  var handle = e.target;
  var resizeType = handle.getAttribute("data-resize");

  // Get current dimensions
  var rect = controls.getBoundingClientRect();
  var startX = e.clientX;
  var startY = e.clientY;
  var startWidth = rect.width;
  var startHeight = rect.height;

  // Add active class and resizing state
  handle.classList.add("active");
  controls.classList.add("resizing");

  // Disable text selection during resize
  document.body.style.userSelect = "none";

  // Set cursor based on resize type
  if (resizeType === "right") {
    document.body.style.cursor = "ew-resize";
  } else if (resizeType === "bottom") {
    document.body.style.cursor = "ns-resize";
  } else if (resizeType === "corner") {
    document.body.style.cursor = "nwse-resize";
  }

  // Get max height based on viewport
  var maxHeight = window.innerHeight - 32;

  function onMouseMove(moveEvent) {
    var deltaX = moveEvent.clientX - startX;
    var deltaY = moveEvent.clientY - startY;

    if (resizeType === "right" || resizeType === "corner") {
      var newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + deltaX));
      controls.style.width = newWidth + "px";
    }

    if (resizeType === "bottom" || resizeType === "corner") {
      var newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + deltaY));
      controls.style.height = newHeight + "px";
      // Add has-height class to enable flexbox layout for height constraint
      controls.classList.add("has-height");

      // Force recalculate inner height for scroll
      updateInnerHeight(controls, newHeight);
    }
  }

  function onMouseUp() {
    handle.classList.remove("active");
    controls.classList.remove("resizing");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

/**
 * Toggle maximize/restore state
 */
function toggleMaximize() {
  var controls = document.getElementById("controls");
  var maxBtn = document.getElementById("panelMaximizeBtn");
  var inner = controls ? controls.querySelector("#controlPanel > details > .inner") : null;
  if (!controls) return;

  if (isMaximized) {
    // Restore
    controls.classList.remove("maximized");
    controls.classList.remove("has-height");

    // Clear the manually set inner height
    if (inner) {
      inner.style.maxHeight = "";
      inner.style.overflowY = "";
    }

    // Restore saved dimensions
    if (savedDimensions) {
      controls.style.width = savedDimensions.width;
      controls.style.height = savedDimensions.height || "";

      // Re-add has-height if there was a saved height
      if (savedDimensions.height) {
        controls.classList.add("has-height");
        // Recalculate inner height
        var h = parseFloat(savedDimensions.height);
        if (h > 0) updateInnerHeight(controls, h);
      }
    }

    if (maxBtn) {
      maxBtn.textContent = "⛶";
      maxBtn.title = "Maximize panel";
    }

    isMaximized = false;
  } else {
    // Save current dimensions before maximizing
    savedDimensions = {
      width: controls.style.width || "",
      height: controls.style.height || "",
      hadHeightClass: controls.classList.contains("has-height"),
      innerMaxHeight: inner ? inner.style.maxHeight : ""
    };

    // Maximize
    controls.classList.add("maximized");
    controls.classList.add("has-height");
    controls.style.width = "";
    controls.style.height = "";

    // Set inner height for maximized state
    var maxHeight = window.innerHeight - 16;
    updateInnerHeight(controls, maxHeight);

    if (maxBtn) {
      maxBtn.textContent = "⛶"; // Same icon, different title
      maxBtn.title = "Restore panel";
    }

    isMaximized = true;
  }
}

/**
 * Check if panel is currently maximized
 */
export function isPanelMaximized() {
  return isMaximized;
}
