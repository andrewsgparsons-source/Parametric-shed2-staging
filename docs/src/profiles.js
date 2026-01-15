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
  // Supports both "c" (viewer mode) and "state" (profile mode) parameters
  var base64Param = params.get("c") || params.get("state");
  if (base64Param) {
    try {
      var json = decodeURIComponent(escape(atob(base64Param)));
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
  // Hide the view selector (cutting lists / BOM access) - now in panel header
  var viewSelect = document.getElementById("viewSelect");
  if (viewSelect) {
    viewSelect.style.display = "none";
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

/**
 * Generate a URL with a specific profile and current state
 * Unlike viewer mode, the user can still edit within their profile's allowed controls
 * @param {string} profileName - e.g., "customer", "builder"
 * @param {object} state - Current shed state
 * @returns {string} URL with profile and state encoded
 */
export function generateProfileUrl(profileName, state) {
  // Build a compact state object (reuse the same logic as viewer)
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

    if (state.roof.pent) {
      compact.roof.pent = {};
      if (state.roof.pent.minHeight_mm != null) {
        compact.roof.pent.minHeight_mm = state.roof.pent.minHeight_mm;
      }
      if (state.roof.pent.maxHeight_mm != null) {
        compact.roof.pent.maxHeight_mm = state.roof.pent.maxHeight_mm;
      }
    }

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

  // Openings
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

  // Dividers
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
  var base64 = btoa(unescape(encodeURIComponent(json)));

  // Build URL with profile and state
  var baseUrl = window.location.origin + window.location.pathname;
  return baseUrl + "?profile=" + encodeURIComponent(profileName) + "&state=" + base64;
}

/**
 * Copy a profile-specific URL to clipboard
 * @param {string} profileName - Profile name (e.g., "customer", "builder")
 * @param {object} state - Current shed state
 * @param {function} onSuccess - Callback with URL on success
 * @param {function} onError - Callback with error on failure
 */
export function copyProfileUrlToClipboard(profileName, state, onSuccess, onError) {
  var url = generateProfileUrl(profileName, state);

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

// ============================================================================
// CONTROL REGISTRY & PROFILE SYSTEM
// ============================================================================

/**
 * Registry of all configurable controls, organized by section
 * This drives the Profile Editor UI and profile application
 *
 * Control types:
 * - Static controls: Have elementIds, can be hidden by DOM manipulation
 * - Dynamic field controls: Use fieldKey, applied during dynamic UI rendering
 */
export var CONTROL_REGISTRY = {
  sizeShape: {
    label: "Size & Shape",
    controls: {
      unitModeMetric: { type: "radio", elementIds: ["unitModeMetric"], label: "Unit Mode: Metric" },
      unitModeImperial: { type: "radio", elementIds: ["unitModeImperial"], label: "Unit Mode: Imperial" },
      dimMode: { type: "select", elementIds: ["dimMode"], label: "Dimension Mode", defaultValue: "frame" },
      wInput: { type: "number", elementIds: ["wInput"], label: "Width", defaultValue: 3000 },
      dInput: { type: "number", elementIds: ["dInput"], label: "Depth", defaultValue: 4000 },
      roofStyle: { type: "select", elementIds: ["roofStyle"], label: "Roof Type", defaultValue: "apex" },
      wallsVariant: { type: "select", elementIds: ["wallsVariant"], label: "Variant", defaultValue: "insulated" },
      wallSection: { type: "select", elementIds: ["wallSection"], label: "Frame Gauge", defaultValue: "50x100" },
      snapPlanBtn: { type: "button", elementIds: ["snapPlanBtn"], label: "Scene View: Plan" },
      snapFrontBtn: { type: "button", elementIds: ["snapFrontBtn"], label: "Scene View: Front" },
      snapBackBtn: { type: "button", elementIds: ["snapBackBtn"], label: "Scene View: Back" },
      snapLeftBtn: { type: "button", elementIds: ["snapLeftBtn"], label: "Scene View: Left" },
      snapRightBtn: { type: "button", elementIds: ["snapRightBtn"], label: "Scene View: Right" }
    }
  },

  wallsOpenings: {
    label: "Walls & Openings",
    controls: {
      // Door buttons
      addDoorBtn: { type: "button", elementIds: ["addDoorBtn"], label: "Add Door Button" },
      removeAllDoorsBtn: { type: "button", elementIds: ["removeAllDoorsBtn"], label: "Remove All Doors Button" },

      // Door item fields (dynamic - applied during renderDoorsUi)
      doorWall: { type: "dynamic-field", fieldKey: "door.wall", label: "Door: Wall Selector" },
      doorStyle: { type: "dynamic-field", fieldKey: "door.style", label: "Door: Style" },
      doorHinge: { type: "dynamic-field", fieldKey: "door.hinge", label: "Door: Hinge Side" },
      doorOpen: { type: "dynamic-field", fieldKey: "door.open", label: "Door: Open Checkbox" },
      doorX: { type: "dynamic-field", fieldKey: "door.x", label: "Door: X Position" },
      doorWidth: { type: "dynamic-field", fieldKey: "door.width", label: "Door: Width" },
      doorHeight: { type: "dynamic-field", fieldKey: "door.height", label: "Door: Height" },
      doorSnapBtn: { type: "dynamic-field", fieldKey: "door.snapBtn", label: "Door: Snap Button" },
      doorRemoveBtn: { type: "dynamic-field", fieldKey: "door.removeBtn", label: "Door: Remove Button" },

      // Window buttons
      addWindowBtn: { type: "button", elementIds: ["addWindowBtn"], label: "Add Window Button" },
      removeAllWindowsBtn: { type: "button", elementIds: ["removeAllWindowsBtn"], label: "Remove All Windows Button" },

      // Window item fields (dynamic - applied during renderWindowsUi)
      windowWall: { type: "dynamic-field", fieldKey: "window.wall", label: "Window: Wall Selector" },
      windowStyle: { type: "dynamic-field", fieldKey: "window.style", label: "Window: Style" },
      windowX: { type: "dynamic-field", fieldKey: "window.x", label: "Window: X Position" },
      windowY: { type: "dynamic-field", fieldKey: "window.y", label: "Window: Y Position" },
      windowWidth: { type: "dynamic-field", fieldKey: "window.width", label: "Window: Width" },
      windowHeight: { type: "dynamic-field", fieldKey: "window.height", label: "Window: Height" },
      windowSnapBtn: { type: "dynamic-field", fieldKey: "window.snapBtn", label: "Window: Snap Button" },
      windowRemoveBtn: { type: "dynamic-field", fieldKey: "window.removeBtn", label: "Window: Remove Button" },

      // Divider buttons
      addDividerBtn: { type: "button", elementIds: ["addDividerBtn"], label: "Add Divider Button" },
      removeAllDividersBtn: { type: "button", elementIds: ["removeAllDividersBtn"], label: "Remove All Dividers Button" },

      // Divider item fields (dynamic)
      dividerAxis: { type: "dynamic-field", fieldKey: "divider.axis", label: "Divider: Axis (Front-Back / Left-Right)" },
      dividerPosition: { type: "dynamic-field", fieldKey: "divider.position", label: "Divider: Position" },
      dividerRemoveBtn: { type: "dynamic-field", fieldKey: "divider.removeBtn", label: "Divider: Remove Button" }
    }
  },

  roof: {
    label: "Roof",
    controls: {
      // Apex roof controls
      roofApexEaveHeight: { type: "number", elementIds: ["roofApexEaveHeight"], label: "Apex: Eave Height", defaultValue: 1850 },
      roofApexCrestHeight: { type: "number", elementIds: ["roofApexCrestHeight"], label: "Apex: Crest Height", defaultValue: 2200 },
      roofApexTrussCount: { type: "number", elementIds: ["roofApexTrussCount"], label: "Apex: Truss Count", defaultValue: 7 },

      // Pent roof controls
      roofMinHeight: { type: "number", elementIds: ["roofMinHeight"], label: "Pent: Min Height", defaultValue: 2100 },
      roofMaxHeight: { type: "number", elementIds: ["roofMaxHeight"], label: "Pent: Max Height", defaultValue: 2300 },

      // Hipped roof controls
      roofHippedEaveHeight: { type: "number", elementIds: ["roofHippedEaveHeight"], label: "Hipped: Eave Height", defaultValue: 2000 },
      roofHippedCrestHeight: { type: "number", elementIds: ["roofHippedCrestHeight"], label: "Hipped: Crest Height", defaultValue: 2400 },

      // Overhang controls (individual)
      roofOverUniform: { type: "number", elementIds: ["roofOverUniform"], label: "Overhang: Uniform" },
      roofOverFront: { type: "number", elementIds: ["roofOverFront"], label: "Overhang: Front" },
      roofOverBack: { type: "number", elementIds: ["roofOverBack"], label: "Overhang: Back" },
      roofOverLeft: { type: "number", elementIds: ["roofOverLeft"], label: "Overhang: Left" },
      roofOverRight: { type: "number", elementIds: ["roofOverRight"], label: "Overhang: Right" }
    }
  },

  buildingAttachments: {
    label: "Building Attachments",
    controls: {
      attachmentType: { type: "select", elementIds: ["attachmentType"], label: "Attachment: Type" },
      attachmentWall: { type: "select", elementIds: ["attachmentWall"], label: "Attachment: Wall" },
      attachmentWidth: { type: "number", elementIds: ["attachmentWidth"], label: "Attachment: Width" },
      attachmentDepth: { type: "number", elementIds: ["attachmentDepth"], label: "Attachment: Depth" },
      attachmentOffset: { type: "number", elementIds: ["attachmentOffset"], label: "Attachment: Offset" },
      addAttachmentBtn: { type: "button", elementIds: ["addAttachmentBtn"], label: "Add Attachment Button" },
      removeAllAttachmentsBtn: { type: "button", elementIds: ["removeAllAttachmentsBtn"], label: "Remove All Attachments Button" },

      // Attachment item fields (dynamic)
      attachmentItemType: { type: "dynamic-field", fieldKey: "attachment.type", label: "Attachment Item: Type" },
      attachmentItemWall: { type: "dynamic-field", fieldKey: "attachment.wall", label: "Attachment Item: Wall" },
      attachmentItemWidth: { type: "dynamic-field", fieldKey: "attachment.width", label: "Attachment Item: Width" },
      attachmentItemDepth: { type: "dynamic-field", fieldKey: "attachment.depth", label: "Attachment Item: Depth" },
      attachmentItemOffset: { type: "dynamic-field", fieldKey: "attachment.offset", label: "Attachment Item: Offset" },
      attachmentItemRemoveBtn: { type: "dynamic-field", fieldKey: "attachment.removeBtn", label: "Attachment Item: Remove Button" }
    }
  },

  visibility: {
    label: "Visibility (Advanced)",
    controls: {
      // Main toggles
      vBaseAll: { type: "checkbox", elementIds: ["vBaseAll"], label: "Visibility: Base (All)" },
      vWalls: { type: "checkbox", elementIds: ["vWalls"], label: "Visibility: Walls (All)" },
      vRoof: { type: "checkbox", elementIds: ["vRoof"], label: "Visibility: Roof (All)" },
      vCladding: { type: "checkbox", elementIds: ["vCladding"], label: "Visibility: Cladding" },
      vOpenings: { type: "checkbox", elementIds: ["vOpenings"], label: "Visibility: Doors & Windows" },

      // Base detail toggles
      vBase: { type: "checkbox", elementIds: ["vBase"], label: "Visibility: Base Frame" },
      vFrame: { type: "checkbox", elementIds: ["vFrame"], label: "Visibility: Wall Frame" },
      vIns: { type: "checkbox", elementIds: ["vIns"], label: "Visibility: Insulation" },
      vDeck: { type: "checkbox", elementIds: ["vDeck"], label: "Visibility: Deck" },

      // Wall detail toggles
      vWallFront: { type: "checkbox", elementIds: ["vWallFront"], label: "Visibility: Front Wall" },
      vWallBack: { type: "checkbox", elementIds: ["vWallBack"], label: "Visibility: Back Wall" },
      vWallLeft: { type: "checkbox", elementIds: ["vWallLeft"], label: "Visibility: Left Wall" },
      vWallRight: { type: "checkbox", elementIds: ["vWallRight"], label: "Visibility: Right Wall" },

      // Roof detail toggles
      vRoofStructure: { type: "checkbox", elementIds: ["vRoofStructure"], label: "Visibility: Roof Structure" },
      vRoofOsb: { type: "checkbox", elementIds: ["vRoofOsb"], label: "Visibility: Roof OSB" },
      vRoofCovering: { type: "checkbox", elementIds: ["vRoofCovering"], label: "Visibility: Roof Covering" }
    }
  },

  saveLoad: {
    label: "Save / Load Design",
    controls: {
      instanceSelect: { type: "select", elementIds: ["instanceSelect"], label: "Preset Selector" },
      loadInstanceBtn: { type: "button", elementIds: ["loadInstanceBtn"], label: "Load Preset Button" },
      exportBtn: { type: "button", elementIds: ["exportBtn"], label: "Export Design Button" },
      importBtn: { type: "button", elementIds: ["importBtn"], label: "Import Design Button" },
      copyViewerLinkBtn: { type: "button", elementIds: ["copyViewerLinkBtn"], label: "Copy Viewer Link Button" }
    }
  },

  developer: {
    label: "Developer",
    controls: {
      devModeCheck: { type: "checkbox", elementIds: ["devModeCheck"], label: "Developer Mode Checkbox" },
      copyStateBtn: { type: "button", elementIds: ["copyStateBtn"], label: "Copy State Button" }
    }
  }
};

/**
 * Get field restrictions for dynamic UI rendering
 * Returns an object mapping fieldKey to { visible, disabled }
 */
export function getFieldRestrictions() {
  if (!_currentProfileName || _currentProfileName === "admin") {
    return {}; // No restrictions
  }

  var profile = getProfileByName(_currentProfileName);
  if (!profile) return {};

  var restrictions = {};
  var sections = profile.sections || {};

  // Iterate through all sections and controls to build restrictions map
  var sectionKeys = Object.keys(sections);
  for (var i = 0; i < sectionKeys.length; i++) {
    var sectionKey = sectionKeys[i];
    var sectionConfig = sections[sectionKey];
    var controls = sectionConfig.controls || {};
    var controlKeys = Object.keys(controls);

    for (var j = 0; j < controlKeys.length; j++) {
      var controlKey = controlKeys[j];
      var controlConfig = controls[controlKey];

      // Check if this is a dynamic field control
      var registrySection = CONTROL_REGISTRY[sectionKey];
      if (registrySection && registrySection.controls[controlKey]) {
        var regControl = registrySection.controls[controlKey];
        if (regControl.type === "dynamic-field" && regControl.fieldKey) {
          restrictions[regControl.fieldKey] = {
            visible: controlConfig.visible !== false,
            disabled: controlConfig.disabled === true,
            default: controlConfig.default
          };
        }
      }
    }
  }

  return restrictions;
}

/**
 * Check if a specific dynamic field should be visible
 * @param {string} fieldKey - e.g., "door.wall", "window.x"
 * @returns {boolean}
 */
export function isFieldVisible(fieldKey) {
  var restrictions = getFieldRestrictions();
  if (restrictions[fieldKey] && restrictions[fieldKey].visible === false) {
    return false;
  }
  return true;
}

/**
 * Check if a specific dynamic field should be disabled (visible but not editable)
 * @param {string} fieldKey - e.g., "door.wall", "window.x"
 * @returns {boolean}
 */
export function isFieldDisabled(fieldKey) {
  var restrictions = getFieldRestrictions();
  if (restrictions[fieldKey] && restrictions[fieldKey].disabled === true) {
    return true;
  }
  return false;
}

/**
 * Get the default value for a dynamic field if set
 * @param {string} fieldKey
 * @returns {*} default value or undefined
 */
export function getFieldDefault(fieldKey) {
  var restrictions = getFieldRestrictions();
  if (restrictions[fieldKey]) {
    return restrictions[fieldKey].default;
  }
  return undefined;
}

// Profile data storage
var _loadedProfiles = null;
var _currentProfileName = null;

/**
 * Load profiles from profiles.json or localStorage
 * @returns {Promise<object>} Profiles data
 */
export function loadProfiles() {
  return new Promise(function(resolve, reject) {
    // Always fetch profiles.json first to get the latest definitions
    fetch("./profiles.json")
      .then(function(response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      })
      .then(function(jsonData) {
        // Check localStorage for working copy with user modifications
        var stored = localStorage.getItem("shedProfilesData");
        if (stored) {
          try {
            var localData = JSON.parse(stored);
            // Merge: profiles.json provides base definitions, localStorage provides user modifications
            // Any profile in profiles.json that doesn't exist in localStorage gets added
            var jsonProfiles = jsonData.profiles || {};
            var localProfiles = localData.profiles || {};

            // Add any new profiles from profiles.json that aren't in localStorage
            for (var profileName in jsonProfiles) {
              if (!localProfiles[profileName]) {
                localProfiles[profileName] = jsonProfiles[profileName];
                console.log("[profiles] Added new profile from profiles.json:", profileName);
              }
            }

            localData.profiles = localProfiles;
            _loadedProfiles = localData;
            console.log("[profiles] Merged profiles from localStorage and profiles.json");
            resolve(_loadedProfiles);
            return;
          } catch (e) {
            console.warn("[profiles] Failed to parse localStorage profiles:", e);
          }
        }

        // No localStorage data, use profiles.json directly
        _loadedProfiles = jsonData;
        console.log("[profiles] Loaded profiles from profiles.json");
        resolve(_loadedProfiles);
      })
      .catch(function(err) {
        console.warn("[profiles] Could not load profiles.json:", err);

        // Fall back to localStorage only
        var stored = localStorage.getItem("shedProfilesData");
        if (stored) {
          try {
            _loadedProfiles = JSON.parse(stored);
            console.log("[profiles] Loaded profiles from localStorage (fallback)");
            resolve(_loadedProfiles);
            return;
          } catch (e) {
            console.warn("[profiles] Failed to parse localStorage profiles:", e);
          }
        }

        // Return default empty profiles
        _loadedProfiles = {
          version: 1,
          profiles: {},
          defaultProfile: null
        };
        resolve(_loadedProfiles);
      });
  });
}

/**
 * Get list of available profile names
 * @returns {string[]}
 */
export function getProfileNames() {
  if (!_loadedProfiles || !_loadedProfiles.profiles) return [];
  return Object.keys(_loadedProfiles.profiles);
}

/**
 * Get profile data by name
 * @param {string} name
 * @returns {object|null}
 */
export function getProfileByName(name) {
  if (!_loadedProfiles || !_loadedProfiles.profiles) return null;
  return _loadedProfiles.profiles[name] || null;
}

/**
 * Get the currently active profile name
 * @returns {string|null}
 */
export function getCurrentProfile() {
  return _currentProfileName;
}

/**
 * Apply a named profile - hide controls and set defaults
 * @param {string} profileName - Name of profile to apply
 * @param {object} store - State store (optional, for setting defaults)
 */
export function applyProfile(profileName, store) {
  // Special case: viewer profile uses existing applyViewerProfile()
  if (profileName === "viewer") {
    _currentProfileName = "viewer";
    applyViewerProfile();
    return;
  }

  // Admin or no profile = everything visible
  if (!profileName || profileName === "admin") {
    _currentProfileName = "admin";
    showAllControls();
    return;
  }

  var profile = getProfileByName(profileName);
  if (!profile) {
    console.warn("[profiles] Profile not found:", profileName);
    _currentProfileName = null;
    return;
  }

  _currentProfileName = profileName;
  console.log("[profiles] Applying profile:", profileName);

  // Start by showing everything
  showAllControls();

  // Then apply profile restrictions
  var sections = profile.sections || {};
  var sectionKeys = Object.keys(sections);

  for (var i = 0; i < sectionKeys.length; i++) {
    var sectionKey = sectionKeys[i];
    var sectionConfig = sections[sectionKey];

    // Never hide the developer section via profiles - it's controlled by "Show Dev Tools" checkbox
    // This ensures the Profile Editor is always accessible to admin users
    if (sectionKey === "developer") {
      continue;
    }

    // Never completely hide the saveLoad section - it contains the Developer panel
    // Individual controls within it can still be hidden
    if (sectionKey === "saveLoad") {
      // Skip section-level hiding, but still process individual controls below
      if (sectionConfig.visible === false) {
        // Don't hide the section, but apply individual control restrictions
        var controls = sectionConfig.controls || {};
        var controlKeys = Object.keys(controls);
        for (var j = 0; j < controlKeys.length; j++) {
          var controlKey = controlKeys[j];
          var controlConfig = controls[controlKey];
          if (controlConfig.visible === false) {
            hideControl(sectionKey, controlKey);
          }
        }
        continue;
      }
    }

    // Hide entire section if visible: false
    if (sectionConfig.visible === false) {
      hideSection(sectionKey);
      continue;
    }

    // Apply individual control settings
    var controls = sectionConfig.controls || {};
    var controlKeys = Object.keys(controls);

    for (var j = 0; j < controlKeys.length; j++) {
      var controlKey = controlKeys[j];
      var controlConfig = controls[controlKey];

      if (controlConfig.visible === false) {
        hideControl(sectionKey, controlKey);

        // Apply default value if specified and store is provided
        if (controlConfig.default !== undefined && store) {
          applyControlDefault(controlKey, controlConfig.default, store);
        }
      }
    }
  }
}

/**
 * Show all controls (reset to admin state)
 */
export function showAllControls() {
  // Show all sections
  var allDetails = document.querySelectorAll("details.boSection");
  allDetails.forEach(function(details) {
    details.style.display = "";
  });

  // Show all controls by iterating through registry
  var sectionKeys = Object.keys(CONTROL_REGISTRY);
  for (var i = 0; i < sectionKeys.length; i++) {
    var section = CONTROL_REGISTRY[sectionKeys[i]];
    var controlKeys = Object.keys(section.controls);

    for (var j = 0; j < controlKeys.length; j++) {
      var control = section.controls[controlKeys[j]];
      var elementIds = control.elementIds || [];

      for (var k = 0; k < elementIds.length; k++) {
        var el = document.getElementById(elementIds[k]);
        if (el) {
          el.style.display = "";
          var row = el.closest(".row");
          if (row) row.style.display = "";
        }
      }
    }
  }
}

/**
 * Hide an entire section by registry key
 * @param {string} sectionKey
 */
export function hideSection(sectionKey) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section) return;

  // Find the <details> element by matching summary text
  var allDetails = document.querySelectorAll("details.boSection");
  allDetails.forEach(function(details) {
    var summary = details.querySelector("summary");
    if (summary && summary.textContent.trim().indexOf(section.label) === 0) {
      details.style.display = "none";
    }
  });
}

/**
 * Show a section by registry key
 * @param {string} sectionKey
 */
export function showSection(sectionKey) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section) return;

  var allDetails = document.querySelectorAll("details.boSection");
  allDetails.forEach(function(details) {
    var summary = details.querySelector("summary");
    if (summary && summary.textContent.trim().indexOf(section.label) === 0) {
      details.style.display = "";
    }
  });
}

