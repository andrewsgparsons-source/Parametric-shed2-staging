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
  enableAllControls,
  hideSection,
  showSection,
  createProfile,
  deleteProfile,
  renameProfile,
  updateProfileControl,
  updateProfileControlOption,
  updateProfileSection,
  exportProfilesToJson,
  importProfilesFromJson,
  copyProfileUrlToClipboard,
  copyViewerUrlToClipboard
} from "./profiles.js";

// Current selected profile in editor
var currentEditorProfile = null;

// Store reference for applying defaults
var _store = null;

/**
 * Initialize the Profile Editor and Live Toggles
 * @param {object} options - { store, skipLoadProfiles }
 */
export function initProfileEditor(options) {
  _store = options && options.store;

  // If profiles are already loaded (skipLoadProfiles=true), just render the UI
  // Otherwise load profiles first (for standalone initialization)
  if (options && options.skipLoadProfiles) {
    console.log("[profile-editor] Skipping loadProfiles - using already loaded data");
    renderProfileEditorUI();
    renderProfileLinkButtons();
    wireEditorEvents();
  } else {
    // Load profiles first
    loadProfiles().then(function() {
      renderProfileEditorUI();
      renderProfileLinkButtons();
      wireEditorEvents();
    });
  }
}

/**
 * Populate the share link dropdown with available profiles
 */
function renderProfileLinkButtons() {
  var select = document.getElementById("shareLinkProfileSelect");
  if (!select) {
    console.warn("[profile-editor] shareLinkProfileSelect not found");
    return;
  }

  // Clear existing options except the first (viewer)
  select.innerHTML = '<option value="viewer">Viewer (read-only)</option>';

  var profileNames = getProfileNames();
  console.log("[profile-editor] renderProfileLinkButtons - profileNames:", profileNames);

  for (var i = 0; i < profileNames.length; i++) {
    var profileName = profileNames[i];

    // Skip "viewer" - already added as first option
    if (profileName === "viewer") continue;

    var profile = getProfileByName(profileName);
    var label = profile && profile.label ? profile.label : profileName;

    var option = document.createElement("option");
    option.value = profileName;
    option.textContent = label;
    select.appendChild(option);
  }

  // Wire up the copy button
  var copyBtn = document.getElementById("copyShareLinkBtn");
  if (copyBtn && !copyBtn._wired) {
    copyBtn._wired = true;
    copyBtn.addEventListener("click", handleCopyShareLink);
  }

  console.log("[profile-editor] Populated share link dropdown with", profileNames.length, "profiles");
}

/**
 * Handle click on "Copy Link" button - copies link for selected profile
 */
function handleCopyShareLink() {
  var select = document.getElementById("shareLinkProfileSelect");
  if (!select || !_store) {
    console.error("[profile-editor] handleCopyShareLink: select or _store missing");
    return;
  }

  var profileName = select.value;
  var state = _store.getState();

  var profile = getProfileByName(profileName);
  var label = profile && profile.label ? profile.label : profileName;

  // Use viewer URL format for "viewer" profile, profile URL for others
  if (profileName === "viewer") {
    copyViewerUrlToClipboard(
      state,
      function(url) {
        showShareLinkHint(label + " link copied!", "#2a7d2a");
        console.log("[profile-editor] Copied viewer URL:", url);
      },
      function(err) {
        showShareLinkHint("Failed to copy link", "#d32f2f");
        console.error("[profile-editor] Failed to copy viewer URL:", err);
      }
    );
  } else {
    copyProfileUrlToClipboard(
      profileName,
      state,
      function(url) {
        showShareLinkHint(label + " link copied!", "#2a7d2a");
        console.log("[profile-editor] Copied " + label + " URL:", url);
      },
      function(err) {
        showShareLinkHint("Failed to copy link", "#d32f2f");
        console.error("[profile-editor] Failed to copy " + label + " URL:", err);
      }
    );
  }
}

/**
 * Show a hint message in the share link area
 */
