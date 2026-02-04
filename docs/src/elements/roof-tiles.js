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
 * Creates a thin box that sits on the OSB, following the slope angle
 * Positioned in LOCAL coordinates, parented to roofRoot
 * @param {Object} slope - Slope definition { width_mm, length_mm, position_mm, rotation, name }
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.TransformNode} roofRoot - Parent transform node
 * @param {string} prefix - Mesh name prefix
 */
function buildMembrane(slope, scene, roofRoot, prefix) {
  const mat = getMembraneMaterial(scene);
  
  // Membrane dimensions:
  // - length_mm = down the slope (becomes tilted X after rotation)
  // - width_mm = along the ridge (Z direction)
  
  const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}membrane-${slope.name}`, {
    width: slope.length_mm / 1000,    // Down the slope
    height: MEMBRANE_SPECS.thickness_mm / 1000,
    depth: slope.width_mm / 1000,     // Along the ridge
  }, scene);
  
  // Parent to roofRoot so we use LOCAL coordinates
  mesh.parent = roofRoot;
  
  // Position in LOCAL coordinates (relative to roofRoot)
  mesh.position = new BABYLON.Vector3(
    slope.position_mm.x / 1000,
    slope.position_mm.y / 1000,
    slope.position_mm.z / 1000
  );
  
  // Rotate to follow roof slope (around Z axis for apex)
  mesh.rotation = new BABYLON.Vector3(
    slope.rotation.x,
    slope.rotation.y,
    slope.rotation.z
  );
  
  mesh.material = mat;
  mesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: slope.name };
  
  console.log(`[ROOF-TILES] Membrane ${slope.name} (LOCAL):`, {
    pos: slope.position_mm,
    rot: slope.rotation,
    length: slope.length_mm,
    width: slope.width_mm
  });
  
  return mesh;
}

/**
 * Builds tile battens for a roof slope
 * Battens run horizontally (parallel to ridge/eaves), spaced down the slope from ridge
 * Positioned in LOCAL coordinates, parented to roofRoot
 * @param {Object} slope - Slope definition
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.TransformNode} roofRoot - Parent transform node
 * @param {Object} roofData - Additional roof data { memberD_mm, osbOutOffset_mm, OSB_THK_MM }
 * @param {string} prefix - Mesh name prefix
 */
function buildBattens(slope, scene, roofRoot, roofData, prefix) {
  const mat = getBattenMaterial(scene);
  const battens = [];
  
  // Calculate number of battens based on slope length
  // Start first batten one spacing from RIDGE, end before eaves
  const numBattens = Math.floor((slope.length_mm - BATTEN_SPECS.spacing_mm) / BATTEN_SPECS.spacing_mm);
  if (numBattens < 1) return battens;
  
  const slopeAng = slope.slopeAngle;
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);
  
  // Battens sit on top of membrane, which sits on OSB
  // battenBottomOffset = osbOutOffset + OSB_THK + membrane_thk
  // battenCenterOffset = battenBottomOffset + batten_height/2
  const { memberD_mm, osbOutOffset_mm, OSB_THK_MM } = roofData;
  const battenCenterOffset_mm = osbOutOffset_mm + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm + BATTEN_SPECS.height_mm / 2;
  
  // Slope normal (outward from roof surface)
  const normalX = slope.normal.x;
  const normalY = slope.normal.y;
  
  // Add RIDGE BATTEN at the very top (close to the ridge line)
  // This supports the top row of tiles and ridge tiles
  {
    const RIDGE_MARGIN_MM = 25;  // Small margin from ridge
    const s_mm = RIDGE_MARGIN_MM;
    const run_mm = s_mm * cosT;
    const drop_mm = s_mm * sinT;
    
    // LOCAL Y at roof surface near ridge
    const ySurf_mm = memberD_mm + (slope.rise_mm - drop_mm);
    
    // LOCAL X at roof surface
    let xSurf_mm;
    if (slope.name === "left") {
      xSurf_mm = slope.halfSpan_mm - run_mm;
    } else {
      xSurf_mm = slope.halfSpan_mm + run_mm;
    }
    
    // Offset from surface along normal to get batten center
    const localX_mm = xSurf_mm + normalX * battenCenterOffset_mm;
    const localY_mm = ySurf_mm + normalY * battenCenterOffset_mm;
    const localZ_mm = slope.position_mm.z;
    
    const ridgeBatten = BABYLON.MeshBuilder.CreateBox(`${prefix}batten-${slope.name}-ridge`, {
      width: BATTEN_SPECS.width_mm / 1000,
      height: BATTEN_SPECS.height_mm / 1000,
      depth: slope.width_mm / 1000,
    }, scene);
    
    ridgeBatten.parent = roofRoot;
    ridgeBatten.position = new BABYLON.Vector3(
      localX_mm / 1000,
      localY_mm / 1000,
      localZ_mm / 1000
    );
    ridgeBatten.rotation = new BABYLON.Vector3(0, 0, slope.rotation.z);
    ridgeBatten.material = mat;
    ridgeBatten.metadata = { dynamic: true, roofTiles: true, layer: "battens", slope: slope.name, index: "ridge" };
    
    battens.push(ridgeBatten);
  }
  
  // For each regular batten, calculate its LOCAL position
  for (let i = 0; i < numBattens; i++) {
    // Distance from RIDGE, measured along the slope surface
    const distFromRidge_mm = (i + 1) * BATTEN_SPECS.spacing_mm;
    
    // Position along slope: s=0 at ridge, s=rafterLen at eaves
    // Battens start from ridge (top) going down
    const s_mm = distFromRidge_mm;
    const run_mm = s_mm * cosT;
    const drop_mm = s_mm * sinT;
    
    // LOCAL Y at roof surface at this position
    const ySurf_mm = memberD_mm + (slope.rise_mm - drop_mm);
    
    // LOCAL X at roof surface
    let xSurf_mm;
    if (slope.name === "left") {
      xSurf_mm = slope.halfSpan_mm - run_mm;
    } else {
      xSurf_mm = slope.halfSpan_mm + run_mm;
    }
    
    // Offset from surface along normal to get batten center
    const localX_mm = xSurf_mm + normalX * battenCenterOffset_mm;
    const localY_mm = ySurf_mm + normalY * battenCenterOffset_mm;
    const localZ_mm = slope.position_mm.z;  // Same Z center as membrane
    
    // Create batten: long along Z (ridge), thin cross-slope, short height
    const batten = BABYLON.MeshBuilder.CreateBox(`${prefix}batten-${slope.name}-${i}`, {
      width: BATTEN_SPECS.width_mm / 1000,   // 50mm (cross-slope direction after rotation)
      height: BATTEN_SPECS.height_mm / 1000, // 25mm (perpendicular to slope)
      depth: slope.width_mm / 1000,          // Full length along ridge (Z)
    }, scene);
    
    // Parent to roofRoot
    batten.parent = roofRoot;
    
    // Position in LOCAL coordinates
    batten.position = new BABYLON.Vector3(
      localX_mm / 1000,
      localY_mm / 1000,
      localZ_mm / 1000
    );
    
    // Rotate to follow slope angle
    batten.rotation = new BABYLON.Vector3(0, 0, slope.rotation.z);
    
    batten.material = mat;
    batten.metadata = { dynamic: true, roofTiles: true, layer: "battens", slope: slope.name, index: i };
    
    battens.push(batten);
  }
  
  // Add EAVES BATTEN at the very bottom edge (adjacent to fascia)
  // This supports the first/bottom row of tiles
  {
    // Eaves batten position: at the outer edge of the slope (s = rafterLen - small offset)
    // Position it close to the eaves edge, leaving just a small margin
    const EAVES_MARGIN_MM = 25;  // Small margin from absolute edge
    const s_mm = slope.length_mm - EAVES_MARGIN_MM;
    const run_mm = s_mm * cosT;
    const drop_mm = s_mm * sinT;
    
    // LOCAL Y at roof surface at eaves
    const ySurf_mm = memberD_mm + (slope.rise_mm - drop_mm);
    
    // LOCAL X at roof surface
    let xSurf_mm;
    if (slope.name === "left") {
      xSurf_mm = slope.halfSpan_mm - run_mm;
    } else {
      xSurf_mm = slope.halfSpan_mm + run_mm;
    }
    
    // Offset from surface along normal to get batten center
    const localX_mm = xSurf_mm + normalX * battenCenterOffset_mm;
    const localY_mm = ySurf_mm + normalY * battenCenterOffset_mm;
    const localZ_mm = slope.position_mm.z;
    
    const eavesBatten = BABYLON.MeshBuilder.CreateBox(`${prefix}batten-${slope.name}-eaves`, {
      width: BATTEN_SPECS.width_mm / 1000,
      height: BATTEN_SPECS.height_mm / 1000,
      depth: slope.width_mm / 1000,
    }, scene);
    
    eavesBatten.parent = roofRoot;
    eavesBatten.position = new BABYLON.Vector3(
      localX_mm / 1000,
      localY_mm / 1000,
      localZ_mm / 1000
    );
    eavesBatten.rotation = new BABYLON.Vector3(0, 0, slope.rotation.z);
    eavesBatten.material = mat;
    eavesBatten.metadata = { dynamic: true, roofTiles: true, layer: "battens", slope: slope.name, index: "eaves" };
    
    battens.push(eavesBatten);
  }
  
  console.log(`[ROOF-TILES] Battens ${slope.name}: ${battens.length} created (incl. eaves batten)`);
  
  return battens;
}

/**
 * Builds slate tile surface for a roof slope
 * Creates a thin slab that sits on top of the battens, representing the finished tiles
 * Positioned in LOCAL coordinates, parented to roofRoot
 * @param {Object} slope - Slope definition
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.TransformNode} roofRoot - Parent transform node
 * @param {Object} roofData - Additional roof data
 * @param {string} prefix - Mesh name prefix
 */
function buildTileSurface(slope, scene, roofRoot, roofData, prefix) {
  const mat = getSlateMaterial(scene);
  
  // Tile surface sits on top of battens
  // Stack: OSB -> membrane -> battens -> tiles
  const { memberD_mm, osbOutOffset_mm, OSB_THK_MM } = roofData;
  
  // Tile surface offset: battens (25mm tall) + half tile thickness
  const TILE_THK_MM = TILE_SPECS.thickness_mm;  // 5mm
  const tileSurfaceOffset_mm = osbOutOffset_mm + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm + BATTEN_SPECS.height_mm + TILE_THK_MM / 2;
  
  const slopeAng = slope.slopeAngle;
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);
  
  // Mid-slope sample point
  const sMid_mm = slope.length_mm / 2;
  const runMid_mm = sMid_mm * cosT;
  const dropMid_mm = sMid_mm * sinT;
  
  // LOCAL Y at roof surface mid-slope
  const ySurf_mm = memberD_mm + (slope.rise_mm - dropMid_mm);
  
  // LOCAL X at roof surface
  let xSurf_mm;
  if (slope.name === "left") {
    xSurf_mm = slope.halfSpan_mm - runMid_mm;
  } else {
    xSurf_mm = slope.halfSpan_mm + runMid_mm;
  }
  
  // Offset from surface along normal to get tile center
  const normalX = slope.normal.x;
  const normalY = slope.normal.y;
  const localX_mm = xSurf_mm + normalX * tileSurfaceOffset_mm;
  const localY_mm = ySurf_mm + normalY * tileSurfaceOffset_mm;
  const localZ_mm = slope.position_mm.z;
  
  // Create tile surface: same dimensions as membrane but sitting higher
  const tileSurface = BABYLON.MeshBuilder.CreateBox(`${prefix}tiles-${slope.name}`, {
    width: slope.length_mm / 1000,    // Down the slope
    height: TILE_THK_MM / 1000,       // 5mm thick
    depth: slope.width_mm / 1000,     // Along the ridge
  }, scene);
  
  // Parent to roofRoot
  tileSurface.parent = roofRoot;
  
  // Position in LOCAL coordinates
  tileSurface.position = new BABYLON.Vector3(
    localX_mm / 1000,
    localY_mm / 1000,
    localZ_mm / 1000
  );
  
  // Rotate to follow slope angle
  tileSurface.rotation = new BABYLON.Vector3(0, 0, slope.rotation.z);
  
  tileSurface.material = mat;
  tileSurface.metadata = { dynamic: true, roofTiles: true, layer: "tiles", slope: slope.name };
  
  console.log(`[ROOF-TILES] Tile surface ${slope.name} (LOCAL): offset ${tileSurfaceOffset_mm.toFixed(1)}mm from OSB`);
  
  return tileSurface;
}

// ============================================================================
// ROOF TYPE ADAPTERS
// ============================================================================

/**
 * Extracts slope information from an apex roof
 * Returns array of slope objects with LOCAL position (relative to roofRoot), rotation, and dimensions
 * Matches roof.js covering positioning exactly
 */
function getApexSlopes(state, scene) {
  const dims = getDims(state);
  if (!dims) return { slopes: [], roofRoot: null };
  
  // Find the existing roofRoot transform node
  const roofRoot = scene.getTransformNodeByName("roof-root");
  if (!roofRoot) {
    console.warn("[ROOF-TILES] No roof-root found in scene");
    return { slopes: [], roofRoot: null };
  }
  
  // Roof dimensions (same as roof.js)
  const A_mm = dims.roofW_mm;  // Total width including overhangs
  const B_mm = dims.roofD_mm;  // Total depth including overhangs (ridge length)
  
  // Get apex heights
  const apex = state?.roof?.apex || {};
  const eavesH_mm = apex.heightToEaves_mm || apex.eavesHeight_mm || 1850;
  const crestH_mm = apex.heightToCrest_mm || apex.crestHeight_mm || eavesH_mm + 400;
  
  // Calculate geometry (matching roof.js exactly)
  const halfSpan_mm = A_mm / 2;
  const rise_mm = Math.max(crestH_mm - eavesH_mm, 100);
  const rafterLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const slopeAng = Math.atan2(rise_mm, halfSpan_mm);
  
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);
  
  // OSB positioning constants (must match roof.js exactly)
  const memberD_mm = 50;         // Rafter depth
  const OSB_THK_MM = 18;
  const OSB_CLEAR_MM = 1;
  const osbOutOffset_mm = memberD_mm + OSB_CLEAR_MM;
  
  // Membrane sits ON TOP of OSB
  const membraneOffset_mm = osbOutOffset_mm + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm / 2;
  
  // Mid-slope sample point (LOCAL coordinates relative to roofRoot)
  // This matches roof.js covering positioning exactly
  const sMid_mm = rafterLen_mm / 2;
  const runMid_mm = sMid_mm * cosT;
  const dropMid_mm = sMid_mm * sinT;
  
  // LOCAL Y at roof surface mid-slope (relative to roofRoot Y=0 at tie beam level)
  const ySurfMid_mm = memberD_mm + (rise_mm - dropMid_mm);
  
  // Left slope: surface at X = halfSpan - runMid, offset outward along normal (-sinT, cosT)
  const leftSurfX_mm = halfSpan_mm - runMid_mm;
  const leftCx = leftSurfX_mm + (-sinT) * membraneOffset_mm;
  const leftCy = ySurfMid_mm + cosT * membraneOffset_mm;
  
  // Right slope: surface at X = halfSpan + runMid, offset outward along normal (sinT, cosT)
  const rightSurfX_mm = halfSpan_mm + runMid_mm;
  const rightCx = rightSurfX_mm + sinT * membraneOffset_mm;
  const rightCy = ySurfMid_mm + cosT * membraneOffset_mm;
  
  // Z center (same as roof.js covering: B_mm / 2)
  const cz_mm = B_mm / 2;
  
  console.log("[ROOF-TILES] Apex slope calc (LOCAL coords):", {
    A_mm, B_mm, rise_mm, rafterLen_mm,
    slopeAng: (slopeAng * 180 / Math.PI).toFixed(1) + "°",
    membraneOffset_mm,
    leftCx: leftCx.toFixed(1), leftCy: leftCy.toFixed(1),
    rightCx: rightCx.toFixed(1), rightCy: rightCy.toFixed(1),
    cz_mm
  });
  
  return {
    slopes: [
      {
        name: "left",
        width_mm: B_mm,             // Along ridge (Z direction)
        length_mm: rafterLen_mm,    // Down the slope
        position_mm: { x: leftCx, y: leftCy, z: cz_mm },
        rotation: { x: 0, y: 0, z: slopeAng },
        slopeAngle: slopeAng,
        normal: { x: -sinT, y: cosT },
        halfSpan_mm,
        rise_mm,
      },
      {
        name: "right", 
        width_mm: B_mm,
        length_mm: rafterLen_mm,
        position_mm: { x: rightCx, y: rightCy, z: cz_mm },
        rotation: { x: 0, y: 0, z: -slopeAng },
        slopeAngle: slopeAng,
        normal: { x: sinT, y: cosT },
        halfSpan_mm,
        rise_mm,
      },
    ],
    roofRoot,
    memberD_mm,
    osbOutOffset_mm,
    OSB_THK_MM,
  };
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
 * @param {Object} roofDataArg - Data from roof builder (unused now - we get from scene)
 * @param {Object} options - Build options
 * @param {boolean} options.membrane - Show membrane layer
 * @param {boolean} options.battens - Show batten layer
 * @param {boolean} options.tiles - Show tile layer
 * @param {boolean} options.hipTiles - Show hip tile geometry
 */
export function buildTileLayers(state, ctx, roofDataArg, options = {}) {
  const { scene } = ctx;
  if (!scene) return;
  
  const prefix = "roof-tiles-";
  
  // Check roof covering type - only build tile layers for slate
  const covering = state?.roof?.covering || "felt";
  if (covering !== "slate") {
    // Not slate - dispose any existing tile meshes and return
    disposeTileMeshes(scene, prefix);
    console.log(`[ROOF-TILES] Covering is "${covering}" - tile layers not needed`);
    return { membrane: [], battens: [], tiles: [], hipTiles: [] };
  }
  
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
  let slopeData = { slopes: [], roofRoot: null };
  
  switch (roofStyle) {
    case "apex":
      slopeData = getApexSlopes(state, scene);
      break;
    case "pent":
      slopeData.slopes = getPentSlopes(state);
      break;
    case "hipped":
      slopeData.slopes = getHippedSlopes(state);
      break;
  }
  
  const { slopes, roofRoot, memberD_mm, osbOutOffset_mm, OSB_THK_MM } = slopeData;
  
  if (!roofRoot) {
    console.warn("[ROOF-TILES] No roofRoot - cannot build tile layers");
    return { membrane: [], battens: [], tiles: [], hipTiles: [] };
  }
  
  console.log(`[ROOF-TILES] Building for ${roofStyle} roof, ${slopes.length} slopes, parenting to roofRoot`);
  
  // Build each layer
  const meshes = {
    membrane: [],
    battens: [],
    tiles: [],
    hipTiles: [],
  };
  
  const roofData = { memberD_mm, osbOutOffset_mm, OSB_THK_MM };
  
  for (const slope of slopes) {
    if (opts.membrane) {
      meshes.membrane.push(buildMembrane(slope, scene, roofRoot, prefix));
    }
    
    if (opts.battens) {
      meshes.battens.push(...buildBattens(slope, scene, roofRoot, roofData, prefix));
    }
    
    if (opts.tiles) {
      meshes.tiles.push(buildTileSurface(slope, scene, roofRoot, roofData, prefix));
    }
    
    // TODO: Add hip tiles for hipped roofs
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
