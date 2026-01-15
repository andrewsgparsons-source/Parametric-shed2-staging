// FILE: docs/src/profiles.js
//
// Profile system for controlling UI visibility based on URL parameters.
// Supports: viewer (read-only), customer, builder, admin (default)
//

/**
 * Get the profile name from URL parameters
 * @returns {string|null} Profile name or null if not specified
 */
export function getProfileFromUrl() {
  var params = new URLSearchParams(window.location.search || "");
  return params.get("profile") || null;
}

/**
 * Check if current profile is viewer mode
 * @returns {boolean}
 */
export function isViewerMode() {
  return getProfileFromUrl() === "viewer";
}

/**
 * Parse URL parameters into a state object for viewer mode
 * Supports both Base64 encoded config (new) and legacy individual params
 * @returns {object} Partial state object from URL params
 */
export function parseUrlState() {
  var params = new URLSearchParams(window.location.search || "");
  var state = {};

  console.log("[profiles] Parsing URL state from:", window.location.search);

  // Check for Base64 encoded config first (new cleaner format)
  if (params.has("c")) {
    try {
      var base64 = params.get("c");
      var json = atob(base64);
      state = JSON.parse(json);
      console.log("[profiles] Decoded Base64 config:", state);

      // Ensure dim object has frameW_mm and frameD_mm set
      if (state.w && !state.dim) {
        state.dim = { frameW_mm: state.w, frameD_mm: state.d };
      }
      if (state.dim && state.w) {
        state.dim.frameW_mm = state.dim.frameW_mm || state.w;
        state.dim.frameD_mm = state.dim.frameD_mm || state.d;
      }

      return state;
    } catch (e) {
      console.warn("[profiles] Failed to decode Base64 config:", e);
      // Fall through to legacy parsing
    }
  }

  // Legacy individual parameter parsing (for backwards compatibility)
  // Basic dimensions - set both root level and canonical dim object
  if (params.has("w")) {
    var w = parseInt(params.get("w"), 10);
    state.w = w;
    state.dim = state.dim || {};
    state.dim.frameW_mm = w;
    console.log("[profiles] Set width:", w);
  }
  if (params.has("d")) {
    var d = parseInt(params.get("d"), 10);
    state.d = d;
    state.dim = state.dim || {};
    state.dim.frameD_mm = d;
    console.log("[profiles] Set depth:", d);
  }
  if (params.has("dimMode")) {
    state.dimMode = params.get("dimMode");
  }

  // Explicit frame dimensions (override if present)
  if (params.has("frameW")) {
    state.dim = state.dim || {};
    state.dim.frameW_mm = parseInt(params.get("frameW"), 10);
  }
  if (params.has("frameD")) {
    state.dim = state.dim || {};
    state.dim.frameD_mm = parseInt(params.get("frameD"), 10);
  }

  // Roof style
  if (params.has("roofStyle")) {
    state.roof = state.roof || {};
    state.roof.style = params.get("roofStyle");
    console.log("[profiles] Set roof style:", state.roof.style);
  }

  // Apex roof params
  if (params.has("roofApexEaveHeight") || params.has("roofApexCrestHeight") || params.has("roofApexTrussCount")) {
    state.roof = state.roof || {};
    state.roof.apex = state.roof.apex || {};
    if (params.has("roofApexEaveHeight")) {
      state.roof.apex.heightToEaves_mm = parseInt(params.get("roofApexEaveHeight"), 10);
    }
    if (params.has("roofApexCrestHeight")) {
      state.roof.apex.heightToCrest_mm = parseInt(params.get("roofApexCrestHeight"), 10);
    }
    if (params.has("roofApexTrussCount")) {
      state.roof.apex.trussCount = parseInt(params.get("roofApexTrussCount"), 10);
    }
  }

  // Pent roof params
  if (params.has("roofPentMinHeight") || params.has("roofPentMaxHeight")) {
    state.roof = state.roof || {};
    state.roof.pent = state.roof.pent || {};
    if (params.has("roofPentMinHeight")) {
      state.roof.pent.minHeight_mm = parseInt(params.get("roofPentMinHeight"), 10);
    }
    if (params.has("roofPentMaxHeight")) {
      state.roof.pent.maxHeight_mm = parseInt(params.get("roofPentMaxHeight"), 10);
    }
  }

  // Hipped roof params
  if (params.has("roofHippedEaveHeight") || params.has("roofHippedCrestHeight")) {
    state.roof = state.roof || {};
    state.roof.hipped = state.roof.hipped || {};
    if (params.has("roofHippedEaveHeight")) {
      state.roof.hipped.heightToEaves_mm = parseInt(params.get("roofHippedEaveHeight"), 10);
    }
    if (params.has("roofHippedCrestHeight")) {
      state.roof.hipped.heightToCrest_mm = parseInt(params.get("roofHippedCrestHeight"), 10);
    }
  }

  // Overhangs
  if (params.has("overhangUniform")) {
    state.overhang = state.overhang || {};
    state.overhang.uniform_mm = parseInt(params.get("overhangUniform"), 10);
  }
  if (params.has("overhangFront")) {
    state.overhang = state.overhang || {};
    state.overhang.front_mm = parseInt(params.get("overhangFront"), 10);
  }
  if (params.has("overhangBack")) {
    state.overhang = state.overhang || {};
    state.overhang.back_mm = parseInt(params.get("overhangBack"), 10);
  }
  if (params.has("overhangLeft")) {
    state.overhang = state.overhang || {};
    state.overhang.left_mm = parseInt(params.get("overhangLeft"), 10);
  }
  if (params.has("overhangRight")) {
    state.overhang = state.overhang || {};
    state.overhang.right_mm = parseInt(params.get("overhangRight"), 10);
  }

  // Walls
  if (params.has("wallsVariant")) {
    state.walls = state.walls || {};
    state.walls.variant = params.get("wallsVariant");
  }
  if (params.has("wallSection")) {
    var section = params.get("wallSection");
    var parts = section.split("x");
    if (parts.length === 2) {
      state.frame = state.frame || {};
      state.frame.thickness_mm = parseInt(parts[0], 10);
      state.frame.depth_mm = parseInt(parts[1], 10);
    }
  }

  // Openings (JSON-encoded array)
  if (params.has("openings")) {
    try {
      var openingsJson = decodeURIComponent(params.get("openings"));
      var openings = JSON.parse(openingsJson);
      if (Array.isArray(openings)) {
        state.walls = state.walls || {};
        state.walls.openings = openings;
      }
    } catch (e) {
      console.warn("[profiles] Failed to parse openings from URL:", e);
    }
  }

  // Dividers (JSON-encoded array)
  if (params.has("dividers")) {
    try {
      var dividersJson = decodeURIComponent(params.get("dividers"));
      var dividers = JSON.parse(dividersJson);
      if (Array.isArray(dividers)) {
        state.dividers = state.dividers || {};
        state.dividers.items = dividers;
      }
    } catch (e) {
      console.warn("[profiles] Failed to parse dividers from URL:", e);
    }
  }

  console.log("[profiles] Parsed URL state:", JSON.stringify(state, null, 2));
  return state;
}

