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
import { getSkylightOpenings } from "./skylights.js?_v=11";

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

/**
 * Separate texture for hipped roof — LANDSCAPE orientation.
 * Tiles run along the building length (Y/V), courses step up slope (X/U).
 * Running bond stagger along the building length.
 */
function _createSlateTileTextureHipped(scene) {
  const SIZE = 512;
  const tex  = new BABYLON.DynamicTexture("slateTileTexHipped", SIZE, scene, true);
  const ctx  = tex.getContext();
  const W = SIZE, H = SIZE;

  const courseH  = W / 2;       // 256px per course in X (along slope)
  const tileW    = H / 2;       // 256px per tile in Y (along ridge / building length)
  const halfTile = tileW / 2;   // 128px = half tile for running bond offset

  const GC = 6;   // course boundary groove width
  const GT = 10;  // tile joint groove width

  const tileCol   = "rgb(62, 68, 76)";
  const grooveCol = "rgb(28, 31, 38)";

  ctx.fillStyle = tileCol;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = grooveCol;

  // --- VERTICAL course boundaries (constant X, full height) ---
  ctx.fillRect(courseH - Math.floor(GC / 2), 0, GC, H);
  ctx.fillRect(0, 0, Math.ceil(GC / 2), H);
  ctx.fillRect(W - Math.floor(GC / 2), 0, Math.floor(GC / 2), H);

  // --- HORIZONTAL tile joints (constant Y, within each course) ---
  // Course 0 (x: 0..courseH):
  ctx.fillRect(0, tileW - Math.floor(GT / 2), courseH, GT);
  ctx.fillRect(0, 0, courseH, Math.ceil(GT / 2));
  ctx.fillRect(0, H - Math.floor(GT / 2), courseH, Math.floor(GT / 2));

  // Course 1 (x: courseH..W): offset by halfTile in Y (running bond)
  ctx.fillRect(courseH, halfTile - Math.floor(GT / 2), courseH, GT);
  ctx.fillRect(courseH, halfTile + tileW - Math.floor(GT / 2), courseH, GT);

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

// ---- Ridge cap texture & material ----

/**
 * DynamicTexture for ridge caps — overlap shadow at one end of each cap.
 * Applied per-cap (vScale=1): shadow sits at V=0 (leading edge).
 * Uses same groove darkness as the main slate tile texture.
 */
function _createRidgeCapTexture(scene) {
  const SIZE = 256;
  const tex  = new BABYLON.DynamicTexture("ridgeCapTex", SIZE, scene, true);
  const ctx  = tex.getContext();
  const W = SIZE, H = SIZE;

  // Base slate colour (matches main tiles)
  ctx.fillStyle = "rgb(62, 68, 76)";
  ctx.fillRect(0, 0, W, H);

  // Overlap shadow at V=0 edge (leading edge of each cap)
  // Uses same darkness as main tile grooves: rgb(28, 31, 38)

  // Deep groove — same colour as main tile joints
  const deepH = Math.round(H * 0.04);
  ctx.fillStyle = "rgb(28, 31, 38)";
  ctx.fillRect(0, 0, W, deepH);

  // Dark shadow zone
  const darkH = Math.round(H * 0.06);
  ctx.fillStyle = "rgb(38, 42, 48)";
  ctx.fillRect(0, deepH, W, darkH);

  // Mid transition
  const midH = Math.round(H * 0.05);
  ctx.fillStyle = "rgb(50, 55, 62)";
  ctx.fillRect(0, deepH + darkH, W, midH);

  tex.update();
  tex.wrapU    = BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.wrapV    = BABYLON.Texture.CLAMP_ADDRESSMODE;   // No wrap — one texture per cap
  tex.hasAlpha = false;
  return tex;
}

/**
 * Ridge cap material — textured per-cap (one texture cycle per box).
 * Overlap shadow at V=0 edge matches main tile groove darkness.
 */
function getRidgeCapMaterial(scene) {
  const name = "roofTiles-ridgeCap";
  let mat = scene.getMaterialByName(name);
  if (!mat) {
    mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor  = new BABYLON.Color3(1, 1, 1);   // Texture handles colour
    mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.1);
    mat.diffuseTexture = _createRidgeCapTexture(scene);
    mat.backFaceCulling = false;  // render both sides (thin quad)
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
// PENT ROOF TILE LAYERS
// ============================================================================

/**
 * Builds tile layers for a pent (lean-to) roof — single slope.
 *
 * Pent roof is built flat in local coords (XZ plane), then the roofRoot
 * transform node is rotated by the pitch quaternion. So we build flat
 * layers at the correct Y offsets and they inherit the tilt.
 *
 * Layers: membrane → battens → tiles (same as apex, but one slope only).
 */
function buildPentTileLayers(state, ctx, scene, prefix) {
  const result = { membrane: [], battens: [], tiles: [] };

  // Import pent roof data computation from roof.js
  let computeRoofData_Pent;
  try {
    // computeRoofData_Pent is exported from roof.js
    const roofModule = window.__roofModule;
    computeRoofData_Pent = roofModule?.computeRoofData_Pent;
  } catch (e) { /* fallback below */ }

  // -- Resolve dimensions --
  const dims = resolveDims(state);
  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 3000)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 4000)));
  const roofW_mm  = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const roofD_mm  = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? frameD_mm)));

  // Pent: slope along X (width), rafters along Z (depth)
  const A_mm = roofW_mm;  // slope dimension
  const B_mm = roofD_mm;  // rafter run

  // Pent heights
  const pent = state?.roof?.pent ?? {};
  const apex = state?.roof?.apex ?? {};
  const minH_mm = Number(pent.minHeight_mm || pent.min_mm || 2100);
  const maxH_mm = Number(pent.maxHeight_mm || pent.max_mm || 2300);
  const rise_mm = Math.max(0, maxH_mm - minH_mm);

  // Slope scale (hypotenuse correction — same as roof.js)
  const run_mm = Math.max(1, frameW_mm);
  const slopeLen_mm = Math.sqrt(run_mm * run_mm + rise_mm * rise_mm);
  const slopeScale = run_mm > 0 ? slopeLen_mm / run_mm : 1;
  const A_phys_mm = Math.max(1, Math.round(A_mm * slopeScale));

  // Rafter dimensions (from timber config)
  const g = { w: Number(state?.timber?.w ?? 50), d: Number(state?.timber?.d ?? 100) };
  const rafterD_mm = g.w;  // rafter depth = timber thickness (vertical when flat)

  const memberD_mm      = rafterD_mm;
  const osbOutOffset_mm = memberD_mm + 1; // OSB_CLEAR_MM = 1
  const osbTopY_mm      = osbOutOffset_mm + OSB_THK_MM;

  // Find the roof-root transform node
  const roofRoot = scene.getTransformNodeByName("roof-root");
  if (!roofRoot) {
    console.warn("[ROOF-TILES] No roof-root in scene (pent)");
    return result;
  }

  // ----------------------------------------------------------------
  // 1. MEMBRANE — flat plane on top of OSB
  // ----------------------------------------------------------------
  const membraneY_mm = osbTopY_mm + MEMBRANE_SPECS.thickness_mm / 2;

  const membraneMesh = BABYLON.MeshBuilder.CreateBox(`${prefix}membrane-pent`, {
    width:  A_phys_mm / 1000,
    height: MEMBRANE_SPECS.thickness_mm / 1000,
    depth:  B_mm / 1000,
  }, scene);

  membraneMesh.position = new BABYLON.Vector3(
    (A_phys_mm / 2) / 1000,
    membraneY_mm / 1000,
    (B_mm / 2) / 1000,
  );

  // Membrane material (light blue, same as apex)
  let membraneMat = scene.getMaterialByName("roofTiles-membrane");
  if (!membraneMat) {
    membraneMat = new BABYLON.StandardMaterial("roofTiles-membrane", scene);
    membraneMat.diffuseColor  = new BABYLON.Color3(0.55, 0.72, 0.85);
    membraneMat.alpha         = 0.85;
    membraneMat.backFaceCulling = false;
  }
  membraneMesh.material = membraneMat;
  membraneMesh.parent   = roofRoot;
  membraneMesh.metadata  = { dynamic: true, roofTiles: true, layer: "membrane" };
  result.membrane.push(membraneMesh);

  console.log(`[ROOF-TILES] Pent membrane: ${A_phys_mm}×${B_mm}mm at y=${membraneY_mm.toFixed(1)}mm`);

  // ----------------------------------------------------------------
  // 2. BATTENS — horizontal strips along Z, spaced up the slope (X)
  // ----------------------------------------------------------------
  const BATTEN_W_MM = 50;
  const BATTEN_H_MM = 25;
  const BATTEN_SPACING_MM = 143;  // Same as apex

  const battenBaseY_mm = osbTopY_mm + MEMBRANE_SPECS.thickness_mm;
  const battenCentreY_mm = battenBaseY_mm + BATTEN_H_MM / 2;

  let battenMat = scene.getMaterialByName("roofTiles-battenMat");
  if (!battenMat) {
    battenMat = new BABYLON.StandardMaterial("roofTiles-battenMat", scene);
    battenMat.diffuseColor = new BABYLON.Color3(0.55, 0.42, 0.25);
  }

  // Eaves batten
  const eavesX_mm = BATTEN_W_MM / 2;
  // Ridge batten
  const ridgeX_mm = A_phys_mm - BATTEN_W_MM / 2;

  // Place battens from eaves to ridge
  const battenPositions = [eavesX_mm]; // Start with eaves batten
  let bx = eavesX_mm + BATTEN_SPACING_MM;
  while (bx < ridgeX_mm - BATTEN_SPACING_MM / 2) {
    battenPositions.push(bx);
    bx += BATTEN_SPACING_MM;
  }
  battenPositions.push(ridgeX_mm); // End with ridge batten

  for (let i = 0; i < battenPositions.length; i++) {
    const bMesh = BABYLON.MeshBuilder.CreateBox(`${prefix}batten-pent-${i}`, {
      width:  BATTEN_W_MM / 1000,
      height: BATTEN_H_MM / 1000,
      depth:  B_mm / 1000,
    }, scene);

    bMesh.position = new BABYLON.Vector3(
      battenPositions[i] / 1000,
      battenCentreY_mm / 1000,
      (B_mm / 2) / 1000,
    );

    bMesh.material = battenMat;
    bMesh.parent   = roofRoot;
    bMesh.metadata  = { dynamic: true, roofTiles: true, layer: "battens", index: i };
    result.battens.push(bMesh);
  }

  console.log(`[ROOF-TILES] Pent battens: ${battenPositions.length} battens at ${BATTEN_SPACING_MM}mm spacing`);

  // ----------------------------------------------------------------
  // 3. TILES — slate slab on top of battens
  // ----------------------------------------------------------------
  const SLATE_BATTEN_HEIGHT_MM = BATTEN_H_MM + 1; // Top of battens + tiny gap
  const tileBaseY_mm = battenBaseY_mm + SLATE_BATTEN_HEIGHT_MM;
  const tileCentreY_mm = tileBaseY_mm + TILE_THK_MM / 2;

  // Extend tiles past edges (same overhang as apex)
  const sideExt_mm  = FASCIA_THK_MM + OVERHANG_MM;
  const eavesExt_mm = FASCIA_THK_MM + OVERHANG_MM;
  const ridgeExt_mm = FASCIA_THK_MM + OVERHANG_MM;

  const tileW_mm = A_phys_mm + eavesExt_mm + ridgeExt_mm;
  const tileD_mm = B_mm + 2 * sideExt_mm;

  // Use same slate material as apex (running-bond pattern)
  const slateMat = getSlateMaterial(scene, tileW_mm, tileD_mm);

  const tileMesh = BABYLON.MeshBuilder.CreateBox(`${prefix}tiles-pent`, {
    width:  tileW_mm / 1000,
    height: TILE_THK_MM / 1000,
    depth:  tileD_mm / 1000,
  }, scene);

  // Centre tile slab over the roof — shifted to account for eaves/ridge extensions
  const tileCentreX_mm = (A_phys_mm / 2) + (eavesExt_mm - ridgeExt_mm) / 2;

  tileMesh.position = new BABYLON.Vector3(
    tileCentreX_mm / 1000,
    tileCentreY_mm / 1000,
    (B_mm / 2) / 1000,
  );

  tileMesh.material = slateMat;
  tileMesh.parent   = roofRoot;
  tileMesh.metadata  = { dynamic: true, roofTiles: true, layer: "tiles" };
  result.tiles.push(tileMesh);

  console.log(`[ROOF-TILES] Pent tiles: ${tileW_mm}×${tileD_mm}mm slab at y=${tileCentreY_mm.toFixed(1)}mm`);
  console.log("[ROOF-TILES] Pent tile layers complete: membrane + " + result.battens.length + " battens + tile slab");

  return result;
}

