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
 * Get embedded profile configuration from URL parameters
 * This allows profile restrictions to travel with the link
 * The embedded config is in compact form (only restrictions), so we expand it
 * @returns {object|null} Profile config object or null if not embedded
 */
export function getEmbeddedProfileFromUrl() {
  var params = new URLSearchParams(window.location.search || "");
  var profileConfig = params.get("pc"); // "pc" = profile config

  if (!profileConfig) return null;

  try {
    var json = decodeURIComponent(escape(atob(profileConfig)));
    var compactConfig = JSON.parse(json);
    console.log("[profiles] Parsed compact embedded profile config from URL:", compactConfig);
    // Expand the compact config back to full format
    var fullConfig = expandProfileConfig(compactConfig);
    console.log("[profiles] Expanded to full profile config:", fullConfig);
    return fullConfig;
  } catch (e) {
    console.warn("[profiles] Failed to decode embedded profile config:", e);
    return null;
  }
}

/**
 * Create a compact version of a profile config that only includes restrictions
 * Format: { h: ["sectionKey", ...], c: { sectionKey: { controlKey: 0|1, ... } } }
 * Where h = hidden sections, c = control restrictions (0=hidden, 1=visible but disabled)
 * @param {object} profile - Full profile config
 * @returns {object} Compact config
 */
function compactifyProfileConfig(profile) {
  var compact = {};
  var hiddenSections = [];
  var controlRestrictions = {};

  var sections = profile.sections || {};
  for (var sectionKey in sections) {
    var sectionConfig = sections[sectionKey];

    // If entire section is hidden, just add to hidden list
    if (sectionConfig.visible === false) {
      hiddenSections.push(sectionKey);
      continue;
    }

    // Check for individual control restrictions
    var controls = sectionConfig.controls || {};
    var sectionRestrictions = {};
    for (var controlKey in controls) {
      var controlConfig = controls[controlKey];
      if (controlConfig.visible === false) {
        sectionRestrictions[controlKey] = 0; // 0 = hidden
      } else if (controlConfig.editable === false) {
        sectionRestrictions[controlKey] = 1; // 1 = visible but disabled
      }
      // If control has option restrictions, include them
      if (controlConfig.options) {
        var optionRestrictions = {};
        var hasOptionRestrictions = false;
        for (var optKey in controlConfig.options) {
          var optConfig = controlConfig.options[optKey];
          if (optConfig.visible === false) {
            optionRestrictions[optKey] = 0;
            hasOptionRestrictions = true;
          } else if (optConfig.editable === false) {
            optionRestrictions[optKey] = 1;
            hasOptionRestrictions = true;
          }
        }
        if (hasOptionRestrictions) {
          sectionRestrictions[controlKey] = sectionRestrictions[controlKey] || 2; // 2 = has option restrictions
          sectionRestrictions[controlKey + "_o"] = optionRestrictions; // "_o" suffix for options
        }
      }
    }

    if (Object.keys(sectionRestrictions).length > 0) {
      controlRestrictions[sectionKey] = sectionRestrictions;
    }
  }

  if (hiddenSections.length > 0) {
    compact.h = hiddenSections; // "h" = hidden sections
  }
  if (Object.keys(controlRestrictions).length > 0) {
    compact.c = controlRestrictions; // "c" = control restrictions
  }

  return compact;
}

/**
 * Expand a compact profile config back to full format
 * @param {object} compact - Compact config from URL
 * @returns {object} Full profile config with sections
 */
