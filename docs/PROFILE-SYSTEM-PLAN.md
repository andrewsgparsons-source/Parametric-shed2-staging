# Profile-Based UI System Implementation Plan

## Overview
Add a URL parameter-driven profile system with a **developer-only profile editor** that allows:
1. Creating and managing named profiles (customer, builder, etc.)
2. Per-control configuration: visibility toggle + default value when hidden
3. Profiles stored in a JSON file (version controllable)
4. URL parameter `?profile=name` loads and applies the profile

## Profile Definitions

### Identified Control Categories

Based on analysis of `docs/index.html`, here are all controls organized by logical grouping:

| Category | Control IDs | Description |
|----------|-------------|-------------|
| **Unit Mode** | `unitModeMetric`, `unitModeImperial` | Metric/Imperial toggle |
| **Dimensions** | `dimMode`, `wInput`, `dInput` | Dimension mode & basic size |
| **Roof Type** | `roofStyle` | Apex/Pent/Hipped selector |
| **Variant** | `wallsVariant` | Insulated/Basic |
| **Frame Gauge** | `wallSection` | Stud thickness (75x50, 100x50) |
| **Scene Views** | `snapPlanBtn`, `snapFrontBtn`, `snapBackBtn`, `snapLeftBtn`, `snapRightBtn` | Camera view buttons |
| **Doors** | `addDoorBtn`, `removeAllDoorsBtn`, `doorsList` | Door management |
| **Windows** | `addWindowBtn`, `removeAllWindowsBtn`, `windowsList` | Window management |
| **Internal Dividers** | `addDividerBtn`, `removeAllDividersBtn`, `dividersList` | Partition walls |
| **Apex Heights** | `roofApexEaveHeight`, `roofApexCrestHeight`, `roofApexTrussCount` | Apex-specific roof settings |
| **Pent Heights** | `roofMinHeight`, `roofMaxHeight` | Pent-specific roof settings |
| **Hipped Heights** | `roofHippedEaveHeight`, `roofHippedCrestHeight` | Hipped-specific roof settings |
| **Overhangs** | `roofOverUniform`, `roofOverFront`, `roofOverBack`, `roofOverLeft`, `roofOverRight` | Roof overhang settings |
| **Attachments** | `attachmentType`, `attachmentWall`, `attachmentWidth`, `attachmentDepth`, `attachmentOffset`, `addAttachmentBtn`, `removeAllAttachmentsBtn`, `attachmentsList` | Building attachments (lean-to) |
| **Visibility** | `vBaseAll`, `vWalls`, `vRoof`, `vCladding`, `vOpenings`, `vBase`, `vFrame`, `vIns`, `vDeck`, `vWallFront`, `vWallBack`, `vWallLeft`, `vWallRight`, `vRoofStructure`, `vRoofOsb`, `vRoofCovering` | Advanced visibility toggles |
| **Save/Load** | `instanceSelect`, `loadInstanceBtn`, `exportBtn`, `importBtn` | Preset & design management |
| **Developer** | `devModeCheck`, `devPanel`, `copyStateBtn` | Dev tools |

### Proposed Profile Assignments

```
customer:
  - Dimensions (wInput, dInput)
  - Roof Type (roofStyle) - Apex & Pent only, Hipped disabled with "coming soon"
  - Doors (addDoorBtn, removeAllDoorsBtn, doorsList)
  - Windows (addWindowBtn, removeAllWindowsBtn, windowsList)
  - Scene Views (all snap buttons)
  - Save/Load (exportBtn, importBtn)

builder:
  - Everything in customer, PLUS:
  - Unit Mode
  - Dimension Mode (dimMode)
  - Variant (wallsVariant)
  - Frame Gauge (wallSection)
  - Internal Dividers
  - Roof Heights (apex/pent/hipped based on roofStyle)
  - Overhangs
  - Presets (instanceSelect, loadInstanceBtn)
  - Hipped roof option enabled

admin (default, no parameter):
  - Everything visible (current behavior)
  - Includes: Attachments, Visibility toggles, Developer tools
```

