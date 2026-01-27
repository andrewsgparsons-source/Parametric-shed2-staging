// FILE: docs/src/sections.js
//
// Section Manager - handles multiple building sections (lean-to, L-wings, split-level)
// Only active when state.sections.enabled === true
// Zero impact on legacy single-building mode

/**
 * Get all building sections in build order
 * Returns array with main section + any attachments
 * In legacy mode (no sections), wraps existing state as single section
 */
export function getAllSections(state) {
  // Legacy mode: no sections defined or not enabled
  if (!state.sections?.enabled || !state.sections?.attachments?.length) {
    return [createLegacySection(state)];
  }

  // Multi-section mode: return main + attachments
  return [state.sections.main, ...(state.sections.attachments || [])];
}

/**
 * Create a virtual section from legacy state
 * Wraps current single-building state in section format for uniform handling
 */
function createLegacySection(state) {
  return {
    id: "main",
    type: "rectangular",
    dimensions: {
      w_mm: state.dim?.frameW_mm || 1800,
      d_mm: state.dim?.frameD_mm || 2400
    },
    position: { x_mm: 0, y_mm: 0, z_mm: 0 },
    roof: state.roof,
    walls: state.walls
  };
}

/**
 * Find a section by ID
 */
export function findSection(state, sectionId) {
  if (sectionId === "main" || !state.sections?.enabled) {
    if (state.sections?.main) {
      return state.sections.main;
    }
    return createLegacySection(state);
  }

  const attachments = state.sections?.attachments || [];
  return attachments.find(s => s.id === sectionId) || null;
}

/**
 * Calculate world position for a section
 * Main section is always at origin (0,0,0)
 * Attachments are positioned relative to their parent section
 */
export function getSectionWorldPosition(state, sectionId) {
  const section = findSection(state, sectionId);
  if (!section) return { x: 0, y: 0, z: 0 };

  // Main section always at origin
  if (section.id === "main" || !state.sections?.enabled) {
    return { x: 0, y: 0, z: 0 };
  }

  // Attachment: calculate position based on attachment config
  return calculateAttachmentPosition(state, section);
}

/**
 * Calculate position for an attached section
 * Returns world coordinates based on parent section and attachment config
 *
 * NEW SYSTEM (v2): Attachments snap to center of wall with offset from centerline
 * OLD SYSTEM (v1): Attachments use offset from corner (for backwards compatibility)
 */
function calculateAttachmentPosition(state, attachment) {
  // Check for new attachment system (attachTo.wall + offsetFromCenter_mm)
  if (attachment.attachTo?.wall && attachment.attachTo?.offsetFromCenter_mm !== undefined) {
    return calculateCenterSnapPosition(state, attachment);
  }

  // Legacy system: sectionId-based attachment
  if (!attachment.attachTo?.sectionId) return { x: 0, y: 0, z: 0 };

  const parent = findSection(state, attachment.attachTo.sectionId);
  if (!parent) return { x: 0, y: 0, z: 0 };

  const parentPos = parent.id === "main"
    ? { x: 0, y: 0, z: 0 }
    : getSectionWorldPosition(state, parent.id);

  const parentDims = getSectionDimensions(state, parent.id);
  const wallThk = 50; // From frame profile

  // Type-specific positioning
  if (attachment.type === "lean-to") {
    return calculateLeantoPosition(attachment, parentPos, parentDims, wallThk);
  }

  if (attachment.type === "l-wing") {
    return calculateLWingPosition(attachment, parentPos, parentDims, wallThk);
  }

  // Default: same position as parent
  return { ...parentPos };
}

/**
 * NEW: Calculate position for center-snap attachments
 * Attachment snaps to center of specified wall with offset from centerline
 */