// ============================================================================
// HIPPED ROOF TILE LAYERS
// ============================================================================

/**
 * Builds tile layers for a hipped roof — CLEAN REWRITE.
 * Starting with ONE side only: left slope membrane.
 *
 * The left slope of a hipped roof is one continuous plane containing:
 *   - FL1 triangle (front hip portion)
 *   - Left saddle rectangle (middle)
 *   - BL1 triangle (back hip portion)
 *
 * Combined shape = trapezoid:
 *   - Narrow edge at ridge (ridgeStartZ → ridgeEndZ)
 *   - Wide edge at eaves (Z=0 → Z=B_mm)
 *   - Slope from eaves (X=0) up to ridge (X=halfSpan)
 *
 * One flat membrane piece sits on top of the OSB, covering the entire slope.
 */
function buildHippedTileLayers(state, ctx, scene, prefix) {
  console.log("[ROOF-TILES] buildHippedTileLayers CALLED");
  const result = { membrane: [], battens: [], tiles: [], ridgeCaps: [] };

  // ------------------------------------------------------------------
  // Resolve dimensions (mirrors buildHipped in roof.js)
  // ------------------------------------------------------------------
  const dims = resolveDims(state);
  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 1)));
  const roofW_mm  = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const roofD_mm  = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? frameD_mm)));

  const A_mm = roofW_mm;          // roof width  (X)
  const B_mm = roofD_mm;          // roof depth  (Z)
  const halfSpan_mm = A_mm / 2;

  const isSquare       = Math.abs(A_mm - B_mm) < 100;
  const ridgeLen_mm    = isSquare ? 0 : Math.max(0, B_mm - A_mm);
  const ridgeStartZ_mm = halfSpan_mm;
  const ridgeEndZ_mm   = B_mm - halfSpan_mm;

  // Rise
  const hipped  = state?.roof?.hipped ?? null;
  const apex    = state?.roof?.apex ?? null;
  const eavesH  = Number(hipped?.heightToEaves_mm || apex?.heightToEaves_mm || apex?.eavesHeight_mm) || 1850;
  const crestH  = Number(hipped?.heightToCrest_mm || apex?.heightToCrest_mm || apex?.crestHeight_mm) || 2400;
  const rise_mm = Math.max(100, crestH - eavesH);

  // Slope geometry
  // Match what buildHipped() in roof.js uses: depth_mm (the tall/load-bearing dimension).
  // state.frame stores thickness_mm and depth_mm directly (no nested gauge object).
  const memberD_mm = Math.max(1, Math.floor(Number(
    state?.frame?.depth_mm || state?.frame?.gauge?.depth_mm || 75
  )));
  const slopeAng   = Math.atan2(rise_mm, halfSpan_mm);
  const sinT       = Math.sin(slopeAng);
  const cosT       = Math.cos(slopeAng);

  const roofRoot = scene.getTransformNodeByName("roof-root");
  if (!roofRoot) {
    console.warn("[ROOF-TILES] No roof-root in scene (hipped)");
    return result;
  }

  const membraneMat = getMembraneMaterial(scene);
  const slopeLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);

  // ------------------------------------------------------------------
  // SKYLIGHT OPENINGS for L/R slopes (used by membrane, battens, tiles)
  // ------------------------------------------------------------------
  let skyOpeningsL = [], skyOpeningsR = [];
  try { skyOpeningsL = getSkylightOpenings(state, "L") || []; } catch(e) { /* safe */ }
  try { skyOpeningsR = getSkylightOpenings(state, "R") || []; } catch(e) { /* safe */ }
  console.log(`[ROOF-TILES] Skylight openings: L=${skyOpeningsL.length}, R=${skyOpeningsR.length}`);

  // ------------------------------------------------------------------
  // HELPER: Build a slope mesh (trapezoid) with rectangular holes
  // ------------------------------------------------------------------
  // Works for both membrane and tiles on L/R saddle slopes.
  //
  // Parameters:
  //   side: "L" or "R"
  //   perpOff_mm: perpendicular offset from rafter surface
  //   holes: array of { sMin, sMax, zMin, zMax } in slope/absolute coords
  //   meshName: name for the mesh
  //   material: Babylon material
  //   layer: metadata layer name
  //   uvFn: optional (s, z) => {u, v} for textured meshes
  //
  // Slope parameterisation for LEFT:
  //   s = slope distance from ridge (0 at ridge, slopeLen at eaves)
  //   z = absolute Z position (0 to B_mm)
  //   At slope distance s: run = s*cosT, xPlan = halfSpan - run
  //   Hip boundary (front): z_min = xPlan = halfSpan - s*cosT
  //   Hip boundary (back):  z_max = B_mm - xPlan = B_mm - halfSpan + s*cosT
  //   Position: X = xPlan + offX, Y = memberD + rise - s*sinT + offY, Z = z
  //
  // For RIGHT: X = A_mm - xPlan + offX (mirror)
  function _buildSlopeMeshWithHoles(side, perpOff_mm, holes, meshName, material, layer, uvFn) {
    const nx = (side === "L") ? -sinT : sinT;
    const oX = nx * perpOff_mm;
    const oY = cosT * perpOff_mm;

    // Convert (s, z) to 3D position
    function pos(s, z) {
      const run = s * cosT;
      const xPlan = halfSpan_mm - run;
      const x = (side === "L") ? (xPlan + oX) : (A_mm - xPlan + oX);
      const y = memberD_mm + rise_mm - s * sinT + oY;
      return { x: x / 1000, y: y / 1000, z: z / 1000 };
    }

    // Hip boundaries at slope distance s
    function zMin(s) { return Math.max(0, halfSpan_mm - s * cosT); }
    function zMax(s) { return Math.min(B_mm, B_mm - halfSpan_mm + s * cosT); }

    // Collect all Z and s breakpoints from holes, sorted and unique
    const zBreaks = [0, B_mm];
    const sBreaks = [0, slopeLen_mm];
    for (const h of holes) {
      zBreaks.push(h.zMin, h.zMax);
      sBreaks.push(h.sMin, h.sMax);
    }
    const uniq = arr => [...new Set(arr)].sort((a, b) => a - b);
    const zList = uniq(zBreaks);
    const sList = uniq(sBreaks);

    // Build quads for each grid cell that isn't inside a hole
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    let vi = 0;

    const normalVec = { x: nx, y: cosT, z: 0 };

    for (let si = 0; si < sList.length - 1; si++) {
      const s0 = sList[si], s1 = sList[si + 1];
      if (s1 - s0 < 1) continue; // skip degenerate cells

      for (let zi = 0; zi < zList.length - 1; zi++) {
        const z0 = zList[zi], z1 = zList[zi + 1];
        if (z1 - z0 < 1) continue;

        // Check if this cell is inside any hole
        const sMid = (s0 + s1) / 2;
        const zMid = (z0 + z1) / 2;
        const inHole = holes.some(h =>
          sMid > h.sMin && sMid < h.sMax && zMid > h.zMin && zMid < h.zMax
        );
        if (inHole) continue;

        // Check if cell is within the trapezoidal boundary (hip edges)
        // Use midpoint s to check Z bounds
        const zLo = zMin(sMid);
        const zHi = zMax(sMid);
        if (zMid < zLo || zMid > zHi) continue;

        // Clamp z0/z1 to hip boundaries at s0 and s1
        const z0_s0 = Math.max(z0, zMin(s0));
        const z1_s0 = Math.min(z1, zMax(s0));
        const z0_s1 = Math.max(z0, zMin(s1));
        const z1_s1 = Math.min(z1, zMax(s1));

        if (z1_s0 - z0_s0 < 1 || z1_s1 - z0_s1 < 1) continue;

        // 4 corners of this cell (clamped to hip edges)
        const p00 = pos(s0, z0_s0); // ridge-side, front
        const p01 = pos(s0, z1_s0); // ridge-side, back
        const p10 = pos(s1, z0_s1); // eaves-side, front
        const p11 = pos(s1, z1_s1); // eaves-side, back

        // UVs
        let uv00, uv01, uv10, uv11;
        if (uvFn) {
          uv00 = uvFn(s0, z0_s0); uv01 = uvFn(s0, z1_s0);
          uv10 = uvFn(s1, z0_s1); uv11 = uvFn(s1, z1_s1);
        } else {
          uv00 = { u: 0, v: 0 }; uv01 = { u: 0, v: 1 };
          uv10 = { u: 1, v: 0 }; uv11 = { u: 1, v: 1 };
        }

        // Add 4 vertices
        positions.push(p00.x, p00.y, p00.z);
        positions.push(p01.x, p01.y, p01.z);
        positions.push(p10.x, p10.y, p10.z);
        positions.push(p11.x, p11.y, p11.z);
        normals.push(normalVec.x, normalVec.y, normalVec.z);
        normals.push(normalVec.x, normalVec.y, normalVec.z);
        normals.push(normalVec.x, normalVec.y, normalVec.z);
        normals.push(normalVec.x, normalVec.y, normalVec.z);
        uvs.push(uv00.u, uv00.v, uv01.u, uv01.v, uv10.u, uv10.v, uv11.u, uv11.v);

        // Two triangles per quad — winding must match normal direction
        if (side === "L") {
          indices.push(vi, vi + 2, vi + 1);  // 00→10→01
          indices.push(vi + 1, vi + 2, vi + 3); // 01→10→11
        } else {
          indices.push(vi, vi + 1, vi + 2);  // 00→01→10
          indices.push(vi + 1, vi + 3, vi + 2); // 01→11→10
        }
        vi += 4;
      }
    }

    if (positions.length === 0) return null;

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = uvs;

    const mesh = new BABYLON.Mesh(meshName, scene);
    vd.applyToMesh(mesh);
    mesh.material = material;
    mesh.metadata = { dynamic: true, roofTiles: true, layer, slope: side };
    mesh.parent = roofRoot;
    return mesh;
  }

  // ------------------------------------------------------------------
  // LEFT SLOPE MEMBRANE
  // ------------------------------------------------------------------
  const CLEAR_GAP_MM = 2;
  const perpOffset_mm = OSB_THK_MM + CLEAR_GAP_MM + MEMBRANE_SPECS.thickness_mm / 2;

  const eavesY = memberD_mm;
  const ridgeY = memberD_mm + rise_mm;

  {
    const skyHolesL = skyOpeningsL.map(op => ({
      sMin: op.a0_mm,
      sMax: op.a0_mm + op.aLen_mm,
      zMin: ridgeStartZ_mm + op.b0_mm,
      zMax: ridgeStartZ_mm + op.b0_mm + op.bLen_mm,
    }));

    const mL = _buildSlopeMeshWithHoles("L", perpOffset_mm, skyHolesL,
      `${prefix}membrane-L`, membraneMat, "membrane", null);
    if (mL) {
      if (mL.enableEdgesRendering) {
        mL.enableEdgesRendering();
        mL.edgesWidth = 2;
        mL.edgesColor = new BABYLON.Color4(0.3, 0.5, 0.7, 1);
      }
      result.membrane.push(mL);
    }
  }

  // ------------------------------------------------------------------
  // FRONT FACE — one triangular membrane piece
  // ------------------------------------------------------------------
  // The front hip face is a triangle:
  //   - Base at eaves (Z=0), from X=0 to X=A_mm
  //   - Apex at ridge start (X=halfSpan, Z=ridgeStartZ)
  // Slope direction is along Z (front→back), same angle as saddle slopes.
  // Outward normal: (0, cosT, -sinT)
  {
    const fOffX = 0;
    const fOffY = cosT * perpOffset_mm;
    const fOffZ = (-sinT) * perpOffset_mm;

    // 3 vertices of the front triangle
    const fv0x = 0           + fOffX;   // left eaves corner
    const fv0y = eavesY      + fOffY;
    const fv0z = 0           + fOffZ;

    const fv1x = A_mm        + fOffX;   // right eaves corner
    const fv1y = eavesY      + fOffY;
    const fv1z = 0           + fOffZ;

    const fv2x = halfSpan_mm + fOffX;   // ridge point (apex of triangle)
    const fv2y = ridgeY      + fOffY;
    const fv2z = ridgeStartZ_mm + fOffZ;

    const fPositions = [
      fv0x / 1000, fv0y / 1000, fv0z / 1000,   // 0: left eaves
      fv1x / 1000, fv1y / 1000, fv1z / 1000,   // 1: right eaves
      fv2x / 1000, fv2y / 1000, fv2z / 1000,   // 2: ridge apex
    ];

    // Single triangle — winding for outward normal (0, cosT, -sinT)
    const fIndices = [0, 2, 1];

    const fnx = 0, fny = cosT, fnz = -sinT;
    const fNormals = [fnx, fny, fnz, fnx, fny, fnz, fnx, fny, fnz];
    const fUvs = [0, 0, 1, 0, 0.5, 1];

    const fVertexData = new BABYLON.VertexData();
    fVertexData.positions = fPositions;
    fVertexData.indices   = fIndices;
    fVertexData.normals   = fNormals;
    fVertexData.uvs       = fUvs;

    const fMesh = new BABYLON.Mesh(`${prefix}membrane-F`, scene);
    fVertexData.applyToMesh(fMesh);
    fMesh.material = membraneMat;
    fMesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: "F" };
    fMesh.parent   = roofRoot;

    if (fMesh.enableEdgesRendering) {
      fMesh.enableEdgesRendering();
      fMesh.edgesWidth = 2;
      fMesh.edgesColor = new BABYLON.Color4(0.3, 0.5, 0.7, 1);
    }

    result.membrane.push(fMesh);
  }

  // ------------------------------------------------------------------
  // RIGHT SLOPE MEMBRANE — uses same helper as left
  // ------------------------------------------------------------------
  {
    const skyHolesR = skyOpeningsR.map(op => ({
      sMin: op.a0_mm,
      sMax: op.a0_mm + op.aLen_mm,
      zMin: ridgeStartZ_mm + op.b0_mm,
      zMax: ridgeStartZ_mm + op.b0_mm + op.bLen_mm,
    }));

    const mR = _buildSlopeMeshWithHoles("R", perpOffset_mm, skyHolesR,
      `${prefix}membrane-R`, membraneMat, "membrane", null);
    if (mR) {
      if (mR.enableEdgesRendering) {
        mR.enableEdgesRendering();
        mR.edgesWidth = 2;
        mR.edgesColor = new BABYLON.Color4(0.3, 0.5, 0.7, 1);
      }
      result.membrane.push(mR);
    }
  }

  // ------------------------------------------------------------------
  // BACK FACE — one triangular membrane piece (mirror of front)
  // ------------------------------------------------------------------
  // Back face outward normal: (0, cosT, +sinT) — pointing backward
  {
    const bOffX = 0;
    const bOffY = cosT * perpOffset_mm;
    const bOffZ = sinT * perpOffset_mm;   // positive Z (backward)

    const bv0x = A_mm        + bOffX;   // right eaves corner
    const bv0y = eavesY      + bOffY;
    const bv0z = B_mm        + bOffZ;

    const bv1x = 0           + bOffX;   // left eaves corner
    const bv1y = eavesY      + bOffY;
    const bv1z = B_mm        + bOffZ;

    const bv2x = halfSpan_mm + bOffX;   // ridge point (apex of triangle)
    const bv2y = ridgeY      + bOffY;
    const bv2z = ridgeEndZ_mm + bOffZ;

    const bPositions = [
      bv0x / 1000, bv0y / 1000, bv0z / 1000,
      bv1x / 1000, bv1y / 1000, bv1z / 1000,
      bv2x / 1000, bv2y / 1000, bv2z / 1000,
    ];

    // Winding for outward normal (0, cosT, +sinT)
    const bIndices = [0, 2, 1];

    const bnx = 0, bny = cosT, bnz = sinT;
    const bNormals = [bnx, bny, bnz, bnx, bny, bnz, bnx, bny, bnz];
    const bUvs = [0, 0, 1, 0, 0.5, 1];

    const bVertexData = new BABYLON.VertexData();
    bVertexData.positions = bPositions;
    bVertexData.indices   = bIndices;
    bVertexData.normals   = bNormals;
    bVertexData.uvs       = bUvs;

    const bMesh = new BABYLON.Mesh(`${prefix}membrane-B`, scene);
    bVertexData.applyToMesh(bMesh);
    bMesh.material = membraneMat;
    bMesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: "B" };
    bMesh.parent   = roofRoot;

    if (bMesh.enableEdgesRendering) {
      bMesh.enableEdgesRendering();
      bMesh.edgesWidth = 2;
      bMesh.edgesColor = new BABYLON.Color4(0.3, 0.5, 0.7, 1);
    }

    result.membrane.push(bMesh);
  }

  // ==================================================================
  // BATTENS — on all 4 slopes, terminating at hip lines
  // ==================================================================
  const battenMat = getBattenMaterial(scene);

  // Batten centre sits on top of membrane:
  //   membrane centre offset + half membrane + half batten height
  const battenPerpOffset_mm = perpOffset_mm + MEMBRANE_SPECS.thickness_mm / 2 + BATTEN_SPECS.height_mm / 2;

  // slopeLen_mm declared earlier (needed by _buildSlopeMeshWithHoles)
  const RIDGE_MARGIN_MM = 25;
  const EAVES_MARGIN_MM = 25;
  const MIN_BATTEN_LEN  = 40;   // skip anything shorter

  // ---- LEFT & RIGHT saddle slopes ----
  // Battens run along Z. At slope distance s from ridge:
  //   run = s * cosT (horizontal from ridge toward eaves)
  //   xPlan (from left eaves) = halfSpan - run
  //   Z_front = xPlan   (front hip at 45° in plan)
  //   Z_back  = B_mm - xPlan
  //   battenLen = Z_back - Z_front = ridgeLen + 2*run
  //   centre Z = B_mm / 2  (always centred)

  // Skylight openings already fetched above: skyOpeningsL, skyOpeningsR

  // Helper: create a single batten box at given position and Z-extent
  function _makeBattenLR(name, cx, cy, cz, battenLen, rotZ, side) {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width:  BATTEN_SPECS.width_mm  / 1000,
      height: BATTEN_SPECS.height_mm / 1000,
      depth:  battenLen / 1000,
    }, scene);
    mesh.parent   = roofRoot;
    mesh.position  = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
    mesh.rotation  = new BABYLON.Vector3(0, 0, rotZ);
    mesh.material  = battenMat;
    mesh.metadata  = { dynamic: true, roofTiles: true, layer: "battens", slope: side };
    return mesh;
  }

  for (const side of ["L", "R"]) {
    const normalX  = (side === "L") ? -sinT : sinT;
    const rotZ     = (side === "L") ? slopeAng : -slopeAng;
    const skyOpenings = (side === "L") ? skyOpeningsL : skyOpeningsR;

    // Convert skylight openings to absolute Z ranges and slope-distance ranges
    // Opening: a0_mm = distance from ridge down slope, b0_mm = offset along saddle from ridgeStartZ
    const skyHoles = skyOpenings.map(op => ({
      sMin: op.a0_mm,                                  // slope distance: start (from ridge)
      sMax: op.a0_mm + op.aLen_mm,                     // slope distance: end
      zMin: ridgeStartZ_mm + op.b0_mm,                 // absolute Z: start
      zMax: ridgeStartZ_mm + op.b0_mm + op.bLen_mm,    // absolute Z: end
    }));

    // Collect slope positions (ridge batten + regular + eaves)
    const sPositions = [RIDGE_MARGIN_MM];
    const numBattens = Math.floor((slopeLen_mm - EAVES_MARGIN_MM) / BATTEN_SPECS.spacing_mm);
    for (let i = 1; i <= numBattens; i++) {
      const s = i * BATTEN_SPECS.spacing_mm;
      if (s < slopeLen_mm - EAVES_MARGIN_MM) sPositions.push(s);
    }
    sPositions.push(slopeLen_mm - EAVES_MARGIN_MM); // eaves batten

    for (let idx = 0; idx < sPositions.length; idx++) {
      const s_mm = sPositions[idx];
      const run  = s_mm * cosT;
      const drop = s_mm * sinT;
      const xPlan = halfSpan_mm - run;

      const zFront    = Math.max(0, xPlan);
      const zBack     = Math.min(B_mm, B_mm - xPlan);
      if (zBack - zFront < MIN_BATTEN_LEN) continue;

      const ySurf = memberD_mm + (rise_mm - drop);
      const xSurf = (side === "L") ? xPlan : (A_mm - xPlan);
      const cx = xSurf + normalX * battenPerpOffset_mm;
      const cy = ySurf + cosT   * battenPerpOffset_mm;

      const tag = (idx === 0) ? "ridge" : (idx === sPositions.length - 1) ? "eaves" : `${idx}`;

      // Check if this batten's slope distance overlaps any skylight hole
      // Batten has negligible slope-extent (it's a thin bar), so check if s_mm falls within [sMin, sMax]
      const halfBattenSlope = BATTEN_SPECS.width_mm / 2; // batten width in slope direction
      const overlappingHoles = skyHoles.filter(h =>
        (s_mm + halfBattenSlope) > h.sMin && (s_mm - halfBattenSlope) < h.sMax
      );

      if (overlappingHoles.length === 0) {
        // No overlap — build full batten as before
        const battenLen = zBack - zFront;
        const cz = (zFront + zBack) / 2;
        result.battens.push(_makeBattenLR(
          `${prefix}batten-${side}-${tag}`, cx, cy, cz, battenLen, rotZ, side
        ));
      } else {
        // Split batten around holes — collect gap-free segments along Z
        // Merge all hole Z ranges that overlap this batten
        const gaps = overlappingHoles.map(h => ({ z0: h.zMin, z1: h.zMax }));
        gaps.sort((a, b) => a.z0 - b.z0);

        // Build segments: before first gap, between gaps, after last gap
        let segStart = zFront;
        let segIdx = 0;
        for (const gap of gaps) {
          const gapStart = Math.max(zFront, gap.z0);
          const gapEnd   = Math.min(zBack, gap.z1);
          if (gapStart > segStart && (gapStart - segStart) >= MIN_BATTEN_LEN) {
            const segLen = gapStart - segStart;
            const segCz  = (segStart + gapStart) / 2;
            result.battens.push(_makeBattenLR(
              `${prefix}batten-${side}-${tag}-s${segIdx}`, cx, cy, segCz, segLen, rotZ, side
            ));
            segIdx++;
          }
          segStart = Math.max(segStart, gapEnd);
        }
        // Final segment after last gap
        if (segStart < zBack && (zBack - segStart) >= MIN_BATTEN_LEN) {
          const segLen = zBack - segStart;
          const segCz  = (segStart + zBack) / 2;
          result.battens.push(_makeBattenLR(
            `${prefix}batten-${side}-${tag}-s${segIdx}`, cx, cy, segCz, segLen, rotZ, side
          ));
        }
      }
    }
  }

  // ---- FRONT & BACK triangular faces ----
  // Battens run along X. At slope distance s from ridge:
  //   run = s * cosT
  //   battenLen = 2 * run  (triangle widens linearly from ridge to eaves)
  //   centre X = halfSpan  (always centred)
  for (const face of ["F", "B"]) {
    const normalZ = (face === "F") ? -sinT : sinT;
    const rotX    = (face === "F") ? -slopeAng : slopeAng;

    const sPositions = [RIDGE_MARGIN_MM];
    const numBattens = Math.floor((slopeLen_mm - EAVES_MARGIN_MM) / BATTEN_SPECS.spacing_mm);
    for (let i = 1; i <= numBattens; i++) {
      const s = i * BATTEN_SPECS.spacing_mm;
      if (s < slopeLen_mm - EAVES_MARGIN_MM) sPositions.push(s);
    }
    sPositions.push(slopeLen_mm - EAVES_MARGIN_MM);

    for (let idx = 0; idx < sPositions.length; idx++) {
      const s_mm = sPositions[idx];
      const run  = s_mm * cosT;
      const drop = s_mm * sinT;
      const battenLen = 2 * run;
      if (battenLen < MIN_BATTEN_LEN) continue;

      const ySurf = memberD_mm + (rise_mm - drop);
      const zRidge = (face === "F") ? ridgeStartZ_mm : ridgeEndZ_mm;
      const zSurf  = (face === "F") ? (zRidge - run) : (zRidge + run);

      const cx = halfSpan_mm;
      const cy = ySurf + cosT    * battenPerpOffset_mm;
      const cz = zSurf + normalZ * battenPerpOffset_mm;

      const tag = (idx === 0) ? "ridge" : (idx === sPositions.length - 1) ? "eaves" : `${idx}`;
      // Front/back battens run along X → use depth for batten width, width for batten length
      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}batten-${face}-${tag}`, {
        width:  battenLen / 1000,                     // along X
        height: BATTEN_SPECS.height_mm / 1000,
        depth:  BATTEN_SPECS.width_mm  / 1000,        // cross-slope (Z)
      }, scene);
      mesh.parent   = roofRoot;
      mesh.position  = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
      mesh.rotation  = new BABYLON.Vector3(rotX, 0, 0);
      mesh.material  = battenMat;
      mesh.metadata  = { dynamic: true, roofTiles: true, layer: "battens", slope: face };
      result.battens.push(mesh);
    }
  }

  // ==================================================================
  // TILE SLABS — same shapes as membrane, sitting on top of battens
  // Textured with running-bond slate pattern (same as apex style)
  // ==================================================================
  const tilePerpOffset_mm = battenPerpOffset_mm + BATTEN_SPECS.height_mm / 2 + TILE_THK_MM / 2;

  // slopeLen_mm declared at top of buildHippedTileLayers

  // UV repeat units (must match apex texture layout)
  const repeatU_mm = TILE_EXPOSURE_MM * 2;   // 286mm — 2 tile rows along slope
  const repeatV_mm = TILE_WIDTH_MM * 2;      // 610mm — 2 tile widths along ridge

  // Textured slate material — same running-bond pattern as apex
  let slateMat = scene.getMaterialByName("roofTiles-slate-hipped");
  if (!slateMat) {
    slateMat = new BABYLON.StandardMaterial("roofTiles-slate-hipped", scene);
    slateMat.diffuseColor  = new BABYLON.Color3(1, 1, 1);   // Texture handles colour
    slateMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    slateMat.backFaceCulling = false;

    const tex = _createSlateTileTextureHipped(scene);
    tex.uScale = 1;   // UVs encode physical tile counts directly
    tex.vScale = 1;
    slateMat.diffuseTexture = tex;
  }

  // Helper: build a tile slab from an array of vertex positions (mm)
  function buildTileMesh(name, verts_mm, indices, normal, slope) {
    const positions = [];
    const normals   = [];
    const uvs       = [];
    for (let i = 0; i < verts_mm.length; i++) {
      positions.push(verts_mm[i].x / 1000, verts_mm[i].y / 1000, verts_mm[i].z / 1000);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(verts_mm[i].u || 0, verts_mm[i].v || 0);
    }
    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices   = indices;
    vd.normals   = normals;
    vd.uvs       = uvs;

    const mesh = new BABYLON.Mesh(name, scene);
    vd.applyToMesh(mesh);
    mesh.material = slateMat;
    mesh.metadata = { dynamic: true, roofTiles: true, layer: "tiles", slope };
    mesh.parent   = roofRoot;
    return mesh;
  }

  // ---- LEFT SLOPE tile (trapezoid with skylight holes) ----
  {
    const skyHolesL = skyOpeningsL.map(op => ({
      sMin: op.a0_mm,
      sMax: op.a0_mm + op.aLen_mm,
      zMin: ridgeStartZ_mm + op.b0_mm,
      zMax: ridgeStartZ_mm + op.b0_mm + op.bLen_mm,
    }));
    const tileUvFn = (s, z) => ({ u: s / repeatU_mm, v: z / repeatV_mm });

    if (skyHolesL.length > 0) {
      const tL = _buildSlopeMeshWithHoles("L", tilePerpOffset_mm, skyHolesL,
        `${prefix}tiles-L`, slateMat, "tiles", tileUvFn);
      if (tL) result.tiles.push(tL);
    } else {
      // No holes — original trapezoid
      const tOff = { x: (-sinT) * tilePerpOffset_mm, y: cosT * tilePerpOffset_mm };
      result.tiles.push(buildTileMesh(`${prefix}tiles-L`, [
        { x: 0           + tOff.x, y: eavesY + tOff.y, z: 0,              u: slopeLen_mm / repeatU_mm, v: 0 },
        { x: 0           + tOff.x, y: eavesY + tOff.y, z: B_mm,           u: slopeLen_mm / repeatU_mm, v: B_mm / repeatV_mm },
        { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeEndZ_mm,   u: 0, v: ridgeEndZ_mm / repeatV_mm },
        { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeStartZ_mm, u: 0, v: ridgeStartZ_mm / repeatV_mm },
      ], [0, 1, 2, 0, 2, 3], { x: -sinT, y: cosT, z: 0 }, "L"));
    }
  }

  // ---- RIGHT SLOPE tile (trapezoid with skylight holes) ----
  {
    const skyHolesR = skyOpeningsR.map(op => ({
      sMin: op.a0_mm,
      sMax: op.a0_mm + op.aLen_mm,
      zMin: ridgeStartZ_mm + op.b0_mm,
      zMax: ridgeStartZ_mm + op.b0_mm + op.bLen_mm,
    }));
    const tileUvFn = (s, z) => ({ u: s / repeatU_mm, v: z / repeatV_mm });

    if (skyHolesR.length > 0) {
      const tR = _buildSlopeMeshWithHoles("R", tilePerpOffset_mm, skyHolesR,
        `${prefix}tiles-R`, slateMat, "tiles", tileUvFn);
      if (tR) result.tiles.push(tR);
    } else {
      const tOff = { x: sinT * tilePerpOffset_mm, y: cosT * tilePerpOffset_mm };
      result.tiles.push(buildTileMesh(`${prefix}tiles-R`, [
        { x: A_mm        + tOff.x, y: eavesY + tOff.y, z: 0,              u: slopeLen_mm / repeatU_mm, v: 0 },
        { x: A_mm        + tOff.x, y: eavesY + tOff.y, z: B_mm,           u: slopeLen_mm / repeatU_mm, v: B_mm / repeatV_mm },
        { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeEndZ_mm,   u: 0, v: ridgeEndZ_mm / repeatV_mm },
        { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeStartZ_mm, u: 0, v: ridgeStartZ_mm / repeatV_mm },
      ], [0, 2, 1, 0, 3, 2], { x: sinT, y: cosT, z: 0 }, "R"));
    }
  }

  // ---- FRONT FACE tile (triangle) ----
  {
    const tOff = { y: cosT * tilePerpOffset_mm, z: (-sinT) * tilePerpOffset_mm };
    // UVs: U = slope distance / repeat (eaves=max, ridge=0), V = X position / repeat
    result.tiles.push(buildTileMesh(`${prefix}tiles-F`, [
      { x: 0,           y: eavesY + tOff.y, z: 0           + tOff.z, u: slopeLen_mm / repeatU_mm, v: 0 },
      { x: A_mm,        y: eavesY + tOff.y, z: 0           + tOff.z, u: slopeLen_mm / repeatU_mm, v: A_mm / repeatV_mm },
      { x: halfSpan_mm, y: ridgeY + tOff.y, z: ridgeStartZ_mm + tOff.z, u: 0, v: halfSpan_mm / repeatV_mm },
    ], [0, 2, 1], { x: 0, y: cosT, z: -sinT }, "F"));
  }

  // ---- BACK FACE tile (triangle) ----
  {
    const tOff = { y: cosT * tilePerpOffset_mm, z: sinT * tilePerpOffset_mm };
    result.tiles.push(buildTileMesh(`${prefix}tiles-B`, [
      { x: A_mm,        y: eavesY + tOff.y, z: B_mm        + tOff.z, u: slopeLen_mm / repeatU_mm, v: 0 },
      { x: 0,           y: eavesY + tOff.y, z: B_mm        + tOff.z, u: slopeLen_mm / repeatU_mm, v: A_mm / repeatV_mm },
      { x: halfSpan_mm, y: ridgeY + tOff.y, z: ridgeEndZ_mm + tOff.z, u: 0, v: halfSpan_mm / repeatV_mm },
    ], [0, 2, 1], { x: 0, y: cosT, z: sinT }, "B"));
  }

  // ==================================================================
  // RIDGE CAPS + HIP CAPS — same style as apex ridge caps
  // ==================================================================
  const RIDGE_CAP_WING_MM    = 127;   // each wing extends 127mm down slope
  const RIDGE_CAP_THK_MM     = 6;     // cap thickness
  const RIDGE_CAP_EXPOSED_MM = 382;   // 457mm cap − 75mm overlap
  const CAP_GAP_MM           = 4;     // gap between adjacent caps

  // Ridge/hip Y: top of tile surface + half cap thickness
  const tileTopOffset_mm = tilePerpOffset_mm + TILE_THK_MM / 2;
  const capHalfThk_mm   = RIDGE_CAP_THK_MM / 2;

  const ridgeCapMat = getRidgeCapMaterial(scene);

  /**
   * Place a row of caps along a 3D line (ridge or hip).
   * @param {string} tag       - Name prefix for meshes
   * @param {number[]} startPt - [x, y, z] in mm (ridge end)
   * @param {number[]} endPt   - [x, y, z] in mm (eaves end)
   * @param {number} wingAngle - Droop angle for each wing (radians)
   * @param {number} yaw       - Y rotation (plan angle of the line)
   * @param {number} pitch     - X rotation (slope tilt of the line, positive = downhill)
   */
  function placeCapsAlongLine(tag, startPt, endPt, wingAngle, yaw, pitch) {
    const dx = endPt[0] - startPt[0];
    const dy = endPt[1] - startPt[1];
    const dz = endPt[2] - startPt[2];
    const lineLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (lineLen < 50) return;

    const numFull    = Math.floor(lineLen / RIDGE_CAP_EXPOSED_MM);
    const remainder  = lineLen - (numFull * RIDGE_CAP_EXPOSED_MM);
    const totalCaps  = remainder > 20 ? numFull + 1 : numFull;

    // Unit direction along the line
    const ux = dx / lineLen, uy = dy / lineLen, uz = dz / lineLen;

    for (let i = 0; i < totalCaps; i++) {
      const isLast      = (i >= numFull);
      const rawDepth_mm = isLast ? remainder : RIDGE_CAP_EXPOSED_MM;
      const capDepth_mm = rawDepth_mm - CAP_GAP_MM;
      if (capDepth_mm < 10) continue;

      // Cap center along the line
      const t_mm = i * RIDGE_CAP_EXPOSED_MM + rawDepth_mm / 2;
      const cx = startPt[0] + ux * t_mm;
      const cy = startPt[1] + uy * t_mm;
      const cz = startPt[2] + uz * t_mm;

      for (const side of ["L", "R"]) {
        const droop = (side === "L") ? wingAngle : -wingAngle;
        const wingMid = RIDGE_CAP_WING_MM / 2;

        // Build rotation quaternion: droop (Z) → pitch (X) → yaw (Y)
        const qDroop = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, droop);
        const qPitch = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, pitch);
        const qYaw   = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw);
        const q = qYaw.multiply(qPitch).multiply(qDroop);

        // Wing offset: start flat along X, apply same rotation
        const offsetLocal = new BABYLON.Vector3(
          (side === "L") ? -wingMid : wingMid, 0, 0
        );
        const offsetWorld = offsetLocal.rotateByQuaternionToRef(q, new BABYLON.Vector3());

        const mesh = BABYLON.MeshBuilder.CreateBox(
          `${prefix}${tag}-${i}-${side}`, {
            width:  RIDGE_CAP_WING_MM / 1000,
            height: RIDGE_CAP_THK_MM  / 1000,
            depth:  capDepth_mm       / 1000,
          }, scene
        );

        mesh.parent   = roofRoot;
        mesh.position = new BABYLON.Vector3(
          (cx + offsetWorld.x) / 1000,
          (cy + offsetWorld.y + capHalfThk_mm) / 1000,
          (cz + offsetWorld.z) / 1000
        );
        mesh.rotationQuaternion = q;
        mesh.material = ridgeCapMat;
        mesh.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps", side };
        result.ridgeCaps.push(mesh);
      }
    }
  }

  // --- 1. MAIN RIDGE (runs along Z from ridgeStartZ to ridgeEndZ) ---
  if (ridgeLen_mm > 50) {
    // Ridge sits at top of tile surface
    const ridgeCapY = ridgeY + cosT * tileTopOffset_mm + capHalfThk_mm;
    const ridgeCapX = halfSpan_mm;  // centered

    placeCapsAlongLine(
      "ridge",
      [ridgeCapX, ridgeCapY, ridgeStartZ_mm],
      [ridgeCapX, ridgeCapY, ridgeEndZ_mm],
      slopeAng,   // wing droop = main slope angle (same as apex)
      0,           // yaw = 0 (ridge runs along Z)
      0            // pitch = 0 (ridge is horizontal)
    );
  }

  // --- 2. HIP CAPS (all 4 corners) - VERTEX SNAPPING APPROACH ---
  // Build custom quad meshes with vertices directly placed on roof surfaces
  console.log("[ROOF-TILES] Building hip caps for all 4 corners...");
  
  // Shared constants for hip caps
  const hcCosT = Math.cos(slopeAng);
  const hcTanT = Math.tan(slopeAng);
  const hcRoofOffset = tileTopOffset_mm / hcCosT;
  const hcRise_mm = ridgeY - eavesY;
  const hcFrontTanT = hcRise_mm / ridgeStartZ_mm;
  const hcBackTanT  = hcRise_mm / (B_mm - ridgeEndZ_mm);
  const wingW = RIDGE_CAP_WING_MM;
  const halfThk = RIDGE_CAP_THK_MM / 2;
  const ARROW_EXTEND_MM = 70;
  
  // Four hip quadrants: [label, ridgePoint, eavesCorner, sideRoofYFn, frontRoofYFn]
  const hipQuadrants = [
    { label: "FL",
      ridgeZ: ridgeStartZ_mm,
      eavesX: 0, eavesZ: 0,
      sideYFn: (x) => eavesY + x * hcTanT + hcRoofOffset,
      endYFn:  (z) => eavesY + z * hcFrontTanT + hcRoofOffset },
    { label: "FR",
      ridgeZ: ridgeStartZ_mm,
      eavesX: A_mm, eavesZ: 0,
      sideYFn: (x) => eavesY + (A_mm - x) * hcTanT + hcRoofOffset,
      endYFn:  (z) => eavesY + z * hcFrontTanT + hcRoofOffset },
    { label: "BL",
      ridgeZ: ridgeEndZ_mm,
      eavesX: 0, eavesZ: B_mm,
      sideYFn: (x) => eavesY + x * hcTanT + hcRoofOffset,
      endYFn:  (z) => eavesY + (B_mm - z) * hcBackTanT + hcRoofOffset },
    { label: "BR",
      ridgeZ: ridgeEndZ_mm,
      eavesX: A_mm, eavesZ: B_mm,
      sideYFn: (x) => eavesY + (A_mm - x) * hcTanT + hcRoofOffset,
      endYFn:  (z) => eavesY + (B_mm - z) * hcBackTanT + hcRoofOffset },
  ];
  
  for (const hq of hipQuadrants) {
    const hipStart = new BABYLON.Vector3(halfSpan_mm, ridgeY, hq.ridgeZ);
    const hipEnd   = new BABYLON.Vector3(hq.eavesX, eavesY, hq.eavesZ);
    
    const hipVec = hipEnd.subtract(hipStart);
    const hipLen = hipVec.length();
    const hipDir = hipVec.normalize();
    
    // Perpendicular to hip in XZ plane
    const perpXZ = new BABYLON.Vector3(-hipDir.z, 0, hipDir.x).normalize();
    
    // Determine which perp direction is "side" (toward side roof) and which is "end" (toward front/back)
    // For FL: perpXZ points toward +X,-Z → side roof is +X direction
    // We need to figure out which wing is side vs end for each quadrant
    // perpXZ always = (-hipDir.z, 0, hipDir.x)
    // "L" wing = perpXZ direction, "R" wing = -perpXZ direction
    // For droop: L wing droop uses side slope, R wing droop uses end slope
    const droopL = wingW * Math.abs(perpXZ.x) * hcTanT;
    const droopR = wingW * Math.abs(perpXZ.z) * ((hq.label[0] === "F") ? hcFrontTanT : hcBackTanT);
    
    const sideRoofY = (x, z) => hq.sideYFn(x);
    const endRoofY  = (x, z) => hq.endYFn(z);
    
    const nearHipY = (sideRoofY(hipStart.x, hipStart.z) + endRoofY(hipStart.x, hipStart.z)) / 2;
    const farHipY  = (sideRoofY(hipEnd.x, hipEnd.z) + endRoofY(hipEnd.x, hipEnd.z)) / 2;
    const nearFoldY_saved = nearHipY + halfThk;
    const farFoldY_saved  = farHipY + halfThk;
    
    console.log(`[ROOF-TILES] Hip cap ${hq.label}: start=(${hipStart.x.toFixed(0)},${hipStart.y.toFixed(0)},${hipStart.z.toFixed(0)}) end=(${hipEnd.x.toFixed(0)},${hipEnd.y.toFixed(0)},${hipEnd.z.toFixed(0)}) len=${hipLen.toFixed(0)}`);
    
    // --- Wing quads ---
    for (const side of ["L", "R"]) {
      const wingPerp = (side === "L") ? perpXZ : perpXZ.scale(-1);
      const droop = (side === "L") ? droopL : droopR;
      const nearFoldY = nearFoldY_saved;
      const farFoldY  = farFoldY_saved;
      
      const nearTip_xz = { x: hipStart.x + wingW * wingPerp.x, z: hipStart.z + wingW * wingPerp.z };
      const farTip_xz  = { x: hipEnd.x + wingW * wingPerp.x,   z: hipEnd.z + wingW * wingPerp.z };
      const nearTipY = nearFoldY - droop;
      const farTipY  = farFoldY - droop;
      
      const positions = [
        hipStart.x / 1000, nearFoldY / 1000, hipStart.z / 1000,
        hipEnd.x / 1000,   farFoldY / 1000,  hipEnd.z / 1000,
        nearTip_xz.x / 1000, nearTipY / 1000, nearTip_xz.z / 1000,
        farTip_xz.x / 1000,  farTipY / 1000,  farTip_xz.z / 1000,
      ];
      
      const indices = (side === "L") 
        ? [0, 1, 2, 1, 3, 2]
        : [0, 2, 1, 1, 2, 3];
      
      const v0 = new BABYLON.Vector3(positions[0], positions[1], positions[2]);
      const v1 = new BABYLON.Vector3(positions[3], positions[4], positions[5]);
      const v2 = new BABYLON.Vector3(positions[6], positions[7], positions[8]);
      const edge1 = v1.subtract(v0);
      const edge2 = v2.subtract(v0);
      const normal = BABYLON.Vector3.Cross(edge1, edge2).normalize();
      if (side === "L") normal.scaleInPlace(-1);
      
      const normals = [normal.x, normal.y, normal.z, normal.x, normal.y, normal.z, normal.x, normal.y, normal.z, normal.x, normal.y, normal.z];
      const uvs = [0, 0, 1, 0, 0, 1, 1, 1];
      
      const mesh = new BABYLON.Mesh(`${prefix}hip-cap-${hq.label}-${side}`, scene);
      const vertexData = new BABYLON.VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.uvs = uvs;
      vertexData.applyToMesh(mesh);
      
      mesh.parent = roofRoot;
      mesh.material = ridgeCapMat;
      mesh.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps", side };
      result.ridgeCaps.push(mesh);
    }
    
    // --- Shadow lines ---
    const shadowSpacing = RIDGE_CAP_EXPOSED_MM / 2;
    const numShadows = Math.floor(hipLen / shadowSpacing);
    
    for (let i = 1; i <= numShadows; i++) {
      const t = i * shadowSpacing;
      const frac = t / hipLen;
      const ptX = hipStart.x + hipDir.x * t;
      const ptZ = hipStart.z + hipDir.z * t;
      const ptFoldY = nearFoldY_saved + (farFoldY_saved - nearFoldY_saved) * frac;
      
      const shadowLine = BABYLON.MeshBuilder.CreateLines(`${prefix}hip-shadow-${hq.label}-${i}`, {
        points: [
          new BABYLON.Vector3((ptX + wingW * perpXZ.x) / 1000, (ptFoldY - droopL) / 1000 + 0.002, (ptZ + wingW * perpXZ.z) / 1000),
          new BABYLON.Vector3(ptX / 1000, ptFoldY / 1000 + 0.002, ptZ / 1000),
          new BABYLON.Vector3((ptX - wingW * perpXZ.x) / 1000, (ptFoldY - droopR) / 1000 + 0.002, (ptZ - wingW * perpXZ.z) / 1000),
        ]
      }, scene);
      shadowLine.color = new BABYLON.Color3(0.2, 0.2, 0.22);
      shadowLine.parent = roofRoot;
      shadowLine.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps" };
      result.ridgeCaps.push(shadowLine);
    }
    
    // --- Arrowhead at eaves end ---
    {
      const arrowPtX = hipEnd.x + hipDir.x * ARROW_EXTEND_MM;
      const arrowPtZ = hipEnd.z + hipDir.z * ARROW_EXTEND_MM;
      const arrowY   = farFoldY_saved + hipDir.y * ARROW_EXTEND_MM;
      
      const Ltip_x = hipEnd.x + wingW * perpXZ.x;
      const Ltip_z = hipEnd.z + wingW * perpXZ.z;
      const Ltip_y = farFoldY_saved - droopL;
      const Rtip_x = hipEnd.x - wingW * perpXZ.x;
      const Rtip_z = hipEnd.z - wingW * perpXZ.z;
      const Rtip_y = farFoldY_saved - droopR;
      
      const arrowPositions = [
        Ltip_x / 1000, Ltip_y / 1000, Ltip_z / 1000,
        Rtip_x / 1000, Rtip_y / 1000, Rtip_z / 1000,
        arrowPtX / 1000, arrowY / 1000, arrowPtZ / 1000,
      ];
      const arrowMesh = new BABYLON.Mesh(`${prefix}hip-cap-arrow-${hq.label}`, scene);
      const arrowVD = new BABYLON.VertexData();
      arrowVD.positions = arrowPositions;
      arrowVD.indices = [0, 2, 1, 0, 1, 2];
      arrowVD.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0];
      arrowVD.uvs = [0, 0, 1, 0, 0.5, 1];
      arrowVD.applyToMesh(arrowMesh);
      
      arrowMesh.parent = roofRoot;
      arrowMesh.material = ridgeCapMat;
      arrowMesh.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps" };
      result.ridgeCaps.push(arrowMesh);
    }
  }

  console.log(`[ROOF-TILES] Hipped: ${result.membrane.length} membranes, ${result.battens.length} battens, ${result.tiles.length} tiles, ${result.ridgeCaps.length} ridge/hip caps — all 4 slopes`);
  console.log(`[ROOF-TILES]   tilePerpOff=${tilePerpOffset_mm.toFixed(1)}mm`);
  return result;
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
  if (style === "hipped") {
    return buildHippedTileLayers(state, ctx, scene, prefix);
  }
  if (style === "pent") {
    return buildPentTileLayers(state, ctx, scene, prefix);
  }
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

  // ------------------------------------------------------------------
  // 4. Ridge caps — individual tiles along the ridge (apex only).
  //    Each cap is a separate box with a small gap so geometry edges
  //    create natural shadow lines between tiles (matches real Tapco).
  // ------------------------------------------------------------------
  const RIDGE_CAP_WING_MM     = 127;   // each wing extends 127mm down slope
  const RIDGE_CAP_THK_MM      = 6;     // cap thickness
  const RIDGE_CAP_EXPOSED_MM  = 382;   // 457mm cap − 75mm overlap
  const CAP_GAP_MM            = 4;     // gap between adjacent caps

  result.ridgeCaps = [];

  // Ridge Y: top of tile surface at apex + half cap thickness
  const ridgeY_mm = memberD_mm + rise_mm
    + sinT * ridgeExt_mm
    + cosT * (tileCentreOffset_mm + TILE_THK_MM / 2)
    + RIDGE_CAP_THK_MM / 2;
  const ridgeX_mm = halfSpan_mm;

  // Ridge length = tile slab width (building depth + overhangs, no overshoot)
  const ridgeLen_mm = slabWidth_mm;

  // Material — textured with overlap shadow at leading edge (matches main tile groove darkness)
  const ridgeCapMat = getRidgeCapMaterial(scene);

  // How many caps fit within the ridge?
  const numFullCaps  = Math.floor(ridgeLen_mm / RIDGE_CAP_EXPOSED_MM);
  const remainder_mm = ridgeLen_mm - (numFullCaps * RIDGE_CAP_EXPOSED_MM);
  const totalCaps    = remainder_mm > 20 ? numFullCaps + 1 : numFullCaps;
  const startZ_mm    = (B_mm / 2) - (slabWidth_mm / 2);

  for (let i = 0; i < totalCaps; i++) {
    const isLast       = (i >= numFullCaps);
    const rawDepth_mm  = isLast ? remainder_mm : RIDGE_CAP_EXPOSED_MM;
    const capDepth_mm  = rawDepth_mm - CAP_GAP_MM;
    if (capDepth_mm < 10) continue;

    const capCenZ_mm = startZ_mm + (i * RIDGE_CAP_EXPOSED_MM) + rawDepth_mm / 2;

    for (const side of ["L", "R"]) {
      const sAngle   = (side === "L") ? slopeAng : -slopeAng;
      const wingMid  = RIDGE_CAP_WING_MM / 2;
      const runDown  = wingMid * cosT;
      const dropDown = wingMid * sinT;

      const wx = ridgeX_mm + ((side === "L") ? -runDown : runDown);
      const wy = ridgeY_mm - dropDown;

      const mesh = BABYLON.MeshBuilder.CreateBox(
        `${prefix}ridgecap-${i}-${side}`, {
          width:  RIDGE_CAP_WING_MM / 1000,
          height: RIDGE_CAP_THK_MM  / 1000,
          depth:  capDepth_mm       / 1000,
        }, scene
      );

      mesh.parent   = roofRoot;
      mesh.position = new BABYLON.Vector3(wx / 1000, wy / 1000, capCenZ_mm / 1000);
      mesh.rotation = new BABYLON.Vector3(0, 0, sAngle);
      mesh.material = ridgeCapMat;
      mesh.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps", side };

      result.ridgeCaps.push(mesh);
    }
  }

  console.log(`[ROOF-TILES] Built: ${result.membrane.length} membranes, ${result.battens.length} battens, ${result.tiles.length} slabs, ${result.ridgeCaps.length} ridge cap pieces`);
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

  // Also dispose cached materials so textures get recreated
  for (const name of ["roofTiles-ridgeCap", "roofTiles-slate", "roofTiles-slate-hipped"]) {
    const mat = scene.getMaterialByName(name);
    if (mat) { mat.dispose(true, true); }   // forceDisposeEffect, forceDisposeTextures
  }

  if (gone.length) console.log(`[ROOF-TILES] Disposed ${gone.length} meshes + materials`);
}

export function setLayerVisibility(scene, layer, visible) {
  for (const m of scene.meshes || []) {
    if (m.metadata?.roofTiles && m.metadata?.layer === layer) {
      m.isVisible = visible;
    }
  }
}
