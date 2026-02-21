/**
 * @fileoverview Attachment Builder - Creates sub-buildings attached to the main structure
 * 
 * Attachments are secondary buildings that share one wall with the main building.
 * Each attachment has its own:
 * - Base (ground supports)
 * - Floor (joists and OSB)
 * - Walls (3 of 4, with the 4th being the main building's wall)
 * - Roof (pent or apex style)
 * 
 * ## Coordinate System
 * Attachments use the same coordinate system as the main building:
 * - X = width (left to right)
 * - Y = height (up)
 * - Z = depth (front to back)
 * 
 * ## Attachment Walls
 * The `attachTo.wall` parameter determines which wall of the main building
 * the attachment connects to:
 * - "left"  → attachment extends in +X direction
 * - "right" → attachment extends in -X direction  
 * - "front" → attachment extends in -Z direction
 * - "back"  → attachment extends in +Z direction
 * 
 * ## Dimension Mapping
 * For left/right attachments:
 * - `width_mm` = dimension along the attached wall (Z direction)
 * - `depth_mm` = dimension outward from main building (X direction)
 * 
 * For front/back attachments:
 * - `width_mm` = dimension along the attached wall (X direction)
 * - `depth_mm` = dimension outward from main building (Z direction)
 * 
 * ## Roof Types
 * - **Pent**: Single slope, high edge at main building, low edge outward
 * - **Apex**: Gabled roof with ridge running perpendicular to attached wall
 * 
 * @module elements/attachments
 */

import { CONFIG } from '../params.js';
import * as Doors from './doors.js';
import * as Windows from './windows.js';

// Constants matching main building
const GRID_HEIGHT_MM = 50;
const FLOOR_FRAME_DEPTH_MM = 100;
const FLOOR_OSB_MM = 18;
const RAFTER_W_MM = 100;  // Rafter width (along slope)
const RAFTER_D_MM = 50;   // Rafter depth (vertical when flat)
const ROOF_OSB_MM = 18;
const COVERING_MM = 2;
const FASCIA_THK_MM = 20;
const FASCIA_DEPTH_MM = 135;
const OVERHANG_MM = 75;
const RAFTER_SPACING_MM = 600;

// Wall framing constants (matching main building walls.js)
const STUD_W_MM = 50;       // Stud width (plate height)
const STUD_H_BASIC_MM = 75;       // Stud depth = wall thickness (basic variant)
const STUD_H_INSULATED_MM = 100;  // Stud depth = wall thickness (insulated variant)
const STUD_SPACING_MM = 400; // Center-to-center stud spacing (insulated variant, max)
const BASIC_MAX_PANEL_MM = 2400;  // Max panel width before splitting (basic variant)
const PLATE_HEIGHT_MM = STUD_W_MM;  // Bottom/top plate height = stud width
const PIR_THICKNESS_MM = 50;  // 50mm PIR insulation (insulated variant)
const PLY_THICKNESS_MM = 12;  // 12mm plywood internal lining (insulated variant)

// Cladding constants (matching main building walls.js)
const CLAD_H_MM = 140;      // Height per course (horizontal board row)
const CLAD_T_MM = 20;       // Thickness (board depth when mounted)
const CLAD_DRIP_MM = 30;    // Drip edge extension on first course only
const CLAD_BOTTOM_DROP_MM = 60;  // How far first course extends below plate
const CLAD_Hb_MM = 20;      // Bottom strip height
const CLAD_Rb_MM = 5;       // Rebate depth - upper strip is recessed by this amount

/**
 * Calculate the main building's apex diamond bottom height
 * Used to cap attachment crest heights when ridges run parallel
 * @param {object} mainState - The main building state  
 * @returns {number} The bottom of the decorative diamond in mm from GROUND (absolute Y)
 */
function getMainBuildingDiamondBottom(mainState) {
  const DIAMOND_SIZE_MM = 120;  // Same as in roof.js
  
  // Floor surface height (heights like crest/eaves are measured from here)
  const floorSurfaceY = GRID_HEIGHT_MM + FLOOR_FRAME_DEPTH_MM + FLOOR_OSB_MM; // 168mm
  
  // Get crest and eaves heights (relative to floor surface)
  const crestHeight = Number(
    mainState.roof?.apex?.heightToCrest_mm || 
    mainState.roof?.apex?.crestHeight_mm || 
    2200
  );
  const eavesHeight = Number(
    mainState.roof?.apex?.heightToEaves_mm ||
    mainState.roof?.apex?.eavesHeight_mm ||
    1850
  );
  
  // Get building width to calculate pitch
  const buildingWidth = Number(mainState.base?.width_mm || 2400);
  const halfSpan = buildingWidth / 2;
  
  // Calculate roof pitch
  const rise = crestHeight - eavesHeight;
  const pitchAngle = Math.atan2(rise, halfSpan);
  const cosT = Math.cos(pitchAngle);
  
  // Diamond center Y (simplified from roof.js formula)
  // ridgeY ≈ crestHeight for this purpose
  const diamondCenterY = crestHeight - (FASCIA_DEPTH_MM / 2) * cosT + DIAMOND_SIZE_MM / 4;
  
  // Diamond bottom = center - half the diagonal (it's rotated 45°)
  const diamondBottom = diamondCenterY - DIAMOND_SIZE_MM / 2;
  
  // Return absolute from ground (add floor surface height)
  return floorSurfaceY + diamondBottom;
}

/**
 * Calculate the main building's lowest fascia bottom height
 * This is used to cap attachment roof heights
 * @param {object} mainState - The main building state
 * @returns {number} The lowest fascia bottom height in mm from GROUND (absolute Y)
 */
function getMainBuildingFasciaBottom(mainState) {
  const roofStyle = mainState.roof?.style || "apex";

  // Floor surface height — eaves/crest heights are measured from here, so we
  // must add it to convert to absolute Y from ground.
  const floorSurfaceY = GRID_HEIGHT_MM + FLOOR_FRAME_DEPTH_MM + FLOOR_OSB_MM; // 168mm

  if (roofStyle === "apex") {
    // For apex roof, the fascia is at the eaves
    const eavesHeight = Number(
      mainState.roof?.apex?.heightToEaves_mm ||
      mainState.roof?.apex?.eavesHeight_mm ||
      1850
    );
    // Fascia bottom = floor surface + eaves height - fascia depth
    return floorSurfaceY + eavesHeight - FASCIA_DEPTH_MM;
  } else if (roofStyle === "pent") {
    // For pent roof, the lowest point is at the min height end
    const minHeight = Number(mainState.roof?.pent?.minHeight_mm || 2100);
    // Fascia bottom = floor surface + min height - fascia depth
    return floorSurfaceY + minHeight - FASCIA_DEPTH_MM;
  } else if (roofStyle === "hipped") {
    // For hipped roof, eaves run all around
    const eavesHeight = Number(
      mainState.roof?.hipped?.heightToEaves_mm || 2500
    );
    return floorSurfaceY + eavesHeight - FASCIA_DEPTH_MM;
  } else {
    // Default/fallback
    return floorSurfaceY + 1850 - FASCIA_DEPTH_MM;
  }
}

/**
 * Build complete 3D geometry for an attachment building
 * 
 * Creates all components: base, floor, walls, and roof. The attachment
 * shares one wall with the main building and extends outward from it.
 * 
 * @param {object} mainState - The main building state object
 * @param {object} mainState.dimensions - Main building dimensions
 * @param {object} mainState.roof - Main building roof configuration
 * @param {object} mainState.vis - Visibility flags for component toggling
 * 
 * @param {object} attachment - The attachment configuration
 * @param {string} attachment.id - Unique identifier for this attachment
 * @param {boolean} attachment.enabled - Whether to build this attachment
 * @param {object} attachment.attachTo - Connection configuration
 * @param {string} attachment.attachTo.wall - Which main wall to attach to ("left"|"right"|"front"|"back")
 * @param {object} attachment.dimensions - Attachment dimensions
 * @param {number} attachment.dimensions.width_mm - Width along the attached wall
 * @param {number} attachment.dimensions.depth_mm - Depth outward from main building
 * @param {object} attachment.roof - Roof configuration
 * @param {string} attachment.roof.type - Roof style ("pent"|"apex")
 * 
 * @param {object} ctx - Babylon.js rendering context
 * @param {BABYLON.Scene} ctx.scene - The Babylon.js scene
 * @param {object} ctx.materials - Shared material instances
 * 
 * @example
 * // Build a pent-roofed attachment on the left wall
 * build3D(mainState, {
 *   id: "att-1",
 *   enabled: true,
 *   attachTo: { wall: "left" },
 *   dimensions: { width_mm: 1800, depth_mm: 1200 },
 *   roof: { type: "pent" }
 * }, { scene, materials });
 */
export function build3D(mainState, attachment, ctx) {
  const { scene, materials } = ctx;

  if (!attachment || !attachment.enabled) {
    console.log("[attachments] Skipping disabled or null attachment:", attachment?.id);
    return;
  }

  const attId = attachment.id;
  const attachWall = attachment.attachTo?.wall || "left";

  console.log("[attachments] Building attachment:", attId, "wall:", attachWall);

  // Check visibility flags from main state (attachments follow main building visibility)
  const vis = mainState?.vis || {};
  const baseEnabled = vis.baseAll !== false;
  const wallsEnabled = vis.walls !== false && vis.wallsEnabled !== false;
  const roofEnabled = vis.roof !== false;
  const claddingEnabled = vis.cladding !== false;

  console.log("[attachments] Visibility - base:", baseEnabled, "walls:", wallsEnabled,
              "roof:", roofEnabled, "cladding:", claddingEnabled);

  // Calculate attachment world position
  const position = calculateAttachmentPosition(mainState, attachment);
  console.log("[attachments] Position:", position);

  // Get attachment dimensions
  const width = attachment.dimensions?.width_mm || 1800;  // Along the attached wall
  const depth = attachment.dimensions?.depth_mm || 1200;  // Outward from main building

  // Create root node for this attachment
  const rootName = `attachment-${attId}-root`;
  const root = new BABYLON.TransformNode(rootName, scene);
  root.position = new BABYLON.Vector3(
    position.x * 0.001,
    position.y * 0.001,
    position.z * 0.001
  );
  root.metadata = { dynamic: true, attachmentId: attId };

  // Get roof configuration
  const roofType = attachment.roof?.type || "pent";

  // Calculate the maximum allowed height for the attachment roof
  // The highest point of the attachment roof cannot exceed the main building's lowest fascia bottom
  const mainFasciaBottom = getMainBuildingFasciaBottom(mainState);

  // Get main building eaves height for apex crest capping
  const mainEavesHeight = Number(
    mainState.roof?.apex?.heightToEaves_mm ||
    mainState.roof?.apex?.eavesHeight_mm ||
    mainState.roof?.pent?.maxHeight_mm ||
    2400
  );

  // For pent roof, the highest point is at the inner edge (highHeight_mm)
  // This height includes the roof structure (rafters + OSB + covering)
  // So we need to account for the roof stack: RAFTER_D_MM (50) + ROOF_OSB_MM (18) + COVERING_MM (2) = 70mm
  const roofStackHeight = RAFTER_D_MM + ROOF_OSB_MM + COVERING_MM;

  // Account for ground level offset — when the attachment is raised, the max
  // allowed heights (relative to the attachment's own base) must shrink so the
  // roof never exceeds the main building's eaves in absolute world space.
  const levelOffset = attachment.base?.levelOffset_mm || 0;

  // Maximum wall height at inner edge = fascia bottom - roof stack - level offset
  const floorStackHeight = GRID_HEIGHT_MM + FLOOR_FRAME_DEPTH_MM + FLOOR_OSB_MM;
  const maxInnerHeight = mainFasciaBottom - roofStackHeight - levelOffset;

  console.log("[attachments] Height constraint - mainFasciaBottom:", mainFasciaBottom,
              "roofStackHeight:", roofStackHeight, "levelOffset:", levelOffset,
              "maxInnerHeight:", maxInnerHeight);

  // Calculate wall heights based on roof type
  let wallHeightInner, wallHeightOuter;

  if (roofType === "apex") {
    // For apex roof, all walls have the same height (eaves level)
    // The gable peak is above the walls, handled by the roof
    
    // User-specified values from UI
    // UI writes to: attachment.roof.apex.eaveHeight_mm and crestHeight_mm
    let userEaves = attachment.roof?.apex?.eaveHeight_mm;
    let userCrest = attachment.roof?.apex?.crestHeight_mm;
    
    console.log("[attachments] RAW apex input - eaveHeight_mm:", userEaves, 
                "crestHeight_mm:", userCrest, "full apex config:", attachment.roof?.apex);
    
    // Calculate sensible defaults based on main building
    // Default crest: 200mm below main fascia bottom (safe clearance)
    // EXCEPTION: For front/back attachments on apex primary, ridges run parallel,
    // so crest can go up to 50mm below the primary's apex (diamond)
    const mainRoofStyle = mainState.roof?.style || "apex";
    const roofRidgesParallel = mainRoofStyle === "apex" && 
      (attachWall === "front" || attachWall === "back");
    
    let defaultCrest;
    if (roofRidgesParallel) {
      // Ridges run parallel - cap at 5cm below primary's diamond bottom
      const mainDiamondBottom = getMainBuildingDiamondBottom(mainState);
      defaultCrest = mainDiamondBottom - 50 - levelOffset;  // 5cm below diamond bottom, adjusted for ground level
    } else {
      defaultCrest = mainFasciaBottom - 200 - levelOffset;
    }
    
    // Default eaves: crest - 400mm rise (reasonable pitch)
    const defaultRise = 400;
    const defaultEaves = defaultCrest - defaultRise;
    
    // Use user values if provided, otherwise defaults
    let crestHeight_mm = userCrest ?? defaultCrest;
    let eavesHeight_mm = userEaves ?? defaultEaves;
    
    // Calculate max crest height based on roof configuration
    // For parallel ridges (front/back on apex primary): 5cm below primary's diamond bottom
    // Otherwise: 200mm below fascia bottom
    // Subtract levelOffset so raised attachments stay under the main roof
    const maxCrestHeight = roofRidgesParallel
      ? getMainBuildingDiamondBottom(mainState) - 50 - levelOffset
      : mainFasciaBottom - 200 - levelOffset;
    
    console.log("[attachments] Apex UI values - userEaves:", userEaves, "userCrest:", userCrest,
                "defaults - eaves:", defaultEaves, "crest:", defaultCrest,
                "maxCrestHeight:", maxCrestHeight, "roofRidgesParallel:", roofRidgesParallel);
    
    // Clamp crest to max allowed height
    const crestBeforeCap = crestHeight_mm;
    crestHeight_mm = Math.max(500, Math.min(crestHeight_mm, maxCrestHeight));
    
    // Clamp eaves to valid range (upper bound only - can't exceed main fascia)
    const eavesBeforeCap = eavesHeight_mm;
    eavesHeight_mm = Math.max(500, Math.min(eavesHeight_mm, maxInnerHeight));
    
    wallHeightInner = Math.max(500, eavesHeight_mm - floorStackHeight);
    wallHeightOuter = wallHeightInner;  // Same height for apex
    
    console.log("[attachments] Apex FULL DEBUG:",
                "userEaves:", userEaves, "userCrest:", userCrest,
                "crestBeforeCap:", crestBeforeCap, "crestAfterCap:", crestHeight_mm,
                "eavesBeforeCap:", eavesBeforeCap, "eavesAfterCap:", eavesHeight_mm,
                "maxCrestHeight:", maxCrestHeight, "maxInnerHeight:", maxInnerHeight,
                "roofRidgesParallel:", roofRidgesParallel,
                "floorStackHeight:", floorStackHeight, "FINAL wallHeightInner:", wallHeightInner);
    
    // Write capped values back to attachment config so buildApexRoof uses them
    // (buildApexRoof reads from attachment.roof.apex directly)
    if (!attachment.roof) attachment.roof = {};
    if (!attachment.roof.apex) attachment.roof.apex = {};
    attachment.roof.apex.crestHeight_mm = crestHeight_mm;
    attachment.roof.apex.eaveHeight_mm = eavesHeight_mm;
  } else {
    // For pent roof, calculate wall heights
    // Inner wall (at main building) is higher, outer wall is lower
    let highHeight_mm = attachment.roof?.pent?.highHeight_mm;
    if (highHeight_mm == null) {
      highHeight_mm = maxInnerHeight;
    }

    let lowHeight_mm = attachment.roof?.pent?.lowHeight_mm;
    if (lowHeight_mm == null) {
      lowHeight_mm = Math.max(500, highHeight_mm - 300);
    }

    if (highHeight_mm > maxInnerHeight) {
      console.log("[attachments] Capping highHeight_mm from", highHeight_mm, "to", maxInnerHeight);
      highHeight_mm = maxInnerHeight;
    }

    const effectiveLowHeight = Math.min(lowHeight_mm, highHeight_mm - 100);

    wallHeightInner = Math.max(500, highHeight_mm - floorStackHeight);
    wallHeightOuter = Math.max(500, effectiveLowHeight - floorStackHeight);

    console.log("[attachments] Pent heights - high:", highHeight_mm, "low:", effectiveLowHeight,
                "wallInner:", wallHeightInner, "wallOuter:", wallHeightOuter);
  }

  // Determine extents based on orientation
  // For left/right attachments: extentX = depth (outward), extentZ = width (along wall)
  // For front/back attachments: extentX = width (along wall), extentZ = depth (outward)
  let extentX, extentZ;
  if (attachWall === "left" || attachWall === "right") {
    extentX = depth;
    extentZ = width;
  } else {
    extentX = width;
    extentZ = depth;
  }

  // Build attachment components based on visibility settings
  // Base and floor
  if (baseEnabled && attachment.base?.enabled !== false) {
    buildAttachmentBase(scene, root, attId, extentX, extentZ, materials);
    buildAttachmentFloor(scene, root, attId, extentX, extentZ, materials);
  }

  console.log("[attachments] Extents - X:", extentX, "Z:", extentZ);

  // Build walls with sloped tops for pent roof
  if (wallsEnabled) {
    console.log("[attachments] Building walls...");
    try {
      buildAttachmentWalls(scene, root, attId, extentX, extentZ, wallHeightInner, wallHeightOuter,
                           attachWall, roofType, attachment, materials, claddingEnabled);
      console.log("[attachments] Walls built successfully");
    } catch (wallErr) {
      console.error("[attachments] ERROR building walls:", wallErr);
    }
  }

  // Build door/window openings for this attachment
  const attOpenings = Array.isArray(attachment.walls?.openings) ? attachment.walls.openings : [];
  if (attOpenings.length > 0 && wallsEnabled) {
    console.log("[attachments] Building openings for", attId, ":", attOpenings.length, "openings");
    try {
      buildAttachmentOpenings(scene, root, attId, extentX, extentZ, attachWall, attachment, position, materials, ctx,
                              wallHeightInner, wallHeightOuter, roofType);
    } catch (openErr) {
      console.error("[attachments] ERROR building openings:", openErr);
    }
  }

  // Build roof structure (rafters, OSB, covering, fascia)
  // Get timber dimensions from main building's frame settings
  const frameThickness = Math.max(1, Math.floor(Number(mainState?.frame?.thickness_mm || 50)));
  const frameDepth = Math.max(1, Math.floor(Number(mainState?.frame?.depth_mm || 75)));
  // memberW = horizontal width (depth_mm), memberD = vertical height (thickness_mm)
  // This matches main building's roof.js convention
  const memberW_mm = frameDepth;   // 75mm default (width in plan / horizontal)
  const memberD_mm = frameThickness; // 50mm default (vertical depth)
  
  if (roofEnabled && roofType !== "overhang") {
    console.log("[attachments] Building roof... memberW:", memberW_mm, "memberD:", memberD_mm);
    try {
      buildAttachmentRoof(scene, root, attId, extentX, extentZ, wallHeightInner, wallHeightOuter,
                          attachWall, roofType, attachment, materials, memberW_mm, memberD_mm, mainFasciaBottom);
      console.log("[attachments] Roof built successfully");
    } catch (roofErr) {
      console.error("[attachments] ERROR building roof:", roofErr);
    }
  }

  // Count meshes created for this attachment
  const attMeshes = scene.meshes.filter(m => m.metadata?.attachmentId === attId);
  console.log("[attachments] Build complete for:", attId, "- created", attMeshes.length, "meshes");
}

/**
 * Calculates the world position for an attachment relative to the main building.
 * Attachment snaps to center of the specified wall with optional offset.
 * 
 * Note: Main building meshes are shifted by -WALL_OVERHANG_MM (-25mm) in X and Z,
 * so attachment positions must account for this.
 * 
 * @param {Object} mainState - Main building state with dimensions
 * @param {Object} attachment - Attachment definition with attachTo and dimensions
 * @returns {Object} Position {x, y, z} in world coordinates (mm)
 * @private
 */
function calculateAttachmentPosition(mainState, attachment) {
  const attachWall = attachment.attachTo?.wall || "left";
  const offsetFromCenter = attachment.attachTo?.offsetFromCenter_mm || 0;
  const attWidth = attachment.dimensions?.width_mm || 1800;
  const attDepth = attachment.dimensions?.depth_mm || 1200;
  const levelOffset = attachment.base?.levelOffset_mm || 0;

  // Main building dimensions (frame dimensions)
  const mainW = mainState.dim?.frameW_mm || 1800;
  const mainD = mainState.dim?.frameD_mm || 2400;

  // Main building wall offset (walls are shifted to this offset)
  const WALL_OVERHANG_MM = 25;

  let x = 0, y = levelOffset, z = 0;

  switch (attachWall) {
    case "left":
      // Left wall of main is at x = -WALL_OVERHANG_MM
      // Attachment outer edge should meet main wall, so attachment starts at x = -(attDepth + WALL_OVERHANG_MM)
      x = -attDepth - WALL_OVERHANG_MM;
      z = (mainD / 2) - (attWidth / 2) + offsetFromCenter - WALL_OVERHANG_MM;
      break;
    case "right":
      // Right wall of main is at x = mainW - WALL_OVERHANG_MM
      x = mainW - WALL_OVERHANG_MM;
      z = (mainD / 2) - (attWidth / 2) + offsetFromCenter - WALL_OVERHANG_MM;
      break;
    case "front":
      // Front wall of main is at z = -WALL_OVERHANG_MM
      x = (mainW / 2) - (attWidth / 2) + offsetFromCenter - WALL_OVERHANG_MM;
      z = -attDepth - WALL_OVERHANG_MM;
      break;
    case "back":
      // Back wall of main is at z = mainD - WALL_OVERHANG_MM
      x = (mainW / 2) - (attWidth / 2) + offsetFromCenter - WALL_OVERHANG_MM;
      z = mainD - WALL_OVERHANG_MM;
      break;
  }

  return { x, y, z };
}