function showShareLinkHint(message, color) {
  var hintEl = document.getElementById("instancesHint");
  if (hintEl) {
    hintEl.textContent = message;
    hintEl.style.color = color || "";
    setTimeout(function() {
      hintEl.textContent = "";
      hintEl.style.color = "";
    }, 3000);
  }
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

    // Select admin profile by default, or first profile if admin doesn't exist
    if (!currentEditorProfile || profileNames.indexOf(currentEditorProfile) < 0) {
      if (profileNames.indexOf("admin") >= 0) {
        currentEditorProfile = "admin";
      } else {
        currentEditorProfile = profileNames[0];
      }
    }
    select.value = currentEditorProfile;

    // Show which profile is active
    var activeHint = document.getElementById("profileActiveHint");
    if (activeHint && currentEditorProfile) {
      var profile = getProfileByName(currentEditorProfile);
      var label = profile && profile.label ? profile.label : currentEditorProfile;
      activeHint.textContent = "Active: " + label;
      activeHint.style.color = "#1976d2";
      activeHint.style.fontWeight = "bold";
    }
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
    var sectionVisible = profileSection.visible !== false;

    for (var j = 0; j < controlKeys.length; j++) {
      var controlKey = controlKeys[j];
      var registryControl = registrySection.controls[controlKey];
      var profileControl = (profileSection.controls || {})[controlKey] || { visible: true, editable: true };

      var controlRow = document.createElement("div");
      controlRow.style.display = "flex";
      controlRow.style.alignItems = "center";
      controlRow.style.justifyContent = "space-between";
      controlRow.style.marginBottom = "4px";
      controlRow.style.fontSize = "12px";

      // Control label
      var labelSpan = document.createElement("span");
      labelSpan.style.flex = "1";
      labelSpan.textContent = registryControl.label;
      controlRow.appendChild(labelSpan);

      // Visible checkbox
      var visibleLabel = document.createElement("label");
      visibleLabel.className = "check";
      visibleLabel.style.marginRight = "12px";
      visibleLabel.style.fontSize = "11px";

      var visibleCheckbox = document.createElement("input");
      visibleCheckbox.type = "checkbox";
      // When section is hidden, show as unchecked for tidiness
      visibleCheckbox.checked = sectionVisible && profileControl.visible !== false;
      // Disable control checkboxes when section is hidden
      visibleCheckbox.disabled = !sectionVisible;
      visibleCheckbox.dataset.sectionKey = sectionKey;
      visibleCheckbox.dataset.controlKey = controlKey;
      visibleCheckbox.dataset.field = "visible";
      visibleCheckbox.addEventListener("change", handleControlVisibilityChange);

      visibleLabel.appendChild(visibleCheckbox);
      visibleLabel.appendChild(document.createTextNode(" Visible"));
      controlRow.appendChild(visibleLabel);

      // Editable checkbox
      var editableLabel = document.createElement("label");
      editableLabel.className = "check";
      editableLabel.style.fontSize = "11px";

      var editableCheckbox = document.createElement("input");
      editableCheckbox.type = "checkbox";
      // When section or control is hidden, show as unchecked for tidiness
      var controlEffectivelyVisible = sectionVisible && profileControl.visible !== false;
      editableCheckbox.checked = controlEffectivelyVisible && profileControl.editable !== false;
      // Disable if section is hidden OR control is not visible
      editableCheckbox.disabled = !controlEffectivelyVisible;
      editableCheckbox.dataset.sectionKey = sectionKey;
      editableCheckbox.dataset.controlKey = controlKey;
      editableCheckbox.dataset.field = "editable";
      editableCheckbox.addEventListener("change", handleControlEditableChange);

      editableLabel.appendChild(editableCheckbox);
      editableLabel.appendChild(document.createTextNode(" Editable"));
      controlRow.appendChild(editableLabel);

      content.appendChild(controlRow);

      // If this control has options (select/dropdown), show option-level controls
      if (registryControl.options && registryControl.options.length > 0) {
        var optionsContainer = document.createElement("div");
        optionsContainer.style.marginLeft = "20px";
        optionsContainer.style.marginBottom = "8px";
        optionsContainer.style.paddingLeft = "10px";
        optionsContainer.style.borderLeft = "2px solid #ddd";

        var optionsHeader = document.createElement("div");
        optionsHeader.style.fontSize = "11px";
        optionsHeader.style.color = "#666";
        optionsHeader.style.marginBottom = "4px";
        optionsHeader.textContent = "Options:";
        optionsContainer.appendChild(optionsHeader);

        // Get profile options config
        var profileOptions = profileControl.options || {};

        for (var k = 0; k < registryControl.options.length; k++) {
          var opt = registryControl.options[k];
          var profileOpt = profileOptions[opt.value] || { visible: true, editable: true };

          var optRow = document.createElement("div");
          optRow.style.display = "flex";
          optRow.style.alignItems = "center";
          optRow.style.justifyContent = "space-between";
          optRow.style.marginBottom = "2px";
          optRow.style.fontSize = "11px";

          var optLabel = document.createElement("span");
          optLabel.style.flex = "1";
          optLabel.textContent = opt.label;
          optRow.appendChild(optLabel);

          // Option visible checkbox
          var optVisLabel = document.createElement("label");
          optVisLabel.className = "check";
          optVisLabel.style.marginRight = "8px";

          var optVisCheck = document.createElement("input");
          optVisCheck.type = "checkbox";
          // When section or control is hidden, show as unchecked for tidiness
          optVisCheck.checked = controlEffectivelyVisible && profileOpt.visible !== false;
          // Disable if section or control is hidden
          optVisCheck.disabled = !controlEffectivelyVisible;
          optVisCheck.dataset.sectionKey = sectionKey;
          optVisCheck.dataset.controlKey = controlKey;
          optVisCheck.dataset.optionValue = opt.value;
          optVisCheck.dataset.field = "visible";
          optVisCheck.addEventListener("change", handleOptionVisibilityChange);

          optVisLabel.appendChild(optVisCheck);
          optVisLabel.appendChild(document.createTextNode(" Vis"));
          optRow.appendChild(optVisLabel);

          // Option editable checkbox
          var optEditLabel = document.createElement("label");
          optEditLabel.className = "check";

          var optEditCheck = document.createElement("input");
          optEditCheck.type = "checkbox";
          // When section, control, or option is hidden, show as unchecked for tidiness
          var optionEffectivelyVisible = controlEffectivelyVisible && profileOpt.visible !== false;
          optEditCheck.checked = optionEffectivelyVisible && profileOpt.editable !== false;
          // Disable if section, control, or option is not visible
          optEditCheck.disabled = !optionEffectivelyVisible;
          optEditCheck.dataset.sectionKey = sectionKey;
          optEditCheck.dataset.controlKey = controlKey;
          optEditCheck.dataset.optionValue = opt.value;
          optEditCheck.dataset.field = "editable";
          optEditCheck.addEventListener("change", handleOptionEditableChange);

          optEditLabel.appendChild(optEditCheck);
          optEditLabel.appendChild(document.createTextNode(" Edit"));
          optRow.appendChild(optEditLabel);

          optionsContainer.appendChild(optRow);
        }

        content.appendChild(optionsContainer);
      }
    }

    details.appendChild(content);
    container.appendChild(details);
  }
}

