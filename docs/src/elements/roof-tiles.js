/**
 * @fileoverview Roof Tiles — slate slab, membrane, and battens per slope
 *
 * Layers (bottom to top):
 * 1. Breathable membrane (light blue, 1mm) — sits on OSB
 * 2. Tile battens (treated timber, 50×25mm @ 143mm spacing)
 * 3. Slate tile slab (5mm solid grey) — sits on top of bargeboards
 *
 * Each layer can be toggled for construction breakdown views.
 * All positioning mirrors roof.js exactly.
 *
 * @module elements/roof-tiles
 */

import { CONFIG, resolveDims } from "../params.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const TILE_THK_MM   = 5;    // Slab thickness
const FASCIA_THK_MM = 20;   // Barge/fascia board thickness — must match roof.js
const OVERHANG_MM   = 10;   // How far tile extends PAST barge/fascia outer face
const OSB_THK_MM    = 18;   // Must match roof.js
const OSB_CLEAR_MM  = 1;    // Must match roof.js

/** Membrane specs */
const MEMBRANE_SPECS = {
  thickness_mm: 1,
  offset_mm: 0.5,           // Tiny gap above OSB to avoid z-fighting
};

/** Batten dimensions (Tapco tile spacing) */
const BATTEN_SPECS = {
  width_mm: 50,              // Cross-slope dimension
  height_mm: 25,             // Perpendicular to slope surface
  spacing_mm: 143,           // Matches tile exposure (batten gauge)
};

// ============================================================================
// MATERIALS
// ============================================================================

/** Tapco synthetic slate tile dimensions (mm) */
const TILE_WIDTH_MM    = 305;   // Tile width along ridge (Tapco standard)
const TILE_EXPOSURE_MM = 143;   // Visible height per tile (= batten gauge)

function getSlateMaterial(scene, slabLen_mm, slabWidth_mm) {
  const name = "roofTiles-slate";
  let mat = scene.getMaterialByName(name);
  if (!mat) {
    mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor  = new BABYLON.Color3(1, 1, 1);   // Texture handles colour
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    const tex = _createSlateTileTexture(scene);
    mat.diffuseTexture = tex;
  }

  // Update UV repeat to match physical slab dimensions
  // Canvas X → U → along slope  (repeat unit = 2 tile rows = 286mm)
  // Canvas Y → V → along ridge  (repeat unit = 2 tile widths = 610mm)
  const repeatU_mm = TILE_EXPOSURE_MM * 2;   // 286
  const repeatV_mm = TILE_WIDTH_MM * 2;      // 610  (2 tiles wide for stagger colours)
  if (mat.diffuseTexture && slabLen_mm > 0 && slabWidth_mm > 0) {
    mat.diffuseTexture.uScale = slabLen_mm  / repeatU_mm;
    mat.diffuseTexture.vScale = slabWidth_mm / repeatV_mm;
  }

  return mat;
}

/**
 * Creates a seamlessly-tiling DynamicTexture with running-bond slate pattern.
 *
 * Matches reference: uniform dark slate colour, very subtle groove lines,
 * stagger visible through groove positions (not colour variation).
 *
 * Canvas layout (512×512):
 *   X axis (U) → along slope: 2 columns = 2 tile rows of 143mm each
 *   Y axis (V) → along ridge: 2 tile widths = 610mm
 *
 *   Course 0 (y=0..courseH):  [Tile][Tile]    tiles stack in X (along slope)
 *   Course 1 (y=courseH..H): [half][Tile][half]  offset ½ tile in X
 *
 * Courses separated along RIDGE (Y). Tiles stack along SLOPE (X).
 * Horizontal tile joints are dominant. Stagger runs HORIZONTALLY.
 */