/**
 * Generate a viewer URL from the current state
 * Uses Base64 encoding for cleaner, shorter URLs
 * @param {object} state - Current application state
 * @returns {string} Full URL with viewer profile and encoded state
 */
export function generateViewerUrl(state) {
  // Build a compact state object with only the needed fields
  var compact = {};

  // Basic dimensions
  var width = (state.dim && state.dim.frameW_mm) || state.w;
  var depth = (state.dim && state.dim.frameD_mm) || state.d;
  if (width) compact.w = width;
  if (depth) compact.d = depth;
  if (state.dimMode) compact.dimMode = state.dimMode;

  // Roof
  if (state.roof) {
    compact.roof = {};
    if (state.roof.style) compact.roof.style = state.roof.style;

    // Apex params
    if (state.roof.apex) {
      compact.roof.apex = {};
      if (state.roof.apex.heightToEaves_mm != null) {
        compact.roof.apex.heightToEaves_mm = state.roof.apex.heightToEaves_mm;
      }
      if (state.roof.apex.heightToCrest_mm != null) {
        compact.roof.apex.heightToCrest_mm = state.roof.apex.heightToCrest_mm;
      }
      if (state.roof.apex.trussCount != null) {
        compact.roof.apex.trussCount = state.roof.apex.trussCount;
      }
    }

    // Pent params
    if (state.roof.pent) {
      compact.roof.pent = {};
      if (state.roof.pent.minHeight_mm != null) {
        compact.roof.pent.minHeight_mm = state.roof.pent.minHeight_mm;
      }
      if (state.roof.pent.maxHeight_mm != null) {
        compact.roof.pent.maxHeight_mm = state.roof.pent.maxHeight_mm;
      }
    }

    // Hipped params
    if (state.roof.hipped) {
      compact.roof.hipped = {};
      if (state.roof.hipped.heightToEaves_mm != null) {
        compact.roof.hipped.heightToEaves_mm = state.roof.hipped.heightToEaves_mm;
      }
      if (state.roof.hipped.heightToCrest_mm != null) {
        compact.roof.hipped.heightToCrest_mm = state.roof.hipped.heightToCrest_mm;
      }
    }
  }

  // Overhangs
  if (state.overhang) {
    compact.overhang = {};
    if (state.overhang.uniform_mm != null) compact.overhang.uniform_mm = state.overhang.uniform_mm;
    if (state.overhang.front_mm != null) compact.overhang.front_mm = state.overhang.front_mm;
    if (state.overhang.back_mm != null) compact.overhang.back_mm = state.overhang.back_mm;
    if (state.overhang.left_mm != null) compact.overhang.left_mm = state.overhang.left_mm;
    if (state.overhang.right_mm != null) compact.overhang.right_mm = state.overhang.right_mm;
  }

  // Walls variant
  if (state.walls && state.walls.variant) {
    compact.walls = compact.walls || {};
    compact.walls.variant = state.walls.variant;
  }

  // Frame section
  if (state.frame && state.frame.thickness_mm && state.frame.depth_mm) {
    compact.frame = {
      thickness_mm: state.frame.thickness_mm,
      depth_mm: state.frame.depth_mm
    };
  }

  // Openings (cleaned)
  if (state.walls && state.walls.openings && state.walls.openings.length > 0) {
    compact.walls = compact.walls || {};
    compact.walls.openings = state.walls.openings.map(function(o) {
      var opening = {
        id: o.id,
        wall: o.wall,
        type: o.type,
        x_mm: o.x_mm,
        y_mm: o.y_mm,
        width_mm: o.width_mm,
        height_mm: o.height_mm,
        style: o.style
      };
      if (o.type === "door") {
        opening.handleSide = o.handleSide || "left";
        opening.isOpen = !!o.isOpen;
      }
      return opening;
    });
  }

  // Dividers (cleaned)
  if (state.dividers && state.dividers.items && state.dividers.items.length > 0) {
    compact.dividers = {
      items: state.dividers.items.map(function(d) {
        return {
          id: d.id,
          axis: d.axis,
          position_mm: d.position_mm
        };
      })
    };
  }

  // Encode as Base64
  var json = JSON.stringify(compact);
  var base64 = btoa(json);

  return window.location.origin + window.location.pathname + "?profile=viewer&c=" + base64;
}