function expandProfileConfig(compact) {
  var profile = { sections: {} };

  // Expand hidden sections
  var hiddenSections = compact.h || [];
  for (var i = 0; i < hiddenSections.length; i++) {
    profile.sections[hiddenSections[i]] = { visible: false };
  }

  // Expand control restrictions
  var controlRestrictions = compact.c || {};
  for (var sectionKey in controlRestrictions) {
    if (!profile.sections[sectionKey]) {
      profile.sections[sectionKey] = { visible: true, controls: {} };
    }
    profile.sections[sectionKey].controls = profile.sections[sectionKey].controls || {};

    var sectionRestrictions = controlRestrictions[sectionKey];
    for (var controlKey in sectionRestrictions) {
      // Skip option keys (they have "_o" suffix)
      if (controlKey.endsWith("_o")) continue;

      var restriction = sectionRestrictions[controlKey];
      if (restriction === 0) {
        profile.sections[sectionKey].controls[controlKey] = { visible: false, editable: false };
      } else if (restriction === 1) {
        profile.sections[sectionKey].controls[controlKey] = { visible: true, editable: false };
      } else if (restriction === 2) {
        // Has option restrictions - get them from the "_o" key
        var optionsKey = controlKey + "_o";
        var optionRestrictions = sectionRestrictions[optionsKey] || {};
        var options = {};
        for (var optKey in optionRestrictions) {
          var optRestriction = optionRestrictions[optKey];
          if (optRestriction === 0) {
            options[optKey] = { visible: false, editable: false };
          } else if (optRestriction === 1) {
            options[optKey] = { visible: true, editable: false };
          }
        }
        profile.sections[sectionKey].controls[controlKey] = { visible: true, editable: true, options: options };
      }
    }
  }

  return profile;
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
    if (state.roof.covering) compact.roof.covering = state.roof.covering;

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
      if (state.roof.apex.tieBeam) {
        compact.roof.apex.tieBeam = state.roof.apex.tieBeam;
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

  // Walls variant and height
  if (state.walls) {
    compact.walls = compact.walls || {};
    if (state.walls.variant) {
      compact.walls.variant = state.walls.variant;
    }
    if (state.walls.height_mm != null) {
      compact.walls.height_mm = state.walls.height_mm;
    }
  }


  // Cladding style
  if (state.cladding && state.cladding.style) {
    compact.cladding = { style: state.cladding.style };
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
        enabled: o.enabled !== false, // Default to true
        x_mm: o.x_mm,
        width_mm: o.width_mm,
        height_mm: o.height_mm
      };
      // Only include y_mm for windows (doors are at ground level)
      if (o.type === "window" && o.y_mm != null) {
        opening.y_mm = o.y_mm;
      }
      // Include style if defined
      if (o.style) {
        opening.style = o.style;
      }
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

  // Sections (attachments)
  if (state.sections && state.sections.attachments && state.sections.attachments.length > 0) {
    compact.sections = {
      enabled: state.sections.enabled !== false,
      attachments: state.sections.attachments.map(function(att) {
        var compactAtt = {
          id: att.id,
          enabled: att.enabled !== false,
          attachTo: att.attachTo,
          dimensions: att.dimensions
        };
        // Include roof config if present
        if (att.roof) {
          compactAtt.roof = att.roof;
        }
        // Include base config if present
        if (att.base) {
          compactAtt.base = att.base;
        }
        return compactAtt;
      })
    };
  }

  // Visibility settings - only include if something is hidden (not default)
  if (state.vis) {
    var compactVis = {};
    var hasVisChanges = false;

    // Main building visibility
    if (state.vis.baseAll === false) { compactVis.baseAll = false; hasVisChanges = true; }
    if (state.vis.walls === false) { compactVis.walls = false; hasVisChanges = true; }
    if (state.vis.roof === false) { compactVis.roof = false; hasVisChanges = true; }
    if (state.vis.cladding === false) { compactVis.cladding = false; hasVisChanges = true; }
    if (state.vis.openings === false) { compactVis.openings = false; hasVisChanges = true; }

    // Base sub-components
    if (state.vis.base === false) { compactVis.base = false; hasVisChanges = true; }
    if (state.vis.frame === false) { compactVis.frame = false; hasVisChanges = true; }
    if (state.vis.ins === false) { compactVis.ins = false; hasVisChanges = true; }
    if (state.vis.deck === false) { compactVis.deck = false; hasVisChanges = true; }

    // Wall insulation and interior plywood
    if (state.vis.wallIns === false) { compactVis.wallIns = false; hasVisChanges = true; }
    if (state.vis.wallPly === false) { compactVis.wallPly = false; hasVisChanges = true; }

    // Wall sub-components (per-wall visibility)
    if (state.vis.walls && typeof state.vis.walls === 'object') {
      var wallVis = state.vis.walls;
      if (wallVis.front === false || wallVis.back === false || wallVis.left === false || wallVis.right === false) {
        compactVis.walls = compactVis.walls || {};
        if (typeof compactVis.walls !== 'object') compactVis.walls = {};
        if (wallVis.front === false) compactVis.walls.front = false;
        if (wallVis.back === false) compactVis.walls.back = false;
        if (wallVis.left === false) compactVis.walls.left = false;
        if (wallVis.right === false) compactVis.walls.right = false;
        hasVisChanges = true;
      }
    }

    // Roof sub-components (include all toggles: structure, osb, covering, tiles, membrane/battens, insulation, ply)
    if (state.vis.roofParts) {
      var rp = state.vis.roofParts;
      var hasRoofVisChanges = (
        rp.structure === false || rp.osb === false || rp.covering === false ||
        rp.tiles === false || rp.membraneBattens === false ||
        rp.insulation === false || rp.ply === false
      );
      if (hasRoofVisChanges) {
        compactVis.roofParts = {};
        if (rp.structure === false) compactVis.roofParts.structure = false;
        if (rp.osb === false) compactVis.roofParts.osb = false;
        if (rp.covering === false) compactVis.roofParts.covering = false;
        if (rp.tiles === false) compactVis.roofParts.tiles = false;
        if (rp.membraneBattens === false) compactVis.roofParts.membraneBattens = false;
        if (rp.insulation === false) compactVis.roofParts.insulation = false;
        if (rp.ply === false) compactVis.roofParts.ply = false;
        hasVisChanges = true;
      }
    }

    // Attachment visibility
    if (state.vis.attachments) {
      var av = state.vis.attachments;
      var compactAv = {};
      var hasAttVisChanges = false;

      if (av.base === false) { compactAv.base = false; hasAttVisChanges = true; }
      if (av.walls === false) { compactAv.walls = false; hasAttVisChanges = true; }
      if (av.roof === false) { compactAv.roof = false; hasAttVisChanges = true; }
      if (av.cladding === false) { compactAv.cladding = false; hasAttVisChanges = true; }
      if (av.baseGrid === false) { compactAv.baseGrid = false; hasAttVisChanges = true; }
      if (av.baseFrame === false) { compactAv.baseFrame = false; hasAttVisChanges = true; }
      if (av.baseDeck === false) { compactAv.baseDeck = false; hasAttVisChanges = true; }
      if (av.wallFront === false) { compactAv.wallFront = false; hasAttVisChanges = true; }
      if (av.wallBack === false) { compactAv.wallBack = false; hasAttVisChanges = true; }
      if (av.wallLeft === false) { compactAv.wallLeft = false; hasAttVisChanges = true; }
      if (av.wallRight === false) { compactAv.wallRight = false; hasAttVisChanges = true; }
      if (av.wallOuter === false) { compactAv.wallOuter = false; hasAttVisChanges = true; }
      if (av.roofStructure === false) { compactAv.roofStructure = false; hasAttVisChanges = true; }
      if (av.roofOsb === false) { compactAv.roofOsb = false; hasAttVisChanges = true; }
      if (av.roofCovering === false) { compactAv.roofCovering = false; hasAttVisChanges = true; }
      if (av.roofInsulation === false) { compactAv.roofInsulation = false; hasAttVisChanges = true; }

      if (hasAttVisChanges) {
        compactVis.attachments = compactAv;
        hasVisChanges = true;
      }
    }

    if (hasVisChanges) {
      compact.vis = compactVis;
    }
  }

  // Price badge visibility (explicitly include so shared links respect the setting)
  if (state.showPriceBadge === true) {
    compact.showPriceBadge = true;
  }
  // If false or undefined, omit it — badge will be hidden by default for shared links

  // Encode as Base64 with UTF-8 support
  // Use unescape(encodeURIComponent()) to convert UTF-8 to ASCII-safe for btoa
  var json = JSON.stringify(compact);
  var base64 = btoa(unescape(encodeURIComponent(json)));

  console.log("[profiles] Generated viewer URL with state:", compact);

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

// Store the MutationObserver so we can disconnect it when switching away from viewer mode
var _viewerModeObserver = null;

/**
 * Make doors list viewer-mode friendly:
 * - Keep "Open" checkbox functional
 * - Disable/hide other editing controls
 * This function is called initially and should be re-called when doors list is re-rendered
 */
function makeDoorsListViewerMode() {
  var doorsList = document.getElementById("doorsList");
  if (!doorsList) return;

  // Disconnect any existing observer first
  if (_viewerModeObserver) {
    _viewerModeObserver.disconnect();
  }

  // Use MutationObserver to handle dynamic door list updates
  _viewerModeObserver = new MutationObserver(function() {
    applyDoorsListViewerRestrictions(doorsList);
  });

  _viewerModeObserver.observe(doorsList, { childList: true, subtree: true });

  // Apply immediately
  applyDoorsListViewerRestrictions(doorsList);
}

/**
 * Stop watching for viewer mode restrictions (called when switching to admin/other profiles)
 */
function stopViewerModeObserver() {
  if (_viewerModeObserver) {
    _viewerModeObserver.disconnect();
    _viewerModeObserver = null;
  }
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
 * Hide visibility checkboxes for components that are hidden in the state
 * This is called in viewer mode to prevent users from seeing controls for hidden components
 * @param {object} state - Current application state with vis settings
 */
export function hideDisabledVisibilityControls(state) {
  if (!state || !state.vis) return;

  var vis = state.vis;

  // Helper to hide a checkbox and its label
  function hideCheckbox(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var label = el.closest("label.check");
    if (label) {
      label.style.display = "none";
    } else {
      el.style.display = "none";
    }
  }

  // Main building visibility controls
  if (vis.baseAll === false) hideCheckbox("vBaseAll");
  if (vis.walls === false) hideCheckbox("vWalls");
  if (vis.roof === false) hideCheckbox("vRoof");
  if (vis.cladding === false) hideCheckbox("vCladding");
  if (vis.openings === false) hideCheckbox("vOpenings");

  // Roof sub-components
  if (vis.roofParts) {
    if (vis.roofParts.structure === false) hideCheckbox("vRoofStructure");
    if (vis.roofParts.osb === false) hideCheckbox("vRoofOsb");
    if (vis.roofParts.covering === false) hideCheckbox("vRoofCovering");
  }

  // Base sub-components
  if (vis.base === false) hideCheckbox("vBase");
  if (vis.frame === false) hideCheckbox("vFrame");
  if (vis.ins === false) hideCheckbox("vIns");
  if (vis.deck === false) hideCheckbox("vDeck");

  // Wall sub-components (per-wall visibility)
  if (vis.walls && typeof vis.walls === 'object') {
    if (vis.walls.front === false) hideCheckbox("vWallFront");
    if (vis.walls.back === false) hideCheckbox("vWallBack");
    if (vis.walls.left === false) hideCheckbox("vWallLeft");
    if (vis.walls.right === false) hideCheckbox("vWallRight");
  }

  // Attachment visibility controls
  if (vis.attachments) {
    var av = vis.attachments;
    if (av.base === false) hideCheckbox("vAttBase");
    if (av.walls === false) hideCheckbox("vAttWalls");
    if (av.roof === false) hideCheckbox("vAttRoof");
    if (av.cladding === false) hideCheckbox("vAttCladding");
    if (av.baseGrid === false) hideCheckbox("vAttBaseGrid");
    if (av.baseFrame === false) hideCheckbox("vAttBaseFrame");
    if (av.baseDeck === false) hideCheckbox("vAttBaseDeck");
    if (av.wallFront === false) hideCheckbox("vAttWallFront");
    if (av.wallBack === false) hideCheckbox("vAttWallBack");
    if (av.wallLeft === false) hideCheckbox("vAttWallLeft");
    if (av.wallRight === false) hideCheckbox("vAttWallRight");
    if (av.wallOuter === false) hideCheckbox("vAttWallOuter");
  }

  console.log("[profiles] Hidden visibility controls for disabled components");
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
  console.log("[profiles] fallbackCopyToClipboard: attempting execCommand('copy')...");
  var textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "0";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    var success = document.execCommand("copy");
    console.log("[profiles] fallbackCopyToClipboard: execCommand returned:", success);
    document.body.removeChild(textarea);
    if (success) {
      console.log("[profiles] fallbackCopyToClipboard: SUCCESS - copied", text.length, "chars");
      if (onSuccess) onSuccess(text);
    } else {
      console.log("[profiles] fallbackCopyToClipboard: FAILED - execCommand returned false");
      if (onError) onError(new Error("execCommand copy failed"));
    }
  } catch (e) {
    console.log("[profiles] fallbackCopyToClipboard: EXCEPTION:", e);
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
  console.log("[profiles] generateProfileUrl called with profileName:", profileName);
  console.log("[profiles] generateProfileUrl input state:", JSON.stringify(state, null, 2));
  console.log("[profiles] generateProfileUrl state.dim:", state?.dim);
  console.log("[profiles] generateProfileUrl state.dim.frameW_mm:", state && state.dim ? state.dim.frameW_mm : "undefined");
  console.log("[profiles] generateProfileUrl state.dim.frameD_mm:", state && state.dim ? state.dim.frameD_mm : "undefined");
  console.log("[profiles] generateProfileUrl state.w:", state?.w);

  // Build a compact state object (reuse the same logic as viewer)
  var compact = {};

  // Basic dimensions
  var width = (state.dim && state.dim.frameW_mm) || state.w;
  var depth = (state.dim && state.dim.frameD_mm) || state.d;
  console.log("[profiles] generateProfileUrl extracted width:", width, "depth:", depth);
  if (width) compact.w = width;
  if (depth) compact.d = depth;
  if (state.dimMode) compact.dimMode = state.dimMode;

  // Roof
  if (state.roof) {
    compact.roof = {};
    if (state.roof.style) compact.roof.style = state.roof.style;
    if (state.roof.covering) compact.roof.covering = state.roof.covering;

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
      if (state.roof.apex.tieBeam) {
        compact.roof.apex.tieBeam = state.roof.apex.tieBeam;
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

  // Walls variant and height
  if (state.walls) {
    compact.walls = compact.walls || {};
    if (state.walls.variant) {
      compact.walls.variant = state.walls.variant;
    }
    if (state.walls.height_mm != null) {
      compact.walls.height_mm = state.walls.height_mm;
    }
  }


  // Cladding style
  if (state.cladding && state.cladding.style) {
    compact.cladding = { style: state.cladding.style };
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
        enabled: o.enabled !== false, // Default to true
        x_mm: o.x_mm,
        width_mm: o.width_mm,
        height_mm: o.height_mm
      };
      // Only include y_mm for windows (doors are at ground level)
      if (o.type === "window" && o.y_mm != null) {
        opening.y_mm = o.y_mm;
      }
      // Include style if defined
      if (o.style) {
        opening.style = o.style;
      }
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

  // Sections (attachments)
  if (state.sections && state.sections.attachments && state.sections.attachments.length > 0) {
    compact.sections = {
      enabled: state.sections.enabled !== false,
      attachments: state.sections.attachments.map(function(att) {
        var compactAtt = {
          id: att.id,
          enabled: att.enabled !== false,
          attachTo: att.attachTo,
          dimensions: att.dimensions
        };
        // Include roof config if present
        if (att.roof) {
          compactAtt.roof = att.roof;
        }
        // Include base config if present
        if (att.base) {
          compactAtt.base = att.base;
        }
        return compactAtt;
      })
    };
  }

  // Visibility settings - only include if something is hidden (not default)
  if (state.vis) {
    var compactVis = {};
    var hasVisChanges = false;

    // Main building visibility
    if (state.vis.baseAll === false) { compactVis.baseAll = false; hasVisChanges = true; }
    if (state.vis.walls === false) { compactVis.walls = false; hasVisChanges = true; }
    if (state.vis.roof === false) { compactVis.roof = false; hasVisChanges = true; }
    if (state.vis.cladding === false) { compactVis.cladding = false; hasVisChanges = true; }
    if (state.vis.openings === false) { compactVis.openings = false; hasVisChanges = true; }

    // Base sub-components
    if (state.vis.base === false) { compactVis.base = false; hasVisChanges = true; }
    if (state.vis.frame === false) { compactVis.frame = false; hasVisChanges = true; }
    if (state.vis.ins === false) { compactVis.ins = false; hasVisChanges = true; }
    if (state.vis.deck === false) { compactVis.deck = false; hasVisChanges = true; }

    // Wall insulation and interior plywood
    if (state.vis.wallIns === false) { compactVis.wallIns = false; hasVisChanges = true; }
    if (state.vis.wallPly === false) { compactVis.wallPly = false; hasVisChanges = true; }

    // Wall sub-components (per-wall visibility)
    if (state.vis.walls && typeof state.vis.walls === 'object') {
      var wallVis = state.vis.walls;
      if (wallVis.front === false || wallVis.back === false || wallVis.left === false || wallVis.right === false) {
        compactVis.walls = compactVis.walls || {};
        if (typeof compactVis.walls !== 'object') compactVis.walls = {};
        if (wallVis.front === false) compactVis.walls.front = false;
        if (wallVis.back === false) compactVis.walls.back = false;
        if (wallVis.left === false) compactVis.walls.left = false;
        if (wallVis.right === false) compactVis.walls.right = false;
        hasVisChanges = true;
      }
    }

    // Roof sub-components
    if (state.vis.roofParts) {
      var rp = state.vis.roofParts;
      if (rp.structure === false || rp.osb === false || rp.covering === false) {
        compactVis.roofParts = {};
        if (rp.structure === false) compactVis.roofParts.structure = false;
        if (rp.osb === false) compactVis.roofParts.osb = false;
        if (rp.covering === false) compactVis.roofParts.covering = false;
        hasVisChanges = true;
      }
    }

    // Attachment visibility
    if (state.vis.attachments) {
      var av = state.vis.attachments;
      var compactAv = {};
      var hasAttVisChanges = false;

      if (av.base === false) { compactAv.base = false; hasAttVisChanges = true; }
      if (av.walls === false) { compactAv.walls = false; hasAttVisChanges = true; }
      if (av.roof === false) { compactAv.roof = false; hasAttVisChanges = true; }
      if (av.cladding === false) { compactAv.cladding = false; hasAttVisChanges = true; }
      if (av.baseGrid === false) { compactAv.baseGrid = false; hasAttVisChanges = true; }
      if (av.baseFrame === false) { compactAv.baseFrame = false; hasAttVisChanges = true; }
      if (av.baseDeck === false) { compactAv.baseDeck = false; hasAttVisChanges = true; }
      if (av.wallFront === false) { compactAv.wallFront = false; hasAttVisChanges = true; }
      if (av.wallBack === false) { compactAv.wallBack = false; hasAttVisChanges = true; }
      if (av.wallLeft === false) { compactAv.wallLeft = false; hasAttVisChanges = true; }
      if (av.wallRight === false) { compactAv.wallRight = false; hasAttVisChanges = true; }
      if (av.wallOuter === false) { compactAv.wallOuter = false; hasAttVisChanges = true; }
      if (av.roofStructure === false) { compactAv.roofStructure = false; hasAttVisChanges = true; }
      if (av.roofOsb === false) { compactAv.roofOsb = false; hasAttVisChanges = true; }
      if (av.roofCovering === false) { compactAv.roofCovering = false; hasAttVisChanges = true; }
      if (av.roofInsulation === false) { compactAv.roofInsulation = false; hasAttVisChanges = true; }

      if (hasAttVisChanges) {
        compactVis.attachments = compactAv;
        hasVisChanges = true;
      }
    }

    if (hasVisChanges) {
      compact.vis = compactVis;
    }
  }

  // Price badge visibility
  if (state.showPriceBadge === true) {
    compact.showPriceBadge = true;
  }

  // Encode as Base64
  var json = JSON.stringify(compact);
  var base64 = btoa(unescape(encodeURIComponent(json)));

  console.log("[profiles] generateProfileUrl compact state:", compact);
  console.log("[profiles] generateProfileUrl compact.w:", compact.w, "compact.d:", compact.d);

  // Build URL with profile and state
  var baseUrl = window.location.origin + window.location.pathname;
  var url = baseUrl + "?profile=" + encodeURIComponent(profileName) + "&state=" + base64;

  // Also embed a COMPACT profile configuration (only restrictions, not full config)
  // This keeps URLs short by only including what differs from "everything visible/editable"
  var profile = getProfileByName(profileName);
  if (profile && profile.sections) {
    var compactProfile = compactifyProfileConfig(profile);
    if (compactProfile && Object.keys(compactProfile).length > 0) {
      var profileJson = JSON.stringify(compactProfile);
      var profileBase64 = btoa(unescape(encodeURIComponent(profileJson)));
      url += "&pc=" + profileBase64; // "pc" = profile config
      console.log("[profiles] Embedded compact profile config in URL, added", profileBase64.length, "chars");
    }
  }

  console.log("[profiles] generateProfileUrl final URL length:", url.length);
  return url;
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
  console.log("[profiles] copyProfileUrlToClipboard: generated URL:", url.substring(0, 100) + "...");
  console.log("[profiles] copyProfileUrlToClipboard: navigator.clipboard available:", !!navigator.clipboard);
  console.log("[profiles] copyProfileUrlToClipboard: isSecureContext:", window.isSecureContext);

  // Clipboard API only works in secure contexts (HTTPS or localhost)
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    console.log("[profiles] copyProfileUrlToClipboard: trying Clipboard API...");
    navigator.clipboard.writeText(url)
      .then(function() {
        console.log("[profiles] copyProfileUrlToClipboard: Clipboard API SUCCESS");
        if (onSuccess) onSuccess(url);
      })
      .catch(function(err) {
        console.log("[profiles] copyProfileUrlToClipboard: Clipboard API FAILED:", err);
        fallbackCopyToClipboard(url, onSuccess, onError);
      });
  } else {
    console.log("[profiles] copyProfileUrlToClipboard: using fallback (not secure context)");
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
      dimMode: {
        type: "select",
        elementIds: ["dimMode"],
        label: "Dimension Mode",
        options: [
          { value: "base", label: "Base" },
          { value: "frame", label: "Frame" },
          { value: "roof", label: "Roof" }
        ]
      },
      wInput: { type: "number", elementIds: ["wInput"], label: "Width" },
      dInput: { type: "number", elementIds: ["dInput"], label: "Depth" },
      roofStyle: {
        type: "select",
        elementIds: ["roofStyle"],
        label: "Roof Type",
        options: [
          { value: "apex", label: "Apex (gabled)" },
          { value: "pent", label: "Pent (single pitch)" },
          { value: "hipped", label: "Hipped" }
        ]
      },
      wallsVariant: {
        type: "select",
        elementIds: ["wallsVariant"],
        label: "Variant",
        options: [
          { value: "insulated", label: "Insulated" },
          { value: "basic", label: "Basic" }
        ]
      },
      wallSection: {
        type: "select",
        elementIds: ["wallSection"],
        label: "Frame Gauge",
        options: [
          { value: "50x75", label: "75 x 50" },
          { value: "50x100", label: "100 x 50" }
        ]
      },
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
      doorWall: {
        type: "dynamic-select",
        fieldKey: "door.wall",
        label: "Door: Wall",
        options: [
          { value: "front", label: "Front" },
          { value: "back", label: "Back" },
          { value: "left", label: "Left" },
          { value: "right", label: "Right" }
        ]
      },
      doorStyle: {
        type: "dynamic-select",
        fieldKey: "door.style",
        label: "Door: Style",
        options: [
          { value: "standard", label: "Standard" },
          { value: "double-standard", label: "Double Standard" },
          { value: "mortise-tenon", label: "Mortise & Tenon" },
          { value: "double-mortise-tenon", label: "Double Mortise & Tenon" },
          { value: "french", label: "French Doors" }
        ]
      },
      doorHinge: {
        type: "dynamic-select",
        fieldKey: "door.hinge",
        label: "Door: Hinge Side",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" }
        ]
      },
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
      windowWall: {
        type: "dynamic-select",
        fieldKey: "window.wall",
        label: "Window: Wall",
        options: [
          { value: "front", label: "Front" },
          { value: "back", label: "Back" },
          { value: "left", label: "Left" },
          { value: "right", label: "Right" }
        ]
      },
      windowStyle: { type: "dynamic-field", fieldKey: "window.style", label: "Window: Style" },
      windowX: { type: "dynamic-field", fieldKey: "window.x", label: "Window: X Position" },
      windowY: { type: "dynamic-field", fieldKey: "window.y", label: "Window: Y Position" },
      windowWidth: { type: "dynamic-field", fieldKey: "window.width", label: "Window: Width" },
      windowHeight: { type: "dynamic-field", fieldKey: "window.height", label: "Window: Height" },
      windowSnapBtn: { type: "dynamic-field", fieldKey: "window.snapBtn", label: "Window: Snap Button" },
      windowRemoveBtn: { type: "dynamic-field", fieldKey: "window.removeBtn", label: "Window: Remove Button" },

      // Internal Dividers section (wrapper for entire subsection)
      internalDividersSection: { type: "container", elementIds: ["internalDividersSection"], label: "Internal Dividers Section" },

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
      // Add new attachment controls
      attachmentWall: {
        type: "select",
        elementIds: ["attachmentWall"],
        label: "Attachment: Wall Selector",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
          { value: "front", label: "Front" },
          { value: "back", label: "Back" }
        ]
      },
      addAttachmentBtn: { type: "button", elementIds: ["addAttachmentBtn"], label: "Add Attachment Button" },
      removeAllAttachmentsBtn: { type: "button", elementIds: ["removeAllAttachmentsBtn"], label: "Remove All Attachments Button" },

      // Attachment editor fields (dynamic - rendered per attachment)
      attachmentEditorWall: { type: "dynamic-select", fieldKey: "attachment.wall", label: "Attachment: Wall" },
      attachmentEditorOffset: { type: "dynamic-field", fieldKey: "attachment.offset", label: "Attachment: Offset from Center" },
      attachmentEditorWidth: { type: "dynamic-field", fieldKey: "attachment.width", label: "Attachment: Width" },
      attachmentEditorDepth: { type: "dynamic-field", fieldKey: "attachment.depth", label: "Attachment: Depth" },
      attachmentEditorLevelOffset: { type: "dynamic-field", fieldKey: "attachment.levelOffset", label: "Attachment: Level Offset" },
      attachmentEditorBaseEnabled: { type: "dynamic-field", fieldKey: "attachment.baseEnabled", label: "Attachment: Show Base" },
      attachmentEditorWallHeight: { type: "dynamic-field", fieldKey: "attachment.wallHeight", label: "Attachment: Wall Height" },
      attachmentEditorWallsVariant: { type: "dynamic-select", fieldKey: "attachment.wallsVariant", label: "Attachment: Walls Variant" },
      attachmentEditorRoofType: { type: "dynamic-select", fieldKey: "attachment.roofType", label: "Attachment: Roof Type" },
      attachmentEditorRemoveBtn: { type: "dynamic-field", fieldKey: "attachment.removeBtn", label: "Attachment: Remove Button" }
    }
  },

  appearance: {
    label: "Appearance",
    controls: {
      claddingStyle: {
        type: "select",
        elementIds: ["claddingStyle"],
        label: "Cladding Style",
        options: [
          { value: "shiplap", label: "Shiplap" },
          { value: "overlap", label: "Overlap (Featheredge)" },
          { value: "loglap", label: "Log Lap" }
        ]
      }
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
      shareLinkProfileSelect: { type: "select", elementIds: ["shareLinkProfileSelect"], label: "Share Link Profile Selector" },
      copyShareLinkBtn: { type: "button", elementIds: ["copyShareLinkBtn"], label: "Copy Share Link Button" },
      copyShedDescriptionBtn: { type: "button", elementIds: ["copyShedDescriptionBtn"], label: "Copy Shed Description Button" }
    }
  },

  developer: {
    label: "Developer",
    controls: {
      devModeCheck: { type: "checkbox", elementIds: ["devModeCheck"], label: "Developer Mode Checkbox" },
      copyStateBtn: { type: "button", elementIds: ["copyStateBtn"], label: "Copy State Button" }
    }
  },

  display: {
    label: "BOM",
    controls: {
      viewSelect: { type: "select", elementIds: ["viewSelect"], label: "View Selector (3D/Cutting Lists)" }
    }
  }
};

/**
 * Get field restrictions for dynamic UI rendering
 * Returns an object mapping fieldKey to { visible, disabled, options }
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

      // Check if this is a dynamic field/select control
      var registrySection = CONTROL_REGISTRY[sectionKey];
      if (registrySection && registrySection.controls[controlKey]) {
        var regControl = registrySection.controls[controlKey];
        // Handle both dynamic-field and dynamic-select types
        if ((regControl.type === "dynamic-field" || regControl.type === "dynamic-select") && regControl.fieldKey) {
          restrictions[regControl.fieldKey] = {
            visible: controlConfig.visible !== false,
            disabled: controlConfig.editable === false, // Use editable, not disabled
            default: controlConfig.default,
            options: controlConfig.options || null // Include option-level restrictions
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

/**
 * Get option-level restrictions for a dynamic select field
 * @param {string} fieldKey - e.g., "door.wall", "door.style"
 * @returns {object|null} options restrictions or null
 */
export function getFieldOptionRestrictions(fieldKey) {
  var restrictions = getFieldRestrictions();
  if (restrictions[fieldKey] && restrictions[fieldKey].options) {
    return restrictions[fieldKey].options;
  }
  return null;
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

            // IMPORTANT: Always use the admin profile from profiles.json (not localStorage)
            // This ensures admin profile is always unrestricted
            if (jsonProfiles["admin"]) {
              localProfiles["admin"] = jsonProfiles["admin"];
              console.log("[profiles] Using admin profile from profiles.json (overriding localStorage)");
            }

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
 * Apply a named profile - hide controls and disable non-editable ones
 * @param {string} profileName - Name of profile to apply
 * @param {object} store - State store (optional, not currently used)
 */
export function applyProfile(profileName, store) {
  // Special case: viewer profile uses existing applyViewerProfile()
  if (profileName === "viewer") {
    _currentProfileName = "viewer";
    applyViewerProfile();
    try { document.dispatchEvent(new CustomEvent('profile-applied', { detail: { profile: profileName } })); } catch(e) {}
    return;
  }

  // Admin or no profile = everything visible and editable
  if (!profileName || profileName === "admin") {
    _currentProfileName = "admin";
    try {
      console.log("[profiles] Applying admin profile - calling showAllControls...");
      showAllControls();
      console.log("[profiles] showAllControls completed - calling enableAllControls...");
      enableAllControls();
      console.log("[profiles] enableAllControls completed - admin profile fully applied");
    } catch (err) {
      console.error("[profiles] Error applying admin profile:", err);
    }
    try { document.dispatchEvent(new CustomEvent('profile-applied', { detail: { profile: profileName } })); } catch(e) {}
    return;
  }

  var profile = getProfileByName(profileName);
  if (!profile) {
    console.warn("[profiles] Profile not found locally:", profileName);
    // Check if there's an embedded profile config in the URL
    var embeddedProfile = getEmbeddedProfileFromUrl();
    if (embeddedProfile && embeddedProfile.sections) {
      console.log("[profiles] Using embedded profile config from URL");
      profile = embeddedProfile;
      // Continue with the embedded profile below
    } else {
      // No embedded profile either - fall back to admin with hidden developer section
      var urlProfile = getProfileFromUrl();
      if (urlProfile) {
        console.log("[profiles] Profile from URL not found and no embedded config, applying admin with hidden developer section");
        _currentProfileName = "admin";
        showAllControls();
        enableAllControls();
        // Hide developer section since this is from a shared link
        hideSection("developer");
        // Also hide display section for shared links
        hideSection("display");
      } else {
        _currentProfileName = null;
      }
      return;
    }
  }

  _currentProfileName = profileName;
  console.log("[profiles] Applying profile:", profileName);

  // Start by showing and enabling everything
  showAllControls();
  enableAllControls();

  // Then apply profile restrictions
  var sections = profile.sections || {};
  var sectionKeys = Object.keys(sections);

  for (var i = 0; i < sectionKeys.length; i++) {
    var sectionKey = sectionKeys[i];
    var sectionConfig = sections[sectionKey];

    // Only skip hiding developer section if NOT loaded from a profile URL
    // This ensures Profile Editor is accessible for local admin use, but hidden when sharing profile links
    var urlProfile = getProfileFromUrl();
    if (sectionKey === "developer" && !urlProfile) {
      continue;
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

      console.log("[profiles] Processing control:", sectionKey + "." + controlKey,
        "visible:", controlConfig.visible,
        "editable:", controlConfig.editable,
        "hasOptions:", controlConfig.options ? Object.keys(controlConfig.options).length : 0);

      if (controlConfig.visible === false) {
        console.log("[profiles] Hiding control:", controlKey);
        hideControl(sectionKey, controlKey);
      } else if (controlConfig.editable === false) {
        // Visible but not editable = greyed out
        console.log("[profiles] Disabling control:", controlKey);
        disableControl(sectionKey, controlKey);
      }

      // Apply option-level restrictions if this control has options configured
      if (controlConfig.options && Object.keys(controlConfig.options).length > 0) {
        console.log("[profiles] Applying option restrictions for:", controlKey, controlConfig.options);
        applySelectOptionRestrictions(sectionKey, controlKey, controlConfig.options);
      }
    }
  }

  // Notify mobile-configurator (and others) that profile has been applied
  try { document.dispatchEvent(new CustomEvent('profile-applied', { detail: { profile: profileName } })); } catch(e) {}
}

/**
 * Show all controls (reset to admin state)
 */
export function showAllControls() {
  console.log("[profiles] showAllControls called");

  // Stop the viewer mode MutationObserver (if active) to prevent it from re-disabling controls
  stopViewerModeObserver();

  // Show the view selector (viewer mode hides this)
  var viewSelect = document.getElementById("viewSelect");
  if (viewSelect) {
    viewSelect.style.display = "";
  }

  // Show all sections and remove "(View Only)" suffix from summaries
  var allDetails = document.querySelectorAll("details.boSection");
  allDetails.forEach(function(details) {
    details.style.display = "";
    var summary = details.querySelector("summary");
    if (summary && summary.textContent.indexOf("(View Only)") >= 0) {
      summary.textContent = summary.textContent.replace(" (View Only)", "");
    }
  });

  // Show all rows that might have been hidden
  var allRows = document.querySelectorAll(".row, .row3, .boBox, .checks");
  allRows.forEach(function(row) {
    row.style.display = "";
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
          // Show the label if it was hidden
          var label = el.closest("label");
          if (label) label.style.display = "";
          // Also ensure the row is visible
          var row = el.closest(".row");
          if (row) row.style.display = "";
        }
      }
    }
  }

  // Show dynamic control containers (doors list, windows list, etc.)
  var dynamicContainers = ["doorsList", "windowsList", "dividersList", "attachmentsList"];
  dynamicContainers.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "";
  });
}