function _createSlateTileTexture(scene) {
  const SIZE = 512;
  const tex  = new BABYLON.DynamicTexture("slateTileTex", SIZE, scene, true);
  const ctx  = tex.getContext();
  const W = SIZE, H = SIZE;
  const tileW    = W / 2;       // 256px per tile in X (along slope)
  const courseH  = H / 2;       // 256px per course in Y (along ridge)
  const halfTile = tileW / 2;   // 128px = half tile for running bond offset

  const GT = 10;  // tile joint groove (horizontal on roof — prominent)
  const GC = 6;   // course boundary groove (vertical on roof — thinner)

  // ---- Single uniform tile colour + groove outlines ----
  const tileCol   = "rgb(62, 68, 76)";
  const grooveCol = "rgb(28, 31, 38)";

  // Fill entire canvas with tile colour
  ctx.fillStyle = tileCol;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = grooveCol;

  // --- HORIZONTAL tile joints (dominant on roof: constant X, run along V/ridge) ---
  // Course 0 (y=0..courseH): joint at x=tileW
  ctx.fillRect(tileW, 0, GT, courseH);
  // Wrap seam at x=0 / x=W for course 0:
  ctx.fillRect(0, 0, Math.ceil(GT / 2), courseH);
  ctx.fillRect(W - Math.floor(GT / 2), 0, Math.floor(GT / 2), courseH);

  // Course 1 (y=courseH..H): joints offset by halfTile in X
  ctx.fillRect(halfTile, courseH, GT, courseH);
  ctx.fillRect(halfTile + tileW, courseH, GT, courseH);

  // --- VERTICAL course boundaries (thinner on roof: constant Y, run along U/slope) ---
  ctx.fillRect(0, courseH, W, GC);
  // Wrap seam at y=0 / y=H:
  ctx.fillRect(0, 0, W, Math.ceil(GC / 2));
  ctx.fillRect(0, H - Math.floor(GC / 2), W, Math.floor(GC / 2));

  tex.update();

  tex.wrapU    = BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.wrapV    = BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.hasAlpha = false;

  return tex;
}

function getMembraneMaterial(scene) {
  const name = "roofTiles-membrane";
  let mat = scene.getMaterialByName(name);
  if (!mat) {
    mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor  = new BABYLON.Color3(0.6, 0.75, 0.9);   // Light blue
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    mat.backFaceCulling = false;
  }
  return mat;
}

function getBattenMaterial(scene) {
  const name = "roofTiles-batten";
  let mat = scene.getMaterialByName(name);
  if (!mat) {
    mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor  = new BABYLON.Color3(0.8, 0.5, 0.3);    // Treated timber
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  }
  return mat;
}

// ============================================================================
// TIMBER GAUGE  (mirrors getRoofFrameGauge in roof.js)
// ============================================================================

function getMemberD(state) {
  const cfgW = Math.floor(Number(CONFIG?.timber?.w ?? 50));
  let t = null;
  try { t = state?.frame?.thickness_mm != null ? Math.floor(Number(state.frame.thickness_mm)) : null; } catch (_) {}
  const thickness_mm = (Number.isFinite(t) && t > 0) ? t : (Number.isFinite(cfgW) && cfgW > 0 ? cfgW : 50);
  return thickness_mm;
}

// ============================================================================
// APEX HEIGHT SOLVER  (mirrors roof.js exactly)
// ============================================================================

function solveApexRise(state, A_mm) {
  function _numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function _first() { for (let i = 0; i < arguments.length; i++) { const n = _numOrNull(arguments[i]); if (n != null) return n; } return null; }

  const apex = state?.roof?.apex ?? null;
  const eavesCtl = _first(apex?.eavesHeight_mm, apex?.heightToEaves_mm, apex?.eaves_mm, apex?.heightEaves_mm);
  const crestCtl = _first(apex?.crestHeight_mm, apex?.heightToCrest_mm, apex?.crest_mm, apex?.ridgeHeight_mm, apex?.heightCrest_mm);

  let rise_mm = Math.max(200, Math.min(900, Math.floor(A_mm * 0.20)));

  if (eavesCtl != null && crestCtl != null) {
    const e0 = Math.max(0, Math.floor(eavesCtl));
    let c0 = Math.max(0, Math.floor(crestCtl));
    if (c0 < e0) c0 = e0;
    if (c0 < e0 + OSB_THK_MM) c0 = e0 + OSB_THK_MM;

    const halfSpan = Math.max(1, Math.floor(A_mm / 2));
    const delta = Math.max(0, Math.floor(c0 - e0));
    const target = Math.max(OSB_THK_MM, Math.floor(delta));
    const f = (r) => {
      const rr = Math.max(0, Number(r));
      const den = Math.sqrt(halfSpan * halfSpan + rr * rr);
      const cosT = den > 1e-6 ? (halfSpan / den) : 1;
      return rr + cosT * OSB_THK_MM;
    };
    let lo = 0, hi = Math.max(target + 2000, 1);
    for (let it = 0; it < 32; it++) { const mid = (lo + hi) / 2; if (f(mid) >= target) hi = mid; else lo = mid; }
    rise_mm = Math.max(0, Math.floor(hi));
  }
  return rise_mm;
}

