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
  // In hipped roof.js, memberD_mm = g.depth_mm (75mm for 50x75).
  // getMemberD() returns thickness (50mm) which is correct for apex but WRONG for hipped.
  // Match what buildHipped() in roof.js uses: depth_mm (the tall/load-bearing dimension).
  const g = state?.frame?.gauge ? state.frame.gauge : {};
  const memberD_mm = Math.max(1, Math.floor(Number(g.depth_mm || 75)));
  const slopeAng   = Math.atan2(rise_mm, halfSpan_mm);
  const sinT       = Math.sin(slopeAng);
  const cosT       = Math.cos(slopeAng);

  const roofRoot = scene.getTransformNodeByName("roof-root");
  if (!roofRoot) {
    console.warn("[ROOF-TILES] No roof-root in scene (hipped)");
    return result;
  }

  const membraneMat = getMembraneMaterial(scene);

  // ------------------------------------------------------------------
  // LEFT SLOPE — one trapezoidal membrane piece
  // ------------------------------------------------------------------
  // Perpendicular offset from rafter top surface to membrane centre:
  //   OSB (18mm) + clear gap (2mm) + half membrane (0.5mm) = 20.5mm
  //   The extra gap ensures the membrane is clearly visible above the OSB boxes.
  const CLEAR_GAP_MM = 2;
  const perpOffset_mm = OSB_THK_MM + CLEAR_GAP_MM + MEMBRANE_SPECS.thickness_mm / 2;

  // Left slope outward normal: (-sinT, cosT, 0)
  const offX = (-sinT) * perpOffset_mm;
  const offY = cosT * perpOffset_mm;

  // 4 corners of the trapezoid (in roof-root local coords, mm)
  // Eaves level (rafter top Y = memberD_mm), ridge level (rafter top Y = memberD_mm + rise)
  // Then offset perpendicular to slope surface to sit on top of OSB.

  const eavesY = memberD_mm;
  const ridgeY = memberD_mm + rise_mm;

  const v0x = 0           + offX;   // front eaves
  const v0y = eavesY      + offY;
  const v0z = 0;

  const v1x = 0           + offX;   // back eaves
  const v1y = eavesY      + offY;
  const v1z = B_mm;

  const v2x = halfSpan_mm + offX;   // ridge back
  const v2y = ridgeY      + offY;
  const v2z = ridgeEndZ_mm;

  const v3x = halfSpan_mm + offX;   // ridge front
  const v3y = ridgeY      + offY;
  const v3z = ridgeStartZ_mm;

  // Vertex positions (metres)
  const positions = [
    v0x / 1000, v0y / 1000, v0z / 1000,   // 0: front eaves
    v1x / 1000, v1y / 1000, v1z / 1000,   // 1: back eaves
    v2x / 1000, v2y / 1000, v2z / 1000,   // 2: ridge back
    v3x / 1000, v3y / 1000, v3z / 1000,   // 3: ridge front
  ];

  // Two triangles — winding gives outward normal (-sinT, cosT, 0)
  const indices = [
    0, 1, 2,   // front-eaves → back-eaves → ridge-back
    0, 2, 3,   // front-eaves → ridge-back → ridge-front
  ];

  // Slope outward normal (same for all vertices — single flat plane)
  const nx = -sinT, ny = cosT, nz = 0;
  const normals = [
    nx, ny, nz,
    nx, ny, nz,
    nx, ny, nz,
    nx, ny, nz,
  ];

  // Simple UVs (not textured yet — just for completeness)
  const uvs = [0, 0,  1, 0,  1, 1,  0, 1];

  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.indices   = indices;
  vertexData.normals   = normals;
  vertexData.uvs       = uvs;

  const mesh = new BABYLON.Mesh(`${prefix}membrane-L`, scene);
  vertexData.applyToMesh(mesh);
  mesh.material = membraneMat;
  mesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: "L" };
  mesh.parent   = roofRoot;

  if (mesh.enableEdgesRendering) {
    mesh.enableEdgesRendering();
    mesh.edgesWidth = 2;
    mesh.edgesColor = new BABYLON.Color4(0.3, 0.5, 0.7, 1);
  }

  result.membrane.push(mesh);

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
  // RIGHT SLOPE — mirror of left slope trapezoid
  // ------------------------------------------------------------------
  // Right slope outward normal: (+sinT, cosT, 0)
  {
    const rOffX = sinT * perpOffset_mm;
    const rOffY = cosT * perpOffset_mm;

    const rv0x = A_mm        + rOffX;   // front eaves (right side)
    const rv0y = eavesY      + rOffY;
    const rv0z = 0;

    const rv1x = A_mm        + rOffX;   // back eaves
    const rv1y = eavesY      + rOffY;
    const rv1z = B_mm;

    const rv2x = halfSpan_mm + rOffX;   // ridge back
    const rv2y = ridgeY      + rOffY;
    const rv2z = ridgeEndZ_mm;

    const rv3x = halfSpan_mm + rOffX;   // ridge front
    const rv3y = ridgeY      + rOffY;
    const rv3z = ridgeStartZ_mm;

    const rPositions = [
      rv0x / 1000, rv0y / 1000, rv0z / 1000,
      rv1x / 1000, rv1y / 1000, rv1z / 1000,
      rv2x / 1000, rv2y / 1000, rv2z / 1000,
      rv3x / 1000, rv3y / 1000, rv3z / 1000,
    ];

    // Winding for outward normal (+sinT, cosT, 0) — reversed from left
    const rIndices = [0, 2, 1, 0, 3, 2];

    const rnx = sinT, rny = cosT, rnz = 0;
    const rNormals = [rnx, rny, rnz, rnx, rny, rnz, rnx, rny, rnz, rnx, rny, rnz];
    const rUvs = [0, 0, 1, 0, 1, 1, 0, 1];

    const rVertexData = new BABYLON.VertexData();
    rVertexData.positions = rPositions;
    rVertexData.indices   = rIndices;
    rVertexData.normals   = rNormals;
    rVertexData.uvs       = rUvs;

    const rMesh = new BABYLON.Mesh(`${prefix}membrane-R`, scene);
    rVertexData.applyToMesh(rMesh);
    rMesh.material = membraneMat;
    rMesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: "R" };
    rMesh.parent   = roofRoot;

    if (rMesh.enableEdgesRendering) {
      rMesh.enableEdgesRendering();
      rMesh.edgesWidth = 2;
      rMesh.edgesColor = new BABYLON.Color4(0.3, 0.5, 0.7, 1);
    }

    result.membrane.push(rMesh);
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

  const slopeLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
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
  for (const side of ["L", "R"]) {
    const normalX  = (side === "L") ? -sinT : sinT;
    const rotZ     = (side === "L") ? slopeAng : -slopeAng;

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
      const battenLen = zBack - zFront;
      if (battenLen < MIN_BATTEN_LEN) continue;

      const ySurf = memberD_mm + (rise_mm - drop);
      const xSurf = (side === "L") ? xPlan : (A_mm - xPlan);

      const cx = xSurf + normalX * battenPerpOffset_mm;
      const cy = ySurf + cosT   * battenPerpOffset_mm;
      const cz = (zFront + zBack) / 2;

      const tag = (idx === 0) ? "ridge" : (idx === sPositions.length - 1) ? "eaves" : `${idx}`;
      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}batten-${side}-${tag}`, {
        width:  BATTEN_SPECS.width_mm  / 1000,
        height: BATTEN_SPECS.height_mm / 1000,
        depth:  battenLen / 1000,
      }, scene);
      mesh.parent   = roofRoot;
      mesh.position  = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
      mesh.rotation  = new BABYLON.Vector3(0, 0, rotZ);
      mesh.material  = battenMat;
      mesh.metadata  = { dynamic: true, roofTiles: true, layer: "battens", slope: side };
      result.battens.push(mesh);
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

  // slopeLen_mm already declared above (battens section)

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

  // ---- LEFT SLOPE tile (trapezoid) ----
  {
    const tOff = { x: (-sinT) * tilePerpOffset_mm, y: cosT * tilePerpOffset_mm };
    // UVs: U = slope distance / repeat (eaves=max, ridge=0), V = Z position / repeat
    result.tiles.push(buildTileMesh(`${prefix}tiles-L`, [
      { x: 0           + tOff.x, y: eavesY + tOff.y, z: 0,              u: slopeLen_mm / repeatU_mm, v: 0 },
      { x: 0           + tOff.x, y: eavesY + tOff.y, z: B_mm,           u: slopeLen_mm / repeatU_mm, v: B_mm / repeatV_mm },
      { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeEndZ_mm,   u: 0, v: ridgeEndZ_mm / repeatV_mm },
      { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeStartZ_mm, u: 0, v: ridgeStartZ_mm / repeatV_mm },
    ], [0, 1, 2, 0, 2, 3], { x: -sinT, y: cosT, z: 0 }, "L"));
  }

  // ---- RIGHT SLOPE tile (trapezoid) ----
  {
    const tOff = { x: sinT * tilePerpOffset_mm, y: cosT * tilePerpOffset_mm };
    result.tiles.push(buildTileMesh(`${prefix}tiles-R`, [
      { x: A_mm        + tOff.x, y: eavesY + tOff.y, z: 0,              u: slopeLen_mm / repeatU_mm, v: 0 },
      { x: A_mm        + tOff.x, y: eavesY + tOff.y, z: B_mm,           u: slopeLen_mm / repeatU_mm, v: B_mm / repeatV_mm },
      { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeEndZ_mm,   u: 0, v: ridgeEndZ_mm / repeatV_mm },
      { x: halfSpan_mm + tOff.x, y: ridgeY + tOff.y, z: ridgeStartZ_mm, u: 0, v: ridgeStartZ_mm / repeatV_mm },
    ], [0, 2, 1, 0, 3, 2], { x: sinT, y: cosT, z: 0 }, "R"));
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

  // --- 2. SINGLE TEST HIP CAP (front-left) ---
  // V-shape fold axis aligned with hip rafter direction
  // Wing tips contact roof surfaces, fold stays above
  {
    // Front-left hip: from ridge front point to front-left eaves corner
    // hipStart at ridge, hipEnd at eaves corner
    const hipStart = new BABYLON.Vector3(halfSpan_mm, ridgeY, ridgeStartZ_mm);
    const hipEnd   = new BABYLON.Vector3(0, eavesY, 0);
    
    // Hip direction vector (pointing from ridge DOWN to eaves)
    const hipVec = hipEnd.subtract(hipStart);
    const hipLen = hipVec.length();
    const hipDir = hipVec.normalize();
    
    // Align local Z (0,0,1) with hipDir using axis-angle rotation
    const localZ = BABYLON.Axis.Z;
    const crossVec = BABYLON.Vector3.Cross(localZ, hipDir);
    const dotVal = BABYLON.Vector3.Dot(localZ, hipDir);
    
    let qAlign;
    if (crossVec.length() < 0.0001) {
      // Vectors are parallel or anti-parallel
      qAlign = (dotVal > 0) 
        ? BABYLON.Quaternion.Identity()
        : BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, Math.PI);
    } else {
      const axis = crossVec.normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, dotVal)));
      qAlign = BABYLON.Quaternion.RotationAxis(axis, angle);
    }
    
    // Wing droop angle = roof slope angle
    const wingDroop = slopeAng;
    
    // Centre of hip cap (midpoint of hip line)
    const center = hipStart.add(hipEnd).scale(0.5);
    
    // Offset upward so cap sits on top of tiles
    // The "up" direction perpendicular to the hip line, pointing away from roof
    // For a hip, this is roughly vertical but tilted
    const perpOffset_mm = RIDGE_CAP_WING_MM * Math.sin(wingDroop) + tileTopOffset_mm;
    
    // Create two wings (L and R) with V-shape
    for (const side of ["L", "R"]) {
      // Droop: L wing tilts one way, R wing tilts the other
      // Droop is rotation around local Z (fold axis) BEFORE alignment
      const droop = (side === "L") ? -wingDroop : wingDroop;
      
      // Build combined rotation: first droop in local space, then align to world
      const qDroop = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, droop);
      const q = qAlign.multiply(qDroop);
      
      // Wing center offset from fold axis (in local X, transformed to world)
      const wingMid = RIDGE_CAP_WING_MM / 2;
      const offsetLocal = new BABYLON.Vector3(
        (side === "L") ? -wingMid : wingMid, 0, 0
      );
      const offsetWorld = offsetLocal.rotateByQuaternionToRef(q, new BABYLON.Vector3());
      
      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}hip-cap-${side}`, {
        width:  RIDGE_CAP_WING_MM / 1000,
        height: RIDGE_CAP_THK_MM / 1000,
        depth:  hipLen / 1000,
      }, scene);
      
      mesh.parent = roofRoot;
      mesh.position = new BABYLON.Vector3(
        (center.x + offsetWorld.x) / 1000,
        (center.y + offsetWorld.y + perpOffset_mm) / 1000,
        (center.z + offsetWorld.z) / 1000
      );
      mesh.rotationQuaternion = q;
      mesh.material = ridgeCapMat;
      mesh.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps", side };
      result.ridgeCaps.push(mesh);
    }
    
    console.log(`[ROOF-TILES] Hip cap: len=${hipLen.toFixed(0)}mm, droop=${(wingDroop*180/Math.PI).toFixed(1)}°, perpOff=${perpOffset_mm.toFixed(1)}mm`);
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