/**
 * Apply viewer profile - hide all parameter controls, keep visibility toggles
 */
export function applyViewerProfile() {
  // Hide the view selector (cutting lists / BOM access)
  var viewSelect = document.getElementById("viewSelect");
  if (viewSelect) {
    viewSelect.style.display = "none";
  }
  // Also hide the entire topbar if it only contains the view selector
  var topbar = document.getElementById("topbar");
  if (topbar) {
    topbar.style.display = "none";
  }

  // Sections to hide entirely
  var sectionsToHide = [
    // We'll hide specific elements instead of whole sections
  ];

  // IDs of elements/containers to hide
  var elementsToHide = [
    // Size & Shape - hide all except scene view buttons
    "unitModeMetric",
    "unitModeImperial",
    "dimMode",
    "wInput",
    "dInput",
    "roofStyle",
    "wallsVariant",
    "wallSection",

    // Walls & Openings - hide add/remove buttons (keep lists for door open toggle)
    "addDoorBtn",
    "removeAllDoorsBtn",
    // "doorsList" - keep visible for door open checkbox
    "addWindowBtn",
    "removeAllWindowsBtn",
    "windowsList",
    "addDividerBtn",
    "removeAllDividersBtn",
    "dividersList",

    // Roof heights
    "roofApexEaveHeight",
    "roofApexCrestHeight",
    "roofApexTrussCount",
    "roofMinHeight",
    "roofMaxHeight",
    "roofHippedEaveHeight",
    "roofHippedCrestHeight",
    "hippedDesignOptionsBtn",

    // Overhangs
    "roofOverUniform",
    "roofOverFront",
    "roofOverBack",
    "roofOverLeft",
    "roofOverRight",

    // Attachments
    "attachmentType",
    "attachmentWall",
    "attachmentWidth",
    "attachmentDepth",
    "attachmentOffset",
    "addAttachmentBtn",
    "removeAllAttachmentsBtn",
    "attachmentsList",

    // Save/Load (except we might want to show something minimal)
    "instanceSelect",
    "loadInstanceBtn",
    "exportBtn",
    "importBtn",
    "copyViewerLinkBtn",

    // Developer
    "devModeCheck",
    "devPanel",
    "copyStateBtn"
  ];

  // Hide individual elements and their parent rows
  elementsToHide.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;

    // Try to hide the parent .row for cleaner layout
    var row = el.closest(".row");
    if (row) {
      row.style.display = "none";
    } else {
      el.style.display = "none";
    }
  });

  // Hide entire sections by summary text
  var sectionSummaries = [
    "Size & Shape",
    // "Walls & Openings" - keep for door open checkbox
    "Roof",
    "Building Attachments",
    "Appearance",
    "Save / Load Design"
  ];

  var allDetails = document.querySelectorAll("details.boSection");
  allDetails.forEach(function(details) {
    var summary = details.querySelector("summary");
    if (!summary) return;
    var text = summary.textContent.trim();

    // Check if this section should be hidden
    var shouldHide = sectionSummaries.some(function(s) {
      return text.indexOf(s) === 0;
    });

    if (shouldHide) {
      details.style.display = "none";
    }
  });

  // Keep Visibility section visible
  // It should remain as-is since we didn't add it to hide list

  // Add a visual indicator that this is viewer mode
  var header = document.querySelector(".boHeader .boTitle1");
  if (header) {
    header.textContent = "Viewing shed design";
  }
  var subheader = document.querySelector(".boHeader .boTitle2");
  if (subheader) {
    subheader.textContent = "Read-only preview";
  }

  // Show scene view buttons by ensuring their section is visible
  var sceneViewBtns = ["snapPlanBtn", "snapFrontBtn", "snapBackBtn", "snapLeftBtn", "snapRightBtn"];
  sceneViewBtns.forEach(function(id) {
    var btn = document.getElementById(id);
    if (btn) {
      var row = btn.closest(".row");
      if (row) row.style.display = "";
      btn.style.display = "";
    }
  });

  // Create a minimal "Scene Views" section if the Size & Shape section was hidden
  ensureSceneViewsVisible();

  // Make doors list read-only except for "Open" checkbox
  makeDoorsListViewerMode();
}

