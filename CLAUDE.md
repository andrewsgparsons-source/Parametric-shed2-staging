# Parametric Shed 2 - Project Memory

## Project Overview
3D parametric shed/building configurator using Babylon.js with CSG (Constructive Solid Geometry) operations.

## Current Work (January 2025)

### Active Branch: `feature/building-attachments`

### Recently Completed: Internal Divider Panels

Added internal divider panels that partition the shed's internal space.

**Files created/modified:**
- `docs/src/elements/dividers.js` - NEW: 3D building logic for dividers
- `docs/src/params.js` - Added `dividers: { items: [] }` to DEFAULTS
- `docs/index.html` - Added UI controls in Walls & Openings section
- `docs/src/index.js` - Added state helpers, validation, UI rendering, event handlers

**Features implemented:**
- Both X-axis (front-to-back) and Z-axis (left-to-right) orientations
- Position validation (50mm min from walls, 200mm min between dividers)
- Door openings with full framing (jack studs, headers, cripple studs)
- Independent covering on each side (none, OSB 18mm, or cladding 20mm)
- CSG cutouts for door openings in covering panels

**Key functions in dividers.js:**
- `build3D(state, ctx, sectionContext)` - Main entry point
- `buildFrameAlongZ/X()` - Frame construction
- `addDoorFramingAlongZ/X()` - Door opening framing
- `addDividerCovering()` - OSB/cladding panels

**Key functions in index.js:**
- `getDividersFromState()`, `setDividers()`, `patchDividerById()`
- `validateDividers()` - Boundary and overlap validation
- `renderDividersUi()` - Dynamic UI generation
- `shiftDividerMeshes()` - Mesh positioning

### Previous Fixes
- Roof visibility: Fixed `sectionId` not being passed to `buildApex`/`buildPent` in roof.js
- Apex roof cladding clipping: Fixed `roofRootY_mm` calculation in walls.js
- State initialization: Use deep merge for preset loading

### Building Attachments (In Progress)
- UI controls added to index.html
- Event handlers in index.js for adding/removing attachments
- `renderMultiSectionMode()` function implemented
- Sections infrastructure in `sections.js`

## Architecture Notes

### Coordinate System
- X = width (left-right)
- Y = height (up)
- Z = depth (front-back)
- WALL_OVERHANG_MM = 25 (wall offset from frame)
- WALL_RISE_MM = 168 (Y offset from floor)

### Mesh Naming Conventions
- `wall-{wallId}-{part}` - Wall frame members
- `clad-{wallId}-{part}` - Cladding panels
- `divider-{divId}-{part}` - Divider frame members
- `roof-{part}` - Roof components

### State Structure
```javascript
state.dividers = {
  items: [{
    id: "div1",
    enabled: true,
    axis: "x" | "z",
    position_mm: number,
    coveringLeft: "none" | "osb" | "cladding",
    coveringRight: "none" | "osb" | "cladding",
    openings: [{ id, type: "door", position_mm, width_mm, height_mm }]
  }]
}
```

### Panel Resize Feature (In Progress)

**Goal:** Make the Controls panel resizable and maximizable for easier editing.

**Files created/modified:**
- `docs/src/ui/panel-resize.js` - NEW: Resize handle logic and maximize toggle
- `docs/src/ui/styles.css` - Added CSS for resize handles, `.has-height` flexbox layout, `.maximized` state
- `docs/index.html` - Added resize handles to `#controls`, moved `#viewSelect` into panel header

**What works:**
- Horizontal resize (drag right edge)
- Maximize button in panel header
- View selector moved into Controls panel header

**Known issue - scrollbar disappears on resize:**
The `.inner` scrollbar disappears when the panel is resized. Multiple approaches tried:
1. Pure CSS flexbox with `overflow-y: auto` - didn't work
2. CSS `overflow-y: scroll !important` - scrollbar shows but doesn't scroll
3. JavaScript-calculated `maxHeight` on `.inner` - still not scrolling

**Root cause (suspected):**
The flexbox chain (`#controls` → `#controlPanel` → `details` → `.inner`) may not be properly constraining heights. When `.has-height` class is added, the CSS switches to flexbox layout but the scroll context isn't established correctly.

**CSS classes:**
- `.has-height` - Added when panel has explicit height (via resize or maximize)
- `.maximized` - Full-screen mode
- `.resizing` - During active resize drag

**Key insight:**
For CSS scroll to work in flexbox, every ancestor in the chain needs:
- `display: flex; flex-direction: column`
- `flex: 1 1 0; min-height: 0` (allows shrinking below content)
- Only the scroll container gets `overflow-y: auto`

## Notes
- Many diagnostic logging commits in git history - may want to clean up before merging to main
- Dividers only render in main section (not in attachments) for now
- Panel resize scrolling issue still unresolved - may need fresh approach
