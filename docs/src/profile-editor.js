// FILE: docs/src/profile-editor.js
//
// Developer Dashboard: Live Toggles and Profile Editor UI
//

import {
  CONTROL_REGISTRY,
  loadProfiles,
  getProfileNames,
  getProfileByName,
  applyProfile,
  showAllControls,
  hideSection,
  showSection,
  createProfile,
  deleteProfile,
  renameProfile,
  updateProfileControl,
  updateProfileSection,
  exportProfilesToJson,
  importProfilesFromJson,
  copyProfileUrlToClipboard
} from "./profiles.js";

// Live toggle state (temporary, not persisted)
var liveToggleState = {};

// Current selected profile in editor
var currentEditorProfile = null;

// Store reference for applying defaults
var _store = null;

// Preview mode state
var isPreviewMode = false;

/**
 * Initialize the Profile Editor and Live Toggles
 * @param {object} options - { store }
 */
export function initProfileEditor(options) {
  _store = options && options.store;

  // Load profiles first
  loadProfiles().then(function() {
    renderLiveTogglesUI();
    renderProfileEditorUI();
    renderProfileLinkButtons();
    wireEditorEvents();
  });
}

/**
 * Render "Copy [Profile] Link" buttons for each profile
 * These allow sharing links with specific profile controls
 */
function renderProfileLinkButtons() {
  var container = document.getElementById("profileLinksContainer");
  if (!container) return;

  container.innerHTML = "";

  var profileNames = getProfileNames();
  if (profileNames.length === 0) return;

  for (var i = 0; i < profileNames.length; i++) {
    var profileName = profileNames[i];

    // Skip "viewer" - it has a dedicated button with different URL format
    if (profileName === "viewer") continue;

    var profile = getProfileByName(profileName);
    var label = profile && profile.label ? profile.label : profileName;

    var row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "4px";

    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Copy " + label + " Link";
    button.dataset.profileName = profileName;
    button.addEventListener("click", handleCopyProfileLink);

    row.appendChild(button);
    container.appendChild(row);
  }
}

/**
 * Handle click on "Copy [Profile] Link" button
 */
function handleCopyProfileLink(e) {
  var profileName = e.target.dataset.profileName;
  if (!profileName || !_store) return;

  var state = _store.getState();
  var profile = getProfileByName(profileName);
  var label = profile && profile.label ? profile.label : profileName;

  copyProfileUrlToClipboard(
    profileName,
    state,
    function(url) {
      // Show success in hint area
      var hintEl = document.getElementById("instancesHint");
      if (hintEl) {
        hintEl.textContent = label + " link copied to clipboard!";
        hintEl.style.color = "#2a7d2a";
        setTimeout(function() {
          hintEl.textContent = "";
          hintEl.style.color = "";
        }, 3000);
      }
      console.log("[profile-editor] Copied " + label + " URL:", url);
    },
    function(err) {
      var hintEl = document.getElementById("instancesHint");
      if (hintEl) {
        hintEl.textContent = "Failed to copy link";
        hintEl.style.color = "#d32f2f";
      }
      console.error("[profile-editor] Failed to copy " + label + " URL:", err);
    }
  );
}

/**
 * Render Live Toggles UI
 */
function renderLiveTogglesUI() {
  var container = document.getElementById("liveTogglesPanel");
  if (!container) return;

  container.innerHTML = "";

  // Create a checkbox for each section in the registry
  var sectionKeys = Object.keys(CONTROL_REGISTRY);

  for (var i = 0; i < sectionKeys.length; i++) {
    var sectionKey = sectionKeys[i];
    var section = CONTROL_REGISTRY[sectionKey];

    // Skip developer section from live toggles (would hide the panel itself)
    if (sectionKey === "developer") continue;

    var row = document.createElement("div");
    row.className = "row";
    row.style.margin = "4px 0";

    var label = document.createElement("label");
    label.className = "check";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true; // Default to visible
    checkbox.dataset.sectionKey = sectionKey;

    checkbox.addEventListener("change", function(e) {
      var key = e.target.dataset.sectionKey;
      var visible = e.target.checked;
      liveToggleState[key] = visible;

      if (visible) {
        showSection(key);
      } else {
        hideSection(key);
      }
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + section.label));
    row.appendChild(label);
    container.appendChild(row);

    // Initialize state
    liveToggleState[sectionKey] = true;
  }
}