/**
 * Builds the foundation grid (base) for an attachment.
 * Creates dark grid support blocks at 500mm intervals.
 * 
 * @param {BABYLON.Scene} scene - Babylon.js scene
 * @param {BABYLON.TransformNode} root - Attachment root node
 * @param {string} attId - Attachment identifier
 * @param {number} extentX - X extent in mm
 * @param {number} extentZ - Z extent in mm
 * @param {Object} materials - Material definitions
 * @private
 */
function buildAttachmentBase(scene, root, attId, extentX, extentZ, materials) {
  const gridSize = CONFIG.grid.size; // 500mm
  const gridH = CONFIG.grid.h;       // 50mm height

  const mat = new BABYLON.StandardMaterial(`att-${attId}-base-mat`, scene);
  mat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

  const yB = 25; // Center of base grid (50mm high, center at 25)

  for (let x = 0; x < extentX; x += gridSize) {
    for (let z = 0; z < extentZ; z += gridSize) {
      const bw = Math.min(gridSize, extentX - x);
      const bd = Math.min(gridSize, extentZ - z);

      const b = BABYLON.MeshBuilder.CreateBox(`att-${attId}-base-${x}-${z}`, {
        width: bw * 0.001,
        height: gridH * 0.001,
        depth: bd * 0.001
      }, scene);

      b.position = new BABYLON.Vector3(
        (x + bw / 2) * 0.001,
        yB * 0.001,
        (z + bd / 2) * 0.001
      );
      b.material = mat;
      b.parent = root;
      b.metadata = { dynamic: true, attachmentId: attId, type: 'base' };

      if (b.enableEdgesRendering) {
        b.enableEdgesRendering();
        b.edgesWidth = 1;
        b.edgesColor = new BABYLON.Color4(0.2, 0.2, 0.2, 1);
      }
    }
  }
}

/**
 * Build the floor frame and decking for the attachment
 */
function buildAttachmentFloor(scene, root, attId, extentX, extentZ, materials) {
  const frameT = 50;  // Frame thickness
  const frameH = 100; // Frame depth (height)

  const yF = 50 + (frameH / 2); // Y position for frame (above base)
  const yD = 50 + frameH + 9;   // Y position for decking (above frame)

  // Frame material
  const frameMat = materials?.timber || new BABYLON.StandardMaterial(`att-${attId}-frame-mat`, scene);
  if (!materials?.timber) {
    frameMat.diffuseColor = new BABYLON.Color3(0.5, 0.4, 0.3);
  }

  // Build perimeter frame (rim joists)
  const isXLonger = extentX >= extentZ;
  const rimLen = isXLonger ? extentX : extentZ;
  const joistSpan = isXLonger ? extentZ : extentX;

  // Rim joists
  [0, joistSpan - frameT].forEach(offset => {
    const r = BABYLON.MeshBuilder.CreateBox(`att-${attId}-rim-${offset}`, {
      width: (isXLonger ? rimLen : frameT) * 0.001,
      height: frameH * 0.001,
      depth: (isXLonger ? frameT : rimLen) * 0.001
    }, scene);

    if (isXLonger) {
      r.position = new BABYLON.Vector3(
        (rimLen / 2) * 0.001,
        yF * 0.001,
        (offset + frameT / 2) * 0.001
      );
    } else {
      r.position = new BABYLON.Vector3(
        (offset + frameT / 2) * 0.001,
        yF * 0.001,
        (rimLen / 2) * 0.001
      );
    }

    r.material = frameMat;
    r.parent = root;
    r.metadata = { dynamic: true, attachmentId: attId, type: 'frame' };
  });

  // Inner joists
  const innerJoistLen = joistSpan - (frameT * 2);
  const spacing = CONFIG.spacing; // 400mm
  let cursor = spacing;

  while (cursor < rimLen - frameT) {
    const j = BABYLON.MeshBuilder.CreateBox(`att-${attId}-joist-${cursor}`, {
      width: (isXLonger ? frameT : innerJoistLen) * 0.001,
      height: frameH * 0.001,
      depth: (isXLonger ? innerJoistLen : frameT) * 0.001
    }, scene);

    const mid = (innerJoistLen / 2 + frameT) * 0.001;
    if (isXLonger) {
      j.position = new BABYLON.Vector3(cursor * 0.001, yF * 0.001, mid);
    } else {
      j.position = new BABYLON.Vector3(mid, yF * 0.001, cursor * 0.001);
    }

    j.material = frameMat;
    j.parent = root;
    j.metadata = { dynamic: true, attachmentId: attId, type: 'frame' };

    cursor += spacing;
  }

  // Decking
  const deckMat = new BABYLON.StandardMaterial(`att-${attId}-deck-mat`, scene);
  deckMat.diffuseColor = new BABYLON.Color3(0.8, 0.7, 0.6);

  const deckH = 18; // 18mm OSB
  const d = BABYLON.MeshBuilder.CreateBox(`att-${attId}-deck`, {
    width: extentX * 0.001,
    height: deckH * 0.001,
    depth: extentZ * 0.001
  }, scene);

  d.position = new BABYLON.Vector3(
    (extentX / 2) * 0.001,
    yD * 0.001,
    (extentZ / 2) * 0.001
  );
  d.material = deckMat;
  d.parent = root;
  d.metadata = { dynamic: true, attachmentId: attId, type: 'deck' };

  d.enableEdgesRendering();
  d.edgesWidth = 4;
  d.edgesColor = new BABYLON.Color4(0, 0, 0, 1);
}

/**
 * Build the walls for the attachment (3 walls - inner wall is missing)
 * Uses proper framing (plates + studs) and cladding matching the main building
 *
 * CORNER JOIN RULES (matching main building):
 * - Outer wall and the wall perpendicular to slope are full width
 * - Side walls (along slope) run BETWEEN outer and inner edges
 * - For left/right attachments: front/back are full width, outer runs between
 * - For front/back attachments: left/right are full width, outer runs between
 *
 * For pent roof, the walls along the slope direction have sloped top plates (prisms)
 */
function buildAttachmentWalls(scene, root, attId, extentX, extentZ, wallHeightInner, wallHeightOuter,
                               attachWall, roofType, attachment, materials, claddingEnabled = true) {
  console.log("[attachments] buildAttachmentWalls called for:", attId,
              "extentX:", extentX, "extentZ:", extentZ,
              "wallHeightInner:", wallHeightInner, "wallHeightOuter:", wallHeightOuter,
              "attachWall:", attachWall, "roofType:", roofType, "claddingEnabled:", claddingEnabled);

  // Wall base Y = floor surface = grid + floor frame + floor OSB
  const wallBaseY = GRID_HEIGHT_MM + FLOOR_FRAME_DEPTH_MM + FLOOR_OSB_MM; // 50 + 100 + 18 = 168

  // Resolve wall variant (basic or insulated) — determines stud depth & layout
  const variant = attachment.walls?.variant || "basic";
  const plateH = PLATE_HEIGHT_MM;   // 50mm - plate height
  const wallThk = variant === "insulated" ? STUD_H_INSULATED_MM : STUD_H_BASIC_MM;
  const studW = STUD_W_MM;          // 50mm - stud width
  const studSpacing = STUD_SPACING_MM; // 400mm max (insulated only; basic uses panel logic)

  console.log("[attachments] Wall params - variant:", variant, "baseY:", wallBaseY, "wallThk:", wallThk, "plateH:", plateH);

  // Get materials - use main building materials for consistency
  const plateMat = materials?.plate || createMaterial(scene, `att-${attId}-plate-mat`, 0.65, 0.45, 0.25);
  const studMat = materials?.timber || createMaterial(scene, `att-${attId}-stud-mat`, 0.72, 0.50, 0.28);

  // Use scene's cladding material if available (matches main building)
  let cladMat = materials?.cladding || scene._claddingMatLight;
  if (!cladMat) {
    cladMat = createCladdingMaterial(scene, `claddingMatLight`);
    scene._claddingMatLight = cladMat;
    console.log("[attachments] Created and cached cladding material on scene");
  }

  console.log("[attachments] Materials - plate:", plateMat?.name, "stud:", studMat?.name, "clad:", cladMat?.name);

  const isPent = roofType === "pent";
  const isApex = roofType === "apex";

  // Helper to create a box mesh at position (bottom-left-front corner)
  function mkBox(name, lenX, lenY, lenZ, pos, mat) {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: lenX / 1000,
      height: lenY / 1000,
      depth: lenZ / 1000
    }, scene);
    mesh.position = new BABYLON.Vector3(
      (pos.x + lenX / 2) / 1000,
      (pos.y + lenY / 2) / 1000,
      (pos.z + lenZ / 2) / 1000
    );
    mesh.material = mat;
    mesh.parent = root;
    mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-frame' };
    return mesh;
  }

  // Helper to create a sloped top plate (prism) for walls along the slope direction
  // Matches main building's mkSlopedPlateAlongX functionality
  function mkSlopedPlateAlongX(name, lenX, lenZ, originX, originZ, yTopAtX0, yTopAtX1, mat) {
    const x0 = originX;
    const x1 = originX + lenX;
    const z0 = originZ;
    const z1 = originZ + lenZ;

    const yTop0 = Math.max(0, Math.floor(Number(yTopAtX0)));
    const yTop1 = Math.max(0, Math.floor(Number(yTopAtX1)));
    const yBot0 = Math.max(0, yTop0 - plateH);
    const yBot1 = Math.max(0, yTop1 - plateH);

    const positions = [
      x0, yBot0, z0,
      x1, yBot1, z0,
      x1, yBot1, z1,
      x0, yBot0, z1,
      x0, yTop0, z0,
      x1, yTop1, z0,
      x1, yTop1, z1,
      x0, yTop0, z1,
    ].map((v) => v / 1000);

    const indices = [
      0, 1, 2, 0, 2, 3, // bottom
      4, 6, 5, 4, 7, 6, // top
      0, 5, 1, 0, 4, 5, // z0 face
      3, 2, 6, 3, 6, 7, // z1 face
      0, 3, 7, 0, 7, 4, // x0 face
      1, 5, 6, 1, 6, 2  // x1 face
    ];

    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;

    const mesh = new BABYLON.Mesh(name, scene);
    vd.applyToMesh(mesh, true);

    // Clone material with backFaceCulling disabled for proper rendering
    let useMat = mat;
    if (mat && mat.clone) {
      useMat = mat.clone(name + "-mat");
      useMat.backFaceCulling = false;
    }
    mesh.material = useMat;
    mesh.parent = root;
    mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-frame', part: 'sloped-plate' };
    return mesh;
  }

  // Helper to create a sloped top plate along Z axis
  function mkSlopedPlateAlongZ(name, lenX, lenZ, originX, originZ, yTopAtZ0, yTopAtZ1, mat) {
    const x0 = originX;
    const x1 = originX + lenX;
    const z0 = originZ;
    const z1 = originZ + lenZ;

    const yTop0 = Math.max(0, Math.floor(Number(yTopAtZ0)));
    const yTop1 = Math.max(0, Math.floor(Number(yTopAtZ1)));
    const yBot0 = Math.max(0, yTop0 - plateH);
    const yBot1 = Math.max(0, yTop1 - plateH);

    const positions = [
      x0, yBot0, z0,
      x1, yBot0, z0,
      x1, yBot1, z1,
      x0, yBot1, z1,
      x0, yTop0, z0,
      x1, yTop0, z0,
      x1, yTop1, z1,
      x0, yTop1, z1,
    ].map((v) => v / 1000);

    const indices = [
      0, 1, 2, 0, 2, 3, // bottom
      4, 6, 5, 4, 7, 6, // top
      0, 5, 1, 0, 4, 5, // z0 face
      3, 2, 6, 3, 6, 7, // z1 face
      0, 3, 7, 0, 7, 4, // x0 face
      1, 5, 6, 1, 6, 2  // x1 face
    ];

    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;

    const mesh = new BABYLON.Mesh(name, scene);
    vd.applyToMesh(mesh, true);

    let useMat = mat;
    if (mat && mat.clone) {
      useMat = mat.clone(name + "-mat");
      useMat.backFaceCulling = false;
    }
    mesh.material = useMat;
    mesh.parent = root;
    mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-frame', part: 'sloped-plate' };
    return mesh;
  }

  // Helper to build triangular gable infill for apex roofs
  function buildGableInfill(wallId, axis, length, startPos, wallTopY, peakY, cladMat) {
    const rise_mm = peakY - wallTopY;
    if (rise_mm <= 0) return;
    
    const halfLen = length / 2;
    const peakPos = startPos + halfLen;
    
    console.log("[attachments] buildGableInfill:", wallId, "axis:", axis, 
                "length:", length, "wallTopY:", wallTopY, "peakY:", peakY);
    
    let positions, indices;
    
    if (axis === 'z') {
      // Gable along Z axis (peak at Z center)
      const x0 = -CLAD_T_MM, x1 = 0;
      const z0 = startPos, z1 = startPos + length, zMid = peakPos;
      
      positions = [
        x0, wallTopY, z0,  x0, wallTopY, z1,  x0, peakY, zMid,  // front triangle
        x1, wallTopY, z0,  x1, wallTopY, z1,  x1, peakY, zMid,  // back triangle
      ].map(v => v / 1000);
      
      indices = [
        0, 2, 1,  3, 4, 5,  // front/back faces
        0, 1, 4, 0, 4, 3,   // bottom edge
        0, 3, 5, 0, 5, 2,   // left slope
        1, 2, 5, 1, 5, 4,   // right slope
      ];
    } else {
      // Gable along X axis (peak at X center)
      const z0 = -CLAD_T_MM, z1 = 0;
      const x0 = startPos, x1 = startPos + length, xMid = peakPos;
      
      positions = [
        x0, wallTopY, z0,  x1, wallTopY, z0,  xMid, peakY, z0,  // front triangle
        x0, wallTopY, z1,  x1, wallTopY, z1,  xMid, peakY, z1,  // back triangle
      ].map(v => v / 1000);
      
      indices = [
        0, 1, 2,  3, 5, 4,  // front/back faces
        0, 3, 4, 0, 4, 1,   // bottom edge
        0, 2, 5, 0, 5, 3,   // left slope
        1, 4, 5, 1, 5, 2,   // right slope
      ];
    }
    
    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    
    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    
    const mesh = new BABYLON.Mesh(`att-${attId}-gable-${wallId}`, scene);
    vd.applyToMesh(mesh, true);
    
    let useMat = cladMat;
    if (cladMat && cladMat.clone) {
      useMat = cladMat.clone(`att-${attId}-gable-${wallId}-mat`);
      useMat.backFaceCulling = false;
    }
    mesh.material = useMat;
    mesh.parent = root;
    mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-cladding', part: 'gable' };
  }

  // ---- Variant-aware wall builder ----
  // For BASIC: uses panel-based layout (2400mm max, 3 studs per panel)
  // For INSULATED: uses regular ≤400mm stud centres + insulation/ply
  function buildVariantWall(wallId, axis, length, origin, isSloped, heightAt, mkSlopedPlate, openings) {
    if (variant === "basic") {
      // Convert openings to interval format for panel computation
      const intervals = openings.map(o => ({
        x0: o.x_mm || 0,
        x1: (o.x_mm || 0) + (o.width_mm || 0),
        ...o
      }));
      const panels = computeAttBasicPanels(length, studW, intervals);
      console.log("[attachments] Basic variant wall:", wallId, "panels:", panels.length, panels);

      // Build sloped top plate for the full wall (if sloped)
      if (isSloped && mkSlopedPlate) {
        const yTop0 = wallBaseY + heightAt(0);
        const yTop1 = wallBaseY + heightAt(length);
        if (axis === 'x') {
          mkSlopedPlate(`att-${attId}-${wallId}-plate-top`, length, wallThk,
                        origin.x, origin.z, yTop0, yTop1, plateMat);
        } else {
          mkSlopedPlate(`att-${attId}-${wallId}-plate-top`, wallThk, length,
                        origin.x, origin.z, yTop0, yTop1, plateMat);
        }
      }

      for (let p = 0; p < panels.length; p++) {
        const pan = panels[p];
        buildAttBasicPanel(scene, root, attId, wallId, p, axis, pan.len, origin,
                           pan.start, wallBaseY, wallThk, plateH, studW, plateMat, studMat,
                           isSloped, heightAt, mkBox, intervals);
      }
    } else {
      // Insulated: regular stud spacing (≤400mm centres)
      buildWallPanel(scene, root, attId, wallId, axis, length, origin, wallBaseY, wallThk,
                     plateH, studW, studSpacing, plateMat, studMat, isSloped, heightAt,
                     mkBox, mkSlopedPlate, openings);

      // Build insulation + plywood lining for insulated walls
      buildAttWallInsulation(scene, root, attId, wallId, axis, length, origin, wallBaseY, wallThk,
                             plateH, studW, studSpacing, isSloped, heightAt, mkBox, openings);
    }
  }

  // Build walls based on attachment orientation
  // Following main building corner join rules

  // Get all openings for this attachment, grouped by wall name
  const allOpenings = Array.isArray(attachment.walls?.openings) ? attachment.walls.openings : [];
  function openingsForWall(wallName) {
    return allOpenings.filter(o => o.wall === wallName && o.enabled !== false);
  }

  if (attachWall === "left") {
    // Attachment to the left - inner wall (right side X=extentX) is missing
    // Slope runs along X: high at X=extentX (inner), low at X=0 (outer)
    // CORNER JOIN: Front/Back are full extentX width, Outer runs BETWEEN them

    const heightAtX = isPent
      ? (x) => wallHeightOuter + (wallHeightInner - wallHeightOuter) * (x / extentX)
      : () => wallHeightInner;

    // Side walls length (outer runs between front and back)
    const outerLen = extentZ - 2 * wallThk;

    const frontOpenings = openingsForWall('front');
    const backOpenings = openingsForWall('back');
    const outerOpenings = openingsForWall('outer');

    // FRONT WALL (at Z=0, runs along X, full width) - potentially sloped for pent
    buildVariantWall('front', 'x', extentX, { x: 0, z: 0 }, isPent, heightAtX, mkSlopedPlateAlongX, frontOpenings);
    buildAttOpeningFraming(attId, 'front', 'x', { x: 0, z: 0 }, frontOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtX, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongX(scene, root, attId, 'front', extentX, wallBaseY, -CLAD_T_MM, isPent, heightAtX, cladMat, 0, false, 0, frontOpenings);
    }

    // BACK WALL (at Z=extentZ-wallThk, runs along X, full width) - potentially sloped for pent
    buildVariantWall('back', 'x', extentX, { x: 0, z: extentZ - wallThk }, isPent, heightAtX, mkSlopedPlateAlongX, backOpenings);
    buildAttOpeningFraming(attId, 'back', 'x', { x: 0, z: extentZ - wallThk }, backOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtX, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongX(scene, root, attId, 'back', extentX, wallBaseY, extentZ, isPent, heightAtX, cladMat, 0, false, 0, backOpenings);
    }

    // OUTER WALL (at X=0, runs along Z, between front/back) - flat height
    buildVariantWall('outer', 'z', outerLen, { x: 0, z: wallThk }, false, () => wallHeightOuter, null, outerOpenings);
    buildAttOpeningFraming(attId, 'outer', 'z', { x: 0, z: wallThk }, outerOpenings,
                           wallBaseY, plateH, studW, wallThk, false, () => wallHeightOuter, mkBox, studMat);
    if (claddingEnabled) {
      // For apex roofs, pass the crest height so cladding extends into the gable
      const apexCrest = isApex ? (attachment.roof?.apex?.crestHeight_mm || 400) : 0;
      buildCladdingAlongZ(scene, root, attId, 'outer', outerLen, wallHeightOuter, -CLAD_T_MM, wallBaseY, wallThk, cladMat, false, null, isApex, apexCrest, outerOpenings);
    }

  } else if (attachWall === "right") {
    // Attachment to the right - inner wall (left side X=0) is missing
    // Slope runs along X: high at X=0 (inner), low at X=extentX (outer)
    // CORNER JOIN: Front/Back are full extentX width, Outer runs BETWEEN them

    const heightAtX = isPent
      ? (x) => wallHeightInner + (wallHeightOuter - wallHeightInner) * (x / extentX)
      : () => wallHeightInner;

    const outerLen = extentZ - 2 * wallThk;

    const frontOpenings = openingsForWall('front');
    const backOpenings = openingsForWall('back');
    const outerOpenings = openingsForWall('outer');

    // FRONT WALL (at Z=0, runs along X, full width) - potentially sloped for pent
    buildVariantWall('front', 'x', extentX, { x: 0, z: 0 }, isPent, heightAtX, mkSlopedPlateAlongX, frontOpenings);
    buildAttOpeningFraming(attId, 'front', 'x', { x: 0, z: 0 }, frontOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtX, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongX(scene, root, attId, 'front', extentX, wallBaseY, -CLAD_T_MM, isPent, heightAtX, cladMat, 0, false, 0, frontOpenings);
    }

    // BACK WALL (at Z=extentZ-wallThk, runs along X, full width) - potentially sloped for pent
    buildVariantWall('back', 'x', extentX, { x: 0, z: extentZ - wallThk }, isPent, heightAtX, mkSlopedPlateAlongX, backOpenings);
    buildAttOpeningFraming(attId, 'back', 'x', { x: 0, z: extentZ - wallThk }, backOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtX, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongX(scene, root, attId, 'back', extentX, wallBaseY, extentZ, isPent, heightAtX, cladMat, 0, false, 0, backOpenings);
    }

    // OUTER WALL (at X=extentX-wallThk, runs along Z, between front/back) - flat height
    buildVariantWall('outer', 'z', outerLen, { x: extentX - wallThk, z: wallThk }, false, () => wallHeightOuter, null, outerOpenings);
    buildAttOpeningFraming(attId, 'outer', 'z', { x: extentX - wallThk, z: wallThk }, outerOpenings,
                           wallBaseY, plateH, studW, wallThk, false, () => wallHeightOuter, mkBox, studMat);
    if (claddingEnabled) {
      // For apex roofs, pass the crest height so cladding extends into the gable
      const apexCrest = isApex ? (attachment.roof?.apex?.crestHeight_mm || 400) : 0;
      buildCladdingAlongZ(scene, root, attId, 'outer', outerLen, wallHeightOuter, extentX, wallBaseY, wallThk, cladMat, false, null, isApex, apexCrest, outerOpenings);
    }

  } else if (attachWall === "front") {
    // Attachment to the front - inner wall (back side Z=extentZ) is missing
    // Slope runs along Z: high at Z=extentZ (inner), low at Z=0 (outer)
    // CORNER JOIN: Left/Right are full extentZ depth, Outer runs BETWEEN them

    const heightAtZ = isPent
      ? (z) => wallHeightOuter + (wallHeightInner - wallHeightOuter) * (z / extentZ)
      : () => wallHeightInner;

    const outerLen = extentX - 2 * wallThk;

    const leftOpenings = openingsForWall('left');
    const rightOpenings = openingsForWall('right');
    const outerOpenings = openingsForWall('outer');

    // LEFT WALL (at X=0, runs along Z, full depth) - potentially sloped for pent
    buildVariantWall('left', 'z', extentZ, { x: 0, z: 0 }, isPent, heightAtZ, mkSlopedPlateAlongZ, leftOpenings);
    buildAttOpeningFraming(attId, 'left', 'z', { x: 0, z: 0 }, leftOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtZ, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongZ(scene, root, attId, 'left', extentZ, wallHeightOuter, -CLAD_T_MM, wallBaseY, 0, cladMat, isPent, heightAtZ, false, 0, leftOpenings);
    }

    // RIGHT WALL (at X=extentX-wallThk, runs along Z, full depth) - potentially sloped for pent
    buildVariantWall('right', 'z', extentZ, { x: extentX - wallThk, z: 0 }, isPent, heightAtZ, mkSlopedPlateAlongZ, rightOpenings);
    buildAttOpeningFraming(attId, 'right', 'z', { x: extentX - wallThk, z: 0 }, rightOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtZ, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongZ(scene, root, attId, 'right', extentZ, wallHeightOuter, extentX, wallBaseY, 0, cladMat, isPent, heightAtZ, false, 0, rightOpenings);
    }

    // OUTER WALL (at Z=0, runs along X, between left/right) - flat height
    buildVariantWall('outer', 'x', outerLen, { x: wallThk, z: 0 }, false, () => wallHeightOuter, null, outerOpenings);
    buildAttOpeningFraming(attId, 'outer', 'x', { x: wallThk, z: 0 }, outerOpenings,
                           wallBaseY, plateH, studW, wallThk, false, () => wallHeightOuter, mkBox, studMat);
    if (claddingEnabled) {
      // For apex roofs, pass the crest height so cladding extends into the gable
      const apexCrest = isApex ? (attachment.roof?.apex?.crestHeight_mm || 400) : 0;
      buildCladdingAlongX(scene, root, attId, 'outer', outerLen, wallBaseY, -CLAD_T_MM, false, () => wallHeightOuter, cladMat, wallThk, isApex, apexCrest, outerOpenings);
    }

  } else if (attachWall === "back") {
    // Attachment to the back - inner wall (front side Z=0) is missing
    // Slope runs along Z: high at Z=0 (inner), low at Z=extentZ (outer)
    // CORNER JOIN: Left/Right are full extentZ depth, Outer runs BETWEEN them

    const heightAtZ = isPent
      ? (z) => wallHeightInner + (wallHeightOuter - wallHeightInner) * (z / extentZ)
      : () => wallHeightInner;

    const outerLen = extentX - 2 * wallThk;

    const leftOpenings = openingsForWall('left');
    const rightOpenings = openingsForWall('right');
    const outerOpenings = openingsForWall('outer');

    // LEFT WALL (at X=0, runs along Z, full depth) - potentially sloped for pent
    buildVariantWall('left', 'z', extentZ, { x: 0, z: 0 }, isPent, heightAtZ, mkSlopedPlateAlongZ, leftOpenings);
    buildAttOpeningFraming(attId, 'left', 'z', { x: 0, z: 0 }, leftOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtZ, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongZ(scene, root, attId, 'left', extentZ, wallHeightInner, -CLAD_T_MM, wallBaseY, 0, cladMat, isPent, heightAtZ, false, 0, leftOpenings);
    }

    // RIGHT WALL (at X=extentX-wallThk, runs along Z, full depth) - potentially sloped for pent
    buildVariantWall('right', 'z', extentZ, { x: extentX - wallThk, z: 0 }, isPent, heightAtZ, mkSlopedPlateAlongZ, rightOpenings);
    buildAttOpeningFraming(attId, 'right', 'z', { x: extentX - wallThk, z: 0 }, rightOpenings,
                           wallBaseY, plateH, studW, wallThk, isPent, heightAtZ, mkBox, studMat);
    if (claddingEnabled) {
      buildCladdingAlongZ(scene, root, attId, 'right', extentZ, wallHeightInner, extentX, wallBaseY, 0, cladMat, isPent, heightAtZ, false, 0, rightOpenings);
    }

    // OUTER WALL (at Z=extentZ-wallThk, runs along X, between left/right) - flat height
    buildVariantWall('outer', 'x', outerLen, { x: wallThk, z: extentZ - wallThk }, false, () => wallHeightOuter, null, outerOpenings);
    buildAttOpeningFraming(attId, 'outer', 'x', { x: wallThk, z: extentZ - wallThk }, outerOpenings,
                           wallBaseY, plateH, studW, wallThk, false, () => wallHeightOuter, mkBox, studMat);
    if (claddingEnabled) {
      // For apex roofs, pass the crest height so cladding extends into the gable
      const apexCrest = isApex ? (attachment.roof?.apex?.crestHeight_mm || 400) : 0;
      buildCladdingAlongX(scene, root, attId, 'outer', outerLen, wallBaseY, extentZ, false, () => wallHeightOuter, cladMat, wallThk, isApex, apexCrest, outerOpenings);
    }
  }
}