**Special handling for roof type in customer profile:**
- Modify the `roofStyle` select to disable the "hipped" option
- Add "(coming soon)" text to the hipped option label

## Dimension Constraints

Each profile defines min/max values for width and depth:

| Profile | Width Min | Width Max | Depth Min | Depth Max |
|---------|-----------|-----------|-----------|-----------|
| customer | 1200mm | 3500mm | 1200mm | 6500mm |
| builder | 800mm | 5000mm | 800mm | 9000mm |
| admin | (no limits) | (no limits) | (no limits) | (no limits) |

**Enforcement:**
- Set `min` and `max` attributes on `wInput` and `dInput` elements
- Clamp values on blur if user types outside range
- Show validation message if value is outside bounds

## Restricted Options (Disabled + Tooltip)

For options that exist but are restricted for certain profiles:
- Add `disabled` attribute to the option/control
- Modify option text to include "(coming soon)" or similar
- Add `title` attribute for tooltip on hover

Example: Hipped roof for customers
- Option shows as: `Hipped (coming soon)`
- Option is disabled, greyed out
- Tooltip explains: "This option will be available in a future update"

## Implementation Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  profiles.json (stored in docs/)                            │
│  - Named profiles with control configs                      │
│  - Version controlled                                       │
└─────────────────────────────────────────────────────────────┘
           ↓ loaded by
┌─────────────────────────────────────────────────────────────┐
│  profiles.js (runtime module)                               │
│  - Loads profiles.json                                      │
│  - Applies profile from URL param                           │
│  - Provides API for profile editor                          │
└─────────────────────────────────────────────────────────────┘
           ↓ used by
┌─────────────────────────────────────────────────────────────┐
│  Profile Editor UI (in Developer panel)                     │
│  - Create/rename/delete profiles                            │
│  - For each control: visibility checkbox + default value    │
│  - Export updated profiles.json                             │
└─────────────────────────────────────────────────────────────┘
```

### New File: `docs/profiles.json`

```json
{
  "profiles": {
    "customer": {
      "label": "Customer",
      "controls": {
        "wInput": { "visible": true, "default": 3000 },
        "dInput": { "visible": true, "default": 4000 },
        "roofStyle": { "visible": true, "default": "apex" },
        "dimMode": { "visible": false, "default": "base" },
        "wallsVariant": { "visible": false, "default": "insulated" },
        ...
      }
    },
    "builder": { ... }
  },
  "defaultProfile": "admin"
}
```

### New File: `docs/src/profiles.js`

```javascript
// Profile system module
// - loadProfiles() - fetch profiles.json
// - getProfileFromUrl() - reads ?profile= parameter
// - applyProfile(name) - hides controls, sets defaults
// - getControlRegistry() - returns all configurable controls with metadata
// - exportProfiles(data) - downloads updated profiles.json

const CONTROL_REGISTRY = [
  { id: "wInput", label: "Width", section: "Size & Shape", type: "number" },
  { id: "dInput", label: "Depth", section: "Size & Shape", type: "number" },
  { id: "roofStyle", label: "Roof Type", section: "Size & Shape", type: "select",
    options: ["apex", "pent", "hipped"] },
  { id: "dimMode", label: "Dimension Mode", section: "Size & Shape", type: "select" },
  // ... all controls
];
```

### Profile Editor UI (in Developer panel)

Located in expanded Developer section when dev mode is enabled:

```
┌─────────────────────────────────────────────────────┐
│ Profile Editor                                       │
├─────────────────────────────────────────────────────┤
│ Profile: [customer ▼] [+ New] [Rename] [Delete]     │
├─────────────────────────────────────────────────────┤
│ ── Size & Shape ──────────────────────────────────  │
│ ☑ Width         Default: [3000    ]                 │
│ ☑ Depth         Default: [4000    ]                 │
│ ☑ Roof Type     Default: [apex ▼  ]                 │
│ ☐ Dimension Mode Default: [base ▼  ]                │
│ ☐ Variant       Default: [insulated ▼]              │
│ ☐ Frame Gauge   Default: [50x100 ▼]                 │
│                                                      │
│ ── Walls & Openings ──────────────────────────────  │
│ ☑ Doors         (dynamic - no default)              │
│ ☑ Windows       (dynamic - no default)              │
│ ☐ Internal Dividers (dynamic - no default)          │
│ ...                                                  │
├─────────────────────────────────────────────────────┤
│ [Export profiles.json] [Copy URL for this profile]  │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Hiding Strategy**: Hide the nearest `.row` parent to maintain clean layout