/**
 * Reset all live toggles to visible
 */
function resetLiveToggles() {
  var container = document.getElementById("liveTogglesPanel");
  if (!container) return;

  var checkboxes = container.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    cb.checked = true;
    var key = cb.dataset.sectionKey;
    if (key) {
      liveToggleState[key] = true;
      showSection(key);
    }
  });
}

/**
 * Render Profile Editor UI
 */
function renderProfileEditorUI() {
  populateProfileSelect();
  renderProfileControls();
}

/**
 * Populate the profile selector dropdown
 */
function populateProfileSelect() {
  var select = document.getElementById("profileEditorSelect");
  if (!select) return;

  select.innerHTML = "";

  var profileNames = getProfileNames();

  if (profileNames.length === 0) {
    var opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(No profiles)";
    select.appendChild(opt);
    currentEditorProfile = null;
  } else {
    for (var i = 0; i < profileNames.length; i++) {
      var name = profileNames[i];
      var profile = getProfileByName(name);
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = profile.label || name;
      select.appendChild(opt);
    }

    // Select first profile
    if (!currentEditorProfile || profileNames.indexOf(currentEditorProfile) < 0) {
      currentEditorProfile = profileNames[0];
    }
    select.value = currentEditorProfile;
  }
}

/**
 * Render the control visibility checkboxes for current profile
 */
function renderProfileControls() {
  var container = document.getElementById("profileControlsContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!currentEditorProfile) {
    container.innerHTML = '<p class="hint">Select or create a profile to edit</p>';
    return;
  }

  var profile = getProfileByName(currentEditorProfile);
  if (!profile) {
    container.innerHTML = '<p class="hint">Profile not found</p>';
    return;
  }

  var sections = profile.sections || {};

  // Create a collapsible section for each registry section
  var sectionKeys = Object.keys(CONTROL_REGISTRY);

  for (var i = 0; i < sectionKeys.length; i++) {
    var sectionKey = sectionKeys[i];
    var registrySection = CONTROL_REGISTRY[sectionKey];
    var profileSection = sections[sectionKey] || { visible: true, controls: {} };

    var details = document.createElement("details");
    details.style.marginBottom = "8px";
    details.style.border = "1px solid #ddd";
    details.style.borderRadius = "4px";
    details.style.padding = "4px 8px";

    var summary = document.createElement("summary");
    summary.style.cursor = "pointer";
    summary.style.fontWeight = "bold";
    summary.style.fontSize = "12px";
    summary.textContent = registrySection.label;
    details.appendChild(summary);

    var content = document.createElement("div");
    content.style.paddingTop = "8px";

    // Section visibility toggle
    var sectionRow = document.createElement("div");
    sectionRow.className = "row";
    sectionRow.style.marginBottom = "8px";
    sectionRow.style.paddingBottom = "8px";
    sectionRow.style.borderBottom = "1px solid #eee";

    var sectionLabel = document.createElement("label");
    sectionLabel.className = "check";

    var sectionCheckbox = document.createElement("input");
    sectionCheckbox.type = "checkbox";
    sectionCheckbox.checked = profileSection.visible !== false;
    sectionCheckbox.dataset.sectionKey = sectionKey;
    sectionCheckbox.addEventListener("change", handleSectionVisibilityChange);

    sectionLabel.appendChild(sectionCheckbox);
    sectionLabel.appendChild(document.createTextNode(" Show entire section"));
    sectionRow.appendChild(sectionLabel);
    content.appendChild(sectionRow);

    // Individual control toggles
    var controlKeys = Object.keys(registrySection.controls);

    for (var j = 0; j < controlKeys.length; j++) {
      var controlKey = controlKeys[j];
      var registryControl = registrySection.controls[controlKey];
      var profileControl = (profileSection.controls || {})[controlKey] || { visible: true };

      var controlRow = document.createElement("div");
      controlRow.style.display = "flex";
      controlRow.style.alignItems = "center";
      controlRow.style.justifyContent = "space-between";
      controlRow.style.marginBottom = "4px";
      controlRow.style.fontSize = "12px";

      var controlLabel = document.createElement("label");
      controlLabel.className = "check";
      controlLabel.style.flex = "1";

      var controlCheckbox = document.createElement("input");
      controlCheckbox.type = "checkbox";
      controlCheckbox.checked = profileControl.visible !== false;
      controlCheckbox.dataset.sectionKey = sectionKey;
      controlCheckbox.dataset.controlKey = controlKey;
      controlCheckbox.addEventListener("change", handleControlVisibilityChange);

      controlLabel.appendChild(controlCheckbox);
      controlLabel.appendChild(document.createTextNode(" " + registryControl.label));
      controlRow.appendChild(controlLabel);

      // Default value input (for non-button controls)
      // Include dynamic-field controls that have meaningful defaults (not buttons)
      var skipTypes = ["button", "button-group", "dynamic-container"];
      var isButtonField = registryControl.type === "dynamic-field" &&
          (registryControl.fieldKey && (registryControl.fieldKey.endsWith(".snapBtn") ||
           registryControl.fieldKey.endsWith(".removeBtn")));

      if (skipTypes.indexOf(registryControl.type) < 0 && !isButtonField) {
        var defaultInput = createDefaultInput(registryControl, profileControl, sectionKey, controlKey);
        if (defaultInput) {
          controlRow.appendChild(defaultInput);
        }
      }

      content.appendChild(controlRow);
    }

    details.appendChild(content);
    container.appendChild(details);
  }
}