/**
 * Build door and window openings for an attachment building.
 *
 * Strategy: Create a synthetic state object that maps the attachment's local
 * coordinate system to what Doors.build3D / Windows.build3D expect (state.w,
 * state.d, wall names front/back/left/right), then call them with a
 * sectionContext that positions everything at the attachment's world location.
 *
 * Wall name mapping (attachment wall → standard wall name):
 *   left/right attachment:  front→front, back→back, outer→left(left)/right(right)
 *   front/back attachment:  left→left, right→right, outer→front(front)/back(back)
 */
function buildAttachmentOpenings(scene, root, attId, extentX, extentZ, attachWall, attachment, worldPos, materials, ctx,
                                 wallHeightInner, wallHeightOuter, roofType) {
  const openings = Array.isArray(attachment.walls?.openings) ? attachment.walls.openings : [];
  if (openings.length === 0) return;

  // Determine wall name mapping based on which main wall we're attached to
  // The synthetic state uses w=extentX, d=extentZ (matching local coords)
  const wallMap = getAttachmentWallMap(attachWall);
  const isPent = roofType === "pent";

  // Wall height at a given position along the slope (for pent roofs)
  // For left attachment: slope runs along X, high at X=extentX (inner), low at X=0 (outer)
  // For right attachment: slope along X, high at X=0 (inner), low at X=extentX (outer)
  // For front attachment: slope along Z, high at Z=extentZ (inner), low at Z=0 (outer)
  // For back attachment: slope along Z, high at Z=0 (inner), low at Z=extentZ (outer)
  function getWallHeightAtPosition(attWallName, x_mm) {
    if (!isPent) return wallHeightInner; // Apex: uniform wall height

    // "outer" wall always has the lowest (constant) height
    if (attWallName === "outer") return wallHeightOuter;

    // Front/back walls on left/right attachments: slope runs along X
    if (attachWall === "left" || attachWall === "right") {
      // front/back walls run along X axis
      const fraction = x_mm / extentX;
      if (attachWall === "left") {
        // High at X=extentX (inner), low at X=0 (outer)
        return wallHeightOuter + (wallHeightInner - wallHeightOuter) * fraction;
      } else {
        // High at X=0 (inner), low at X=extentX (outer)
        return wallHeightInner + (wallHeightOuter - wallHeightInner) * fraction;
      }
    }
    // Left/right walls on front/back attachments: slope runs along Z
    if (attachWall === "front" || attachWall === "back") {
      // left/right walls run along Z axis - but x_mm here is position along the wall
      const fraction = x_mm / extentZ;
      if (attachWall === "front") {
        // High at Z=extentZ (inner), low at Z=0 (outer)
        return wallHeightOuter + (wallHeightInner - wallHeightOuter) * fraction;
      } else {
        // High at Z=0 (inner), low at Z=extentZ (outer)
        return wallHeightInner + (wallHeightOuter - wallHeightInner) * fraction;
      }
    }
    return wallHeightInner;
  }

  // Clearance: leave room for top plate (50mm) below wall height
  const TOP_PLATE_CLEARANCE = PLATE_HEIGHT_MM; // 50mm

  // Map attachment openings to standard wall names, with height capping
  const mappedOpenings = openings.map(function(o) {
    const mapped = Object.assign({}, o);
    const standardWall = wallMap[o.wall];
    if (standardWall) {
      mapped.wall = standardWall;
    } else {
      console.warn("[attachments] Unknown attachment wall name:", o.wall, "for attachment on", attachWall);
      mapped.wall = "front"; // fallback
    }

    // Outer wall runs between corner walls, starting at wallThk offset.
    // x_mm for outer openings is relative to the outer wall start, but the
    // standard wall coordinate system starts at 0.  We must add wallThk so
    // that Doors/Windows position the opening correctly in world space.
    if (o.wall === "outer") {
      mapped.x_mm = (mapped.x_mm || 0) + attWallThk; // +wallThk corner wall thickness (75mm basic, 100mm insulated)
      console.log("[attachments] Offset outer opening", mapped.id, "x_mm by wallThk:", attWallThk, "→", mapped.x_mm);
    }

    // Cap opening height to available wall height at this position
    const x = mapped.x_mm || 0;
    const openingWidth = mapped.width_mm || 800;
    // Use the minimum wall height across the opening's width (conservative)
    const heightAtStart = getWallHeightAtPosition(o.wall, x);
    const heightAtEnd = getWallHeightAtPosition(o.wall, x + openingWidth);
    const minWallHeight = Math.min(heightAtStart, heightAtEnd);
    // Maximum opening height = wall height - top plate clearance
    const maxOpeningHeight = Math.max(200, minWallHeight - TOP_PLATE_CLEARANCE);

    if (mapped.type === "door") {
      if (mapped.height_mm > maxOpeningHeight) {
        console.log("[attachments] Capping door", mapped.id, "height from", mapped.height_mm, "to", maxOpeningHeight,
                    "(wall height at pos:", minWallHeight, ")");
        mapped.height_mm = maxOpeningHeight;
      }
    } else if (mapped.type === "window") {
      const winY = mapped.y_mm || 800;
      const winTop = winY + (mapped.height_mm || 400);
      if (winTop > maxOpeningHeight) {
        // First try reducing height, then reduce y position
        const newHeight = Math.max(200, maxOpeningHeight - winY);
        if (newHeight >= 200) {
          console.log("[attachments] Capping window", mapped.id, "height from", mapped.height_mm, "to", newHeight);
          mapped.height_mm = newHeight;
        } else {
          // Window doesn't fit at all at this Y - move it down
          mapped.y_mm = Math.max(200, maxOpeningHeight - (mapped.height_mm || 400));
          console.log("[attachments] Moving window", mapped.id, "y_mm to", mapped.y_mm);
        }
      }
    }

    return mapped;
  });

  // Build synthetic state that Doors/Windows expect
  const attVariant = attachment.walls?.variant || "basic";
  const attWallThk = attVariant === "insulated" ? STUD_H_INSULATED_MM : STUD_H_BASIC_MM;
  const syntheticState = {
    w: extentX,
    d: extentZ,
    walls: {
      variant: attVariant,
      openings: mappedOpenings,
      insulated: { section: { w: STUD_W_MM, h: STUD_H_INSULATED_MM }, spacing: STUD_SPACING_MM },
      basic: { section: { w: STUD_W_MM, h: STUD_H_BASIC_MM }, spacing: null }
    },
    frame: { thickness_mm: STUD_W_MM, depth_mm: attWallThk }
  };

  // Section context: positions openings in world space at the attachment root
  const sectionContext = {
    sectionId: "att-" + attId,
    position: { x: worldPos.x, y: worldPos.y, z: worldPos.z }
  };

  console.log("[attachments] Building openings with synthetic state:",
    "w:", syntheticState.w, "d:", syntheticState.d,
    "openings:", mappedOpenings.length,
    "sectionPos:", sectionContext.position);

  // Build doors
  const doors = mappedOpenings.filter(o => o.type === "door" && o.enabled !== false);
  if (doors.length > 0 && Doors && typeof Doors.build3D === "function") {
    try {
      Doors.build3D(syntheticState, ctx, sectionContext);
      console.log("[attachments] Doors built:", doors.length);
    } catch (e) {
      console.error("[attachments] Error building doors:", e);
    }
  }

  // Build windows
  const windows = mappedOpenings.filter(o => o.type === "window" && o.enabled !== false);
  if (windows.length > 0 && Windows && typeof Windows.build3D === "function") {
    try {
      Windows.build3D(syntheticState, ctx, sectionContext);
      console.log("[attachments] Windows built:", windows.length);
    } catch (e) {
      console.error("[attachments] Error building windows:", e);
    }
  }
}

/**
 * Map attachment wall names to standard wall names used by Doors/Windows.
 * @param {string} attachToWall - Which main building wall this attachment is on
 * @returns {Object} Map from attachment wall name → standard wall name
 */
function getAttachmentWallMap(attachToWall) {
  switch (attachToWall) {
    case "left":
      // extentX = depth outward (+X from main), extentZ = width along wall
      // front (Z=0), back (Z=extentZ), outer (X=0) = "left" in standard coords
      return { front: "front", back: "back", outer: "left" };
    case "right":
      // extentX = depth outward (-X from main), extentZ = width along wall
      // front (Z=0), back (Z=extentZ), outer (X=extentX) = "right" in standard coords
      return { front: "front", back: "back", outer: "right" };
    case "front":
      // extentX = width along wall, extentZ = depth outward (-Z from main)
      // left (X=0), right (X=extentX), outer (Z=0) = "front" in standard coords
      return { left: "left", right: "right", outer: "front" };
    case "back":
      // extentX = width along wall, extentZ = depth outward (+Z from main)
      // left (X=0), right (X=extentX), outer (Z=extentZ) = "back" in standard coords
      return { left: "left", right: "right", outer: "back" };
    default:
      return { front: "front", back: "back", outer: "left" };
  }
}

// ============================================================================
// BASIC VARIANT: PANEL-BASED STUD LAYOUT
// Replicates primary building logic from walls.js computeBasicPanels/buildBasicPanel
// ============================================================================

/**
 * Compute basic panel splits for a wall.
 * If wall length > BASIC_MAX_PANEL_MM (2400mm), split into 2 panels.
 * Accounts for openings near the seam to avoid awkward splits.
 *
 * @param {number} length - Wall length in mm
 * @param {number} studW - Stud width (50mm)
 * @param {Array} openingsX - Opening intervals [{x0, x1, ...}]
 * @returns {Array} panels [{start, len}, ...]
 */
function computeAttBasicPanels(length, studW, openingsX) {
  let panels = [{ start: 0, len: length }];

  if (length > BASIC_MAX_PANEL_MM) {
    const p1 = Math.floor(length / 2);
    const p2 = length - p1;
    panels = [{ start: 0, len: p1 }, { start: p1, len: p2 }];

    const seamA = p1 - studW;
    const seamB = p1 + studW;

    const all = openingsX
      .map((o) => ({ x0: Math.floor(o.x0 ?? o.x_mm ?? 0), x1: Math.floor(o.x1 ?? ((o.x_mm || 0) + (o.width_mm || 0))) }))
      .filter((o) => Number.isFinite(o.x0) && Number.isFinite(o.x1));

    all.sort((a, b) => (a.x0 - b.x0) || (a.x1 - b.x1));

    const clusters = [];
    if (all.length) {
      let cs = all[0].x0;
      let ce = all[0].x1;
      for (let i = 1; i < all.length; i++) {
        const o = all[i];
        const ne = Math.max(ce, o.x1);
        const span = ne - cs;
        if (span <= BASIC_MAX_PANEL_MM) {
          ce = ne;
        } else {
          clusters.push({ x0: cs, x1: ce });
          cs = o.x0;
          ce = o.x1;
        }
      }
      clusters.push({ x0: cs, x1: ce });
    }

    const regions = [];
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const coversSeam = !(c.x1 < seamA || c.x0 > seamB);
      if (!coversSeam) continue;

      const clusterPanelStart = Math.max(0, Math.min(c.x0 - studW, length));
      const clusterPanelEnd = Math.max(0, Math.min(c.x1 + studW, length));

      regions.push({ start: clusterPanelStart, end: clusterPanelEnd });
    }

    if (regions.length) {
      regions.sort((a, b) => a.start - b.start || a.end - b.end);

      const merged = [];
      let cur = { start: regions[0].start, end: regions[0].end };
      for (let i = 1; i < regions.length; i++) {
        const r = regions[i];
        if (r.start <= (cur.end + 1)) {
          cur.end = Math.max(cur.end, r.end);
        } else {
          merged.push(cur);
          cur = { start: r.start, end: r.end };
        }
      }
      merged.push(cur);

      const next = [];
      let cursor = 0;
      for (let i = 0; i < merged.length; i++) {
        const r = merged[i];
        const s = Math.max(0, Math.min(r.start, length));
        const e = Math.max(0, Math.min(r.end, length));
        if (s > cursor) {
          const leftLen = Math.max(0, s - cursor);
          if (leftLen > 0) next.push({ start: cursor, len: leftLen });
        }
        const midLen = Math.max(0, e - s);
        if (midLen > 0) next.push({ start: s, len: midLen });
        cursor = Math.max(cursor, e);
      }
      if (cursor < length) {
        const rightLen = Math.max(0, length - cursor);
        if (rightLen > 0) next.push({ start: cursor, len: rightLen });
      }

      panels = next.length ? next : panels;
    }
  }

  return panels;
}

/**
 * Build a single basic panel: left stud, centre stud, right stud.
 * Replicates primary building's buildBasicPanel logic.
 */
function buildAttBasicPanel(scene, root, attId, wallId, panelIdx, axis, panelLen, origin,
                             offsetAlong, baseY, wallThk, plateH, studW, plateMat, studMat,
                             isSloped, heightAt, mkBox, openings) {
  const isAlongX = axis === 'x';
  const prefix = `att-${attId}-${wallId}-panel-${panelIdx}`;

  // Stud height helper
  const hForStart = (posStart) => {
    if (!isSloped) {
      const h0 = heightAt(0);
      return Math.max(1, h0 - 2 * plateH);
    }
    const posCenter = posStart + studW / 2;
    return Math.max(1, heightAt(posCenter) - 2 * plateH);
  };

  // Bottom plate for this panel
  if (isAlongX) {
    mkBox(`${prefix}-plate-bottom`, panelLen, plateH, wallThk,
          { x: origin.x + offsetAlong, y: baseY, z: origin.z }, plateMat);
  } else {
    mkBox(`${prefix}-plate-bottom`, wallThk, plateH, panelLen,
          { x: origin.x, y: baseY, z: origin.z + offsetAlong }, plateMat);
  }

  // Top plate for this panel
  if (!isSloped) {
    const topPlateY = baseY + heightAt(0) - plateH;
    if (isAlongX) {
      mkBox(`${prefix}-plate-top`, panelLen, plateH, wallThk,
            { x: origin.x + offsetAlong, y: topPlateY, z: origin.z }, plateMat);
    } else {
      mkBox(`${prefix}-plate-top`, wallThk, plateH, panelLen,
            { x: origin.x, y: topPlateY, z: origin.z + offsetAlong }, plateMat);
    }
  }
  // Note: sloped top plates are built by the parent caller (buildAttachmentWalls)

  // Place stud helper
  const placeStud = (posWorld_x, posWorld_z, idx, posStartRel) => {
    const h = hForStart(posStartRel);
    if (h <= 0) return;
    if (isAlongX) {
      mkBox(`${prefix}-stud-${idx}`, studW, h, wallThk,
            { x: posWorld_x, y: baseY + plateH, z: posWorld_z }, studMat);
    } else {
      mkBox(`${prefix}-stud-${idx}`, wallThk, h, studW,
            { x: posWorld_x, y: baseY + plateH, z: posWorld_z }, studMat);
    }
  };

  // Check if a stud at this position overlaps any opening
  const panelOpenings = openings.filter((o) => {
    const ox0 = o.x_mm || o.x0 || 0;
    const ox1 = (o.x_mm || 0) + (o.width_mm || 0);
    const s = o.x0 !== undefined ? o.x0 : ox0;
    const e = o.x1 !== undefined ? o.x1 : ox1;
    return e > offsetAlong && s < (offsetAlong + panelLen);
  });

  const studAt = (posStart) => {
    for (let i = 0; i < panelOpenings.length; i++) {
      const d = panelOpenings[i];
      const s = d.x0 !== undefined ? d.x0 : (d.x_mm || 0);
      const e = d.x1 !== undefined ? d.x1 : ((d.x_mm || 0) + (d.width_mm || 0));
      if (posStart + studW > s && posStart < e) return false;
    }
    return true;
  };

  if (isAlongX) {
    const x0 = origin.x + offsetAlong;
    const x1 = origin.x + offsetAlong + panelLen - studW;
    const xm = Math.max(x0, Math.floor(origin.x + offsetAlong + panelLen / 2 - studW / 2));

    if (studAt(offsetAlong)) placeStud(x0, origin.z, 0, offsetAlong);
    if (studAt(offsetAlong + panelLen - studW)) placeStud(x1, origin.z, 1, offsetAlong + panelLen - studW);
    if (studAt(xm - origin.x)) placeStud(xm, origin.z, 2, xm - origin.x);
  } else {
    const z0 = origin.z + offsetAlong;
    const z1 = origin.z + offsetAlong + panelLen - studW;
    const zm = Math.max(z0, Math.floor(origin.z + offsetAlong + panelLen / 2 - studW / 2));

    if (studAt(offsetAlong)) placeStud(origin.x, z0, 0, offsetAlong);
    if (studAt(offsetAlong + panelLen - studW)) placeStud(origin.x, z1, 1, offsetAlong + panelLen - studW);
    if (studAt(zm - origin.z)) placeStud(origin.x, zm, 2, zm - origin.z);
  }
}

