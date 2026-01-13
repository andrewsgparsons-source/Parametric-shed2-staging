// FILE: docs/src/instances.js
//
// Simplified preset/instance management:
// - Built-in presets (read-only, from ../instances.js)
// - Export current state to JSON file
// - Import state from JSON file
// - Developer mode: copy state to clipboard for creating new presets
//

import { DEFAULTS } from "./params.js";
import { getBuiltInPresets, getDefaultBuiltInPresetId, findBuiltInPresetById } from "../instances.js";

export function initInstancesUI({ store, ids, dbg }) {
  function $(id) { return document.getElementById(id); }

  // ---- DOM Elements ----
  var presetSelectEl = $(ids.presetSelect || ids.instanceSelect);
  var loadPresetBtnEl = $(ids.loadPresetBtn || ids.loadInstanceBtn);
  var exportBtnEl = $(ids.exportBtn);
  var importBtnEl = $(ids.importBtn);
  var devModeCheckEl = $(ids.devModeCheck);
  var devPanelEl = $(ids.devPanel);
  var copyStateBtnEl = $(ids.copyStateBtn);
  var hintEl = $(ids.hint || ids.instancesHint);

  // Hidden file input for import
  var fileInputEl = null;

  // ---- Utilities ----
  function setHint(msg) {
    if (hintEl) hintEl.textContent = msg || "";
  }

  function cloneJson(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
  }

  function isPlainObject(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  function deepMerge(dst, src) {
    if (!isPlainObject(dst)) dst = {};
    if (!isPlainObject(src)) return dst;
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var sv = src[k];
      if (Array.isArray(sv)) {
        dst[k] = sv.slice();
      } else if (isPlainObject(sv)) {
        dst[k] = deepMerge(isPlainObject(dst[k]) ? dst[k] : {}, sv);
      } else {
        dst[k] = sv;
      }
    }
    return dst;
  }

  // ---- Preset Management ----
  function getPresets() {
    try {
      return getBuiltInPresets() || [];
    } catch (e) {
      return [];
    }
  }

  function populatePresetSelect() {
    if (!presetSelectEl) return;

    var presets = getPresets();
    presetSelectEl.innerHTML = "";

    // Group by category
    var categories = {};
    for (var i = 0; i < presets.length; i++) {
      var p = presets[i];
      var cat = p.category || "Other";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(p);
    }

    var catNames = Object.keys(categories).sort();
    
    for (var c = 0; c < catNames.length; c++) {
      var catName = catNames[c];
      var group = document.createElement("optgroup");
      group.label = catName;

      var items = categories[catName];
      for (var j = 0; j < items.length; j++) {
        var preset = items[j];
        var opt = document.createElement("option");
        opt.value = preset.id;
        opt.textContent = preset.name;
        if (preset.description) {
          opt.title = preset.description;
        }
        group.appendChild(opt);
      }
      presetSelectEl.appendChild(group);
    }

    // Select default
    var defaultId = getDefaultBuiltInPresetId();
    if (defaultId) {
      presetSelectEl.value = defaultId;
    }
  }

function applyState(stateObj) {
    // Deep merge onto DEFAULTS to ensure all required fields exist
    var baseline = cloneJson(DEFAULTS);
    var merged = deepMerge(baseline, cloneJson(stateObj || {}));
    
    // Replace entire state (not shallow merge)
    // We need to set each top-level key
    var keys = Object.keys(merged);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var patch = {};
      patch[k] = merged[k];
      store.setState(patch);
    }

    // Update sequence counters to avoid duplicate IDs
    // Scan existing openings and set counters above any existing IDs
    try {
      var openings = merged.walls && merged.walls.openings ? merged.walls.openings : [];
      var maxDoor = 0;
      var maxWin = 0;
      for (var j = 0; j < openings.length; j++) {
        var o = openings[j];
        if (!o || !o.id) continue;
        var id = String(o.id);
        var doorMatch = id.match(/^door(\d+)$/);
        var winMatch = id.match(/^win(\d+)$/);
        if (doorMatch) {
          var dn = parseInt(doorMatch[1], 10);
          if (dn > maxDoor) maxDoor = dn;
        }
        if (winMatch) {
          var wn = parseInt(winMatch[1], 10);
          if (wn > maxWin) maxWin = wn;
        }
      }
      if (window.__dbg) {
        window.__dbg.doorSeq = maxDoor + 1;
        window.__dbg.windowSeq = maxWin + 1;
      }
    } catch (e) {
      // Ignore errors in sequence update
    }
  }

  function loadPreset(presetId) {
    var preset = findBuiltInPresetById(presetId);
    if (!preset) {
      setHint("Preset not found: " + presetId);
      return false;
    }

    if (preset.state) {
      applyState(preset.state);
      setHint("Loaded: " + preset.name);
      return true;
    } else {
      setHint("Preset has no state data");
      return false;
    }
  }

  // ---- Export / Import ----
  function exportDesign() {
    try {
      var state = store.getState();
      var exportData = {
        _format: "shed-designer-v1",
        _exportedAt: new Date().toISOString(),
        state: cloneJson(state)
      };

      var json = JSON.stringify(exportData, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);

      var a = document.createElement("a");
      a.href = url;
      a.download = "shed-design-" + formatDateForFilename(new Date()) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setHint("Design exported");
    } catch (e) {
      setHint("Export failed: " + (e.message || e));
      if (dbg) dbg.lastError = "Export failed: " + String(e);
    }
  }

  function formatDateForFilename(d) {
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return yyyy + mm + dd + "-" + hh + min;
  }

  function importDesign(file) {
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var text = e.target.result;
        var data = JSON.parse(text);

        // Validate format
        if (!data || typeof data !== "object") {
          setHint("Invalid file format");
          return;
        }

        // Support both wrapped format and raw state
        var state = null;
        if (data._format === "shed-designer-v1" && data.state) {
          state = data.state;
        } else if (data.dim || data.walls || data.roof) {
          // Looks like raw state
          state = data;
        } else {
          setHint("Unrecognized file format");
          return;
        }

        applyState(state);
        setHint("Design imported from " + file.name);
      } catch (err) {
        setHint("Import failed: " + (err.message || err));
        if (dbg) dbg.lastError = "Import failed: " + String(err);
      }
    };

    reader.onerror = function() {
      setHint("Failed to read file");
    };

    reader.readAsText(file);
  }

  function createFileInput() {
    if (fileInputEl) return fileInputEl;

    fileInputEl = document.createElement("input");
    fileInputEl.type = "file";
    fileInputEl.accept = ".json,application/json";
    fileInputEl.style.display = "none";
    document.body.appendChild(fileInputEl);

    fileInputEl.addEventListener("change", function(e) {
      var files = e.target.files;
      if (files && files.length > 0) {
        importDesign(files[0]);
      }
      // Reset so same file can be selected again
      fileInputEl.value = "";
    });

    return fileInputEl;
  }

  // ---- Developer Mode ----
  function copyStateToClipboard() {
    try {
      var state = store.getState();
      
      // Create a clean state object suitable for pasting into presets
      var cleanState = cloneJson(state);
      
      // Remove transient/computed fields that shouldn't be in presets
      delete cleanState._noop;
      delete cleanState.invalidDoorIds;
      delete cleanState.invalidWindowIds;
      
      var json = JSON.stringify(cleanState, null, 2);
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(function() {
          setHint("State copied to clipboard!");
        }).catch(function(err) {
          fallbackCopy(json);
        });
      } else {
        fallbackCopy(json);
      }
    } catch (e) {
      setHint("Copy failed: " + (e.message || e));
    }
  }

  function fallbackCopy(text) {
    // Fallback for browsers without clipboard API
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      setHint("State copied to clipboard!");
    } catch (e) {
      setHint("Copy failed - check console");
      console.log("State JSON:", text);
    }
    document.body.removeChild(textarea);
  }

  function toggleDevMode(show) {
    if (devPanelEl) {
      devPanelEl.style.display = show ? "block" : "none";
    }
  }

  // ---- Wire Up Events ----
  function wireEvents() {
    // Load Preset button
    if (loadPresetBtnEl) {
      loadPresetBtnEl.addEventListener("click", function() {
        if (presetSelectEl) {
          var presetId = presetSelectEl.value;
          if (presetId) {
            loadPreset(presetId);
          }
        }
      });
    }

    // Preset select change - just update hint, don't auto-load
    if (presetSelectEl) {
      presetSelectEl.addEventListener("change", function() {
        var presetId = presetSelectEl.value;
        var preset = findBuiltInPresetById(presetId);
        if (preset && preset.description) {
          setHint(preset.description);
        } else if (preset) {
          setHint("Selected: " + preset.name);
        }
      });
    }

    // Export button
    if (exportBtnEl) {
      exportBtnEl.addEventListener("click", function() {
        exportDesign();
      });
    }

    // Import button
    if (importBtnEl) {
      importBtnEl.addEventListener("click", function() {
        var input = createFileInput();
        input.click();
      });
    }

    // Dev mode toggle
    if (devModeCheckEl) {
      devModeCheckEl.addEventListener("change", function(e) {
        toggleDevMode(e.target.checked);
      });
      // Initialize state
      toggleDevMode(devModeCheckEl.checked);
    }

    // Copy state button
    if (copyStateBtnEl) {
      copyStateBtnEl.addEventListener("click", function() {
        copyStateToClipboard();
      });
    }
  }

  // ---- Initialize ----
  function init() {
    populatePresetSelect();
    wireEvents();

    // Load default preset on startup
    var defaultId = getDefaultBuiltInPresetId();
    if (defaultId) {
      var preset = findBuiltInPresetById(defaultId);
      if (preset && preset.state) {
        applyState(preset.state);
        setHint("Loaded: " + preset.name);
      }
    }
  }

  // Run init
  try {
    init();
  } catch (e) {
    setHint("Initialization failed");
    if (dbg) dbg.lastError = "initInstancesUI failed: " + String(e);
  }
}