/**
 * Create a default value input for a control
 */
function createDefaultInput(registryControl, profileControl, sectionKey, controlKey) {
  var wrapper = document.createElement("span");
  wrapper.style.marginLeft = "8px";
  wrapper.style.fontSize = "11px";

  var label = document.createElement("span");
  label.textContent = "Default: ";
  label.style.color = "#666";
  wrapper.appendChild(label);

  var input;
  var currentDefault = profileControl.default !== undefined ? profileControl.default : registryControl.defaultValue;

  // Determine input type - for dynamic-field controls, infer from fieldKey
  var inputType = registryControl.type;
  if (registryControl.type === "dynamic-field" && registryControl.fieldKey) {
    inputType = inferDynamicFieldType(registryControl.fieldKey);
  }

  if (inputType === "select" || inputType === "dynamic-select") {
    input = document.createElement("select");
    input.style.fontSize = "11px";
    input.style.padding = "2px";

    // For static selects, get options from DOM
    if (registryControl.elementIds && registryControl.elementIds[0]) {
      var elementId = registryControl.elementIds[0];
      var domSelect = document.getElementById(elementId);
      if (domSelect) {
        for (var i = 0; i < domSelect.options.length; i++) {
          var opt = document.createElement("option");
          opt.value = domSelect.options[i].value;
          opt.textContent = domSelect.options[i].textContent;
          input.appendChild(opt);
        }
      }
    } else if (registryControl.fieldKey) {
      // For dynamic selects, provide options based on fieldKey
      var options = getDynamicFieldOptions(registryControl.fieldKey);
      for (var i = 0; i < options.length; i++) {
        var opt = document.createElement("option");
        opt.value = options[i].value;
        opt.textContent = options[i].label;
        input.appendChild(opt);
      }
    }
    input.value = currentDefault || "";
  } else if (inputType === "number") {
    input = document.createElement("input");
    input.type = "number";
    input.style.width = "60px";
    input.style.fontSize = "11px";
    input.style.padding = "2px";
    input.value = currentDefault || "";
  } else if (inputType === "checkbox") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!currentDefault;
  } else {
    // Text input fallback
    input = document.createElement("input");
    input.type = "text";
    input.style.width = "60px";
    input.style.fontSize = "11px";
    input.style.padding = "2px";
    input.value = currentDefault || "";
  }

  input.dataset.sectionKey = sectionKey;
  input.dataset.controlKey = controlKey;
  input.addEventListener("change", handleDefaultValueChange);

  wrapper.appendChild(input);
  return wrapper;
}

/**
 * Infer the input type for a dynamic field based on its fieldKey
 * @param {string} fieldKey - e.g., "door.wall", "door.x", "door.open"
 * @returns {string} Input type: "select", "number", "checkbox", "text"
 */
function inferDynamicFieldType(fieldKey) {
  // Fields that are selects
  var selectFields = [
    "door.wall", "door.style", "door.hinge",
    "window.wall", "window.style",
    "divider.axis",
    "attachment.type", "attachment.wall"
  ];

  // Fields that are numbers
  var numberFields = [
    "door.x", "door.width", "door.height",
    "window.x", "window.y", "window.width", "window.height",
    "divider.position",
    "attachment.width", "attachment.depth", "attachment.offset"
  ];

  // Fields that are checkboxes
  var checkboxFields = ["door.open"];

  if (selectFields.indexOf(fieldKey) >= 0) {
    return "dynamic-select";
  }
  if (numberFields.indexOf(fieldKey) >= 0) {
    return "number";
  }
  if (checkboxFields.indexOf(fieldKey) >= 0) {
    return "checkbox";
  }

  return "text";
}