// ============================================================================
// INSULATED VARIANT: REGULAR STUD SPACING (≤400mm)
// ============================================================================

/**
 * Build a single wall panel with plates and studs (INSULATED variant).
 * Studs at regular ≤400mm centres. Also used as fallback for basic when
 * buildWallPanel is called directly.
 * Handles both flat and sloped (pent) walls.
 * @param {string} axis - 'x' or 'z' - direction the wall runs
 * @param {number} length - wall length in mm
 * @param {object} origin - {x, z} position of wall start
 * @param {boolean} isSloped - whether this wall has a sloped top
 * @param {function} heightAt - function(position) returning wall height at that position
 */
function buildWallPanel(scene, root, attId, wallId, axis, length, origin, baseY, wallThk, plateH, studW, studSpacing, plateMat, studMat, isSloped, heightAt, mkBox, mkSlopedPlate, openings = []) {
  const isAlongX = axis === 'x';
  const prefix = `att-${attId}-${wallId}`;

  // Calculate wall heights at start and end
  const heightAtStart = heightAt(0);
  const heightAtEnd = heightAt(length);
  const wallHeight = isSloped ? Math.max(heightAtStart, heightAtEnd) : heightAtStart;

  // Build bottom plate (always flat)
  if (isAlongX) {
    mkBox(`${prefix}-plate-bottom`, length, plateH, wallThk, { x: origin.x, y: baseY, z: origin.z }, plateMat);
  } else {
    mkBox(`${prefix}-plate-bottom`, wallThk, plateH, length, { x: origin.x, y: baseY, z: origin.z }, plateMat);
  }

  // Build top plate
  if (!isSloped) {
    // Flat top plate
    const topPlateY = baseY + wallHeight - plateH;
    if (isAlongX) {
      mkBox(`${prefix}-plate-top`, length, plateH, wallThk, { x: origin.x, y: topPlateY, z: origin.z }, plateMat);
    } else {
      mkBox(`${prefix}-plate-top`, wallThk, plateH, length, { x: origin.x, y: topPlateY, z: origin.z }, plateMat);
    }
  } else if (mkSlopedPlate) {
    // Sloped top plate (prism)
    const yTop0 = baseY + heightAtStart;
    const yTop1 = baseY + heightAtEnd;
    if (isAlongX) {
      mkSlopedPlate(`${prefix}-plate-top`, length, wallThk, origin.x, origin.z, yTop0, yTop1, plateMat);
    } else {
      mkSlopedPlate(`${prefix}-plate-top`, wallThk, length, origin.x, origin.z, yTop0, yTop1, plateMat);
    }
  }

  // Check if a stud at this position overlaps any opening's framed zone
  // Opening framing occupies [x_mm - studW, x_mm + width_mm + studW]
  function studOverlapsOpening(studPos) {
    for (let i = 0; i < openings.length; i++) {
      const o = openings[i];
      const openLeft = (o.x_mm || 0) - studW;
      const openRight = (o.x_mm || 0) + (o.width_mm || 0) + studW;
      if (studPos + studW > openLeft && studPos < openRight) return true;
    }
    return false;
  }

  // Build studs
  const placeStud = (posAlongWall) => {
    if (studOverlapsOpening(posAlongWall)) return; // Skip studs in opening zones

    // Calculate stud height at this position
    const studHeight = isSloped
      ? Math.max(1, heightAt(posAlongWall + studW / 2) - 2 * plateH)
      : Math.max(1, wallHeight - 2 * plateH);

    if (studHeight <= 0) return;

    if (isAlongX) {
      mkBox(`${prefix}-stud-${posAlongWall}`, studW, studHeight, wallThk,
            { x: origin.x + posAlongWall, y: baseY + plateH, z: origin.z }, studMat);
    } else {
      mkBox(`${prefix}-stud-${posAlongWall}`, wallThk, studHeight, studW,
            { x: origin.x, y: baseY + plateH, z: origin.z + posAlongWall }, studMat);
    }
  };

  // Place end studs
  placeStud(0);
  if (length > studW) {
    placeStud(length - studW);
  }

  // Place intermediate studs at regular spacing
  let pos = studSpacing;
  while (pos < length - studW) {
    // Don't place if too close to end stud
    if (Math.abs(pos - (length - studW)) >= studW) {
      placeStud(pos);
    }
    pos += studSpacing;
  }
}

// ============================================================================
// INSULATION & PLYWOOD LINING (Insulated variant only)
// Replicates primary building logic: PIR insulation between studs + ply lining
// ============================================================================

/**
 * Build wall insulation (PIR) and plywood lining for an attachment's insulated walls.
 * Creates insulation panels between stud bays and a plywood sheet on the interior face.
 *
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.TransformNode} root - Attachment root node
 * @param {string} attId - Attachment ID
 * @param {string} wallId - Wall identifier (front/back/left/right/outer)
 * @param {string} axis - 'x' or 'z' - direction the wall runs
 * @param {number} length - Wall length in mm
 * @param {object} origin - {x, z} position of wall start (local to attachment root)
 * @param {number} baseY - Absolute Y of wall base (168mm typically)
 * @param {number} wallThk - Wall thickness / stud depth (100mm for insulated)
 * @param {number} plateH - Plate height (50mm)
 * @param {number} studW - Stud width (50mm)
 * @param {number} studSpacing - Stud spacing (400mm)
 * @param {boolean} isSloped - Whether this wall has a sloped top
 * @param {function} heightAt - Function(posAlongWall) → wall frame height at that position
 * @param {function} mkBox - Box creation helper
 * @param {Array} openings - Wall openings [{x_mm, width_mm, height_mm, ...}]
 */
function buildAttWallInsulation(scene, root, attId, wallId, axis, length, origin, baseY, wallThk, plateH, studW, studSpacing, isSloped, heightAt, mkBox, openings) {
  const isAlongX = axis === 'x';
  const prefix = `att-${attId}-${wallId}`;

  // Materials
  const insMat = new BABYLON.StandardMaterial(`${prefix}-ins-mat`, scene);
  insMat.diffuseColor = new BABYLON.Color3(0.95, 0.9, 0.4); // Yellow PIR
  insMat.alpha = 0.9;

  const plyMat = new BABYLON.StandardMaterial(`${prefix}-ply-mat`, scene);
  plyMat.diffuseColor = new BABYLON.Color3(0.85, 0.75, 0.65); // Light wood

  // Insulation height (between plates)
  const wallHeight = heightAt(0);
  const insHeight = Math.max(1, wallHeight - 2 * plateH);
  const insBaseY = baseY + plateH; // Top of bottom plate

  // Stud bay positions: find where studs are placed, insulation goes between them
  const studPositions = [0]; // Start stud
  let pos = studSpacing;
  while (pos < length - studW) {
    if (Math.abs(pos - (length - studW)) >= studW) {
      studPositions.push(pos);
    }
    pos += studSpacing;
  }
  if (length > studW) {
    studPositions.push(length - studW);
  }
  studPositions.sort((a, b) => a - b);

  // Check if a position range overlaps any opening
  function overlapsOpening(start, end) {
    for (let i = 0; i < openings.length; i++) {
      const o = openings[i];
      const oStart = o.x_mm || 0;
      const oEnd = oStart + (o.width_mm || 0);
      if (end > oStart && start < oEnd) return true;
    }
    return false;
  }

  // Build insulation panels between each pair of adjacent studs
  for (let i = 0; i < studPositions.length - 1; i++) {
    const bayStart = studPositions[i] + studW; // After left stud
    const bayEnd = studPositions[i + 1];       // Before right stud
    const bayWidth = bayEnd - bayStart;

    if (bayWidth <= 0) continue;
    if (overlapsOpening(bayStart, bayEnd)) continue;

    // Insulation height at bay centre (for sloped walls)
    const bayCentre = bayStart + bayWidth / 2;
    const bayInsHeight = isSloped
      ? Math.max(1, heightAt(bayCentre) - 2 * plateH)
      : insHeight;

    if (bayInsHeight <= 0) continue;

    // Insulation is PIR_THICKNESS_MM deep, positioned against the OUTER face of the wall
    // (studs are wallThk deep, insulation fills the inner portion)
    if (isAlongX) {
      const mesh = mkBox(`${prefix}-ins-${i}`, bayWidth, bayInsHeight, PIR_THICKNESS_MM,
            { x: origin.x + bayStart, y: insBaseY, z: origin.z + (wallThk - PIR_THICKNESS_MM) }, insMat);
      if (mesh) mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-insulation' };
    } else {
      const mesh = mkBox(`${prefix}-ins-${i}`, PIR_THICKNESS_MM, bayInsHeight, bayWidth,
            { x: origin.x + (wallThk - PIR_THICKNESS_MM), y: insBaseY, z: origin.z + bayStart }, insMat);
      if (mesh) mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-insulation' };
    }
  }

  // Build plywood lining on interior face (covers the full wall, inside the insulation)
  // Plywood sits on the INTERIOR side, after the insulation
  const plyOffset = wallThk; // Flush with interior face of wall

  // Full-wall plywood (simple rectangle for flat walls)
  if (!isSloped) {
    if (isAlongX) {
      const mesh = mkBox(`${prefix}-ply`, length, insHeight, PLY_THICKNESS_MM,
            { x: origin.x, y: insBaseY, z: origin.z + plyOffset }, plyMat);
      if (mesh) mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-plywood' };
    } else {
      const mesh = mkBox(`${prefix}-ply`, PLY_THICKNESS_MM, insHeight, length,
            { x: origin.x + plyOffset, y: insBaseY, z: origin.z }, plyMat);
      if (mesh) mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-plywood' };
    }
  } else {
    // For sloped walls, approximate with segments matching stud bays
    for (let i = 0; i < studPositions.length - 1; i++) {
      const bayStart = studPositions[i];
      const bayEnd = studPositions[i + 1] + studW;
      const bayWidth = bayEnd - bayStart;
      if (bayWidth <= 0) continue;
      if (overlapsOpening(bayStart, bayEnd)) continue;

      const bayCentre = bayStart + bayWidth / 2;
      const bayH = Math.max(1, heightAt(bayCentre) - 2 * plateH);

      if (isAlongX) {
        const mesh = mkBox(`${prefix}-ply-${i}`, bayWidth, bayH, PLY_THICKNESS_MM,
              { x: origin.x + bayStart, y: insBaseY, z: origin.z + plyOffset }, plyMat);
        if (mesh) mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-plywood' };
      } else {
        const mesh = mkBox(`${prefix}-ply-${i}`, PLY_THICKNESS_MM, bayH, bayWidth,
              { x: origin.x + plyOffset, y: insBaseY, z: origin.z + bayStart }, plyMat);
        if (mesh) mesh.metadata = { dynamic: true, attachmentId: attId, type: 'wall-plywood' };
      }
    }
  }

  console.log("[attachments] Built insulation + ply lining for wall:", wallId, "bays:", studPositions.length - 1);
}

// ============================================================================
// OPENING FRAMING HELPERS
// Mirror main building walls.js: uprights, headers, sills, cripple studs
// ============================================================================

/**
 * Add door framing for an attachment wall running along X axis.
 * Creates left/right uprights, header beam, and cripple studs above.
 *
 * @param {string} attId - Attachment ID
 * @param {string} wallId - Wall identifier (front/back/outer/left/right)
 * @param {object} origin - Wall origin {x, z} in mm (local to attachment root)
 * @param {object} door - Opening definition {id, x_mm, width_mm, height_mm}
 * @param {number} baseY - Absolute Y of wall base (168mm typically)
 * @param {number} plateH - Plate height (50mm)
 * @param {number} studW - Stud width (50mm)
 * @param {number} wallThk - Wall thickness / stud depth (75mm)
 * @param {boolean} isSloped - Whether this wall has a sloped top (pent)
 * @param {function} heightAt - Function(posAlongWall) → wall frame height at that position
 * @param {function} mkBox - Box creation helper (name, lenX, lenY, lenZ, pos, mat)
 * @param {object} mat - Material for framing members
 */
function addAttDoorFramingAlongX(attId, wallId, origin, door, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat) {
  const x_mm = door.x_mm || 0;
  const width_mm = door.width_mm || 800;
  let height_mm = door.height_mm || 1900;
  // Half-height doors (e.g. bin store)
  if (door.style === 'double-half') height_mm = Math.max(600, Math.floor(height_mm * 0.5));
  const id = door.id || 'unknown';
  const studH = wallThk; // Header beam height = stud depth (75mm)

  const plateY = baseY + plateH; // Top of bottom plate (absolute Y)

  // Wall height at door centre
  const centerPos = x_mm + width_mm / 2;
  const wallHeight = isSloped ? heightAt(centerPos) : heightAt(0);
  const wallTop = baseY + wallHeight; // Absolute Y of wall top

  // Header Y (absolute) — clamped so header fits below top plate
  const desiredHeaderY = plateY + height_mm;
  const maxHeaderY = Math.max(plateY, wallTop - studH);
  const headerY = Math.min(desiredHeaderY, maxHeaderY);

  // Upright height = bottom plate top → header bottom
  const uprightH = Math.max(1, headerY - plateY);

  // Left upright
  mkBox(`att-${attId}-${wallId}-door-${id}-upright-L`,
    studW, uprightH, wallThk,
    { x: origin.x + x_mm - studW, y: plateY, z: origin.z },
    mat);

  // Right upright
  mkBox(`att-${attId}-${wallId}-door-${id}-upright-R`,
    studW, uprightH, wallThk,
    { x: origin.x + x_mm + width_mm, y: plateY, z: origin.z },
    mat);

  // Header beam (spans both uprights)
  const headerL = width_mm + 2 * studW;
  mkBox(`att-${attId}-${wallId}-door-${id}-header`,
    headerL, studH, wallThk,
    { x: origin.x + x_mm - studW, y: headerY, z: origin.z },
    mat);

  // Cripple studs above header (if space allows)
  const headerTopY = headerY + studH;
  const topPlateBottomY = wallTop - plateH;
  const spaceAbove = Math.max(0, topPlateBottomY - headerTopY);
  if (spaceAbove > studW) {
    mkBox(`att-${attId}-${wallId}-door-${id}-cripple-L`,
      studW, spaceAbove, wallThk,
      { x: origin.x + x_mm - studW, y: headerTopY, z: origin.z },
      mat);
    mkBox(`att-${attId}-${wallId}-door-${id}-cripple-R`,
      studW, spaceAbove, wallThk,
      { x: origin.x + x_mm + width_mm, y: headerTopY, z: origin.z },
      mat);
  }
}

/**
 * Add door framing for an attachment wall running along Z axis.
 * Same members as AlongX but with swapped X/Z dimensions.
 */
function addAttDoorFramingAlongZ(attId, wallId, origin, door, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat) {
  const z_mm = door.x_mm || 0; // x_mm in opening def = position along wall (Z here)
  const width_mm = door.width_mm || 800;
  let height_mm = door.height_mm || 1900;
  // Half-height doors (e.g. bin store)
  if (door.style === 'double-half') height_mm = Math.max(600, Math.floor(height_mm * 0.5));
  const id = door.id || 'unknown';
  const studH = wallThk; // 75mm

  const plateY = baseY + plateH;
  const centerPos = z_mm + width_mm / 2;
  const wallHeight = isSloped ? heightAt(centerPos) : heightAt(0);
  const wallTop = baseY + wallHeight;

  const desiredHeaderY = plateY + height_mm;
  const maxHeaderY = Math.max(plateY, wallTop - studH);
  const headerY = Math.min(desiredHeaderY, maxHeaderY);
  const uprightH = Math.max(1, headerY - plateY);

  // Left upright (Z-axis: wallThk wide in X, studW deep in Z)
  mkBox(`att-${attId}-${wallId}-door-${id}-upright-L`,
    wallThk, uprightH, studW,
    { x: origin.x, y: plateY, z: origin.z + z_mm - studW },
    mat);

  // Right upright
  mkBox(`att-${attId}-${wallId}-door-${id}-upright-R`,
    wallThk, uprightH, studW,
    { x: origin.x, y: plateY, z: origin.z + z_mm + width_mm },
    mat);

  // Header beam
  const headerL = width_mm + 2 * studW;
  mkBox(`att-${attId}-${wallId}-door-${id}-header`,
    wallThk, studH, headerL,
    { x: origin.x, y: headerY, z: origin.z + z_mm - studW },
    mat);

  // Cripple studs above header
  const headerTopY = headerY + studH;
  const topPlateBottomY = wallTop - plateH;
  const spaceAbove = Math.max(0, topPlateBottomY - headerTopY);
  if (spaceAbove > studW) {
    mkBox(`att-${attId}-${wallId}-door-${id}-cripple-L`,
      wallThk, spaceAbove, studW,
      { x: origin.x, y: headerTopY, z: origin.z + z_mm - studW },
      mat);
    mkBox(`att-${attId}-${wallId}-door-${id}-cripple-R`,
      wallThk, spaceAbove, studW,
      { x: origin.x, y: headerTopY, z: origin.z + z_mm + width_mm },
      mat);
  }
}

/**
 * Add window framing for an attachment wall running along X axis.
 * Creates full-height uprights, header, sill, and cripple studs below sill.
 */
function addAttWindowFramingAlongX(attId, wallId, origin, win, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat) {
  const x_mm = win.x_mm || 0;
  const width_mm = win.width_mm || 600;
  const height_mm = win.height_mm || 400;
  const y_mm = win.y_mm || 900; // Sill height above bottom plate
  const id = win.id || 'unknown';
  const studH = wallThk; // 75mm

  const plateY = baseY + plateH;
  const centerPos = x_mm + width_mm / 2;
  const wallHeight = isSloped ? heightAt(centerPos) : heightAt(0);
  const wallTop = baseY + wallHeight;

  // Full-height uprights (bottom plate top → top plate bottom)
  const studLen = Math.max(1, wallHeight - 2 * plateH);

  // Left upright (full height)
  mkBox(`att-${attId}-${wallId}-win-${id}-upright-L`,
    studW, studLen, wallThk,
    { x: origin.x + x_mm - studW, y: plateY, z: origin.z },
    mat);

  // Right upright (full height)
  mkBox(`att-${attId}-${wallId}-win-${id}-upright-R`,
    studW, studLen, wallThk,
    { x: origin.x + x_mm + width_mm, y: plateY, z: origin.z },
    mat);

  // Sill and header Y positions (absolute)
  const sillY = Math.min(plateY + y_mm, wallTop - studH);
  const headerY = Math.min(sillY + height_mm, wallTop - studH);

  // Header beam
  const headerL = width_mm + 2 * studW;
  mkBox(`att-${attId}-${wallId}-win-${id}-header`,
    headerL, studH, wallThk,
    { x: origin.x + x_mm - studW, y: headerY, z: origin.z },
    mat);

  // Sill beam
  mkBox(`att-${attId}-${wallId}-win-${id}-sill`,
    headerL, studH, wallThk,
    { x: origin.x + x_mm - studW, y: sillY - studH, z: origin.z },
    mat);

  // Cripple studs below sill (from bottom plate top to sill underside)
  const crippleHeight = Math.max(0, sillY - studH - plateY);
  if (crippleHeight > studW) {
    const innerWidth = Math.max(0, width_mm);
    const studSpacing = 400;
    const numCripples = Math.max(1, Math.min(10, Math.floor(innerWidth / studSpacing)));
    const crippleSpacing = innerWidth / (numCripples + 1);

    for (let ci = 1; ci <= numCripples; ci++) {
      const crippleX = origin.x + x_mm + (ci * crippleSpacing) - (studW / 2);
      mkBox(`att-${attId}-${wallId}-win-${id}-cripple-${ci}`,
        studW, crippleHeight, wallThk,
        { x: crippleX, y: plateY, z: origin.z },
        mat);
    }
  }
}

/**
 * Add window framing for an attachment wall running along Z axis.
 * Same members as AlongX but with swapped X/Z dimensions.
 */