/**
 * Hide an entire section by registry key
 * @param {string} sectionKey
 */
export function hideSection(sectionKey) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section) return;

  // Special handling for "display" section - it's not in a <details> element
  // Instead, hide all controls in the section directly
  if (sectionKey === "display") {
    var controls = section.controls || {};
    for (var controlKey in controls) {
      hideControl(sectionKey, controlKey);
    }
    return;
  }

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

  // Special handling for "display" section - it's not in a <details> element
  if (sectionKey === "display") {
    var controls = section.controls || {};
    for (var controlKey in controls) {
      showControl(sectionKey, controlKey);
    }
    return;
  }

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

    // For container types, hide the element directly (it's a wrapper div)
    if (control.type === "container") {
      el.style.display = "none";
      continue;
    }

    // For buttons, just hide the button itself (don't affect siblings in row)
    if (el.tagName === "BUTTON") {
      el.style.display = "none";
      continue;
    }

    // Try to hide the parent label first (safer - doesn't affect siblings in same row)
    var label = el.closest("label");
    if (label) {
      label.style.display = "none";
    } else {
      // Fall back to hiding the row if no label
      var row = el.closest(".row");
      if (row) {
        row.style.display = "none";
      } else {
        el.style.display = "none";
      }
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

    // For container types, just show the element directly
    if (control.type === "container") {
      continue;
    }

    // For buttons, just show the button itself
    if (el.tagName === "BUTTON") {
      continue;
    }

    // Show the label if it was hidden
    var label = el.closest("label");
    if (label) label.style.display = "";
    // Also ensure the row is visible
    var row = el.closest(".row");
    if (row) row.style.display = "";
  }
}