function calculateCenterSnapPosition(state, attachment) {
  const attachWall = attachment.attachTo?.wall || "left";
  const offsetFromCenter = attachment.attachTo?.offsetFromCenter_mm || 0;
  const attWidth = attachment.dimensions?.width_mm || 1800;
  const attDepth = attachment.dimensions?.depth_mm || 1200;
  const levelOffset = attachment.base?.levelOffset_mm || 0;

  // Main building dimensions
  const mainW = state.dim?.frameW_mm || 1800;
  const mainD = state.dim?.frameD_mm || 2400;

  let x = 0, y = levelOffset, z = 0;

  switch (attachWall) {
    case "left":
      // Attachment extends outward from main building's left side
      x = -attDepth;
      z = (mainD / 2) - (attWidth / 2) + offsetFromCenter;
      break;

    case "right":
      // Attachment extends outward from main building's right side
      x = mainW;
      z = (mainD / 2) - (attWidth / 2) + offsetFromCenter;
      break;

    case "front":
      // Attachment extends outward from main building's front
      x = (mainW / 2) - (attWidth / 2) + offsetFromCenter;
      z = -attDepth;
      break;

    case "back":
      // Attachment extends outward from main building's back
      x = (mainW / 2) - (attWidth / 2) + offsetFromCenter;
      z = mainD;
      break;
  }

  return { x, y, z };
}

/**
 * Calculate position for lean-to attachment
 * Lean-to abuts one wall of parent building
 */
function calculateLeantoPosition(attachment, parentPos, parentDims, wallThk) {
  const { wall, offset_mm = 0 } = attachment.attachTo;
  const leantoD = attachment.dimensions?.d_mm || 1200;

  switch (wall) {
    case "back":
      return {
        x: parentPos.x + offset_mm,
        y: parentPos.y || 0,
        z: parentPos.z + parentDims.d_mm - wallThk
      };

    case "front":
      return {
        x: parentPos.x + offset_mm,
        y: parentPos.y || 0,
        z: parentPos.z - leantoD + wallThk
      };

    case "left":
      return {
        x: parentPos.x - leantoD + wallThk,
        y: parentPos.y || 0,
        z: parentPos.z + offset_mm
      };

    case "right":
      return {
        x: parentPos.x + parentDims.w_mm - wallThk,
        y: parentPos.y || 0,
        z: parentPos.z + offset_mm
      };

    default:
      return { x: parentPos.x, y: parentPos.y || 0, z: parentPos.z };
  }
}

/**
 * Calculate position for L-wing attachment
 * L-wing connects at a corner of parent building
 * TODO: Implement in Phase 3
 */
function calculateLWingPosition(attachment, parentPos, parentDims, wallThk) {
  // Placeholder for Phase 3
  return { x: parentPos.x, y: parentPos.y || 0, z: parentPos.z };
}

/**
 * Get dimensions for a section
 */
export function getSectionDimensions(state, sectionId) {
  const section = findSection(state, sectionId);
  if (!section) {
    return { w_mm: 1800, d_mm: 2400 };
  }

  return section.dimensions || {
    w_mm: state.dim?.frameW_mm || 1800,
    d_mm: state.dim?.frameD_mm || 2400
  };
}

/**
 * Get wall enable flags for a section
 * Returns which walls should be built: { front: bool, back: bool, left: bool, right: bool }
 */
export function getSectionWallFlags(state, sectionId) {
  const section = findSection(state, sectionId);
  if (!section) {
    return { front: true, back: true, left: true, right: true };
  }

  return section.walls?.enabled || { front: true, back: true, left: true, right: true };
}

/**
 * Get openings (doors/windows) for a section
 * Returns array of opening objects
 */
export function getSectionOpenings(state, sectionId) {
  const section = findSection(state, sectionId);
  if (!section) return [];

  return section.walls?.openings || [];
}

/**
 * Create section-specific state object
 * Takes global state + section and returns state object for builders
 * This allows builders to work with either legacy or section-based state
 */
export function createSectionState(state, section) {
  if (!state.sections?.enabled) {
    // Legacy mode: return state as-is
    return state;
  }

  // Multi-section mode: create section-specific state
  return {
    ...state,
    dim: {
      frameW_mm: section.dimensions?.w_mm || state.dim?.frameW_mm,
      frameD_mm: section.dimensions?.d_mm || state.dim?.frameD_mm
    },
    roof: section.roof || state.roof,
    walls: section.walls || state.walls
  };
}