/**
 * Hide a specific control within a section
 * @param {string} sectionKey
 * @param {string} controlKey
 */
export function hideControl(sectionKey, controlKey) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section || !section.controls[controlKey]) return;

  var control = section.controls[controlKey];
  var elementIds = control.elementIds || [];

  for (var i = 0; i < elementIds.length; i++) {
    var el = document.getElementById(elementIds[i]);
    if (!el) continue;

    // Try to hide the parent .row for cleaner layout
    var row = el.closest(".row");
    if (row) {
      row.style.display = "none";
    } else {
      el.style.display = "none";
    }
  }
}

/**
 * Show a specific control within a section
 * @param {string} sectionKey
 * @param {string} controlKey
 */
export function showControl(sectionKey, controlKey) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section || !section.controls[controlKey]) return;

  var control = section.controls[controlKey];
  var elementIds = control.elementIds || [];

  for (var i = 0; i < elementIds.length; i++) {
    var el = document.getElementById(elementIds[i]);
    if (!el) continue;

    el.style.display = "";
    var row = el.closest(".row");
    if (row) row.style.display = "";
  }
}

/**
 * Apply a default value to a control
 * @param {string} controlKey
 * @param {*} value
 * @param {object} store
 */
function applyControlDefault(controlKey, value, store) {
  // Map control keys to state paths
  var stateMapping = {
    dimMode: { path: "dimMode" },
    wInput: { path: "dim.frameW_mm" },
    dInput: { path: "dim.frameD_mm" },
    roofStyle: { path: "roof.style" },
    wallsVariant: { path: "walls.variant" },
    wallSection: { path: null, custom: true }, // Needs custom handling
    roofApexEaveHeight: { path: "roof.apex.heightToEaves_mm" },
    roofApexCrestHeight: { path: "roof.apex.heightToCrest_mm" },
    roofApexTrussCount: { path: "roof.apex.trussCount" },
    roofMinHeight: { path: "roof.pent.minHeight_mm" },
    roofMaxHeight: { path: "roof.pent.maxHeight_mm" },
    roofHippedEaveHeight: { path: "roof.hipped.heightToEaves_mm" },
    roofHippedCrestHeight: { path: "roof.hipped.heightToCrest_mm" }
  };

  var mapping = stateMapping[controlKey];
  if (!mapping) return;

  if (mapping.custom && controlKey === "wallSection") {
    // Parse "50x100" format
    var parts = String(value).split("x");
    if (parts.length === 2) {
      store.setState({
        frame: {
          thickness_mm: parseInt(parts[0], 10),
          depth_mm: parseInt(parts[1], 10)
        }
      });
    }
    return;
  }

  if (mapping.path) {
    // Build nested patch object from dot-notation path
    var pathParts = mapping.path.split(".");
    var patch = {};
    var current = patch;

    for (var i = 0; i < pathParts.length - 1; i++) {
      current[pathParts[i]] = {};
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = value;

    store.setState(patch);
  }
}

/**
 * Save profiles to localStorage
 * @param {object} profilesData
 */
export function saveProfilesToStorage(profilesData) {
  _loadedProfiles = profilesData;
  localStorage.setItem("shedProfilesData", JSON.stringify(profilesData));
  console.log("[profiles] Saved profiles to localStorage");
}

/**
 * Export profiles as JSON file download
 */
export function exportProfilesToJson() {
  if (!_loadedProfiles) {
    console.warn("[profiles] No profiles loaded to export");
    return;
  }

  var json = JSON.stringify(_loadedProfiles, null, 2);
  var blob = new Blob([json], { type: "application/json" });
  var url = URL.createObjectURL(blob);

  var a = document.createElement("a");
  a.href = url;
  a.download = "profiles.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log("[profiles] Exported profiles.json");
}

/**
 * Import profiles from JSON
 * @param {string} jsonString
 * @returns {boolean} Success
 */
export function importProfilesFromJson(jsonString) {
  try {
    var data = JSON.parse(jsonString);
    if (!data.profiles || typeof data.profiles !== "object") {
      throw new Error("Invalid profiles format");
    }
    saveProfilesToStorage(data);
    return true;
  } catch (e) {
    console.error("[profiles] Failed to import profiles:", e);
    return false;
  }
}

/**
 * Create a new profile
 * @param {string} name
 * @param {string} label
 * @returns {boolean} Success
 */
export function createProfile(name, label) {
  if (!_loadedProfiles) _loadedProfiles = { version: 1, profiles: {}, defaultProfile: null };

  if (_loadedProfiles.profiles[name]) {
    console.warn("[profiles] Profile already exists:", name);
    return false;
  }

  _loadedProfiles.profiles[name] = {
    label: label || name,
    description: "",
    sections: {}
  };

  saveProfilesToStorage(_loadedProfiles);
  return true;
}

/**
 * Delete a profile
 * @param {string} name
 * @returns {boolean} Success
 */
export function deleteProfile(name) {
  if (!_loadedProfiles || !_loadedProfiles.profiles[name]) {
    return false;
  }

  delete _loadedProfiles.profiles[name];
  saveProfilesToStorage(_loadedProfiles);
  return true;
}

/**
 * Rename a profile
 * @param {string} oldName
 * @param {string} newName
 * @param {string} newLabel
 * @returns {boolean} Success
 */
export function renameProfile(oldName, newName, newLabel) {
  if (!_loadedProfiles || !_loadedProfiles.profiles[oldName]) {
    return false;
  }

  if (oldName !== newName && _loadedProfiles.profiles[newName]) {
    console.warn("[profiles] Profile name already taken:", newName);
    return false;
  }

  var profile = _loadedProfiles.profiles[oldName];
  if (newLabel) profile.label = newLabel;

  if (oldName !== newName) {
    _loadedProfiles.profiles[newName] = profile;
    delete _loadedProfiles.profiles[oldName];
  }

  saveProfilesToStorage(_loadedProfiles);
  return true;
}

/**
 * Update a control's visibility setting in a profile
 * @param {string} profileName
 * @param {string} sectionKey
 * @param {string} controlKey
 * @param {boolean} visible
 * @param {*} defaultValue (optional)
 */
export function updateProfileControl(profileName, sectionKey, controlKey, visible, defaultValue) {
  if (!_loadedProfiles || !_loadedProfiles.profiles[profileName]) {
    return false;
  }

  var profile = _loadedProfiles.profiles[profileName];
  if (!profile.sections) profile.sections = {};
  if (!profile.sections[sectionKey]) profile.sections[sectionKey] = { visible: true, controls: {} };
  if (!profile.sections[sectionKey].controls) profile.sections[sectionKey].controls = {};

  var controlConfig = { visible: visible };
  if (defaultValue !== undefined) {
    controlConfig.default = defaultValue;
  }

  profile.sections[sectionKey].controls[controlKey] = controlConfig;
  saveProfilesToStorage(_loadedProfiles);
  return true;
}

/**
 * Update a section's visibility in a profile
 * @param {string} profileName
 * @param {string} sectionKey
 * @param {boolean} visible
 */
export function updateProfileSection(profileName, sectionKey, visible) {
  if (!_loadedProfiles || !_loadedProfiles.profiles[profileName]) {
    return false;
  }

  var profile = _loadedProfiles.profiles[profileName];
  if (!profile.sections) profile.sections = {};
  if (!profile.sections[sectionKey]) profile.sections[sectionKey] = {};

  profile.sections[sectionKey].visible = visible;
  saveProfilesToStorage(_loadedProfiles);
  return true;
}