function addAttWindowFramingAlongZ(attId, wallId, origin, win, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat) {
  const z_mm = win.x_mm || 0; // x_mm in opening def = position along wall (Z here)
  const width_mm = win.width_mm || 600;
  const height_mm = win.height_mm || 400;
  const y_mm = win.y_mm || 900;
  const id = win.id || 'unknown';
  const studH = wallThk; // 75mm

  const plateY = baseY + plateH;
  const centerPos = z_mm + width_mm / 2;
  const wallHeight = isSloped ? heightAt(centerPos) : heightAt(0);
  const wallTop = baseY + wallHeight;

  const studLen = Math.max(1, wallHeight - 2 * plateH);

  // Left upright (full height)
  mkBox(`att-${attId}-${wallId}-win-${id}-upright-L`,
    wallThk, studLen, studW,
    { x: origin.x, y: plateY, z: origin.z + z_mm - studW },
    mat);

  // Right upright (full height)
  mkBox(`att-${attId}-${wallId}-win-${id}-upright-R`,
    wallThk, studLen, studW,
    { x: origin.x, y: plateY, z: origin.z + z_mm + width_mm },
    mat);

  // Sill and header Y positions
  const sillY = Math.min(plateY + y_mm, wallTop - studH);
  const headerY = Math.min(sillY + height_mm, wallTop - studH);

  // Header beam
  const headerL = width_mm + 2 * studW;
  mkBox(`att-${attId}-${wallId}-win-${id}-header`,
    wallThk, studH, headerL,
    { x: origin.x, y: headerY, z: origin.z + z_mm - studW },
    mat);

  // Sill beam
  mkBox(`att-${attId}-${wallId}-win-${id}-sill`,
    wallThk, studH, headerL,
    { x: origin.x, y: sillY - studH, z: origin.z + z_mm - studW },
    mat);

  // Cripple studs below sill
  const crippleHeight = Math.max(0, sillY - studH - plateY);
  if (crippleHeight > studW) {
    const innerWidth = Math.max(0, width_mm);
    const studSpacing = 400;
    const numCripples = Math.max(1, Math.min(10, Math.floor(innerWidth / studSpacing)));
    const crippleSpacing = innerWidth / (numCripples + 1);

    for (let ci = 1; ci <= numCripples; ci++) {
      const crippleZ = origin.z + z_mm + (ci * crippleSpacing) - (studW / 2);
      mkBox(`att-${attId}-${wallId}-win-${id}-cripple-${ci}`,
        wallThk, crippleHeight, studW,
        { x: origin.x, y: plateY, z: crippleZ },
        mat);
    }
  }
}

/**
 * Build all opening framing (doors + windows) for a single attachment wall.
 * Dispatches to the appropriate AlongX/AlongZ helpers based on wall axis.
 *
 * @param {string} attId - Attachment ID
 * @param {string} wallId - Wall identifier
 * @param {string} axis - 'x' or 'z'
 * @param {object} origin - Wall origin {x, z}
 * @param {Array} openings - Openings on this wall [{id, type, x_mm, width_mm, height_mm, y_mm, ...}]
 * @param {number} baseY - Wall base Y
 * @param {number} plateH - Plate height
 * @param {number} studW - Stud width
 * @param {number} wallThk - Wall thickness
 * @param {boolean} isSloped - Sloped top
 * @param {function} heightAt - Height function
 * @param {function} mkBox - Box creation helper
 * @param {object} mat - Timber material
 */
function buildAttOpeningFraming(attId, wallId, axis, origin, openings, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat) {
  if (!openings || openings.length === 0) return;

  const isAlongX = axis === 'x';

  for (let i = 0; i < openings.length; i++) {
    const o = openings[i];
    if (o.enabled === false) continue;

    if (o.type === 'door') {
      if (isAlongX) {
        addAttDoorFramingAlongX(attId, wallId, origin, o, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat);
      } else {
        addAttDoorFramingAlongZ(attId, wallId, origin, o, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat);
      }
    } else if (o.type === 'window') {
      if (isAlongX) {
        addAttWindowFramingAlongX(attId, wallId, origin, o, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat);
      } else {
        addAttWindowFramingAlongZ(attId, wallId, origin, o, baseY, plateH, studW, wallThk, isSloped, heightAt, mkBox, mat);
      }
    }
  }
}

/**
 * Create cladding material matching the main building
 */
function createCladdingMaterial(scene, name) {
  const mat = new BABYLON.StandardMaterial(name, scene);
  mat.diffuseColor = new BABYLON.Color3(0.85, 0.72, 0.55);
  mat.emissiveColor = new BABYLON.Color3(0.17, 0.14, 0.11);
  mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  mat.specularPower = 16;
  mat.backFaceCulling = false;
  return mat;
}

/**
 * Build cladding courses along X axis (for front/back walls)
 * For sloped walls, uses CSG to cleanly clip cladding at the roof line (matching main building)
 * @param {number} xOffset - optional X offset for walls that start after x=0 (e.g., outer wall between side walls)
 */
function buildCladdingAlongX(scene, root, attId, wallId, length, baseY, zPos, isSloped, heightAtX, cladMat, xOffset = 0, isApexGable = false, apexCrestHeight = 0, openings = []) {
  // For apex gables, we need to build up to the crest height
  const maxWallHeight = isApexGable ? apexCrestHeight : (isSloped ? Math.max(heightAtX(0), heightAtX(length)) : heightAtX(0));
  // Build extra courses above roof line for ALL walls:
  // - Sloped walls: CSG will trim them to the slope
  // - Non-sloped walls: extra courses extend behind fascia (hidden)
  // - Apex gables: CSG will trim to triangular peak
  const extraHeight = isSloped ? 500 : (isApexGable ? 200 : 200);
  const cladHeight = maxWallHeight + CLAD_BOTTOM_DROP_MM + extraHeight;
  const numCourses = Math.ceil(cladHeight / CLAD_H_MM);

  console.log("[attachments] buildCladdingAlongX:", wallId, "length:", length, "baseY:", baseY, "zPos:", zPos,
              "xOffset:", xOffset, "maxWallHeight:", maxWallHeight, "numCourses:", numCourses, "isSloped:", isSloped, "isApexGable:", isApexGable, "apexCrestHeight:", apexCrestHeight);

  // Calculate roof line Y values (absolute Y, not relative to baseY)
  const roofYAtStart = heightAtX(0) + baseY;  // Wall top Y at X=0
  const roofYAtEnd = heightAtX(length) + baseY;  // Wall top Y at X=length

  // Collect all cladding course meshes to merge
  const parts = [];

  for (let c = 0; c < numCourses; c++) {
    const isFirst = c === 0;
    const yBase = baseY - CLAD_BOTTOM_DROP_MM + c * CLAD_H_MM;

    // Bottom strip: full thickness, at base of board (+ drip on first course)
    const yBottomStrip = yBase - (isFirst ? CLAD_DRIP_MM : 0);
    const hBottomStrip = CLAD_Hb_MM + (isFirst ? CLAD_DRIP_MM : 0);

    // Upper strip: recessed (thinner), above bottom strip
    const yUpperStrip = yBase + CLAD_Hb_MM;
    const hUpperStrip = Math.max(1, CLAD_H_MM - CLAD_Hb_MM);
    const tUpper = Math.max(1, CLAD_T_MM - CLAD_Rb_MM); // 15mm instead of 20mm

    const courseTopY = yUpperStrip + hUpperStrip;

    // For sloped walls, we build all courses and CSG trims them
    // For non-sloped walls, we build extra courses that extend behind the fascia (no skip)
    // The extra height added above ensures we don't build too many courses

    // Calculate Z positions for the two strips
    // Both strips have their INNER face at the wall surface
    // Upper strip is thinner, creating a recess on the OUTER face (shiplap profile)
    // zPos is the outer face position, so inner face is at zPos + CLAD_T_MM (for front) or zPos - CLAD_T_MM (for back)
    // Determine which way the wall faces based on zPos sign
    const wallFacingBack = zPos >= 0; // Back wall cladding has zPos > 0

    // Bottom strip: full thickness, inner face at wall surface
    const zBottomCenter = wallFacingBack
      ? zPos + CLAD_T_MM / 2    // Back wall: inner face at zPos, outer at zPos + CLAD_T
      : zPos + CLAD_T_MM / 2;   // Front wall: inner face at zPos + CLAD_T, outer at zPos

    // Upper strip: thinner, inner face at same position, recess on outer face
    const zUpperCenter = wallFacingBack
      ? zPos + tUpper / 2       // Back wall: recessed from outer face
      : zPos + CLAD_T_MM - tUpper / 2;  // Front wall: recessed from outer face

    // BOTTOM STRIP - full thickness (creates the protruding lip)
    const bottomMesh = BABYLON.MeshBuilder.CreateBox(`att-${attId}-clad-${wallId}-c${c}-bottom-temp`, {
      width: length / 1000,
      height: hBottomStrip / 1000,
      depth: CLAD_T_MM / 1000
    }, scene);
    bottomMesh.position = new BABYLON.Vector3(
      (xOffset + length / 2) / 1000,
      (yBottomStrip + hBottomStrip / 2) / 1000,
      zBottomCenter / 1000
    );
    parts.push(bottomMesh);

    // UPPER STRIP - recessed (thinner, creates the shadow line)
    const upperMesh = BABYLON.MeshBuilder.CreateBox(`att-${attId}-clad-${wallId}-c${c}-upper-temp`, {
      width: length / 1000,
      height: hUpperStrip / 1000,
      depth: tUpper / 1000
    }, scene);
    upperMesh.position = new BABYLON.Vector3(
      (xOffset + length / 2) / 1000,
      (yUpperStrip + hUpperStrip / 2) / 1000,
      zUpperCenter / 1000
    );
    parts.push(upperMesh);
  }

  if (parts.length === 0) return;

  // Merge all course meshes
  let merged = null;
  try {
    merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  } catch (e) {
    console.error("[attachments] Failed to merge cladding courses:", e);
    merged = null;
  }

  if (!merged) return;

  // CSG clip cladding at roof line - matching main building walls.js approach
  let cutterCSG = null;

  if (isSloped) {
    // SLOPED walls: use wedge cutter following the slope
    const CUT_EXTRA = 120; // Match main building
    const z0r = zPos - CUT_EXTRA;
    const z1r = zPos + CLAD_T_MM + CUT_EXTRA;

    const x0 = xOffset;
    const x1 = xOffset + length;

    // Match main building: clip line is at wall top MINUS plate thickness
    // roofYAtStart/End already include baseY (168mm floor rise)
    const PENT_CLIP_DROP_MM = PLATE_HEIGHT_MM; // 50mm - drop by plate thickness
    const y0 = roofYAtStart - PENT_CLIP_DROP_MM;
    const y1 = roofYAtEnd - PENT_CLIP_DROP_MM;
    const yTop = Math.max(y0, y1) + 20000; // Very high - same as main building

    console.log('[ATT_WEDGE_DEBUG]', { x0, x1, y0, y1, yTop, z0r, z1r, roofYAtStart, roofYAtEnd });

    // Create wedge ABOVE the roof line - EXACTLY like main building
    // Vertices 0-3 = sloped bottom at roof line, vertices 4-7 = flat top very high
    const positions = [
      x0, y0, z0r,
      x1, y1, z0r,
      x1, y1, z1r,
      x0, y0, z1r,
      x0, yTop, z0r,
      x1, yTop, z0r,
      x1, yTop, z1r,
      x0, yTop, z1r,
    ].map((v) => v / 1000);

    // EXACT same indices as main building walls.js mkWedgeAboveLineX_Fixed
    const indices = [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 5, 4, 0, 1, 5,
      3, 6, 2, 3, 7, 6,
      0, 7, 3, 0, 4, 7,
      1, 6, 5, 1, 2, 6
    ];

    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;

    const wedge = new BABYLON.Mesh(`att-${attId}-clad-${wallId}-cutter`, scene);
    vd.applyToMesh(wedge, true);

    try { cutterCSG = BABYLON.CSG.FromMesh(wedge); } catch (e) { cutterCSG = null; }
    try { if (wedge && !wedge.isDisposed()) wedge.dispose(false, true); } catch (e) {}
  } else if (isApexGable && apexCrestHeight > 0) {
    // APEX GABLE: triangular cutter following roof underside profile (along X axis)
    // Simple approach: linear interpolation from eaves to crest, with offset for roof structure
    const CUT_EXTRA = 120;
    const z0r = zPos - CUT_EXTRA;
    const z1r = zPos + CLAD_T_MM + CUT_EXTRA;

    const x0 = xOffset;
    const x1 = xOffset + length;
    
    // Ridge is at center of roof span (not wall)
    const roofSpan = length + 2 * xOffset;
    const xMid = roofSpan / 2;

    // Get wall height from heightAtX function
    const wallHeightVal = heightAtX(0);

    // Eaves and crest heights from the actual roof configuration
    const eavesY = wallHeightVal + baseY;  // Wall top = eaves level
    const crestY = apexCrestHeight;         // Ridge height from UI
    
    // Roof underside is slightly below the crest (account for rafter depth at ridge)
    // At eaves, cladding should stop just above the wall top (under the fascia)
    const EAVES_OFFSET = 50;   // Small offset above wall top
    const RIDGE_OFFSET = 100;  // Rafter depth at ridge
    
    // Simple linear interpolation for roof underside
    const yAtEaves = eavesY + EAVES_OFFSET;
    const yAtRidge = crestY - RIDGE_OFFSET;
    
    // Function to get Y at any X position (linear from eaves to ridge)
    const yUnderAtX = (xPos) => {
      const distToMid = Math.abs(xMid - xPos);
      // Linear blend from eaves to ridge
      const t = 1 - (distToMid / xMid);  // 0 at eaves, 1 at ridge
      return yAtEaves + t * (yAtRidge - yAtEaves);
    };
    
    // Calculate Y at key points
    const yAtStart = yUnderAtX(x0);
    const yAtMidCalc = yUnderAtX(xMid);
    const yAtEnd = yUnderAtX(x1);
    const yTop = yAtMidCalc + 20000;

    console.log('[ATT_APEX_GABLE_X_DEBUG]', { x0, x1, xMid, roofSpan, eavesY, crestY, yAtEaves, yAtRidge, yAtStart, yAtMidCalc, yAtEnd });

    // Create two wedges - left side (x0 to xMid) slopes up, right side (xMid to x1) slopes down
    const wedges = [];

    // Left wedge: from x0 (eaves) to xMid (ridge)
    const posL = [
      x0, yAtStart, z0r,
      xMid, yAtMidCalc, z0r,
      xMid, yAtMidCalc, z1r,
      x0, yAtStart, z1r,
      x0, yTop, z0r,
      xMid, yTop, z0r,
      xMid, yTop, z1r,
      x0, yTop, z1r,
    ].map((v) => v / 1000);

    const indices = [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 5, 4, 0, 1, 5,
      3, 6, 2, 3, 7, 6,
      0, 7, 3, 0, 4, 7,
      1, 6, 5, 1, 2, 6
    ];

    const normalsL = [];
    BABYLON.VertexData.ComputeNormals(posL, indices, normalsL);
    const vdL = new BABYLON.VertexData();
    vdL.positions = posL;
    vdL.indices = indices;
    vdL.normals = normalsL;
    const wedgeL = new BABYLON.Mesh(`att-${attId}-clad-${wallId}-cutter-L`, scene);
    vdL.applyToMesh(wedgeL, true);
    wedges.push(wedgeL);

    // Right wedge: from xMid (ridge) to x1 (eaves)
    const posR = [
      xMid, yAtMidCalc, z0r,
      x1, yAtEnd, z0r,
      x1, yAtEnd, z1r,
      xMid, yAtMidCalc, z1r,
      xMid, yTop, z0r,
      x1, yTop, z0r,
      x1, yTop, z1r,
      xMid, yTop, z1r,
    ].map((v) => v / 1000);

    const normalsR = [];
    BABYLON.VertexData.ComputeNormals(posR, indices, normalsR);
    const vdR = new BABYLON.VertexData();
    vdR.positions = posR;
    vdR.indices = indices;
    vdR.normals = normalsR;
    const wedgeR = new BABYLON.Mesh(`att-${attId}-clad-${wallId}-cutter-R`, scene);
    vdR.applyToMesh(wedgeR, true);
    wedges.push(wedgeR);

    // Union the two wedges
    try {
      cutterCSG = BABYLON.CSG.FromMesh(wedges[0]);
      cutterCSG = cutterCSG.union(BABYLON.CSG.FromMesh(wedges[1]));
    } catch (e) {
      console.error('[APEX_GABLE_X] CSG error:', e);
      cutterCSG = null;
    }

    for (const w of wedges) {
      try { if (w && !w.isDisposed()) w.dispose(false, true); } catch (e) {}
    }
  } else {
    // NON-SLOPED walls: use flat box cutter at constant height
    // Matching main building walls.js approach for flat-topped walls
    const CUT_EXTRA = 120;
    const cutMinZ = zPos - CUT_EXTRA;
    const cutMaxZ = zPos + CLAD_T_MM + CUT_EXTRA;

    // Cut height: wall height + baseY - plate thickness (same as main building)
    const PENT_CLIP_DROP_MM = PLATE_HEIGHT_MM; // 50mm
    const cutHeight = roofYAtStart - PENT_CLIP_DROP_MM;

    // X extents of the cladding
    const x0 = xOffset;
    const x1 = xOffset + length;

    // Create a box cutter above the cut height - same as main building
    const cutterHeight = 20000; // Tall enough to cut everything above

    console.log('[ATT_BOX_X_DEBUG]', { cutHeight, cutMinZ, cutMaxZ, x0, x1, roofYAtStart, baseY });

    const cutterBox = BABYLON.MeshBuilder.CreateBox(`att-${attId}-clad-${wallId}-cutter`, {
      width: (x1 - x0) / 1000,
      height: cutterHeight / 1000,
      depth: (cutMaxZ - cutMinZ) / 1000
    }, scene);
    cutterBox.position = new BABYLON.Vector3(
      (x0 + (x1 - x0) / 2) / 1000,
      (cutHeight + cutterHeight / 2) / 1000,
      (cutMinZ + (cutMaxZ - cutMinZ) / 2) / 1000
    );

    try { cutterCSG = BABYLON.CSG.FromMesh(cutterBox); } catch (e) { cutterCSG = null; }
    try { if (cutterBox && !cutterBox.isDisposed()) cutterBox.dispose(false, true); } catch (e) {}
  }

  // Apply CSG subtract if cutter was created
  if (cutterCSG) {
    let resMesh = null;
    try {
      const baseCSG = BABYLON.CSG.FromMesh(merged);
      const resCSG = baseCSG.subtract(cutterCSG);
      resMesh = resCSG.toMesh(`att-${attId}-clad-${wallId}`, cladMat, scene, false);
    } catch (e) {
      console.error("[attachments] CSG clip failed:", e);
      resMesh = null;
    }

    if (resMesh) {
      try { merged.dispose(false, true); } catch (e) {}
      merged = resMesh;
    }
  }

  // ---- CSG cutouts for door/window openings (along X) ----
  if (openings.length > 0 && merged && !merged.isDisposed()) {
    const hasCSG = typeof BABYLON !== "undefined" && BABYLON && BABYLON.CSG && typeof BABYLON.CSG.FromMesh === "function";
    if (hasCSG) {
      const CUT_EXTRA = 80;
      const cutDepth = Math.max(1, CLAD_T_MM + 2 * CUT_EXTRA);
      // Z centre of the cutter box — covers full cladding thickness plus margin
      const cutZCenter = zPos + CLAD_T_MM / 2;

      const cutters = [];
      for (let oi = 0; oi < openings.length; oi++) {
        const o = openings[oi];
        if (o.enabled === false) continue;
        const ox = (o.x_mm || 0) + xOffset; // position along wall + any X offset
        const ow = o.width_mm || (o.type === 'door' ? 800 : 600);
        let oh = o.type === 'door'
          ? (o.height_mm || 1900)
          : (o.height_mm || 400);
        // Half-height doors (e.g. bin store)
        if (o.type === 'door' && o.style === 'double-half') {
          oh = Math.max(600, Math.floor(oh * 0.5));
        }

        // Y span for cutter
        let y0, y1;
        if (o.type === 'door') {
          // Door: from bottom plate top to door height
          y0 = baseY + PLATE_HEIGHT_MM;
          y1 = y0 + oh;
        } else {
          // Window: from sill to top
          const winY = o.y_mm || 900;
          y0 = baseY + PLATE_HEIGHT_MM + winY;
          y1 = y0 + oh;
        }

        const cutH = Math.max(1, y1 - y0);
        const cutW = Math.max(1, ow);

        const m = BABYLON.MeshBuilder.CreateBox(
          `att-${attId}-cladcut-${wallId}-${oi}`,
          { width: cutW / 1000, height: cutH / 1000, depth: cutDepth / 1000 },
          scene
        );
        m.position = new BABYLON.Vector3(
          (ox + cutW / 2) / 1000,
          (y0 + cutH / 2) / 1000,
          cutZCenter / 1000
        );
        cutters.push(m);
      }

      if (cutters.length > 0) {
        try {
          let openingCSG = BABYLON.CSG.FromMesh(cutters[0]);
          for (let ci = 1; ci < cutters.length; ci++) {
            openingCSG = openingCSG.union(BABYLON.CSG.FromMesh(cutters[ci]));
          }
          const baseCSG = BABYLON.CSG.FromMesh(merged);
          const resCSG = baseCSG.subtract(openingCSG);
          const resMesh = resCSG.toMesh(`att-${attId}-clad-${wallId}-cut`, cladMat, scene, false);
          if (resMesh) {
            try { merged.dispose(false, true); } catch (e) {}
            merged = resMesh;
          }
        } catch (e) {
          console.error("[attachments] Opening CSG cutout failed for wall", wallId, ":", e);
        }
      }
      // Dispose cutter meshes
      for (let ci = 0; ci < cutters.length; ci++) {
        try { if (cutters[ci] && !cutters[ci].isDisposed()) cutters[ci].dispose(false, true); } catch (e) {}
      }
    }
  }

  // Set final properties on the merged/clipped mesh
  merged.name = `att-${attId}-clad-${wallId}`;
  merged.material = cladMat;
  merged.parent = root;
  merged.metadata = { dynamic: true, attachmentId: attId, type: 'cladding', wallId: wallId };

  // Board definition comes from merged geometry (same as main building)
  // No explicit edge rendering needed - internal board faces provide definition
}

/**
 * Build cladding courses along Z axis (for left/right walls)
 * For sloped walls, uses CSG to cleanly clip cladding at the roof line (matching main building)
 * @param {number} zOffset - Z offset for the cladding start position
 */