/**
 * Get options for a dynamic select field
 * @param {string} fieldKey
 * @returns {Array<{value: string, label: string}>}
 */
function getDynamicFieldOptions(fieldKey) {
  var options = {
    "door.wall": [
      { value: "front", label: "Front" },
      { value: "back", label: "Back" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" }
    ],
    "door.style": [
      { value: "single", label: "Single" },
      { value: "double", label: "Double" },
      { value: "sliding", label: "Sliding" }
    ],
    "door.hinge": [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" }
    ],
    "window.wall": [
      { value: "front", label: "Front" },
      { value: "back", label: "Back" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" }
    ],
    "window.style": [
      { value: "fixed", label: "Fixed" },
      { value: "sliding", label: "Sliding" },
      { value: "casement", label: "Casement" }
    ],
    "divider.axis": [
      { value: "x", label: "Front-Back (X)" },
      { value: "z", label: "Left-Right (Z)" }
    ],
    "attachment.type": [
      { value: "lean-to", label: "Lean-to" },
      { value: "canopy", label: "Canopy" }
    ],
    "attachment.wall": [
      { value: "front", label: "Front" },
      { value: "back", label: "Back" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" }
    ]
  };

  return options[fieldKey] || [];
}

/**
 * Handle section visibility checkbox change
 */
function handleSectionVisibilityChange(e) {
  var sectionKey = e.target.dataset.sectionKey;
  var visible = e.target.checked;

  if (currentEditorProfile) {
    updateProfileSection(currentEditorProfile, sectionKey, visible);
  }
}

/**
 * Handle control visibility checkbox change
 */
function handleControlVisibilityChange(e) {
  var sectionKey = e.target.dataset.sectionKey;
  var controlKey = e.target.dataset.controlKey;
  var visible = e.target.checked;

  if (currentEditorProfile) {
    // Get existing default value if any
    var profile = getProfileByName(currentEditorProfile);
    var existingDefault;
    if (profile && profile.sections && profile.sections[sectionKey] &&
        profile.sections[sectionKey].controls && profile.sections[sectionKey].controls[controlKey]) {
      existingDefault = profile.sections[sectionKey].controls[controlKey].default;
    }
    updateProfileControl(currentEditorProfile, sectionKey, controlKey, visible, existingDefault);
  }
}

/**
 * Handle default value input change
 */
function handleDefaultValueChange(e) {
  var sectionKey = e.target.dataset.sectionKey;
  var controlKey = e.target.dataset.controlKey;
  var value;

  if (e.target.type === "checkbox") {
    value = e.target.checked;
  } else if (e.target.type === "number") {
    value = e.target.value ? parseInt(e.target.value, 10) : undefined;
  } else {
    value = e.target.value || undefined;
  }

  if (currentEditorProfile) {
    // Get existing visibility
    var profile = getProfileByName(currentEditorProfile);
    var visible = true;
    if (profile && profile.sections && profile.sections[sectionKey] &&
        profile.sections[sectionKey].controls && profile.sections[sectionKey].controls[controlKey]) {
      visible = profile.sections[sectionKey].controls[controlKey].visible !== false;
    }
    updateProfileControl(currentEditorProfile, sectionKey, controlKey, visible, value);
  }
}

/**
 * Wire up editor button events
 */
function wireEditorEvents() {
  // Reset live toggles
  var resetBtn = document.getElementById("resetLiveTogglesBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      resetLiveToggles();
    });
  }

  // Profile selector change
  var profileSelect = document.getElementById("profileEditorSelect");
  if (profileSelect) {
    profileSelect.addEventListener("change", function(e) {
      currentEditorProfile = e.target.value;
      renderProfileControls();

      // If in preview mode, update the preview to show the newly selected profile
      if (isPreviewMode) {
        applyProfile(currentEditorProfile);
        var previewHint = document.getElementById("profilePreviewHint");
        if (previewHint) {
          var profile = getProfileByName(currentEditorProfile);
          var label = profile && profile.label ? profile.label : currentEditorProfile;
          previewHint.textContent = "Previewing: " + label + " profile";
        }
        console.log("[profile-editor] Updated preview to:", currentEditorProfile);
      }
    });
  }

  // New profile
  var newBtn = document.getElementById("profileNewBtn");
  if (newBtn) {
    newBtn.addEventListener("click", function() {
      var name = prompt("Enter profile name (lowercase, no spaces):");
      if (!name) return;
      name = name.toLowerCase().replace(/\s+/g, "_");

      var label = prompt("Enter display label:", name);
      if (!label) label = name;

      if (createProfile(name, label)) {
        currentEditorProfile = name;
        populateProfileSelect();
        renderProfileControls();
        renderProfileLinkButtons();
      } else {
        alert("Failed to create profile. Name may already exist.");
      }
    });
  }

  // Rename profile
  var renameBtn = document.getElementById("profileRenameBtn");
  if (renameBtn) {
    renameBtn.addEventListener("click", function() {
      if (!currentEditorProfile) {
        alert("Select a profile first");
        return;
      }

      var newName = prompt("Enter new name (lowercase, no spaces):", currentEditorProfile);
      if (!newName) return;
      newName = newName.toLowerCase().replace(/\s+/g, "_");

      var profile = getProfileByName(currentEditorProfile);
      var currentLabel = profile ? profile.label : currentEditorProfile;
      var newLabel = prompt("Enter display label:", currentLabel);

      if (renameProfile(currentEditorProfile, newName, newLabel)) {
        currentEditorProfile = newName;
        populateProfileSelect();
        renderProfileControls();
        renderProfileLinkButtons();
      } else {
        alert("Failed to rename profile.");
      }
    });
  }

  // Delete profile
  var deleteBtn = document.getElementById("profileDeleteBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function() {
      if (!currentEditorProfile) {
        alert("Select a profile first");
        return;
      }

      if (!confirm("Delete profile '" + currentEditorProfile + "'?")) return;

      if (deleteProfile(currentEditorProfile)) {
        currentEditorProfile = null;
        populateProfileSelect();
        renderProfileControls();
        renderProfileLinkButtons();
      } else {
        alert("Failed to delete profile.");
      }
    });
  }

  // Export JSON
  var exportBtn = document.getElementById("profileExportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function() {
      exportProfilesToJson();
    });
  }

  // Import JSON
  var importBtn = document.getElementById("profileImportBtn");
  if (importBtn) {
    importBtn.addEventListener("click", function() {
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";

      fileInput.addEventListener("change", function(e) {
        var file = e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function(ev) {
          if (importProfilesFromJson(ev.target.result)) {
            currentEditorProfile = null;
            populateProfileSelect();
            renderProfileControls();
            renderProfileLinkButtons();
            alert("Profiles imported successfully");
          } else {
            alert("Failed to import profiles. Check file format.");
          }
        };
        reader.readAsText(file);
      });

      fileInput.click();
    });
  }

  // Preview profile button
  var previewBtn = document.getElementById("profilePreviewBtn");
  var revertBtn = document.getElementById("profileRevertBtn");
  var previewHint = document.getElementById("profilePreviewHint");

  if (previewBtn) {
    previewBtn.addEventListener("click", function() {
      if (!currentEditorProfile) {
        alert("Select a profile first");
        return;
      }

      // Apply the selected profile to see what it looks like
      applyProfile(currentEditorProfile);
      isPreviewMode = true;

      // Update UI
      previewBtn.style.display = "none";
      if (revertBtn) revertBtn.style.display = "inline-block";
      if (previewHint) {
        var profile = getProfileByName(currentEditorProfile);
        var label = profile && profile.label ? profile.label : currentEditorProfile;
        previewHint.textContent = "Previewing: " + label + " profile";
        previewHint.style.color = "#1976d2";
        previewHint.style.fontWeight = "bold";
      }

      console.log("[profile-editor] Previewing profile:", currentEditorProfile);
    });
  }

  if (revertBtn) {
    revertBtn.addEventListener("click", function() {
      // Revert to admin view (show all controls)
      showAllControls();
      isPreviewMode = false;

      // Update UI
      revertBtn.style.display = "none";
      if (previewBtn) previewBtn.style.display = "inline-block";
      if (previewHint) {
        previewHint.textContent = "";
        previewHint.style.color = "";
        previewHint.style.fontWeight = "";
      }

      console.log("[profile-editor] Reverted to admin view");
    });
  }
}