/**
 * Handle section visibility checkbox change
 */
function handleSectionVisibilityChange(e) {
  var sectionKey = e.target.dataset.sectionKey;
  var visible = e.target.checked;

  if (currentEditorProfile) {
    updateProfileSection(currentEditorProfile, sectionKey, visible);

    // Cascade to child control checkboxes - disable them when section is hidden
    var controlCheckboxes = document.querySelectorAll(
      'input[data-section-key="' + sectionKey + '"][data-control-key]'
    );
    for (var i = 0; i < controlCheckboxes.length; i++) {
      var checkbox = controlCheckboxes[i];
      checkbox.disabled = !visible;
      // Also visually uncheck when section is hidden (for tidiness)
      if (!visible) {
        checkbox.checked = false;
      }
    }

    // Also handle option checkboxes within this section
    var optionCheckboxes = document.querySelectorAll(
      'input[data-section-key="' + sectionKey + '"][data-option-value]'
    );
    for (var j = 0; j < optionCheckboxes.length; j++) {
      var optCheckbox = optionCheckboxes[j];
      optCheckbox.disabled = !visible;
      if (!visible) {
        optCheckbox.checked = false;
      }
    }

    // Re-apply profile to show changes immediately
    reapplyCurrentProfile();
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
    // Get existing editable value
    var profile = getProfileByName(currentEditorProfile);
    var editable = true;
    if (profile && profile.sections && profile.sections[sectionKey] &&
        profile.sections[sectionKey].controls && profile.sections[sectionKey].controls[controlKey]) {
      editable = profile.sections[sectionKey].controls[controlKey].editable !== false;
    }
    updateProfileControl(currentEditorProfile, sectionKey, controlKey, visible, editable);

    // Update the editable checkbox state (disable if not visible)
    var editableCheckbox = document.querySelector(
      'input[data-section-key="' + sectionKey + '"][data-control-key="' + controlKey + '"][data-field="editable"]'
    );
    if (editableCheckbox) {
      editableCheckbox.disabled = !visible;
      if (!visible) {
        editableCheckbox.checked = false;
      }
    }

    // Cascade to option checkboxes within this control
    var optionCheckboxes = document.querySelectorAll(
      'input[data-section-key="' + sectionKey + '"][data-control-key="' + controlKey + '"][data-option-value]'
    );
    for (var i = 0; i < optionCheckboxes.length; i++) {
      var optCheckbox = optionCheckboxes[i];
      optCheckbox.disabled = !visible;
      if (!visible) {
        optCheckbox.checked = false;
      }
    }

    // Re-apply profile to show changes immediately
    reapplyCurrentProfile();
  }
}