function buildCladdingAlongZ(scene, root, attId, wallId, length, wallHeight, xPos, baseY, zOffset, cladMat, isSloped, heightAtZ, isApexGable = false, apexCrestHeight = 0, openings = []) {
  // For apex gables, we need to build up to the crest height
  const effectiveHeight = isApexGable ? apexCrestHeight : (isSloped && heightAtZ ? Math.max(heightAtZ(0), heightAtZ(length)) : wallHeight);
  // Build extra courses above roof line for ALL walls:
  // - Sloped walls: CSG will trim them to the slope
  // - Non-sloped walls: extra courses extend behind fascia (hidden)
  // - Apex gables: CSG will trim to triangular peak
  const extraHeight = (isSloped && heightAtZ) ? 500 : (isApexGable ? 200 : 200);
  const cladHeight = effectiveHeight + CLAD_BOTTOM_DROP_MM + extraHeight;
  const numCourses = Math.ceil(cladHeight / CLAD_H_MM);

  console.log("[attachments] buildCladdingAlongZ:", wallId, "length:", length, "wallHeight:", wallHeight,
              "xPos:", xPos, "baseY:", baseY, "zOffset:", zOffset, "effectiveHeight:", effectiveHeight,
              "numCourses:", numCourses, "isSloped:", isSloped, "isApexGable:", isApexGable, "apexCrestHeight:", apexCrestHeight);

  // Calculate roof line Y values (absolute Y)
  const roofYAtStart = (isSloped && heightAtZ) ? (heightAtZ(0) + baseY) : (wallHeight + baseY);
  const roofYAtEnd = (isSloped && heightAtZ) ? (heightAtZ(length) + baseY) : (wallHeight + baseY);

  // Collect all cladding course meshes to merge
  const parts = [];

  for (let c = 0; c < numCourses; c++) {
    const isFirst = c === 0;
    const yBase = baseY - CLAD_BOTTOM_DROP_MM + c * CLAD_H_MM;

    // Bottom strip: full thickness, at base of board (+ drip on first course)
    const yBottomStrip = yBase - (isFirst ? CLAD_DRIP_MM : 0);
    const hBottomStrip = CLAD_Hb_MM + (isFirst ? CLAD_DRIP_MM : 0);

    // Upper strip: recessed (thinner), above bottom strip
    const yUpperStrip = yBase + CLAD_Hb_MM;
    const hUpperStrip = Math.max(1, CLAD_H_MM - CLAD_Hb_MM);
    const tUpper = Math.max(1, CLAD_T_MM - CLAD_Rb_MM); // 15mm instead of 20mm

    const courseTopY = yUpperStrip + hUpperStrip;

    // For sloped walls, we build all courses and CSG trims them
    // For non-sloped walls, we build extra courses that extend behind the fascia (no skip)
    // The extra height added above ensures we don't build too many courses

    // For Z-axis walls, thickness is along X
    // Determine wall facing direction based on xPos
    // xPos < 0 means wall is on the LEFT side (outer wall), facing outward (-X direction)
    // xPos > 0 means wall is on the RIGHT side, facing outward (+X direction)
    const wallFacingLeft = xPos < 0;

    // Bottom strip: full thickness, center is always at xPos + CLAD_T_MM / 2
    const xBottomCenter = xPos + CLAD_T_MM / 2;

    // Upper strip: thinner, with recess on OUTER face (visible side)
    // Both strips must have their INNER face aligned at the wall surface
    const xUpperCenter = wallFacingLeft
      ? xPos + CLAD_T_MM - tUpper / 2  // Left-facing: inner face at xPos + CLAD_T_MM, recess on left (outer)
      : xPos + tUpper / 2;              // Right-facing: inner face at xPos, recess on right (outer)

    // BOTTOM STRIP - full thickness (creates the protruding lip)
    const bottomMesh = BABYLON.MeshBuilder.CreateBox(`att-${attId}-clad-${wallId}-c${c}-bottom-temp`, {
      width: CLAD_T_MM / 1000,
      height: hBottomStrip / 1000,
      depth: length / 1000
    }, scene);
    bottomMesh.position = new BABYLON.Vector3(
      xBottomCenter / 1000,
      (yBottomStrip + hBottomStrip / 2) / 1000,
      (zOffset + length / 2) / 1000
    );
    parts.push(bottomMesh);

    // UPPER STRIP - recessed (thinner, creates the shadow line)
    const upperMesh = BABYLON.MeshBuilder.CreateBox(`att-${attId}-clad-${wallId}-c${c}-upper-temp`, {
      width: tUpper / 1000,
      height: hUpperStrip / 1000,
      depth: length / 1000
    }, scene);
    upperMesh.position = new BABYLON.Vector3(
      xUpperCenter / 1000,
      (yUpperStrip + hUpperStrip / 2) / 1000,
      (zOffset + length / 2) / 1000
    );
    parts.push(upperMesh);
  }

  if (parts.length === 0) return;

  // Merge all course meshes
  let merged = null;
  try {
    merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  } catch (e) {
    console.error("[attachments] Failed to merge cladding courses:", e);
    merged = null;
  }

  if (!merged) return;

  // CSG clip cladding at roof line - matching main building walls.js approach
  let cutterCSG = null;

  if (isSloped && heightAtZ) {
    // SLOPED walls: use wedge cutter following the slope
    const CUT_EXTRA = 120; // Match main building
    const x0r = xPos - CUT_EXTRA;
    const x1r = xPos + CLAD_T_MM + CUT_EXTRA;

    const z0 = zOffset;
    const z1 = zOffset + length;

    // Match main building: clip line is at wall top MINUS plate thickness
    const PENT_CLIP_DROP_MM = PLATE_HEIGHT_MM; // 50mm
    const y0 = roofYAtStart - PENT_CLIP_DROP_MM;
    const y1 = roofYAtEnd - PENT_CLIP_DROP_MM;
    const yTop = Math.max(y0, y1) + 20000;

    console.log('[ATT_WEDGE_Z_DEBUG]', { z0, z1, y0, y1, yTop, x0r, x1r });

    // Create wedge ABOVE the roof line - for Z-axis walls
    // Vertices follow the same pattern as X-axis but with Z as the slope direction
    const positions = [
      x0r, y0, z0,
      x1r, y0, z0,
      x1r, y1, z1,
      x0r, y1, z1,
      x0r, yTop, z0,
      x1r, yTop, z0,
      x1r, yTop, z1,
      x0r, yTop, z1,
    ].map((v) => v / 1000);

    // EXACT same indices as main building
    const indices = [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 5, 4, 0, 1, 5,
      3, 6, 2, 3, 7, 6,
      0, 7, 3, 0, 4, 7,
      1, 6, 5, 1, 2, 6
    ];

    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;

    const wedge = new BABYLON.Mesh(`att-${attId}-clad-${wallId}-cutter`, scene);
    vd.applyToMesh(wedge, true);

    try { cutterCSG = BABYLON.CSG.FromMesh(wedge); } catch (e) { cutterCSG = null; }
    try { if (wedge && !wedge.isDisposed()) wedge.dispose(false, true); } catch (e) {}
  } else if (isApexGable && apexCrestHeight > 0) {
    // APEX GABLE: triangular cutter following roof underside profile
    // Simple approach: linear interpolation from eaves to crest, with offset for roof structure
    const CUT_EXTRA = 120;
    const x0r = xPos - CUT_EXTRA;
    const x1r = xPos + CLAD_T_MM + CUT_EXTRA;

    const z0 = zOffset;
    const z1 = zOffset + length;
    
    // Ridge is at center of roof span (not wall)
    const roofSpan = length + 2 * zOffset;
    const zMid = roofSpan / 2;

    // Eaves and crest heights from the actual roof configuration
    const eavesY = wallHeight + baseY;  // Wall top = eaves level
    const crestY = apexCrestHeight;     // Ridge height from UI
    
    // Roof underside is slightly below the crest (account for rafter depth at ridge)
    // At eaves, cladding should stop just above the wall top (under the fascia)
    // Use simple offset: 50mm at eaves, ~100mm below crest at ridge
    const EAVES_OFFSET = 50;   // Small offset above wall top
    const RIDGE_OFFSET = 100;  // Rafter depth at ridge
    
    // Simple linear interpolation for roof underside
    const yAtEaves = eavesY + EAVES_OFFSET;
    const yAtRidge = crestY - RIDGE_OFFSET;
    
    // Function to get Y at any Z position (linear from eaves to ridge)
    const yUnderAtZ = (zPos) => {
      const distFromStart = Math.abs(zPos);
      const distToMid = Math.abs(zMid - zPos);
      // Linear blend from eaves to ridge
      const t = 1 - (distToMid / zMid);  // 0 at eaves, 1 at ridge
      return yAtEaves + t * (yAtRidge - yAtEaves);
    };
    
    // Calculate Y at key points
    const yAtStart = yUnderAtZ(z0);
    const yAtMidCalc = yUnderAtZ(zMid);
    const yAtEnd = yUnderAtZ(z1);
    const yTop = yAtMidCalc + 20000;

    console.log('[ATT_APEX_GABLE_Z_DEBUG]', { z0, z1, zMid, roofSpan, eavesY, crestY, yAtEaves, yAtRidge, yAtStart, yAtMidCalc, yAtEnd });

    // Create two wedges - left side (z0 to zMid) slopes up, right side (zMid to z1) slopes down
    const wedges = [];

    // Left wedge: from z0 (eaves) to zMid (ridge)
    const posL = [
      x0r, yAtStart, z0,
      x1r, yAtStart, z0,
      x1r, yAtMidCalc, zMid,
      x0r, yAtMidCalc, zMid,
      x0r, yTop, z0,
      x1r, yTop, z0,
      x1r, yTop, zMid,
      x0r, yTop, zMid,
    ].map((v) => v / 1000);

    const indices = [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 5, 4, 0, 1, 5,
      3, 6, 2, 3, 7, 6,
      0, 7, 3, 0, 4, 7,
      1, 6, 5, 1, 2, 6
    ];

    const normalsL = [];
    BABYLON.VertexData.ComputeNormals(posL, indices, normalsL);
    const vdL = new BABYLON.VertexData();
    vdL.positions = posL;
    vdL.indices = indices;
    vdL.normals = normalsL;
    const wedgeL = new BABYLON.Mesh(`att-${attId}-clad-${wallId}-cutter-L`, scene);
    vdL.applyToMesh(wedgeL, true);
    wedges.push(wedgeL);

    // Right wedge: from zMid (ridge) to z1 (eaves)
    const posR = [
      x0r, yAtMidCalc, zMid,
      x1r, yAtMidCalc, zMid,
      x1r, yAtEnd, z1,
      x0r, yAtEnd, z1,
      x0r, yTop, zMid,
      x1r, yTop, zMid,
      x1r, yTop, z1,
      x0r, yTop, z1,
    ].map((v) => v / 1000);

    const normalsR = [];
    BABYLON.VertexData.ComputeNormals(posR, indices, normalsR);
    const vdR = new BABYLON.VertexData();
    vdR.positions = posR;
    vdR.indices = indices;
    vdR.normals = normalsR;
    const wedgeR = new BABYLON.Mesh(`att-${attId}-clad-${wallId}-cutter-R`, scene);
    vdR.applyToMesh(wedgeR, true);
    wedges.push(wedgeR);

    // Union the two wedges
    try {
      cutterCSG = BABYLON.CSG.FromMesh(wedges[0]);
      cutterCSG = cutterCSG.union(BABYLON.CSG.FromMesh(wedges[1]));
    } catch (e) {
      console.error('[APEX_GABLE_Z] CSG error:', e);
      cutterCSG = null;
    }

    for (const w of wedges) {
      try { if (w && !w.isDisposed()) w.dispose(false, true); } catch (e) {}
    }
  } else {
    // NON-SLOPED walls: use flat box cutter at constant height
    // Matching main building walls.js lines 1264-1305
    const CUT_EXTRA = 120;
    const cutMinX = xPos - CUT_EXTRA;
    const cutMaxX = xPos + CLAD_T_MM + CUT_EXTRA;

    // Cut height: wall height + baseY - plate thickness (same as main building)
    const PENT_CLIP_DROP_MM = PLATE_HEIGHT_MM; // 50mm
    const cutHeight = roofYAtStart - PENT_CLIP_DROP_MM;

    // Z extents of the cladding
    const z0 = zOffset;
    const z1 = zOffset + length;

    // Create a box cutter above the cut height - same as main building
    const cutterHeight = 20000; // Tall enough to cut everything above

    console.log('[ATT_BOX_Z_DEBUG]', { cutHeight, cutMinX, cutMaxX, z0, z1, wallHeight, baseY });

    const cutterBox = BABYLON.MeshBuilder.CreateBox(`att-${attId}-clad-${wallId}-cutter`, {
      width: (cutMaxX - cutMinX) / 1000,
      height: cutterHeight / 1000,
      depth: (z1 - z0) / 1000
    }, scene);
    cutterBox.position = new BABYLON.Vector3(
      (cutMinX + (cutMaxX - cutMinX) / 2) / 1000,
      (cutHeight + cutterHeight / 2) / 1000,
      (z0 + (z1 - z0) / 2) / 1000
    );

    try { cutterCSG = BABYLON.CSG.FromMesh(cutterBox); } catch (e) { cutterCSG = null; }
    try { if (cutterBox && !cutterBox.isDisposed()) cutterBox.dispose(false, true); } catch (e) {}
  }

  // Apply CSG subtract if cutter was created
  if (cutterCSG) {
    let resMesh = null;
    try {
      const baseCSG = BABYLON.CSG.FromMesh(merged);
      const resCSG = baseCSG.subtract(cutterCSG);
      resMesh = resCSG.toMesh(`att-${attId}-clad-${wallId}`, cladMat, scene, false);
    } catch (e) {
      console.error("[attachments] CSG clip failed:", e);
      resMesh = null;
    }

    if (resMesh) {
      try { merged.dispose(false, true); } catch (e) {}
      merged = resMesh;
    }
  }

  // ---- CSG cutouts for door/window openings (along Z) ----
  if (openings.length > 0 && merged && !merged.isDisposed()) {
    const hasCSG = typeof BABYLON !== "undefined" && BABYLON && BABYLON.CSG && typeof BABYLON.CSG.FromMesh === "function";
    if (hasCSG) {
      const CUT_EXTRA = 80;
      const cutDepth = Math.max(1, CLAD_T_MM + 2 * CUT_EXTRA);
      // X centre of the cutter box — covers full cladding thickness plus margin
      const cutXCenter = xPos + CLAD_T_MM / 2;

      const cutters = [];
      for (let oi = 0; oi < openings.length; oi++) {
        const o = openings[oi];
        if (o.enabled === false) continue;
        const oz = (o.x_mm || 0) + zOffset; // position along wall + Z offset
        const ow = o.width_mm || (o.type === 'door' ? 800 : 600);
        let oh = o.type === 'door'
          ? (o.height_mm || 1900)
          : (o.height_mm || 400);
        // Half-height doors (e.g. bin store)
        if (o.type === 'door' && o.style === 'double-half') {
          oh = Math.max(600, Math.floor(oh * 0.5));
        }

        // Y span for cutter
        let y0, y1;
        if (o.type === 'door') {
          y0 = baseY + PLATE_HEIGHT_MM;
          y1 = y0 + oh;
        } else {
          const winY = o.y_mm || 900;
          y0 = baseY + PLATE_HEIGHT_MM + winY;
          y1 = y0 + oh;
        }

        const cutH = Math.max(1, y1 - y0);
        const cutW = Math.max(1, ow);

        const m = BABYLON.MeshBuilder.CreateBox(
          `att-${attId}-cladcut-${wallId}-${oi}`,
          { width: cutDepth / 1000, height: cutH / 1000, depth: cutW / 1000 },
          scene
        );
        m.position = new BABYLON.Vector3(
          cutXCenter / 1000,
          (y0 + cutH / 2) / 1000,
          (oz + cutW / 2) / 1000
        );
        cutters.push(m);
      }

      if (cutters.length > 0) {
        try {
          let openingCSG = BABYLON.CSG.FromMesh(cutters[0]);
          for (let ci = 1; ci < cutters.length; ci++) {
            openingCSG = openingCSG.union(BABYLON.CSG.FromMesh(cutters[ci]));
          }
          const baseCSG = BABYLON.CSG.FromMesh(merged);
          const resCSG = baseCSG.subtract(openingCSG);
          const resMesh = resCSG.toMesh(`att-${attId}-clad-${wallId}-cut`, cladMat, scene, false);
          if (resMesh) {
            try { merged.dispose(false, true); } catch (e) {}
            merged = resMesh;
          }
        } catch (e) {
          console.error("[attachments] Opening CSG cutout failed for wall", wallId, ":", e);
        }
      }
      // Dispose cutter meshes
      for (let ci = 0; ci < cutters.length; ci++) {
        try { if (cutters[ci] && !cutters[ci].isDisposed()) cutters[ci].dispose(false, true); } catch (e) {}
      }
    }
  }

  // Set final properties on the merged/clipped mesh
  merged.name = `att-${attId}-clad-${wallId}`;
  merged.material = cladMat;
  merged.parent = root;
  merged.metadata = { dynamic: true, attachmentId: attId, type: 'cladding', wallId: wallId };

  // Board definition comes from merged geometry (same as main building)
  // No explicit edge rendering needed - internal board faces provide definition
}

/**
 * Build the roof structure for the attachment
 * Following the same approach as main building: build flat in local space, then rotate and position
 * Includes rafters, OSB sheathing, covering (felt), and fascia boards
 */
function buildAttachmentRoof(scene, root, attId, extentX, extentZ, wallHeightInner, wallHeightOuter,
                              attachWall, roofType, attachment, materials, memberW_mm, memberD_mm, mainFasciaBottom) {
  // Floor surface Y position
  const floorSurfaceY = GRID_HEIGHT_MM + FLOOR_FRAME_DEPTH_MM + FLOOR_OSB_MM;

  // Roof bearing heights (Y at top of wall plates)
  const roofInnerY = floorSurfaceY + wallHeightInner;
  const roofOuterY = floorSurfaceY + wallHeightOuter;

  // Materials
  const joistMat = materials?.timber || createMaterial(scene, `att-${attId}-joist-mat`, 0.5, 0.4, 0.3);
  const osbMat = createMaterial(scene, `att-${attId}-osb-mat`, 0.75, 0.62, 0.45);
  const coveringMat = createMaterial(scene, `att-${attId}-covering-mat`, 0.1, 0.1, 0.1);
  // Use the same cladding material as the walls (light tan color)
  // Always create a fresh material to ensure correct color for fascia
  let claddingMat = scene._claddingMatLight;
  if (!claddingMat || !claddingMat.diffuseColor) {
    claddingMat = createCladdingMaterial(scene, `claddingMatLight`);
    scene._claddingMatLight = claddingMat;
  }
  console.log("[attachments] buildAttachmentRoof - claddingMat:", claddingMat?.name, "diffuse:", claddingMat?.diffuseColor?.toString());

  if (roofType === "pent") {
    console.log("[attachments] PENT ROOF - claddingMat:", claddingMat?.name, "color:", claddingMat?.diffuseColor);
    buildPentRoof(scene, root, attId, extentX, extentZ, roofInnerY, roofOuterY,
                  attachWall, joistMat, osbMat, coveringMat, claddingMat, attachment);
  } else if (roofType === "apex") {
    buildApexRoof(scene, root, attId, extentX, extentZ, roofInnerY,
                  attachWall, attachment, joistMat, osbMat, coveringMat, claddingMat, memberW_mm, memberD_mm, mainFasciaBottom);
  }
}

/**
 * Helper to create a simple diffuse material
 */
function createMaterial(scene, name, r, g, b) {
  const mat = new BABYLON.StandardMaterial(name, scene);
  mat.diffuseColor = new BABYLON.Color3(r, g, b);
  mat.backFaceCulling = false;  // Show both sides
  return mat;
}

/**
 * Build pent roof with proper structure
 * Follows the main building approach: build flat in a local root node, then rotate to pitch angle
 * Supports configurable overhangs (eaves, vergeLeft, vergeRight) matching main building protocol
 */