/**
 * Disable a specific control (visible but greyed out, not editable)
 * @param {string} sectionKey
 * @param {string} controlKey
 */
export function disableControl(sectionKey, controlKey) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section || !section.controls[controlKey]) return;

  var control = section.controls[controlKey];
  var elementIds = control.elementIds || [];

  for (var i = 0; i < elementIds.length; i++) {
    var el = document.getElementById(elementIds[i]);
    if (!el) continue;

    // Disable the element
    el.disabled = true;
    el.classList.add("profile-disabled");

    // For inputs, also add visual styling
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "BUTTON") {
      el.style.opacity = "0.6";
      el.style.cursor = "not-allowed";
      el.style.pointerEvents = "none";
    }
  }
}

/**
 * Enable a specific control (make it editable)
 * @param {string} sectionKey
 * @param {string} controlKey
 */
export function enableControl(sectionKey, controlKey) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section || !section.controls[controlKey]) return;

  var control = section.controls[controlKey];
  var elementIds = control.elementIds || [];

  for (var i = 0; i < elementIds.length; i++) {
    var el = document.getElementById(elementIds[i]);
    if (!el) continue;

    el.disabled = false;
    el.classList.remove("profile-disabled");
    el.style.opacity = "";
    el.style.cursor = "";
    el.style.pointerEvents = "";
  }
}