/**
 * Handle control editable checkbox change
 */
function handleControlEditableChange(e) {
  var sectionKey = e.target.dataset.sectionKey;
  var controlKey = e.target.dataset.controlKey;
  var editable = e.target.checked;

  if (currentEditorProfile) {
    // Get existing visibility
    var profile = getProfileByName(currentEditorProfile);
    var visible = true;
    if (profile && profile.sections && profile.sections[sectionKey] &&
        profile.sections[sectionKey].controls && profile.sections[sectionKey].controls[controlKey]) {
      visible = profile.sections[sectionKey].controls[controlKey].visible !== false;
    }
    updateProfileControl(currentEditorProfile, sectionKey, controlKey, visible, editable);

    // Re-apply profile to show changes immediately
    reapplyCurrentProfile();
  }
}

/**
 * Handle option visibility checkbox change
 */
function handleOptionVisibilityChange(e) {
  var sectionKey = e.target.dataset.sectionKey;
  var controlKey = e.target.dataset.controlKey;
  var optionValue = e.target.dataset.optionValue;
  var visible = e.target.checked;

  if (currentEditorProfile) {
    // Get existing editable value for this option
    var profile = getProfileByName(currentEditorProfile);
    var editable = true;
    if (profile && profile.sections && profile.sections[sectionKey] &&
        profile.sections[sectionKey].controls && profile.sections[sectionKey].controls[controlKey] &&
        profile.sections[sectionKey].controls[controlKey].options &&
        profile.sections[sectionKey].controls[controlKey].options[optionValue]) {
      editable = profile.sections[sectionKey].controls[controlKey].options[optionValue].editable !== false;
    }
    updateProfileControlOption(currentEditorProfile, sectionKey, controlKey, optionValue, visible, editable);

    // Update the editable checkbox state
    var editableCheckbox = document.querySelector(
      'input[data-section-key="' + sectionKey + '"][data-control-key="' + controlKey + '"][data-option-value="' + optionValue + '"][data-field="editable"]'
    );
    if (editableCheckbox) {
      editableCheckbox.disabled = !visible;
      if (!visible) {
        editableCheckbox.checked = false;
      }
    }

    // Re-apply profile to show changes immediately
    reapplyCurrentProfile();
  }
}

/**
 * Handle option editable checkbox change
 */
function handleOptionEditableChange(e) {
  var sectionKey = e.target.dataset.sectionKey;
  var controlKey = e.target.dataset.controlKey;
  var optionValue = e.target.dataset.optionValue;
  var editable = e.target.checked;

  if (currentEditorProfile) {
    // Get existing visibility for this option
    var profile = getProfileByName(currentEditorProfile);
    var visible = true;
    if (profile && profile.sections && profile.sections[sectionKey] &&
        profile.sections[sectionKey].controls && profile.sections[sectionKey].controls[controlKey] &&
        profile.sections[sectionKey].controls[controlKey].options &&
        profile.sections[sectionKey].controls[controlKey].options[optionValue]) {
      visible = profile.sections[sectionKey].controls[controlKey].options[optionValue].visible !== false;
    }
    updateProfileControlOption(currentEditorProfile, sectionKey, controlKey, optionValue, visible, editable);

    // Re-apply profile to show changes immediately
    reapplyCurrentProfile();
  }
}

/**
 * Wire up editor button events
 */