function buildPentRoof(scene, root, attId, extentX, extentZ, roofInnerY, roofOuterY,
                        attachWall, joistMat, osbMat, coveringMat, claddingMat, attachment) {

  // Get overhang values from attachment config (with defaults)
  const pentOvh = attachment?.roof?.pent?.overhang || {};
  const ovhEaves = Math.max(0, Math.floor(Number(pentOvh.eaves_mm ?? 75)));
  const ovhVergeL = Math.max(0, Math.floor(Number(pentOvh.vergeLeft_mm ?? 75)));
  const ovhVergeR = Math.max(0, Math.floor(Number(pentOvh.vergeRight_mm ?? 75)));

  console.log("[attachments] buildPentRoof:", attId,
              "extentX:", extentX, "extentZ:", extentZ,
              "roofInnerY:", roofInnerY, "roofOuterY:", roofOuterY,
              "attachWall:", attachWall,
              "overhangs:", { eaves: ovhEaves, vergeL: ovhVergeL, vergeR: ovhVergeR });

  // Calculate rise (height difference) and run (horizontal distance)
  const rise_mm = roofInnerY - roofOuterY;

  // Determine slope direction based on attachWall
  // For left/right attachments: slope runs along X (extentX is depth/run)
  // For front/back attachments: slope runs along Z (extentZ is depth/run)
  const slopeAlongX = (attachWall === "left" || attachWall === "right");

  const run_mm = slopeAlongX ? extentX : extentZ;       // Distance along slope direction
  const span_mm = slopeAlongX ? extentZ : extentX;     // Distance perpendicular to slope

  // Calculate slope length (hypotenuse) and scale factor
  const slopeLen_mm = Math.sqrt(run_mm * run_mm + rise_mm * rise_mm);
  const slopeScale = slopeLen_mm / run_mm;

  // Pitch angle
  const pitchAngle = Math.atan2(rise_mm, run_mm);

  // Slope direction is now handled by yaw rotation (see below)
  // - Left/Right: slope runs along X axis
  // - Front/Back: slope runs along Z axis
  // The yaw rotation ensures the high end (inner edge) always points toward the main building

  // Create a roof root node at the low point of the roof
  // We'll build everything flat (y=0 at underside of rafters) then rotate and position
  const roofRoot = new BABYLON.TransformNode(`att-${attId}-roof-root`, scene);
  roofRoot.metadata = { dynamic: true, attachmentId: attId };
  roofRoot.parent = root;

  // Local coordinate system for roof:
  // - slopeAxis runs along the slope (0 to slopeLen)
  // - spanAxis runs perpendicular (0 to span)
  // - Y is up (0 at rafter bottom)

  // Physical dimensions for roof (along slope, we use the scaled length)
  // Add overhang at eaves (outer edge) - note: no overhang at ridge (connects to main building)
  // The slope length with eaves overhang = sqrt((run + eaves_ovh)^2 + rise^2)
  const runWithEaves_mm = run_mm + ovhEaves;
  const slopeLenWithEaves_mm = Math.sqrt(runWithEaves_mm * runWithEaves_mm + rise_mm * rise_mm);

  // Span with verge overhangs on both sides
  const spanWithVerges_mm = span_mm + ovhVergeL + ovhVergeR;

  const roofSlope_mm = slopeLenWithEaves_mm;
  const roofSpan_mm = spanWithVerges_mm;

  // Helper to create box at local position (bottom-aligned in Y)
  function mkBox(name, lenX, lenY, lenZ, x, yBottom, z, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: lenX / 1000,
      height: lenY / 1000,
      depth: lenZ / 1000
    }, scene);

    mesh.position = new BABYLON.Vector3(
      (x + lenX / 2) / 1000,
      yBottom / 1000 + lenY / 2000,
      (z + lenZ / 2) / 1000
    );

    mesh.material = mat;
    mesh.parent = roofRoot;
    mesh.metadata = Object.assign({ dynamic: true, attachmentId: attId, type: 'roof' }, meta || {});
    return mesh;
  }

  // Build in local coordinates (A = slope axis, B = span axis)
  // If slopeAlongX: A->X, B->Z in local
  // If slopeAlongZ: A->Z, B->X in local

  const A_mm = roofSlope_mm;  // Along slope direction
  const B_mm = roofSpan_mm;   // Perpendicular to slope

  // Build rim joists (at front and back of span, running along slope)
  mkBox(`att-${attId}-rim-front`, A_mm, RAFTER_D_MM, RAFTER_W_MM, 0, 0, 0, joistMat, { part: 'rim', edge: 'front' });
  mkBox(`att-${attId}-rim-back`, A_mm, RAFTER_D_MM, RAFTER_W_MM, 0, 0, B_mm - RAFTER_W_MM, joistMat, { part: 'rim', edge: 'back' });

  // Build rafters (run along slope, spaced along span)
  const rafterPositions = [];
  let p = 0;
  const maxP = B_mm - RAFTER_W_MM;
  while (p <= maxP) {
    rafterPositions.push(p);
    p += RAFTER_SPACING_MM;
  }
  // Ensure last rafter at end
  if (rafterPositions.length && rafterPositions[rafterPositions.length - 1] < maxP) {
    rafterPositions.push(maxP);
  }

  rafterPositions.forEach((pos, i) => {
    mkBox(`att-${attId}-rafter-${i}`, A_mm, RAFTER_D_MM, RAFTER_W_MM, 0, 0, pos, joistMat, { part: 'rafter' });
  });

  // Build OSB (on top of rafters)
  const osbY = RAFTER_D_MM;
  const osbMesh = mkBox(`att-${attId}-osb`, A_mm, ROOF_OSB_MM, B_mm, 0, osbY, 0, osbMat, { part: 'osb' });
  if (osbMesh.enableEdgesRendering) {
    osbMesh.enableEdgesRendering();
    osbMesh.edgesWidth = 3;
    osbMesh.edgesColor = new BABYLON.Color4(0, 0, 0, 1);
  }

  // Build covering (felt) on top of OSB - extends past OSB for overhang fold-down
  const coverY = RAFTER_D_MM + ROOF_OSB_MM;
  mkBox(`att-${attId}-covering`, A_mm, COVERING_MM, B_mm, 0, coverY, 0, coveringMat, { part: 'covering' });

  // Covering fold-downs (100mm drop at edges)
  const FOLD_DOWN_MM = 100;

  // Eaves fold (at A=0, low edge)
  mkBox(`att-${attId}-covering-eaves`, COVERING_MM, FOLD_DOWN_MM, B_mm, -COVERING_MM, coverY - FOLD_DOWN_MM, 0, coveringMat, { part: 'covering-eaves' });

  // Ridge fold (at A=A_mm, high edge)
  mkBox(`att-${attId}-covering-ridge`, COVERING_MM, FOLD_DOWN_MM, B_mm, A_mm, coverY - FOLD_DOWN_MM, 0, coveringMat, { part: 'covering-ridge' });

  // Verge folds (at B=0 and B=B_mm)
  mkBox(`att-${attId}-covering-verge-left`, A_mm, FOLD_DOWN_MM, COVERING_MM, 0, coverY - FOLD_DOWN_MM, -COVERING_MM, coveringMat, { part: 'covering-verge', edge: 'left' });
  mkBox(`att-${attId}-covering-verge-right`, A_mm, FOLD_DOWN_MM, COVERING_MM, 0, coverY - FOLD_DOWN_MM, B_mm, coveringMat, { part: 'covering-verge', edge: 'right' });

  // Fascia boards (hang down from roof edges)
  const fasciaTopY = RAFTER_D_MM + ROOF_OSB_MM;
  const fasciaBottomY = fasciaTopY - FASCIA_DEPTH_MM;

  // Use the same fascia material as the main building for consistency
  let fasciaMat = scene._fasciaMat || claddingMat;
  console.log("[buildPentRoof] FASCIA - using material:", fasciaMat?.name, "color:", fasciaMat?.diffuseColor?.toString());

  // Eaves fascia (at A=0) - uses cladding color to match walls
  mkBox(`att-${attId}-fascia-eaves`, FASCIA_THK_MM, FASCIA_DEPTH_MM, B_mm + 2 * FASCIA_THK_MM, -FASCIA_THK_MM, fasciaBottomY, -FASCIA_THK_MM, fasciaMat, { part: 'fascia', edge: 'eaves' });

  // Ridge fascia (at A=A_mm) - Note: This connects to main building, may not be needed
  // mkBox(`att-${attId}-fascia-ridge`, FASCIA_THK_MM, FASCIA_DEPTH_MM, B_mm + 2 * FASCIA_THK_MM, A_mm, fasciaBottomY, -FASCIA_THK_MM, fasciaMat, { part: 'fascia', edge: 'ridge' });

  // Verge fascia (at B=0 and B=B_mm, runs along slope) - uses cladding color to match walls
  mkBox(`att-${attId}-fascia-verge-left`, A_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM, 0, fasciaBottomY, -FASCIA_THK_MM, fasciaMat, { part: 'fascia', edge: 'verge-left' });
  mkBox(`att-${attId}-fascia-verge-right`, A_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM, 0, fasciaBottomY, B_mm, fasciaMat, { part: 'fascia', edge: 'verge-right' });

  // Now rotate and position the roof root node
  // The roof is built with A along local X, B along local Z
  // We need to rotate so A aligns with the world slope direction

  // Determine pitch axis (perpendicular to slope direction)
  const pitchAxisWorld = slopeAlongX ? new BABYLON.Vector3(0, 0, 1) : new BABYLON.Vector3(1, 0, 0);

  // Yaw rotation to align local +X (high end of slope) toward the main building
  // Pitch sign determines which way to tilt to raise the inner edge
  // 
  // After yaw, local +X points toward main building (inner edge = ridge)
  // Then pitch rotation around the perpendicular axis tilts that edge UP
  //
  // Attachment | Yaw    | Ridge direction | Pitch axis | Pitch sign
  // -----------|--------|-----------------|------------|------------
  // Left       | 0      | +X              | Z          | +1
  // Right      | π      | -X              | Z          | -1
  // Front      | -π/2   | +Z              | X          | -1
  // Back       | +π/2   | -Z              | X          | +1

  let yaw = 0;
  let pitchSign = 1;

  if (attachWall === "left") {
    yaw = 0;
    pitchSign = 1;   // +pitch around Z tilts +X toward +Y (up)
  } else if (attachWall === "right") {
    yaw = Math.PI;   // 180° flip: local +X → world -X
    pitchSign = -1;  // -pitch around Z tilts -X toward +Y (up)
  } else if (attachWall === "front") {
    yaw = -Math.PI / 2;  // local +X → world +Z (toward main building)
    pitchSign = -1;      // -pitch around X tilts +Z toward +Y (up)
  } else { // back
    yaw = Math.PI / 2;   // local +X → world -Z (toward main building)
    pitchSign = 1;       // +pitch around X tilts -Z toward +Y (up)
  }

  const qYaw = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), yaw);
  const qPitch = BABYLON.Quaternion.RotationAxis(pitchAxisWorld, pitchSign * pitchAngle);

  roofRoot.rotationQuaternion = qPitch.multiply(qYaw);

  console.log("[attachments] Roof rotation - pitchAngle:", pitchAngle * 180 / Math.PI, "deg",
              "slopeAlongX:", slopeAlongX,
              "appliedPitch:", (slopeAlongX ? -pitchAngle : pitchAngle) * 180 / Math.PI, "deg");

  // Position the roof root
  // After rotation, we need to position it so:
  // - The low edge of the roof is at the outer wall position
  // - The roof height at low edge = roofOuterY

  // First, compute where the roof corners end up after rotation
  // Local corners at y=0: (0,0,0), (A,0,0), (0,0,B), (A,0,B)
  function localToWorld(lx, ly, lz) {
    const local = new BABYLON.Vector3(lx / 1000, ly / 1000, lz / 1000);
    const rotated = local.rotateByQuaternionToRef(roofRoot.rotationQuaternion, new BABYLON.Vector3());
    return rotated;
  }

  // Find the min/max X, Z at corners after rotation
  const corners = [
    localToWorld(0, 0, 0),
    localToWorld(A_mm, 0, 0),
    localToWorld(0, 0, B_mm),
    localToWorld(A_mm, 0, B_mm)
  ];

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  corners.forEach(c => {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.z < minZ) minZ = c.z;
    if (c.z > maxZ) maxZ = c.z;
  });

  // The low corner (A=0) should be at the outer edge MINUS the eaves overhang
  // The roof extends past walls by: eaves at outer edge, vergeL/vergeR on sides
  // For left/right attachments: eaves extends in X direction, verges extend in Z
  // For front/back attachments: eaves extends in Z direction, verges extend in X

  // Calculate the overhang offset for eaves (extends outward from outer wall)
  const eavesOffset_m = ovhEaves / 1000;

  // Calculate the verge offset (roof starts at -vergeL relative to wall span start)
  const vergeLOffset_m = ovhVergeL / 1000;

  // Position the roof based on where the geometry extends after rotation
  // The roof is built with eaves at local origin (0,0,0), extending toward +X (ridge) and +Z (span)
  // After yaw rotation, these directions change:
  //   Left (yaw=0):     local +X → world +X, local +Z → world +Z
  //   Right (yaw=π):    local +X → world -X, local +Z → world -Z
  //   Front (yaw=-π/2): local +X → world +Z, local +Z → world +X
  //   Back (yaw=+π/2):  local +X → world -Z, local +Z → world -X

  const vergeROffset_m = (ovhVergeR || ovhVergeL) / 1000;

  let targetRoofX_m, targetRoofZ_m;
  if (attachWall === "left") {
    // Roof extends +X (toward main), +Z (span)
    // Eaves (origin) at outer edge: X = -ovhEaves
    // Span starts at Z = -vergeL
    targetRoofX_m = -eavesOffset_m;
    targetRoofZ_m = -vergeLOffset_m;
  } else if (attachWall === "right") {
    // Roof extends -X (toward main), -Z (span) due to 180° yaw
    // Eaves (origin) at outer edge: X = extentX + ovhEaves
    // Span far edge (origin after Z flip) at: Z = extentZ + vergeR
    targetRoofX_m = extentX / 1000 + eavesOffset_m;
    targetRoofZ_m = extentZ / 1000 + vergeROffset_m;
  } else if (attachWall === "front") {
    // With yaw=-π/2: local +X → world +Z, local +Z → world -X (flipped!)
    // Roof extends +Z (toward main), span extends toward -X
    // Eaves (origin) at outer edge: Z = -ovhEaves
    // Span: near edge at X=roofRoot.x, far edge at X=roofRoot.x - B
    // Want coverage from X = -vergeL to X = extentX + vergeR
    // So roofRoot.x = extentX + vergeR (far edge at -vergeL)
    targetRoofX_m = extentX / 1000 + vergeROffset_m;
    targetRoofZ_m = -eavesOffset_m;
  } else { // back
    // With yaw=+π/2: local +X → world -Z, local +Z → world +X
    // Roof extends -Z (toward main), span extends toward +X
    // Eaves (origin) at outer edge: Z = extentZ + ovhEaves
    // Span: near edge at X=roofRoot.x, far edge at X=roofRoot.x + B
    // Want coverage from X = -vergeL to X = extentX + vergeR
    // So roofRoot.x = -vergeL (far edge at extentX + vergeR)
    targetRoofX_m = -vergeLOffset_m;
    targetRoofZ_m = extentZ / 1000 + eavesOffset_m;
  }

  // The eaves corner (0,0,0) stays at origin after rotation
  const eavesCorner = localToWorld(0, 0, 0);

  // Y position: The BEARING POINT (where roof meets outer wall) should be at roofOuterY
  // The eaves extends ovhEaves beyond the outer wall, so it's LOWER than roofOuterY
  // Calculate the slope distance from eaves to bearing point: ovhEaves / cos(pitchAngle)
  const bearingPointA_mm = ovhEaves / Math.cos(pitchAngle);
  const bearingPointY = localToWorld(bearingPointA_mm, 0, B_mm / 2).y;
  const targetY_m = roofOuterY / 1000 - bearingPointY;

  // Position the roof root so that the eaves corner lands at the target position
  roofRoot.position = new BABYLON.Vector3(
    targetRoofX_m - eavesCorner.x,
    targetY_m,
    targetRoofZ_m - eavesCorner.z
  );

  console.log("[attachments] Roof positioning - yaw:", (yaw * 180 / Math.PI).toFixed(1) + "°",
              "pitchSign:", pitchSign, "pitch:", (pitchAngle * 180 / Math.PI).toFixed(1) + "°");
  console.log("[attachments] Eaves corner after rotation:", eavesCorner);
  console.log("[attachments] Target roof position: X=" + targetRoofX_m.toFixed(4) + " Z=" + targetRoofZ_m.toFixed(4));
  console.log("[attachments] Roof root position:",
              "x:", (targetRoofX_m - eavesCorner.x).toFixed(4),
              "y:", targetY_m.toFixed(4),
              "z:", (targetRoofZ_m - eavesCorner.z).toFixed(4));
}

/**
 * REFACTORED buildApexRoof for attachments
 * Matches the primary building's apex roof construction approach
 * 
 * Key differences from old version:
 * 1. Uses surface-following positioning (sample point + perpendicular offset)
 * 2. Proper coordinate handling for both orientations
 * 3. No CreatePolygon (avoids earcut dependency)
 * 4. Consistent with primary roof geometry
 */

