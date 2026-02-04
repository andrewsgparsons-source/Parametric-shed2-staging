/**
 * @fileoverview Roof Tiles - Adds tile covering layers to any roof type
 * 
 * Creates the following layers (bottom to top):
 * 1. Breathable membrane (light blue) - sits on OSB
 * 2. Tile battens (horizontal at 143mm spacing)
 * 3. Hip/ridge battens (along hip and ridge lines)
 * 4. Field tiles (textured slate surfaces)
 * 5. Hip tiles (V-profile geometry along hip/ridge lines)
 * 6. Apex cap (where hips/ridges meet)
 * 
 * Each layer can be toggled for construction breakdown views.
 * 
 * @module elements/roof-tiles
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Tapco synthetic slate tile specifications */
const TILE_SPECS = {
  overallWidth_mm: 445,      // Full tile width
  overallHeight_mm: 305,     // Full tile height  
  exposedHeight_mm: 143,     // Visible portion per course (batten spacing)
  thickness_mm: 5,           // Tile thickness
};

/** Batten dimensions */
const BATTEN_SPECS = {
  width_mm: 50,              // Batten width (vertical dimension when installed)
  height_mm: 25,             // Batten height (stands off from membrane)
  spacing_mm: 143,           // Matches tile exposure
};

/** Membrane specs */
const MEMBRANE_SPECS = {
  thickness_mm: 1,           // Very thin layer
  offset_mm: 0.5,            // Tiny gap above OSB to avoid z-fighting
};

/** Hip tile specs */
const HIP_TILE_SPECS = {
  length_mm: 300,            // Length of each hip tile piece
  width_mm: 200,             // Total width (both sides of V)
  overlap_mm: 50,            // How much each tile overlaps the one below
  thickness_mm: 8,           // Profile thickness
};

// ============================================================================
// MATERIALS
// ============================================================================

/**
 * Creates or retrieves the light blue membrane material
 */
function getMembraneMaterial(scene) {
  const matName = "roofTiles-membrane";
  let mat = scene.getMaterialByName(matName);
  if (!mat) {
    mat = new BABYLON.StandardMaterial(matName, scene);
    // Light blue color for breathable membrane
    mat.diffuseColor = new BABYLON.Color3(0.6, 0.75, 0.9);  // Light blue
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);  // Low shine
    mat.backFaceCulling = false;
  }
  return mat;
}

/**
 * Creates or retrieves the batten material (treated timber look)
 */
function getBattenMaterial(scene) {
  const matName = "roofTiles-batten";
  let mat = scene.getMaterialByName(matName);
  if (!mat) {
    mat = new BABYLON.StandardMaterial(matName, scene);
    // Orange-ish treated timber color (like in Andrew's photo)
    mat.diffuseColor = new BABYLON.Color3(0.8, 0.5, 0.3);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  }
  return mat;
}

/**
 * Creates or retrieves the slate tile material
 */
function getSlateMaterial(scene) {
  const matName = "roofTiles-slate";
  let mat = scene.getMaterialByName(matName);
  if (!mat) {
    mat = new BABYLON.StandardMaterial(matName, scene);
    // Dark grey slate color
    mat.diffuseColor = new BABYLON.Color3(0.25, 0.27, 0.3);  // Pewter grey
    mat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15); // Slight sheen
  }
  return mat;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a box mesh centered at a local position
 */
function createBox(name, width_mm, height_mm, depth_mm, position_mm, material, scene, metadata = {}) {
  const box = BABYLON.MeshBuilder.CreateBox(name, {
    width: width_mm / 1000,
    height: height_mm / 1000,
    depth: depth_mm / 1000,
  }, scene);
  
  box.position = new BABYLON.Vector3(
    position_mm.x / 1000,
    position_mm.y / 1000,
    position_mm.z / 1000
  );
  
  box.material = material;
  box.metadata = { dynamic: true, roofTiles: true, ...metadata };
  
  return box;
}

/**
 * Creates a thin plane for membrane surfaces
 */