2. **Section Collapsing**: If all controls in a `<details>` section are hidden, hide the entire section

3. **Profile Storage**: JSON file in `docs/` folder - can be version controlled, edited manually if needed

4. **Default "admin" profile**: When no profile param or profile=admin, all controls visible (current behavior)

5. **Control Registry**: Hardcoded list of all configurable controls with metadata (label, type, section) - this drives the editor UI

## Files to Create/Modify

| File | Changes |
|------|---------|
| `docs/profiles.json` | **NEW** - Profile definitions data file |
| `docs/src/profiles.js` | **NEW** - Profile loading, application, and editor API |
| `docs/src/profile-editor.js` | **NEW** - Profile editor UI component |
| `docs/src/index.js` | Import profiles.js, call init early in `initApp()` |
| `docs/index.html` | Add profile editor section to Developer panel |

## Implementation Steps

1. **Create `docs/src/profiles.js`**
   - Define CONTROL_REGISTRY with all configurable controls
   - Implement `loadProfiles()` to fetch profiles.json
   - Implement `getProfileFromUrl()` to read URL param
   - Implement `applyProfile(name, store)` to hide controls and set defaults
   - Implement `exportProfiles(data)` to download JSON

2. **Create `docs/profiles.json`**
   - Initial profiles: customer, builder (admin is implicit - everything visible)
   - Based on the visibility matrix defined earlier

3. **Create `docs/src/profile-editor.js`**
   - Build editor UI dynamically from CONTROL_REGISTRY
   - Profile selector with create/rename/delete
   - Per-control: visibility checkbox + default value input
   - Wire up export button

4. **Update `docs/index.html`**
   - Add profile editor container in Developer panel

5. **Update `docs/src/index.js`**
   - Import and initialize profile system
   - Call `applyProfile()` early, before UI wiring

6. **Test**
   - Create/edit profiles in editor
   - Export and verify JSON
   - Test URL parameter loading

## Verification

**Profile Editor (Dev Mode):**
1. Enable dev mode - verify Profile Editor section appears
2. Create a new profile - verify it appears in dropdown
3. Toggle control visibility - verify checkbox state persists
4. Change default values - verify they persist
5. Export profiles.json - verify file downloads with correct structure
6. Rename/delete profile - verify operations work

**Profile Application:**
7. Open `index.html?profile=customer` - verify hidden controls are not visible
8. Verify hidden controls use their configured default values
9. Open `index.html?profile=builder` - verify different visibility
10. Open `index.html` (no param) - verify all controls visible (admin)

**Functionality with Profiles:**
11. Customer mode: Change visible controls - verify shed updates
12. Customer mode: Add door/window - verify functionality works
13. Reload page with profile param - verify state is consistent

## Initial Profile Configuration (profiles.json)

This is the **initial** configuration to ship with. You can modify these via the Profile Editor.

| Control Section | Customer | Builder | Admin |
|-----------------|:--------:|:-------:|:-----:|
| Unit Mode | - | Y | Y |
| Dimension Mode | - | Y | Y |
| Width/Depth | Y | Y | Y |
| Roof Type | Y | Y | Y |
| Variant | - | Y | Y |
| Frame Gauge | - | Y | Y |
| Scene Views | Y | Y | Y |
| Doors | Y | Y | Y |
| Windows | Y | Y | Y |
| Internal Dividers | - | Y | Y |
| Roof Heights | - | Y | Y |
| Overhangs | - | Y | Y |
| Attachments | - | - | Y |
| Appearance | - | - | Y |
| Visibility | - | - | Y |
| Presets | - | Y | Y |
| Export/Import | Y | Y | Y |
| Developer | - | - | Y |

**Note:** Admin profile is implicit (everything visible) - not stored in profiles.json.