// ============================================================================
// MEMBRANE BUILDER
// ============================================================================

/**
 * Builds a membrane sheet on one slope.
 * Thin box sitting on OSB, same dimensions as OSB coverage.
 */
function buildMembrane(slope, scene, roofRoot, prefix) {
  const mat = getMembraneMaterial(scene);

  const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}membrane-${slope.name}`, {
    width:  slope.length_mm / 1000,
    height: MEMBRANE_SPECS.thickness_mm / 1000,
    depth:  slope.width_mm / 1000,
  }, scene);

  mesh.parent = roofRoot;
  mesh.position = new BABYLON.Vector3(
    slope.position_mm.x / 1000,
    slope.position_mm.y / 1000,
    slope.position_mm.z / 1000
  );
  mesh.rotation = new BABYLON.Vector3(0, 0, slope.rotation.z);
  mesh.material = mat;
  mesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: slope.name };

  return mesh;
}

// ============================================================================
// BATTEN BUILDER
// ============================================================================

/**
 * Creates one batten box at a given slope-distance from the ridge.
 */
function _createBatten(name, s_mm, slope, battenCenterOffset_mm, roofRoot, mat, scene, meta) {
  const { slopeAngle, normal, halfSpan_mm, rise_mm, memberD_mm, width_mm } = slope;
  const cosT = Math.cos(slopeAngle);
  const sinT = Math.sin(slopeAngle);

  const run_mm  = s_mm * cosT;
  const drop_mm = s_mm * sinT;
  const ySurf_mm = memberD_mm + (rise_mm - drop_mm);

  const xSurf_mm = (slope.name === "left")
    ? (halfSpan_mm - run_mm)
    : (halfSpan_mm + run_mm);

  const localX = xSurf_mm + normal.x * battenCenterOffset_mm;
  const localY = ySurf_mm + normal.y * battenCenterOffset_mm;
  const localZ = slope.position_mm.z;

  const mesh = BABYLON.MeshBuilder.CreateBox(name, {
    width:  BATTEN_SPECS.width_mm  / 1000,
    height: BATTEN_SPECS.height_mm / 1000,
    depth:  width_mm / 1000,
  }, scene);

  mesh.parent   = roofRoot;
  mesh.position = new BABYLON.Vector3(localX / 1000, localY / 1000, localZ / 1000);
  mesh.rotation = new BABYLON.Vector3(0, 0, slope.rotation.z);
  mesh.material = mat;
  mesh.metadata = { dynamic: true, roofTiles: true, layer: "battens", slope: slope.name, ...meta };

  return mesh;
}

/**
 * Builds all battens for one slope: ridge batten, regular spaced battens, eaves batten.
 */
function buildBattens(slope, scene, roofRoot, roofData, prefix) {
  const mat = getBattenMaterial(scene);
  const battens = [];

  const { osbOutOffset_mm, OSB_THK_MM: osbThk } = roofData;
  const battenCenterOffset_mm = osbOutOffset_mm + osbThk + MEMBRANE_SPECS.thickness_mm + BATTEN_SPECS.height_mm / 2;

  const RIDGE_MARGIN_MM = 25;
  const EAVES_MARGIN_MM = 25;

  // Ridge batten
  battens.push(_createBatten(
    `${prefix}batten-${slope.name}-ridge`, RIDGE_MARGIN_MM,
    slope, battenCenterOffset_mm, roofRoot, mat, scene, { index: "ridge" }
  ));

  // Regular battens (spaced down from ridge)
  const numBattens = Math.floor((slope.length_mm - BATTEN_SPECS.spacing_mm) / BATTEN_SPECS.spacing_mm);
  for (let i = 0; i < numBattens; i++) {
    const s_mm = (i + 1) * BATTEN_SPECS.spacing_mm;
    battens.push(_createBatten(
      `${prefix}batten-${slope.name}-${i}`, s_mm,
      slope, battenCenterOffset_mm, roofRoot, mat, scene, { index: i }
    ));
  }

  // Eaves batten
  battens.push(_createBatten(
    `${prefix}batten-${slope.name}-eaves`, slope.length_mm - EAVES_MARGIN_MM,
    slope, battenCenterOffset_mm, roofRoot, mat, scene, { index: "eaves" }
  ));

  console.log(`[ROOF-TILES] Battens ${slope.name}: ${battens.length} created`);
  return battens;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export function buildTileLayers(state, ctx, _unused, options = {}) {
  const { scene } = ctx;
  if (!scene) return { membrane: [], battens: [], tiles: [] };

  const prefix = "roof-tiles-";

  const covering = state?.roof?.covering || "felt";
  if (covering !== "slate") {
    disposeTileMeshes(scene, prefix);
    console.log(`[ROOF-TILES] Covering is "${covering}" — skipped`);
    return { membrane: [], battens: [], tiles: [] };
  }

  disposeTileMeshes(scene, prefix);

  const style = state?.roof?.style || "apex";
  if (style !== "apex") {
    console.log(`[ROOF-TILES] Style "${style}" not yet supported`);
    return { membrane: [], battens: [], tiles: [] };
  }

  // ------------------------------------------------------------------
  // Resolve dimensions (identical logic to roof.js buildApex)
  // ------------------------------------------------------------------
  const dims = resolveDims(state);
  const ovh  = dims?.overhang ?? { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };

  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 1)));

  const roofW_mm = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const roofD_mm = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? frameD_mm)));

  const A_mm = roofW_mm;
  const B_mm = roofD_mm;

  const halfSpan_mm  = A_mm / 2;
  const rise_mm      = solveApexRise(state, A_mm);
  const rafterLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const slopeAng     = Math.atan2(rise_mm, halfSpan_mm);
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);

  const memberD_mm      = getMemberD(state);
  const osbOutOffset_mm = memberD_mm + OSB_CLEAR_MM;

  const roofRoot = scene.getTransformNodeByName("roof-root");
  if (!roofRoot) {
    console.warn("[ROOF-TILES] No roof-root in scene");
    return { membrane: [], battens: [], tiles: [] };
  }

  // ------------------------------------------------------------------
  // Build slope descriptors (used by membrane + batten builders)
  // ------------------------------------------------------------------
  const membraneOffset_mm = osbOutOffset_mm + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm / 2;

  function makeSlopeDescriptor(side) {
    const normalX = (side === "L") ? -sinT : sinT;
    const normalY = cosT;
    const rotZ    = (side === "L") ? slopeAng : -slopeAng;
    const name    = (side === "L") ? "left" : "right";

    // Membrane centre (mid-slope, on top of OSB)
    const sMid = rafterLen_mm / 2;
    const run  = sMid * cosT;
    const drop = sMid * sinT;
    const ySurf = memberD_mm + (rise_mm - drop);
    const xSurf = (side === "L") ? (halfSpan_mm - run) : (halfSpan_mm + run);

    return {
      name,
      width_mm:  B_mm,
      length_mm: rafterLen_mm,
      position_mm: {
        x: xSurf + normalX * membraneOffset_mm,
        y: ySurf + normalY * membraneOffset_mm,
        z: B_mm / 2,
      },
      rotation: { x: 0, y: 0, z: rotZ },
      slopeAngle: slopeAng,
      normal: { x: normalX, y: normalY },
      halfSpan_mm,
      rise_mm,
      memberD_mm,
    };
  }

  const slopeL = makeSlopeDescriptor("L");
  const slopeR = makeSlopeDescriptor("R");
  const slopes = [slopeL, slopeR];

  const roofData = { memberD_mm, osbOutOffset_mm, OSB_THK_MM };

  // ------------------------------------------------------------------
  // Build layers
  // ------------------------------------------------------------------
  const result = { membrane: [], battens: [], tiles: [] };

  for (const slope of slopes) {
    // 1. Membrane
    result.membrane.push(buildMembrane(slope, scene, roofRoot, prefix));

    // 2. Battens
    result.battens.push(...buildBattens(slope, scene, roofRoot, roofData, prefix));
  }

  // ------------------------------------------------------------------
  // 3. Tile slabs (raised to bargeboard top)
  // ------------------------------------------------------------------
  const SLATE_BATTEN_HEIGHT_MM = 36;
  const tileCentreOffset_mm = osbOutOffset_mm + OSB_THK_MM + SLATE_BATTEN_HEIGHT_MM + (TILE_THK_MM / 2);

  const sideExt_mm  = FASCIA_THK_MM + OVERHANG_MM;
  const eavesExt_mm = FASCIA_THK_MM + OVERHANG_MM;
  const tanT = sinT / cosT;
  const ridgeExt_mm = Math.ceil(tanT * tileCentreOffset_mm);

  const slabLen_mm   = rafterLen_mm + eavesExt_mm + ridgeExt_mm;
  const slabWidth_mm = B_mm + 2 * sideExt_mm;
  const sLabMid_mm   = (rafterLen_mm + eavesExt_mm - ridgeExt_mm) / 2;

  const slateMat = getSlateMaterial(scene, slabLen_mm, slabWidth_mm);

  for (const side of ["L", "R"]) {
    const normalX = (side === "L") ? -sinT :  sinT;
    const normalY = cosT;
    const rotZ    = (side === "L") ? slopeAng : -slopeAng;

    const run  = sLabMid_mm * cosT;
    const drop = sLabMid_mm * sinT;
    const ySurf = memberD_mm + (rise_mm - drop);
    const xSurf = (side === "L") ? (halfSpan_mm - run) : (halfSpan_mm + run);

    const cx = xSurf + normalX * tileCentreOffset_mm;
    const cy = ySurf + normalY * tileCentreOffset_mm;
    const cz = B_mm / 2;

    const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}tiles-${side}`, {
      width:  slabLen_mm   / 1000,
      height: TILE_THK_MM  / 1000,
      depth:  slabWidth_mm / 1000,
    }, scene);

    mesh.parent   = roofRoot;
    mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
    mesh.rotation = new BABYLON.Vector3(0, 0, rotZ);
    mesh.material = slateMat;
    mesh.metadata = { dynamic: true, roofTiles: true, layer: "tiles", side };

    result.tiles.push(mesh);

    console.log(
      `[ROOF-TILES] Slab ${side}: ${slabLen_mm.toFixed(0)}×${slabWidth_mm.toFixed(0)}mm, ` +
      `pos(${cx.toFixed(1)},${cy.toFixed(1)},${cz.toFixed(1)}), rot ${(rotZ * 180 / Math.PI).toFixed(1)}°`
    );
  }

  console.log(`[ROOF-TILES] Built: ${result.membrane.length} membranes, ${result.battens.length} battens, ${result.tiles.length} slabs`);
  return result;
}

// ============================================================================
// DISPOSAL / VISIBILITY HELPERS
// ============================================================================

export function disposeTileMeshes(scene, prefix = "roof-tiles-") {
  const gone = [];
  for (const m of scene.meshes || []) {
    if (m.name?.startsWith(prefix)) gone.push(m);
  }
  for (const m of gone) m.dispose();
  if (gone.length) console.log(`[ROOF-TILES] Disposed ${gone.length} meshes`);
}

export function setLayerVisibility(scene, layer, visible) {
  for (const m of scene.meshes || []) {
    if (m.metadata?.roofTiles && m.metadata?.layer === layer) {
      m.isVisible = visible;
    }
  }
}