/**
 * Enable all controls (reset to editable state)
 */
export function enableAllControls() {
  console.log("[profiles] enableAllControls called");

  // Enable all controls by iterating through registry
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
          el.disabled = false;
          el.classList.remove("profile-disabled");
          el.classList.remove("profile-options-restricted");
          el.style.opacity = "";
          el.style.cursor = "";
          el.style.pointerEvents = "";

          // Reset all options in select elements
          if (el.tagName === "SELECT") {
            resetSelectOptions(el);
          }
        }
      }
    }
  }

  // Also enable any inputs/buttons that might have been disabled by viewer mode
  // This catches elements that aren't in the registry but were disabled
  var allInputs = document.querySelectorAll("#controlPanel input, #controlPanel select, #controlPanel button");
  allInputs.forEach(function(el) {
    // Don't enable the hipped roof button (it's always disabled for now)
    if (el.id === "hippedDesignOptionsBtn") return;

    el.disabled = false;
    el.style.opacity = "";
    el.style.cursor = "";
    el.style.pointerEvents = "";
  });
}

/**
 * Reset all options in a select element to visible and enabled
 * @param {HTMLSelectElement} selectEl
 */
function resetSelectOptions(selectEl) {
  var options = selectEl.querySelectorAll("option");
  options.forEach(function(opt) {
    opt.style.display = "";
    opt.disabled = false;
    opt.style.color = "";
  });
}