function createPlane(name, width_mm, depth_mm, position_mm, rotation, material, scene, metadata = {}) {
  const plane = BABYLON.MeshBuilder.CreatePlane(name, {
    width: width_mm / 1000,
    height: depth_mm / 1000,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE,
  }, scene);
  
  plane.position = new BABYLON.Vector3(
    position_mm.x / 1000,
    position_mm.y / 1000,
    position_mm.z / 1000
  );
  
  if (rotation) {
    plane.rotation = new BABYLON.Vector3(rotation.x, rotation.y, rotation.z);
  }
  
  plane.material = material;
  plane.metadata = { dynamic: true, roofTiles: true, ...metadata };
  
  return plane;
}

// ============================================================================
// LAYER BUILDERS
// ============================================================================

/**
 * Builds membrane layer for a roof slope
 * Creates a thin box (like the felt covering) that follows the slope
 * @param {Object} slope - Slope definition { width_mm, length_mm, position_mm, rotation, name }
 * @param {BABYLON.Scene} scene
 * @param {string} prefix - Mesh name prefix
 */
function buildMembrane(slope, scene, prefix) {
  const mat = getMembraneMaterial(scene);
  
  // Create a thin box (length down slope, width along ridge)
  const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}membrane-${slope.name}`, {
    width: slope.length_mm / 1000,    // Down the slope (X after rotation)
    height: MEMBRANE_SPECS.thickness_mm / 1000,
    depth: slope.width_mm / 1000,     // Along the ridge (Z)
  }, scene);
  
  mesh.position = new BABYLON.Vector3(
    slope.position_mm.x / 1000,
    slope.position_mm.y / 1000,
    slope.position_mm.z / 1000
  );
  
  mesh.rotation = new BABYLON.Vector3(
    slope.rotation.x,
    slope.rotation.y,
    slope.rotation.z
  );
  
  mesh.material = mat;
  mesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: slope.name };
  
  return mesh;
}

/**
 * Builds tile battens for a roof slope
 * Battens run horizontally (parallel to ridge/eaves), spaced up the slope
 * @param {Object} slope - Slope definition
 * @param {BABYLON.Scene} scene
 * @param {string} prefix - Mesh name prefix
 */
function buildBattens(slope, scene, prefix) {
  const mat = getBattenMaterial(scene);
  const battens = [];
  
  // Calculate number of battens based on slope length
  const numBattens = Math.floor(slope.length_mm / BATTEN_SPECS.spacing_mm);
  
  const sinT = Math.sin(slope.slopeAngle);
  const cosT = Math.cos(slope.slopeAngle);
  
  // Starting position (from eaves, going up the slope)
  for (let i = 0; i < numBattens; i++) {
    const distanceUp_mm = (i + 0.5) * BATTEN_SPECS.spacing_mm;
    
    // Calculate position along the slope surface
    // distanceUp_mm is measured along the slope, need to convert to X/Y offsets
    const runOffset_mm = distanceUp_mm * cosT;  // Horizontal distance from eaves
    const riseOffset_mm = distanceUp_mm * sinT; // Vertical rise
    
    // For left slope: X decreases as we go up (toward ridge), Y increases
    // For right slope: X increases as we go up, Y increases
    const xOffset = (slope.name === "left") ? -runOffset_mm : runOffset_mm;
    
    // Batten position (start from eaves edge and go up)
    // Eaves edge is at slope.position - half length offset
    const battenX = slope.position_mm.x + xOffset - (slope.name === "left" ? -1 : 1) * (slope.length_mm / 2 * cosT);
    const battenY = slope.position_mm.y + riseOffset_mm - (slope.length_mm / 2 * sinT) + BATTEN_SPECS.height_mm;
    const battenZ = slope.position_mm.z;
    
    // Batten dimensions: width along Z (ridge direction), thin in X, height in Y
    const batten = BABYLON.MeshBuilder.CreateBox(`${prefix}batten-${slope.name}-${i}`, {
      width: BATTEN_SPECS.width_mm / 1000,   // Thin (50mm) - perpendicular to ridge
      height: BATTEN_SPECS.height_mm / 1000, // Height (25mm)
      depth: slope.width_mm / 1000,          // Length along ridge (full roof depth)
    }, scene);
    
    batten.position = new BABYLON.Vector3(
      battenX / 1000,
      battenY / 1000,
      battenZ / 1000
    );
    
    // Rotate to follow slope angle (around Z axis)
    batten.rotation = new BABYLON.Vector3(0, 0, slope.rotation.z);
    
    batten.material = mat;
    batten.metadata = { dynamic: true, roofTiles: true, layer: "battens", slope: slope.name, index: i };
    
    battens.push(batten);
  }
  
  return battens;
}

// ============================================================================
// ROOF TYPE ADAPTERS
// ============================================================================

/**
 * Extracts slope information from an apex roof
 * Returns array of slope objects with position, rotation, and dimensions
 */
function getApexSlopes(state) {
  const dims = getDims(state);
  if (!dims) return [];
  
  // Roof dimensions
  const roofW_mm = dims.roofW_mm;
  const roofD_mm = dims.roofD_mm;
  
  // Get apex heights
  const apex = state?.roof?.apex || {};
  const eavesH_mm = apex.heightToEaves_mm || apex.eavesHeight_mm || 1850;
  const crestH_mm = apex.heightToCrest_mm || apex.crestHeight_mm || eavesH_mm + 400;
  
  // WALL_RISE is the floor stack height (grid + frame + OSB + plate = 168mm)
  const WALL_RISE_MM = 168;
  
  // Roof root Y position (where the roof sits on the walls)
  // This matches the calculation in roof.js: roofRootY = eavesH_mm - WALL_RISE_MM
  const roofRootY_mm = eavesH_mm - WALL_RISE_MM;
  
  // Calculate geometry
  const halfSpan_mm = roofW_mm / 2;
  const rise_mm = Math.max(crestH_mm - eavesH_mm, 100);  // Minimum 100mm rise
  const rafterLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const slopeAng = Math.atan2(rise_mm, halfSpan_mm);
  
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);
  
  // OSB sits on rafters (50mm deep for apex trusses)
  const memberD_mm = 50;
  const OSB_THK_MM = 18;
  const OSB_CLEAR_MM = 1;
  
  // Membrane sits ON TOP of OSB
  const membraneOffset_mm = memberD_mm + OSB_CLEAR_MM + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm / 2;
  
  // Calculate mid-slope surface positions (in roof-local coordinates)
  const sMid_mm = rafterLen_mm / 2;
  const runMid_mm = sMid_mm * cosT;
  const dropMid_mm = sMid_mm * sinT;
  
  // Y position at mid-slope (roof-local) + offset to world coordinates
  const ySurfMid_local_mm = memberD_mm + (rise_mm - dropMid_mm);
  const ySurfMid_world_mm = roofRootY_mm + ySurfMid_local_mm;
  
  // Left slope (X goes from 0 to halfSpan)
  const leftNormalX = -sinT;
  const leftNormalY = cosT;
  const leftSurfX_mm = halfSpan_mm - runMid_mm;
  const leftCx = leftSurfX_mm + leftNormalX * membraneOffset_mm;
  const leftCy = ySurfMid_world_mm + leftNormalY * membraneOffset_mm;
  
  // Right slope (X goes from halfSpan to roofW)
  const rightNormalX = sinT;
  const rightNormalY = cosT;
  const rightSurfX_mm = halfSpan_mm + runMid_mm;
  const rightCx = rightSurfX_mm + rightNormalX * membraneOffset_mm;
  const rightCy = ySurfMid_world_mm + rightNormalY * membraneOffset_mm;
  
  // Z center (ridge runs along Z axis)
  const cz_mm = roofD_mm / 2;
  
  console.log("[ROOF-TILES] Apex slope calc:", {
    eavesH_mm, roofRootY_mm, rise_mm, rafterLen_mm,
    slopeAng: (slopeAng * 180 / Math.PI).toFixed(1) + "°",
    leftCy, rightCy
  });
  
  return [
    {
      name: "left",
      width_mm: roofD_mm,           // Along ridge (Z direction when rotated)
      length_mm: rafterLen_mm,      // Down the slope
      position_mm: { x: leftCx, y: leftCy, z: cz_mm },
      rotation: { x: 0, y: 0, z: slopeAng },
      slopeAngle: slopeAng,
      normal: { x: leftNormalX, y: leftNormalY },
    },
    {
      name: "right", 
      width_mm: roofD_mm,
      length_mm: rafterLen_mm,
      position_mm: { x: rightCx, y: rightCy, z: cz_mm },
      rotation: { x: 0, y: 0, z: -slopeAng },
      slopeAngle: slopeAng,
      normal: { x: rightNormalX, y: rightNormalY },
    },
  ];
}

/**
 * Helper to get dimensions from state
 */
function getDims(state) {
  if (!state) return null;
  
  // Get frame dimensions
  const frameW_mm = state.w || state.frame?.w_mm || 2400;
  const frameD_mm = state.d || state.frame?.d_mm || 3000;
  
  // Get overhang
  const ovh = state.overhang || { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };
  const l_mm = ovh.l_mm || 0;
  const r_mm = ovh.r_mm || 0;
  const f_mm = ovh.f_mm || 0;
  const b_mm = ovh.b_mm || 0;
  
  return {
    frameW_mm,
    frameD_mm,
    roofW_mm: frameW_mm + l_mm + r_mm,
    roofD_mm: frameD_mm + f_mm + b_mm,
    overhang: ovh,
  };
}

/**
 * Extracts slope information from a pent roof
 */
function getPentSlopes(state) {
  // TODO: Extract slope geometry from pent roof state
  console.log("[ROOF-TILES] Pent roof tiles not yet implemented");
  return [];
}

/**
 * Extracts slope information from a hipped roof
 */
function getHippedSlopes(state) {
  // TODO: Extract slope geometry from hipped roof state
  // This includes: 2 main slopes (trapezoids) + 2 hip ends (triangles)
  console.log("[ROOF-TILES] Hipped roof tiles not yet implemented");
  return [];
}

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

/**
 * Main entry point - builds all tile layers for the current roof
 * 
 * @param {Object} state - Building state
 * @param {Object} ctx - Babylon context { scene, materials }
 * @param {Object} roofData - Data from roof builder (dimensions, positions, etc.)
 * @param {Object} options - Build options
 * @param {boolean} options.membrane - Show membrane layer
 * @param {boolean} options.battens - Show batten layer
 * @param {boolean} options.tiles - Show tile layer
 * @param {boolean} options.hipTiles - Show hip tile geometry
 */
export function buildTileLayers(state, ctx, roofData, options = {}) {
  const { scene } = ctx;
  if (!scene) return;
  
  const prefix = "roof-tiles-";
  
  // Default options - all layers visible
  const opts = {
    membrane: true,
    battens: true,
    tiles: true,
    hipTiles: true,
    ...options,
  };
  
  // First, dispose any existing tile meshes
  disposeTileMeshes(scene, prefix);
  
  // Get slopes based on roof type
  const roofStyle = state?.roof?.style || "apex";
  let slopes = [];
  
  switch (roofStyle) {
    case "apex":
      slopes = getApexSlopes(state);
      break;
    case "pent":
      slopes = getPentSlopes(state);
      break;
    case "hipped":
      slopes = getHippedSlopes(state);
      break;
  }
  
  console.log(`[ROOF-TILES] Building for ${roofStyle} roof, ${slopes.length} slopes`);
  
  // Build each layer
  const meshes = {
    membrane: [],
    battens: [],
    tiles: [],
    hipTiles: [],
  };
  
  for (const slope of slopes) {
    if (opts.membrane) {
      meshes.membrane.push(buildMembrane(slope, scene, prefix));
    }
    
    if (opts.battens) {
      meshes.battens.push(...buildBattens(slope, scene, prefix));
    }
    
    // TODO: Add tile surface and hip tiles
  }
  
  return meshes;
}

/**
 * Disposes all tile-related meshes
 */
export function disposeTileMeshes(scene, prefix = "roof-tiles-") {
  const toDispose = [];
  
  for (const mesh of scene.meshes || []) {
    if (mesh.name && mesh.name.startsWith(prefix)) {
      toDispose.push(mesh);
    }
  }
  
  for (const mesh of toDispose) {
    mesh.dispose();
  }
  
  console.log(`[ROOF-TILES] Disposed ${toDispose.length} meshes`);
}

/**
 * Sets visibility of specific tile layers
 */
export function setLayerVisibility(scene, layer, visible, prefix = "roof-tiles-") {
  for (const mesh of scene.meshes || []) {
    if (mesh.metadata?.roofTiles && mesh.metadata?.layer === layer) {
      mesh.isVisible = visible;
    }
  }
}