function buildApexRoof(scene, root, attId, extentX, extentZ, roofBaseY, attachWall, attachment, joistMat, osbMat, coveringMat, claddingMat, memberW_mm, memberD_mm, mainFasciaBottom) {
  // Constants matching primary roof
  const ROOF_OSB_MM = 18;
  const COVERING_MM = 2;
  const FASCIA_THK_MM = 20;
  const FASCIA_DEPTH_MM = 135;
  const CLAD_T_MM = 20;
  
  // Fascia material (white/painted) - same as primary building
  const fasciaMat = scene._fasciaMat || joistMat;
  
  // Get overhang values
  const apexOvh = attachment?.roof?.apex?.overhang || {};
  const ovhEaves_mm = apexOvh.eaves_mm ?? 75;
  const ovhVergeL_mm = apexOvh.vergeLeft_mm ?? 75;
  const ovhVergeR_mm = apexOvh.vergeRight_mm ?? 75;

  // Get crest height from attachment config (already capped in build3D)
  // The capping is done in build3D based on diamond bottom clearance
  const crestHeightAbs = attachment.roof?.apex?.crestHeight_mm || (roofBaseY + 400);
  
  const rise_mm = Math.max(100, crestHeightAbs - roofBaseY);

  // Ridge direction based on attachment wall
  // Left/Right: ridge along X, slopes face Z
  // Front/Back: ridge along Z, slopes face X
  const ridgeAlongX = (attachWall === "left" || attachWall === "right");

  // Dimensions in world coords
  const span_mm = ridgeAlongX ? extentZ : extentX;   // perpendicular to ridge
  const ridge_mm = ridgeAlongX ? extentX : extentZ;  // along ridge
  const halfSpan_mm = span_mm / 2;

  // Slope geometry
  const rafterLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const slopeAng = Math.atan2(rise_mm, halfSpan_mm);
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);

  // Timber dimensions
  const MEMBER_W = memberW_mm || 75;
  const MEMBER_D = memberD_mm || 50;
  const TRUSS_SPACING = 600;

  console.log("[apex-v2] Building apex roof:", attId,
    "ridgeAlongX:", ridgeAlongX,
    "span:", span_mm, "ridge:", ridge_mm, "rise:", rise_mm,
    "rafterLen:", Math.round(rafterLen_mm), "slope:", (slopeAng * 180 / Math.PI).toFixed(1) + "°");

  // Create roof root node
  // Position at eaves height (roofBaseY is absolute, but root is parented to attachment root)
  const roofRoot = new BABYLON.TransformNode(`att-${attId}-apex-roof-root`, scene);
  roofRoot.metadata = { dynamic: true, attachmentId: attId };
  roofRoot.parent = root;
  roofRoot.position = new BABYLON.Vector3(0, roofBaseY / 1000, 0);

  // ========== HELPER FUNCTIONS ==========
  
  // Create box centered at position (in mm, converted to meters)
  function mkBox(name, w, h, d, cx, cy, cz, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: w / 1000, height: h / 1000, depth: d / 1000
    }, scene);
    mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
    mesh.material = mat;
    mesh.parent = roofRoot;
    mesh.metadata = Object.assign({ dynamic: true, attachmentId: attId, type: 'roof' }, meta || {});
    return mesh;
  }

  // Create a sloped panel (covering/OSB) using surface-following positioning
  // This matches the primary roof's approach
  function createSlopedPanel(name, side, length_mm, width_mm, thickness_mm, perpOffset_mm, mat, meta) {
    // side: 'L' (left/lower index slope) or 'R' (right/higher index slope)
    // length_mm: dimension down the slope
    // width_mm: dimension along ridge
    // perpOffset_mm: perpendicular distance from rafter surface to panel center
    
    // Sample point at mid-slope
    const sMid = length_mm / 2;  // distance down slope from ridge
    const runMid = sMid * cosT;  // horizontal distance from ridge
    const dropMid = sMid * sinT; // vertical drop from ridge
    
    // Surface Y at mid-slope (in local coords where tie beam top = MEMBER_D)
    const ySurfMid = MEMBER_D + (rise_mm - dropMid);
    
    // Normal direction for this slope (pointing outward from surface)
    // Left slope: normal points toward -spanAxis and +Y
    // Right slope: normal points toward +spanAxis and +Y
    const normalSpan = (side === 'L') ? -sinT : sinT;
    const normalY = cosT;
    
    // Panel center position
    let cx, cy, cz;
    
    if (ridgeAlongX) {
      // Slopes face Z direction
      // Left slope: Z decreases from ridge (halfSpan) toward 0
      // Right slope: Z increases from ridge toward span_mm
      const spanPos = (side === 'L') 
        ? (halfSpan_mm - runMid)  // left slope
        : (halfSpan_mm + runMid); // right slope
      
      cx = ridge_mm / 2;  // centered along ridge
      cy = ySurfMid + normalY * perpOffset_mm;
      cz = spanPos + normalSpan * perpOffset_mm;
    } else {
      // Slopes face X direction
      const spanPos = (side === 'L')
        ? (halfSpan_mm - runMid)
        : (halfSpan_mm + runMid);
      
      cx = spanPos + normalSpan * perpOffset_mm;
      cy = ySurfMid + normalY * perpOffset_mm;
      cz = ridge_mm / 2;  // centered along ridge
    }
    
    // Create panel
    const mesh = mkBox(name, 
      ridgeAlongX ? width_mm : length_mm,  // width in X
      thickness_mm,
      ridgeAlongX ? length_mm : width_mm,  // depth in Z
      cx, cy, cz, mat, meta);
    
    // Rotate to match slope
    const rotAngle = (side === 'L') ? slopeAng : -slopeAng;
    if (ridgeAlongX) {
      mesh.rotation = new BABYLON.Vector3(-rotAngle, 0, 0);  // rotate around X
    } else {
      mesh.rotation = new BABYLON.Vector3(0, 0, rotAngle);   // rotate around Z
    }
    
    return mesh;
  }

  // ========== 1. TRUSSES ==========
  const trussPositions = [];
  for (let p = 0; p <= ridge_mm - MEMBER_W; p += TRUSS_SPACING) {
    trussPositions.push(p);
  }
  // Ensure end truss
  const lastPos = ridge_mm - MEMBER_W;
  if (trussPositions.length === 0 || trussPositions[trussPositions.length - 1] < lastPos) {
    trussPositions.push(lastPos);
  }

  trussPositions.forEach((pos, idx) => {
    const trussCenterAlongRidge = pos + MEMBER_W / 2;
    
    // Tie beam at bottom
    const tieCx = ridgeAlongX ? trussCenterAlongRidge : halfSpan_mm;
    const tieCy = MEMBER_D / 2;
    const tieCz = ridgeAlongX ? halfSpan_mm : trussCenterAlongRidge;
    const tieW = ridgeAlongX ? MEMBER_W : span_mm;
    const tieD = ridgeAlongX ? span_mm : MEMBER_W;
    
    mkBox(`att-${attId}-truss-${idx}-tie`, tieW, MEMBER_D, tieD, tieCx, tieCy, tieCz,
      joistMat, { part: 'truss', member: 'tie' });
    
    // Rafters
    const rafterCy = MEMBER_D + rise_mm / 2;  // vertical center of rafter
    
    ['L', 'R'].forEach(side => {
      const spanOffset = (rafterLen_mm / 2) * cosT;  // horizontal offset from ridge to rafter center
      const spanPos = (side === 'L') 
        ? (halfSpan_mm - spanOffset)
        : (halfSpan_mm + spanOffset);
      
      let cx, cz;
      if (ridgeAlongX) {
        cx = trussCenterAlongRidge;
        cz = spanPos;
      } else {
        cx = spanPos;
        cz = trussCenterAlongRidge;
      }
      
      const rafter = mkBox(`att-${attId}-truss-${idx}-rafter-${side}`,
        ridgeAlongX ? MEMBER_W : rafterLen_mm,
        MEMBER_D,
        ridgeAlongX ? rafterLen_mm : MEMBER_W,
        cx, rafterCy, cz, joistMat, { part: 'truss', member: `rafter-${side}` });
      
      // Rotate rafter
      const rotAngle = (side === 'L') ? slopeAng : -slopeAng;
      if (ridgeAlongX) {
        rafter.rotation = new BABYLON.Vector3(-rotAngle, 0, 0);
      } else {
        rafter.rotation = new BABYLON.Vector3(0, 0, rotAngle);
      }
    });

    // King post (cripple stud): vertical strut from tie midpoint to apex
    const tieTopY_mm = MEMBER_D;  // top of tie beam
    const postH_mm = Math.max(1, Math.floor(rise_mm - tieTopY_mm));
    
    if (postH_mm > 20) {  // Only create if there's meaningful height
      // Triangular cap that fits between rafters
      const capH_mm = Math.max(20, Math.min(Math.floor(postH_mm * 0.35), Math.floor(MEMBER_W * 0.9)));
      const bodyH_mm = Math.max(1, postH_mm - capH_mm);
      
      // King post body (vertical box)
      const postCx = ridgeAlongX ? trussCenterAlongRidge : halfSpan_mm;
      const postCy = tieTopY_mm + bodyH_mm / 2;
      const postCz = ridgeAlongX ? halfSpan_mm : trussCenterAlongRidge;
      
      mkBox(`att-${attId}-truss-${idx}-kingpost`,
        ridgeAlongX ? MEMBER_W : MEMBER_D,
        bodyH_mm,
        ridgeAlongX ? MEMBER_D : MEMBER_W,
        postCx, postCy, postCz, joistMat, { part: 'truss', member: 'kingpost' });
      
      // King post cap (triangular) using ExtrudeShape
      const halfRun_mm = Math.max(1, Math.round(capH_mm / Math.max(1e-6, Math.tan(slopeAng))));
      
      // Build triangle shape - points defined relative to center
      let capShape, capPath;
      if (ridgeAlongX) {
        // Ridge along X, slopes face Z - triangle in Y-Z plane, extrude along X
        capShape = [
          new BABYLON.Vector3(0, 0, -halfRun_mm / 1000),
          new BABYLON.Vector3(0, capH_mm / 1000, 0),
          new BABYLON.Vector3(0, 0, halfRun_mm / 1000),
          new BABYLON.Vector3(0, 0, -halfRun_mm / 1000)  // close the shape
        ];
        capPath = [
          new BABYLON.Vector3(-MEMBER_W / 2000, 0, 0),
          new BABYLON.Vector3(MEMBER_W / 2000, 0, 0)
        ];
      } else {
        // Ridge along Z, slopes face X - triangle in X-Y plane, extrude along Z
        capShape = [
          new BABYLON.Vector3(-halfRun_mm / 1000, 0, 0),
          new BABYLON.Vector3(0, capH_mm / 1000, 0),
          new BABYLON.Vector3(halfRun_mm / 1000, 0, 0),
          new BABYLON.Vector3(-halfRun_mm / 1000, 0, 0)  // close the shape
        ];
        capPath = [
          new BABYLON.Vector3(0, 0, -MEMBER_W / 2000),
          new BABYLON.Vector3(0, 0, MEMBER_W / 2000)
        ];
      }
      
      const cap = BABYLON.MeshBuilder.ExtrudeShape(
        `att-${attId}-truss-${idx}-kingpost-cap`,
        { shape: capShape, path: capPath, cap: BABYLON.Mesh.CAP_ALL },
        scene
      );
      
      cap.position = new BABYLON.Vector3(
        postCx / 1000,
        (tieTopY_mm + bodyH_mm) / 1000,
        postCz / 1000
      );
      cap.material = joistMat;
      cap.parent = roofRoot;
      cap.metadata = { dynamic: true, attachmentId: attId, type: 'roof', part: 'truss', member: 'kingpost-cap' };
    }
  });

  // ========== 1b. PURLINS ==========
  // Purlins run parallel to the ridge, spaced at 609mm along the slope
  // They sit on top of the rafters (perpendicular offset from slope surface)
  const PURLIN_STEP_MM = 609;
  const PURLIN_CLEAR_MM = 1;
  const purlinOutOffset_mm = (MEMBER_D / 2) + PURLIN_CLEAR_MM;

  // Calculate slope stations: start at ridge (0), step 609mm, always include bottom
  const runBottom_mm = halfSpan_mm;
  const sBottom_mm = cosT > 1e-6 ? (runBottom_mm / cosT) : rafterLen_mm;
  
  const sList = [0];
  let sNext = PURLIN_STEP_MM;
  while (sNext < sBottom_mm) {
    sList.push(Math.round(sNext));
    sNext += PURLIN_STEP_MM;
  }
  const sBottomRounded = Math.round(sBottom_mm);
  if (sList[sList.length - 1] !== sBottomRounded) sList.push(sBottomRounded);

  console.log("[apex-v2] Creating", sList.length * 2, "purlins at stations:", sList);

  sList.forEach((s_mm, idx) => {
    // Clamp within usable slope length
    const run_mm = Math.min(halfSpan_mm, Math.max(0, Math.round(s_mm * cosT)));
    const drop_mm = Math.min(rise_mm, Math.max(0, Math.round(s_mm * sinT)));

    // Roof surface Y in local coords (tie beam top = MEMBER_D)
    const ySurf_mm = MEMBER_D + (rise_mm - drop_mm);

    ['L', 'R'].forEach(side => {
      const spanPos = (side === 'L')
        ? (halfSpan_mm - run_mm)
        : (halfSpan_mm + run_mm);
      
      const normalSpan = (side === 'L') ? -sinT : sinT;
      const normalY = cosT;

      let cx, cy, cz;
      if (ridgeAlongX) {
        cx = ridge_mm / 2;  // centered along ridge
        cy = ySurf_mm + normalY * purlinOutOffset_mm;
        cz = spanPos + normalSpan * purlinOutOffset_mm;
      } else {
        cx = spanPos + normalSpan * purlinOutOffset_mm;
        cy = ySurf_mm + normalY * purlinOutOffset_mm;
        cz = ridge_mm / 2;  // centered along ridge
      }

      const purlin = mkBox(`att-${attId}-purlin-${side}-${idx}`,
        ridgeAlongX ? ridge_mm : MEMBER_W,
        MEMBER_D,
        ridgeAlongX ? MEMBER_W : ridge_mm,
        cx, cy, cz, joistMat, { part: 'purlin', side, idx });

      // Rotate to match slope
      const rotAngle = (side === 'L') ? slopeAng : -slopeAng;
      if (ridgeAlongX) {
        purlin.rotation = new BABYLON.Vector3(-rotAngle, 0, 0);
      } else {
        purlin.rotation = new BABYLON.Vector3(0, 0, rotAngle);
      }
    });
  });

  // ========== 2. OSB ==========
  // OSB sits ON TOP of purlins (not just rafters)
  // Purlins sit on rafters at offset (MEMBER_D/2 + 1), with depth MEMBER_D
  // So purlin outer surface is at: MEMBER_D/2 + 1 + MEMBER_D/2 = MEMBER_D + 1
  // OSB inner surface should be at that level, so OSB center is at: MEMBER_D + 1 + ROOF_OSB_MM/2 + clearance
  const osbPerpOffset = MEMBER_D + ROOF_OSB_MM / 2 + 2;  // Sits on top of purlins
  
  createSlopedPanel(`att-${attId}-osb-L`, 'L', rafterLen_mm, ridge_mm, ROOF_OSB_MM, osbPerpOffset, osbMat, { part: 'osb', side: 'L' });
  createSlopedPanel(`att-${attId}-osb-R`, 'R', rafterLen_mm, ridge_mm, ROOF_OSB_MM, osbPerpOffset, osbMat, { part: 'osb', side: 'R' });

  // ========== 3. COVERING ==========
  // Covering sits on top of OSB - same size as OSB (no overhang, no fold-downs)
  // Simpler approach: covering matches OSB exactly
  const coverPerpOffset = osbPerpOffset + ROOF_OSB_MM / 2 + COVERING_MM / 2 + 1;
  
  // Use same dimensions as OSB panels
  createSlopedPanel(`att-${attId}-covering-L`, 'L', rafterLen_mm, ridge_mm, COVERING_MM, coverPerpOffset, coveringMat, { part: 'covering', side: 'L' });
  createSlopedPanel(`att-${attId}-covering-R`, 'R', rafterLen_mm, ridge_mm, COVERING_MM, coverPerpOffset, coveringMat, { part: 'covering', side: 'R' });

  // ========== 4. FASCIA ==========
  // Eaves fascia (horizontal boards at eaves edges) and barge boards (sloped boards at gable ends)
  const fasciaTopY = MEMBER_D + osbPerpOffset + ROOF_OSB_MM / 2;
  const fasciaCy = fasciaTopY - FASCIA_DEPTH_MM / 2;
  
  // Calculate eaves fascia position so it sits ON the bottom purlin end (not through it)
  // Bottom purlin sits at perpendicular offset from rafter, angled with slope
  // Its outer edge extends: sinT * purlinOffset + half purlin width
  const purlinPerpOffset = (MEMBER_D / 2) + 1; // Same as purlin section
  const purlinOuterEdge_mm = sinT * purlinPerpOffset + MEMBER_W / 2;
  const eaveFasciaOffset_mm = purlinOuterEdge_mm + FASCIA_THK_MM / 2;
  
  // Eaves fascia (horizontal, at outer edges of each slope)
  if (ridgeAlongX) {
    // Eaves at Z=0 and Z=span_mm
    mkBox(`att-${attId}-fascia-eaves-L`, ridge_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM,
      ridge_mm / 2, fasciaCy, -eaveFasciaOffset_mm, fasciaMat, { part: 'fascia', edge: 'eaves-L' });
    mkBox(`att-${attId}-fascia-eaves-R`, ridge_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM,
      ridge_mm / 2, fasciaCy, span_mm + eaveFasciaOffset_mm, fasciaMat, { part: 'fascia', edge: 'eaves-R' });
  } else {
    // Eaves at X=0 and X=span_mm
    mkBox(`att-${attId}-fascia-eaves-L`, FASCIA_THK_MM, FASCIA_DEPTH_MM, ridge_mm,
      -eaveFasciaOffset_mm, fasciaCy, ridge_mm / 2, fasciaMat, { part: 'fascia', edge: 'eaves-L' });
    mkBox(`att-${attId}-fascia-eaves-R`, FASCIA_THK_MM, FASCIA_DEPTH_MM, ridge_mm,
      span_mm + eaveFasciaOffset_mm, fasciaCy, ridge_mm / 2, fasciaMat, { part: 'fascia', edge: 'eaves-R' });
  }

  // Barge boards (sloped fascia running up to the ridge at gable ends)
  // These run from eaves to crest on both sides of each gable end
  // Extend at bottom to cover eaves fascia end grain + 10mm overlap
  const osbOuterOffset_mm = MEMBER_D / 2 + ROOF_OSB_MM / 2 + 2 + ROOF_OSB_MM;
  const BARGE_EXTENSION_MM = FASCIA_THK_MM + 10; // Extra length to cover fascia end grain
  
  function createBargeFascia(side) {
    // side: 'L' or 'R'
    // Barge length = rafter length + extension at eaves end
    const bargeLen_mm = rafterLen_mm + BARGE_EXTENSION_MM;
    // Calculate mid-point along the slope for positioning (shifted down by half extension)
    const sMid = rafterLen_mm / 2 + BARGE_EXTENSION_MM / 2;
    const runMid = sMid * cosT;  // horizontal from ridge
    const dropMid = sMid * sinT; // vertical drop from ridge
    
    // Surface Y at mid-slope
    const ySurfMid = MEMBER_D + (rise_mm - dropMid);
    
    // Normal direction for outward offset
    const normalSpan = (side === 'L') ? -sinT : sinT;
    const normalY = cosT;
    
    // Barge center position (offset outward from OSB surface)
    const bargePerpOffset = osbOuterOffset_mm + FASCIA_THK_MM / 2;
    
    // Calculate span position at mid-slope
    const spanPosMid = (side === 'L')
      ? (halfSpan_mm - runMid)
      : (halfSpan_mm + runMid);
    
    // Barge center Y - hanging down from surface
    const bargeCy = ySurfMid + normalY * bargePerpOffset - (FASCIA_DEPTH_MM / 2) * cosT;
    
    if (ridgeAlongX) {
      // Gable ends at X=0 (front) and X=ridge_mm (back)
      // Barge runs along Z (slope direction)
      const bargeCz = spanPosMid + normalSpan * bargePerpOffset;
      
      // Front barge
      const bargeFront = mkBox(`att-${attId}-fascia-barge-${side}-front`,
        FASCIA_THK_MM, FASCIA_DEPTH_MM, bargeLen_mm,
        -FASCIA_THK_MM / 2, bargeCy, bargeCz,
        fasciaMat, { part: 'fascia', side: side, edge: 'barge-front' });
      bargeFront.rotation = new BABYLON.Vector3((side === 'L') ? -slopeAng : slopeAng, 0, 0);
      
      // Back barge
      const bargeBack = mkBox(`att-${attId}-fascia-barge-${side}-back`,
        FASCIA_THK_MM, FASCIA_DEPTH_MM, bargeLen_mm,
        ridge_mm + FASCIA_THK_MM / 2, bargeCy, bargeCz,
        fasciaMat, { part: 'fascia', side: side, edge: 'barge-back' });
      bargeBack.rotation = new BABYLON.Vector3((side === 'L') ? -slopeAng : slopeAng, 0, 0);
    } else {
      // Gable ends at Z=0 (front) and Z=ridge_mm (back)
      // Barge runs along X (slope direction)
      const bargeCx = spanPosMid + normalSpan * bargePerpOffset;
      
      // Front barge
      const bargeFront = mkBox(`att-${attId}-fascia-barge-${side}-front`,
        bargeLen_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM,
        bargeCx, bargeCy, -FASCIA_THK_MM / 2,
        fasciaMat, { part: 'fascia', side: side, edge: 'barge-front' });
      bargeFront.rotation = new BABYLON.Vector3(0, 0, (side === 'L') ? slopeAng : -slopeAng);
      
      // Back barge
      const bargeBack = mkBox(`att-${attId}-fascia-barge-${side}-back`,
        bargeLen_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM,
        bargeCx, bargeCy, ridge_mm + FASCIA_THK_MM / 2,
        fasciaMat, { part: 'fascia', side: side, edge: 'barge-back' });
      bargeBack.rotation = new BABYLON.Vector3(0, 0, (side === 'L') ? slopeAng : -slopeAng);
    }
  }
  
  createBargeFascia('L');
  createBargeFascia('R');

  // ========== 4b. DIAMOND CAPS ==========
  // Diamond ridge caps at apex (cover the joint where barge boards meet at crest)
  {
    const DIAMOND_SIZE_MM = 120;
    const DIAMOND_THK_MM = FASCIA_THK_MM;
    
    // Ridge Y position (top of roof surface)
    const ridgeY_mm = MEMBER_D + rise_mm + cosT * osbOuterOffset_mm;
    
    // Diamond center Y - positioned to cover the barge board joint
    const diamondCenterY_mm = ridgeY_mm - (FASCIA_DEPTH_MM / 2) * cosT + DIAMOND_SIZE_MM / 4;
    
    if (ridgeAlongX) {
      // Gable ends at X=0 and X=ridge_mm
      // Diamond at the ridge (halfSpan on Z axis)
      
      // Front diamond
      const diamondFront = BABYLON.MeshBuilder.CreateBox(
        `att-${attId}-fascia-diamond-front`,
        { width: DIAMOND_THK_MM / 1000, height: DIAMOND_SIZE_MM / 1000, depth: DIAMOND_SIZE_MM / 1000 },
        scene
      );
      diamondFront.position = new BABYLON.Vector3(
        -DIAMOND_THK_MM / 2 / 1000,
        diamondCenterY_mm / 1000,
        halfSpan_mm / 1000
      );
      diamondFront.rotation = new BABYLON.Vector3(Math.PI / 4, 0, 0);
      diamondFront.material = fasciaMat;
      diamondFront.parent = roofRoot;
      diamondFront.metadata = { dynamic: true, attachmentId: attId, type: 'roof', part: 'fascia', edge: 'diamond-front' };
      
      // Back diamond
      const diamondBack = BABYLON.MeshBuilder.CreateBox(
        `att-${attId}-fascia-diamond-back`,
        { width: DIAMOND_THK_MM / 1000, height: DIAMOND_SIZE_MM / 1000, depth: DIAMOND_SIZE_MM / 1000 },
        scene
      );
      diamondBack.position = new BABYLON.Vector3(
        (ridge_mm + DIAMOND_THK_MM / 2) / 1000,
        diamondCenterY_mm / 1000,
        halfSpan_mm / 1000
      );
      diamondBack.rotation = new BABYLON.Vector3(Math.PI / 4, 0, 0);
      diamondBack.material = fasciaMat;
      diamondBack.parent = roofRoot;
      diamondBack.metadata = { dynamic: true, attachmentId: attId, type: 'roof', part: 'fascia', edge: 'diamond-back' };
    } else {
      // Gable ends at Z=0 and Z=ridge_mm
      // Diamond at the ridge (halfSpan on X axis)
      
      // Front diamond
      const diamondFront = BABYLON.MeshBuilder.CreateBox(
        `att-${attId}-fascia-diamond-front`,
        { width: DIAMOND_SIZE_MM / 1000, height: DIAMOND_SIZE_MM / 1000, depth: DIAMOND_THK_MM / 1000 },
        scene
      );
      diamondFront.position = new BABYLON.Vector3(
        halfSpan_mm / 1000,
        diamondCenterY_mm / 1000,
        -DIAMOND_THK_MM / 2 / 1000
      );
      diamondFront.rotation = new BABYLON.Vector3(0, 0, Math.PI / 4);
      diamondFront.material = fasciaMat;
      diamondFront.parent = roofRoot;
      diamondFront.metadata = { dynamic: true, attachmentId: attId, type: 'roof', part: 'fascia', edge: 'diamond-front' };
      
      // Back diamond
      const diamondBack = BABYLON.MeshBuilder.CreateBox(
        `att-${attId}-fascia-diamond-back`,
        { width: DIAMOND_SIZE_MM / 1000, height: DIAMOND_SIZE_MM / 1000, depth: DIAMOND_THK_MM / 1000 },
        scene
      );
      diamondBack.position = new BABYLON.Vector3(
        halfSpan_mm / 1000,
        diamondCenterY_mm / 1000,
        (ridge_mm + DIAMOND_THK_MM / 2) / 1000
      );
      diamondBack.rotation = new BABYLON.Vector3(0, 0, Math.PI / 4);
      diamondBack.material = fasciaMat;
      diamondBack.parent = roofRoot;
      diamondBack.metadata = { dynamic: true, attachmentId: attId, type: 'roof', part: 'fascia', edge: 'diamond-back' };
    }
  }

  // ========== 5. GABLE ENDS ==========
  // Skip for now - need to use CSG or ExtrudePolygon approach
  // TODO: Implement proper gable cladding without earcut
  console.log("[apex-v2] Skipping gable ends (TODO: implement without CreatePolygon)");
}

// Export for testing
if (typeof module !== 'undefined') module.exports = { buildApexRoof };

/**
 * Dispose all meshes belonging to a specific attachment
 * 
 * Removes all geometry created by build3D for the given attachment ID.
 * Uses mesh metadata to identify which meshes belong to the attachment.
 * 
 * @param {BABYLON.Scene} scene - The Babylon.js scene
 * @param {string} attachmentId - The attachment ID to dispose
 */
export function disposeAttachment(scene, attachmentId) {
  const meshes = scene.meshes.filter(m =>
    m.metadata?.attachmentId === attachmentId
  );
  meshes.forEach(m => m.dispose());

  // Also dispose the root node
  const rootName = `attachment-${attachmentId}-root`;
  const root = scene.getTransformNodeByName(rootName);
  if (root) root.dispose();
}

/**
 * Disposes all attachment meshes and root nodes from the scene.
 * Used when clearing all attachments (e.g., before rebuild).
 * 
 * @param {BABYLON.Scene} scene - The Babylon.js scene
 */
export function disposeAllAttachments(scene) {
  const meshes = scene.meshes.filter(m =>
    m.metadata?.attachmentId != null
  );
  meshes.forEach(m => m.dispose());

  // Dispose all attachment root nodes
  const roots = scene.transformNodes.filter(n =>
    n.name.startsWith('attachment-') && n.name.endsWith('-root')
  );
  roots.forEach(r => r.dispose());
}