/**
 * Apply option-level restrictions to a select element
 * @param {string} sectionKey
 * @param {string} controlKey
 * @param {object} optionsConfig - { optionValue: { visible, editable }, ... }
 */
export function applySelectOptionRestrictions(sectionKey, controlKey, optionsConfig) {
  var section = CONTROL_REGISTRY[sectionKey];
  if (!section || !section.controls[controlKey]) {
    console.log("[profiles] applySelectOptionRestrictions - control not found in registry:", sectionKey, controlKey);
    return;
  }

  var control = section.controls[controlKey];
  var elementIds = control.elementIds || [];
  console.log("[profiles] applySelectOptionRestrictions for", controlKey, "elementIds:", elementIds);

  for (var i = 0; i < elementIds.length; i++) {
    var el = document.getElementById(elementIds[i]);
    var row = el ? el.closest(".row") : null;
    console.log("[profiles] Looking for element:", elementIds[i],
      "found:", !!el,
      "tagName:", el ? el.tagName : "N/A",
      "el.display:", el ? el.style.display : "N/A",
      "row.display:", row ? row.style.display : "N/A");
    if (!el || el.tagName !== "SELECT") continue;

    var options = el.querySelectorAll("option");
    var hasEnabledOption = false;

    options.forEach(function(opt) {
      var optValue = opt.value;
      var optConfig = optionsConfig[optValue];

      if (optConfig) {
        if (optConfig.visible === false) {
          // Hide the option completely
          opt.style.display = "none";
          opt.disabled = true;
        } else if (optConfig.editable === false) {
          // Show but grey out (not selectable)
          opt.style.display = "";
          opt.disabled = true;
          opt.style.color = "#999";
        } else {
          // Fully enabled
          opt.style.display = "";
          opt.disabled = false;
          opt.style.color = "";
          hasEnabledOption = true;
        }
      } else {
        // Option not in config - leave it enabled
        hasEnabledOption = true;
      }
    });

    // If ALL options are disabled, keep the select openable but users can't select anything
    // The dropdown can still be opened to VIEW the greyed-out options
    if (!hasEnabledOption) {
      // Don't disable the select - allow opening to view options
      // Just add visual indication that options are restricted
      el.classList.add("profile-options-restricted");
      console.log("[profiles] All options disabled for", controlKey, "- dropdown remains openable but options not selectable");
    } else {
      // If currently selected option is now hidden or disabled, select first available
      var selectedOpt = el.options[el.selectedIndex];
      if (selectedOpt && (selectedOpt.style.display === "none" || selectedOpt.disabled)) {
        // Find first visible, enabled option
        for (var j = 0; j < el.options.length; j++) {
          if (el.options[j].style.display !== "none" && !el.options[j].disabled) {
            el.selectedIndex = j;
            // Trigger change event
            el.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
      }
    }
  }
}

/**
 * Apply a default value to a control (legacy, kept for compatibility)
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
 * Update a control's visibility and editable settings in a profile
 * @param {string} profileName
 * @param {string} sectionKey
 * @param {string} controlKey
 * @param {boolean} visible - can the user see this control?
 * @param {boolean} editable - can the user change it? (only relevant if visible)
 */
export function updateProfileControl(profileName, sectionKey, controlKey, visible, editable) {
  if (!_loadedProfiles || !_loadedProfiles.profiles[profileName]) {
    return false;
  }

  var profile = _loadedProfiles.profiles[profileName];
  if (!profile.sections) profile.sections = {};
  if (!profile.sections[sectionKey]) profile.sections[sectionKey] = { visible: true, controls: {} };
  if (!profile.sections[sectionKey].controls) profile.sections[sectionKey].controls = {};

  // Preserve existing options if any
  var existingOptions = profile.sections[sectionKey].controls[controlKey]
    ? profile.sections[sectionKey].controls[controlKey].options
    : undefined;

  var controlConfig = {
    visible: visible,
    editable: editable !== false // default to true if not specified
  };

  if (existingOptions) {
    controlConfig.options = existingOptions;
  }

  profile.sections[sectionKey].controls[controlKey] = controlConfig;
  saveProfilesToStorage(_loadedProfiles);
  return true;
}

/**
 * Update a dropdown option's visibility and editable settings in a profile
 * @param {string} profileName
 * @param {string} sectionKey
 * @param {string} controlKey
 * @param {string} optionValue - the value attribute of the option
 * @param {boolean} visible - can the user see this option?
 * @param {boolean} editable - can the user select it? (only relevant if visible)
 */
export function updateProfileControlOption(profileName, sectionKey, controlKey, optionValue, visible, editable) {
  if (!_loadedProfiles || !_loadedProfiles.profiles[profileName]) {
    return false;
  }

  var profile = _loadedProfiles.profiles[profileName];
  if (!profile.sections) profile.sections = {};
  if (!profile.sections[sectionKey]) profile.sections[sectionKey] = { visible: true, controls: {} };
  if (!profile.sections[sectionKey].controls) profile.sections[sectionKey].controls = {};
  if (!profile.sections[sectionKey].controls[controlKey]) {
    profile.sections[sectionKey].controls[controlKey] = { visible: true, editable: true, options: {} };
  }
  if (!profile.sections[sectionKey].controls[controlKey].options) {
    profile.sections[sectionKey].controls[controlKey].options = {};
  }

  profile.sections[sectionKey].controls[controlKey].options[optionValue] = {
    visible: visible,
    editable: editable !== false
  };

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