function wireEditorEvents() {
  // Profile selector change - automatically apply the selected profile
  var profileSelect = document.getElementById("profileEditorSelect");
  if (profileSelect) {
    profileSelect.addEventListener("change", function(e) {
      currentEditorProfile = e.target.value;
      renderProfileControls();

      // Automatically apply the selected profile to the UI
      applyProfile(currentEditorProfile, _store);

      // Refresh dynamic controls (doors, windows) to apply profile restrictions
      if (window.__dbg && typeof window.__dbg.refreshDynamicControls === "function") {
        window.__dbg.refreshDynamicControls();
      }

      // Update the hint to show which profile is active
      var activeHint = document.getElementById("profileActiveHint");
      if (activeHint) {
        var profile = getProfileByName(currentEditorProfile);
        var label = profile && profile.label ? profile.label : currentEditorProfile;
        activeHint.textContent = "Active: " + label;
        activeHint.style.color = "#1976d2";
        activeHint.style.fontWeight = "bold";
      }

      console.log("[profile-editor] Applied profile:", currentEditorProfile);
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

  // Reset profile button - resets current profile to "admin" state (all visible/editable)
  var resetBtn = document.getElementById("profileResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      if (!currentEditorProfile) {
        alert("Select a profile first");
        return;
      }

      var profile = getProfileByName(currentEditorProfile);
      var label = profile && profile.label ? profile.label : currentEditorProfile;

      if (confirm("Reset \"" + label + "\" profile to show all controls?\n\nThis will make all controls visible and editable, and save the change.")) {
        resetProfileToAdmin();

        // Re-apply the profile (which is now all visible/editable)
        applyProfile(currentEditorProfile, _store);

        // Refresh dynamic controls
        if (window.__dbg && typeof window.__dbg.refreshDynamicControls === "function") {
          window.__dbg.refreshDynamicControls();
        }

        alert("Profile \"" + label + "\" has been reset to show all controls.");
      }
    });
  }
}

/**
 * Re-apply the current profile to reflect changes in the UI
 * Called whenever a checkbox is toggled in the profile editor
 */
function reapplyCurrentProfile() {
  if (!currentEditorProfile) return;

  // Re-apply the profile to show changes immediately
  applyProfile(currentEditorProfile, _store);

  // Refresh dynamic controls (doors, windows) to apply profile restrictions
  if (window.__dbg && typeof window.__dbg.refreshDynamicControls === "function") {
    window.__dbg.refreshDynamicControls();
  }

  console.log("[profile-editor] Re-applied profile:", currentEditorProfile);
}

/**
 * Reset a profile to "admin" state (all visible, all editable) and SAVE it
 * Use this if you want to actually reset a profile's configuration
 */
function resetProfileToAdmin() {
  if (!currentEditorProfile) return;

  var container = document.getElementById("profileControlsContainer");
  if (!container) return;

  // Find and check all section visibility checkboxes
  var sectionCheckboxes = container.querySelectorAll('input[type="checkbox"][data-section-key]:not([data-control-key])');
  for (var i = 0; i < sectionCheckboxes.length; i++) {
    var checkbox = sectionCheckboxes[i];
    checkbox.checked = true;
    var sectionKey = checkbox.dataset.sectionKey;
    updateProfileSection(currentEditorProfile, sectionKey, true);
  }

  // Find and check all control checkboxes
  var controlCheckboxes = container.querySelectorAll('input[type="checkbox"][data-control-key]:not([data-option-value])');
  for (var j = 0; j < controlCheckboxes.length; j++) {
    var checkbox = controlCheckboxes[j];
    checkbox.checked = true;
    checkbox.disabled = false;
    var sectionKey = checkbox.dataset.sectionKey;
    var controlKey = checkbox.dataset.controlKey;
    updateProfileControl(currentEditorProfile, sectionKey, controlKey, true, true);
  }

  // Find and check all option checkboxes
  var optionCheckboxes = container.querySelectorAll('input[type="checkbox"][data-option-value]');
  for (var k = 0; k < optionCheckboxes.length; k++) {
    var checkbox = optionCheckboxes[k];
    checkbox.checked = true;
    checkbox.disabled = false;
    var sectionKey = checkbox.dataset.sectionKey;
    var controlKey = checkbox.dataset.controlKey;
    var optionValue = checkbox.dataset.optionValue;
    updateProfileControlOption(currentEditorProfile, sectionKey, controlKey, optionValue, true, true);
  }

  console.log("[profile-editor] Reset profile to admin state and saved:", currentEditorProfile);
}