/**
 * Ensure scene view buttons are visible even when Size & Shape is hidden
 */
function ensureSceneViewsVisible() {
  var snapPlanBtn = document.getElementById("snapPlanBtn");
  if (!snapPlanBtn) return;

  // Find the closest details section
  var sizeSection = snapPlanBtn.closest("details.boSection");
  if (!sizeSection) return;

  // If Size & Shape section is hidden, we need to show just the scene views part
  if (sizeSection.style.display === "none") {
    // Create a new minimal section for scene views
    var controlPanel = document.getElementById("controlPanel");
    if (!controlPanel) return;

    var viewerSection = document.createElement("details");
    viewerSection.className = "boSection";
    viewerSection.open = true;
    viewerSection.innerHTML = '<summary>Scene Views</summary><div class="boBox" id="viewerSceneViews"></div>';

    // Insert after the main Controls toggle
    var innerDiv = controlPanel.querySelector(".inner");
    if (innerDiv) {
      var form = innerDiv.querySelector("form");
      if (form) {
        form.insertBefore(viewerSection, form.firstChild);
      }
    }

    // Move scene view buttons to the new section
    var viewerBox = document.getElementById("viewerSceneViews");
    if (viewerBox) {
      var row1 = document.createElement("div");
      row1.className = "row";
      var row2 = document.createElement("div");
      row2.className = "row";
      var row3 = document.createElement("div");
      row3.className = "row";

      // Clone buttons (originals are hidden with section)
      var btnIds = [
        ["snapPlanBtn", "snapFrontBtn"],
        ["snapBackBtn", "snapLeftBtn"],
        ["snapRightBtn"]
      ];

      btnIds[0].forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) {
          var clone = btn.cloneNode(true);
          clone.id = id + "_viewer";
          clone.style.display = "";
          // Copy click handler
          clone.addEventListener("click", function() {
            btn.click();
          });
          row1.appendChild(clone);
        }
      });

      btnIds[1].forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) {
          var clone = btn.cloneNode(true);
          clone.id = id + "_viewer";
          clone.style.display = "";
          clone.addEventListener("click", function() {
            btn.click();
          });
          row2.appendChild(clone);
        }
      });

      btnIds[2].forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) {
          var clone = btn.cloneNode(true);
          clone.id = id + "_viewer";
          clone.style.display = "";
          clone.addEventListener("click", function() {
            btn.click();
          });
          row3.appendChild(clone);
        }
      });

      viewerBox.appendChild(row1);
      viewerBox.appendChild(row2);
      viewerBox.appendChild(row3);
    }
  }
}

/**
 * Make doors list viewer-mode friendly:
 * - Keep "Open" checkbox functional
 * - Disable/hide other editing controls
 * This function is called initially and should be re-called when doors list is re-rendered
 */
function makeDoorsListViewerMode() {
  var doorsList = document.getElementById("doorsList");
  if (!doorsList) return;

  // Use MutationObserver to handle dynamic door list updates
  var observer = new MutationObserver(function() {
    applyDoorsListViewerRestrictions(doorsList);
  });

  observer.observe(doorsList, { childList: true, subtree: true });

  // Apply immediately
  applyDoorsListViewerRestrictions(doorsList);
}

/**
 * Apply viewer restrictions to doors list
 */
function applyDoorsListViewerRestrictions(doorsList) {
  // Hide all edit controls except the "Open" checkbox
  var doorItems = doorsList.querySelectorAll(".doorItem, .openingItem, [data-door-id]");

  doorItems.forEach(function(item) {
    // Find and disable inputs except for "Open" checkbox
    var inputs = item.querySelectorAll("input, select, button");
    inputs.forEach(function(input) {
      // Check if this is the "Open" checkbox (has label with "Open" text nearby)
      var label = input.closest("label");
      var isOpenCheckbox = label && label.textContent.toLowerCase().indexOf("open") >= 0;

      if (isOpenCheckbox) {
        // Keep this enabled
        input.disabled = false;
      } else if (input.tagName === "BUTTON") {
        // Hide buttons (Remove, Snap, etc.)
        input.style.display = "none";
      } else {
        // Disable other inputs
        input.disabled = true;
      }
    });

    // Also disable any position/dimension inputs
    var posInputs = item.querySelectorAll('input[type="number"]');
    posInputs.forEach(function(inp) {
      inp.disabled = true;
    });
  });

  // Update section header to indicate read-only
  var wallsSection = doorsList.closest("details.boSection");
  if (wallsSection) {
    var summary = wallsSection.querySelector("summary");
    if (summary && summary.textContent.indexOf("(View Only)") < 0) {
      summary.textContent = summary.textContent + " (View Only)";
    }
  }
}

/**
 * Copy viewer URL to clipboard
 * @param {object} state - Current application state
 * @param {function} onSuccess - Callback on successful copy
 * @param {function} onError - Callback on error
 */
export function copyViewerUrlToClipboard(state, onSuccess, onError) {
  var url = generateViewerUrl(state);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(function() {
        if (onSuccess) onSuccess(url);
      })
      .catch(function(err) {
        fallbackCopyToClipboard(url, onSuccess, onError);
      });
  } else {
    fallbackCopyToClipboard(url, onSuccess, onError);
  }
}

/**
 * Fallback clipboard copy for older browsers
 */
function fallbackCopyToClipboard(text, onSuccess, onError) {
  var textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    var success = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (success && onSuccess) {
      onSuccess(text);
    } else if (!success && onError) {
      onError(new Error("execCommand copy failed"));
    }
  } catch (e) {
    document.body.removeChild(textarea);
    if (onError) onError(e);
  }
}
