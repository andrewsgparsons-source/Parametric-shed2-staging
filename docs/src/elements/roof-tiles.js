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
 * Builds tile layers for a hipped roof.
 * 4 slopes: 2 saddle (rectangular, L/R) + 2 hip ends (triangular, F/B).
 * Ridge caps along main ridge + hip ridges.
 */
function buildHippedTileLayers(state, ctx, scene, prefix) {
  const result = { membrane: [], battens: [], tiles: [], ridgeCaps: [] };

  // ------------------------------------------------------------------
  // Resolve dimensions (mirrors buildHipped in roof.js)
  // ------------------------------------------------------------------
  const dims = resolveDims(state);
  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 1)));
  const roofW_mm = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const roofD_mm = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? frameD_mm)));

  const A_mm = roofW_mm;   // width (X)
  const B_mm = roofD_mm;   // depth (Z)
  const halfSpan_mm = A_mm / 2;

  const isSquare = Math.abs(A_mm - B_mm) < 100;
  const ridgeLen_mm = isSquare ? 0 : Math.max(0, B_mm - A_mm);
  const ridgeStartZ_mm = halfSpan_mm;
  const ridgeEndZ_mm   = B_mm - halfSpan_mm;

  // Rise — use hipped/apex height controls
  const hipped = state?.roof?.hipped ?? null;
  const apex   = state?.roof?.apex ?? null;
  const eavesH_mm = Number(hipped?.heightToEaves_mm || apex?.heightToEaves_mm || apex?.eavesHeight_mm) || 1850;
  const crestH_mm = Number(hipped?.heightToCrest_mm || apex?.heightToCrest_mm || apex?.crestHeight_mm) || 2400;
  const rise_mm = Math.max(100, crestH_mm - eavesH_mm);

  // Timber & slope geometry
  const memberD_mm      = getMemberD(state);
  const slopeAng        = Math.atan2(rise_mm, halfSpan_mm);
  const sinT            = Math.sin(slopeAng);
  const cosT            = Math.cos(slopeAng);
  const commonRafterLen = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const osbOutOffset_mm = memberD_mm + OSB_CLEAR_MM;

  // Hip geometry
  const hipPlanLen_mm    = halfSpan_mm * Math.SQRT2;
  const hipRafterLen_mm  = Math.sqrt(hipPlanLen_mm * hipPlanLen_mm + rise_mm * rise_mm);
  const hipSlopeAng      = Math.atan2(rise_mm, hipPlanLen_mm);

  const roofRoot = scene.getTransformNodeByName("roof-root");
  if (!roofRoot) {
    console.warn("[ROOF-TILES] No roof-root in scene (hipped)");
    return result;
  }

  // ------------------------------------------------------------------
  // Tile layer constants (same as apex)
  // ------------------------------------------------------------------
  const SLATE_BATTEN_HEIGHT_MM = 36;
  const tileCentreOffset_mm = osbOutOffset_mm + OSB_THK_MM + SLATE_BATTEN_HEIGHT_MM + (TILE_THK_MM / 2);
  const sideExt_mm  = FASCIA_THK_MM + OVERHANG_MM;
  const eavesExt_mm = FASCIA_THK_MM + OVERHANG_MM;
  const tanT = sinT / cosT;
  const ridgeExt_mm = Math.ceil(tanT * tileCentreOffset_mm);

  // ------------------------------------------------------------------
  // Phase 1: SADDLE SLOPES (L/R rectangles) — tiles, membrane, battens
  // ------------------------------------------------------------------
  if (ridgeLen_mm > 0) {
    // On a hipped roof, the main slope tiles extend the full building depth
    // (not just the ridge section). The hip ridge covers the junction.
    const saddleWidth_mm = B_mm + 2 * sideExt_mm;
    const membraneOffset_mm = osbOutOffset_mm + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm / 2;

    // Build slope descriptors for saddle sections
    function makeSaddleSlopeDescriptor(side) {
      const normalX = (side === "L") ? -sinT : sinT;
      const normalY = cosT;
      const rotZ    = (side === "L") ? slopeAng : -slopeAng;
      const name    = (side === "L") ? "left" : "right";

      const sMid = commonRafterLen / 2;
      const run  = sMid * cosT;
      const drop = sMid * sinT;
      const ySurf = memberD_mm + (rise_mm - drop);
      const xSurf = (side === "L") ? (halfSpan_mm - run) : (halfSpan_mm + run);

      return {
        name,
        width_mm:  saddleWidth_mm,
        length_mm: commonRafterLen,
        position_mm: {
          x: xSurf + normalX * membraneOffset_mm,
          y: ySurf + normalY * membraneOffset_mm,
          z: B_mm / 2,  // center of full building depth
        },
        rotation: { x: 0, y: 0, z: rotZ },
        slopeAngle: slopeAng,
        normal: { x: normalX, y: normalY },
        halfSpan_mm,
        rise_mm,
        memberD_mm,
      };
    }

    const slopeL = makeSaddleSlopeDescriptor("L");
    const slopeR = makeSaddleSlopeDescriptor("R");
    const roofData = { memberD_mm, osbOutOffset_mm, OSB_THK_MM };

    for (const slope of [slopeL, slopeR]) {
      result.membrane.push(buildMembrane(slope, scene, roofRoot, prefix));
      result.battens.push(...buildBattens(slope, scene, roofRoot, roofData, prefix));
    }

    // Tile slabs for saddle slopes
    const slabLen_mm       = commonRafterLen + eavesExt_mm + ridgeExt_mm;
    const slabWidth_mm     = saddleWidth_mm;  // no side extensions (hip junctions, not bargeboards)
    const sLabMid_mm       = (commonRafterLen + eavesExt_mm - ridgeExt_mm) / 2;
    const slateMat         = getSlateMaterial(scene, slabLen_mm, slabWidth_mm);

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
      const cz = B_mm / 2;  // center of full building depth

      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}tiles-saddle-${side}`, {
        width:  slabLen_mm       / 1000,
        height: TILE_THK_MM      / 1000,
        depth:  saddleWidth_mm   / 1000,
      }, scene);

      mesh.parent   = roofRoot;
      mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
      mesh.rotation = new BABYLON.Vector3(0, 0, rotZ);
      mesh.material = slateMat;
      mesh.metadata = { dynamic: true, roofTiles: true, layer: "tiles", side };

      result.tiles.push(mesh);
    }

    console.log(`[ROOF-TILES] Hipped saddle slopes: ${result.membrane.length} membranes, ${result.battens.length} battens, ${result.tiles.length} slabs`);
  }

  // ------------------------------------------------------------------
  // Phase 2: MAIN RIDGE CAPS (same approach as apex, shorter length)
  // ------------------------------------------------------------------
  if (ridgeLen_mm > 0) {
    const RIDGE_CAP_WING_MM     = 127;
    const RIDGE_CAP_THK_MM      = 6;
    const RIDGE_CAP_EXPOSED_MM  = 382;
    const CAP_GAP_MM            = 4;

    const mainRidgeY_mm = memberD_mm + rise_mm
      + sinT * ridgeExt_mm
      + cosT * (tileCentreOffset_mm + TILE_THK_MM / 2)
      + RIDGE_CAP_THK_MM / 2;
    const mainRidgeX_mm = halfSpan_mm;

    const mainRidgeLen_mm = ridgeLen_mm;  // only covers the actual ridge section
    const ridgeCapMat     = getRidgeCapMaterial(scene);

    const numFullCaps  = Math.floor(mainRidgeLen_mm / RIDGE_CAP_EXPOSED_MM);
    const remainder_mm = mainRidgeLen_mm - (numFullCaps * RIDGE_CAP_EXPOSED_MM);
    const totalCaps    = remainder_mm > 20 ? numFullCaps + 1 : numFullCaps;
    const capStartZ_mm = ridgeStartZ_mm;

    for (let i = 0; i < totalCaps; i++) {
      const isLast       = (i >= numFullCaps);
      const rawDepth_mm  = isLast ? remainder_mm : RIDGE_CAP_EXPOSED_MM;
      const capDepth_mm  = rawDepth_mm - CAP_GAP_MM;
      if (capDepth_mm < 10) continue;

      const capCenZ_mm = capStartZ_mm + (i * RIDGE_CAP_EXPOSED_MM) + rawDepth_mm / 2;

      for (const side of ["L", "R"]) {
        const sAngle   = (side === "L") ? slopeAng : -slopeAng;
        const wingMid  = RIDGE_CAP_WING_MM / 2;
        const runDown  = wingMid * cosT;
        const dropDown = wingMid * sinT;

        const wx = mainRidgeX_mm + ((side === "L") ? -runDown : runDown);
        const wy = mainRidgeY_mm - dropDown;

        const mesh = BABYLON.MeshBuilder.CreateBox(
          `${prefix}ridgecap-main-${i}-${side}`, {
            width:  RIDGE_CAP_WING_MM / 1000,
            height: RIDGE_CAP_THK_MM  / 1000,
            depth:  capDepth_mm       / 1000,
          }, scene
        );

        mesh.parent   = roofRoot;
        mesh.position = new BABYLON.Vector3(wx / 1000, wy / 1000, capCenZ_mm / 1000);
        mesh.rotation = new BABYLON.Vector3(0, 0, sAngle);
        mesh.material = ridgeCapMat;
        mesh.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps", type: "main" };

        result.ridgeCaps.push(mesh);
      }
    }

    console.log(`[ROOF-TILES] Hipped main ridge: ${result.ridgeCaps.length} cap pieces`);
  }

  // ------------------------------------------------------------------
  // Phase 3: HIP END SLOPES (front & back triangular faces)
  // For now, use rectangular slabs rotated to the hip slope angle.
  // The hip ridge caps will cover the junction lines.
  // ------------------------------------------------------------------
  {
    // The front/back hip slopes face in the Z direction (not X like saddles).
    // Slope angle from eaves center to ridge = commonSlopeAng (same pitch).
    // The slope runs along Z from eaves (Z=0 or Z=B_mm) toward the ridge.
    // Width along eaves = A_mm (the building width).
    const hipFaceWidth_mm = A_mm;
    const hipFaceRun_mm   = halfSpan_mm;  // horizontal run from eaves to ridge in Z
    const hipFaceLen_mm   = Math.sqrt(hipFaceRun_mm * hipFaceRun_mm + rise_mm * rise_mm);

    // Tile slab for hip end faces
    // Extend generously — rectangular slab needs to overshoot the triangle
    const hipSlabLen_mm   = hipFaceLen_mm + eavesExt_mm * 2 + ridgeExt_mm * 2;
    const hipSlabWidth_mm = hipFaceWidth_mm + 4 * sideExt_mm;
    const hipSlabMid_mm   = (hipFaceLen_mm + eavesExt_mm - ridgeExt_mm) / 2;

    const hipSlateMat = getSlateMaterial(scene, hipSlabLen_mm, hipSlabWidth_mm);

    // Front hip face: slope from Z=0 up to ridgeStartZ, centered on X=halfSpan
    // Rotation around X axis (slope faces forward/Z-negative)
    {
      const run  = hipSlabMid_mm * cosT;
      const drop = hipSlabMid_mm * sinT;
      const cy   = memberD_mm + (rise_mm - drop) + cosT * tileCentreOffset_mm;
      const cx   = halfSpan_mm;
      const cz   = ridgeStartZ_mm - run - sinT * tileCentreOffset_mm;

      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}tiles-hip-F`, {
        width:  hipSlabWidth_mm / 1000,
        height: TILE_THK_MM    / 1000,
        depth:  hipSlabLen_mm  / 1000,
      }, scene);

      mesh.parent   = roofRoot;
      mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
      mesh.rotation = new BABYLON.Vector3(slopeAng, 0, 0);
      mesh.material = hipSlateMat;
      mesh.metadata = { dynamic: true, roofTiles: true, layer: "tiles", side: "F" };

      result.tiles.push(mesh);
    }

    // Back hip face: slope from Z=B_mm down to ridgeEndZ
    {
      const run  = hipSlabMid_mm * cosT;
      const drop = hipSlabMid_mm * sinT;
      const cy   = memberD_mm + (rise_mm - drop) + cosT * tileCentreOffset_mm;
      const cx   = halfSpan_mm;
      const cz   = ridgeEndZ_mm + run + sinT * tileCentreOffset_mm;

      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}tiles-hip-B`, {
        width:  hipSlabWidth_mm / 1000,
        height: TILE_THK_MM    / 1000,
        depth:  hipSlabLen_mm  / 1000,
      }, scene);

      mesh.parent   = roofRoot;
      mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
      mesh.rotation = new BABYLON.Vector3(-slopeAng, 0, 0);
      mesh.material = hipSlateMat;
      mesh.metadata = { dynamic: true, roofTiles: true, layer: "tiles", side: "B" };

      result.tiles.push(mesh);
    }

    // --- Membrane + battens for hip end faces ---
    const membraneOffset_hip = osbOutOffset_mm + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm / 2;
    const battenCtrOffset_hip = osbOutOffset_mm + OSB_THK_MM + MEMBRANE_SPECS.thickness_mm + BATTEN_SPECS.height_mm / 2;
    const membraneMat = getMembraneMaterial(scene);
    const battenMat   = getBattenMaterial(scene);

    for (const face of ["F", "B"]) {
      const sign = (face === "F") ? 1 : -1;  // +slopeAng for front, -slopeAng for back
      const midS = hipFaceLen_mm / 2;

      // Membrane
      {
        const run  = midS * cosT;
        const drop = midS * sinT;
        const cy = memberD_mm + (rise_mm - drop) + cosT * membraneOffset_hip;
        const cx = halfSpan_mm;
        const cz = (face === "F")
          ? ridgeStartZ_mm - run - sinT * membraneOffset_hip
          : ridgeEndZ_mm   + run + sinT * membraneOffset_hip;

        const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}membrane-hip-${face}`, {
          width:  hipFaceWidth_mm / 1000,
          height: MEMBRANE_SPECS.thickness_mm / 1000,
          depth:  hipFaceLen_mm / 1000,
        }, scene);
        mesh.parent   = roofRoot;
        mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
        mesh.rotation = new BABYLON.Vector3(sign * slopeAng, 0, 0);
        mesh.material = membraneMat;
        mesh.metadata = { dynamic: true, roofTiles: true, layer: "membrane", slope: `hip-${face}` };
        result.membrane.push(mesh);
      }

      // Battens (spaced along the slope from ridge toward eaves)
      const RIDGE_MARGIN = 25;
      const EAVES_MARGIN = 25;
      const numB = Math.floor((hipFaceLen_mm - BATTEN_SPECS.spacing_mm) / BATTEN_SPECS.spacing_mm);

      function addHipBatten(name, s_mm) {
        const run_mm  = s_mm * cosT;
        const drop_mm = s_mm * sinT;
        const cy = memberD_mm + (rise_mm - drop_mm) + cosT * battenCtrOffset_hip;
        const cx = halfSpan_mm;
        const cz = (face === "F")
          ? ridgeStartZ_mm - run_mm - sinT * battenCtrOffset_hip
          : ridgeEndZ_mm   + run_mm + sinT * battenCtrOffset_hip;

        const mesh = BABYLON.MeshBuilder.CreateBox(name, {
          width:  hipFaceWidth_mm / 1000,
          height: BATTEN_SPECS.height_mm / 1000,
          depth:  BATTEN_SPECS.width_mm / 1000,
        }, scene);
        mesh.parent   = roofRoot;
        mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
        mesh.rotation = new BABYLON.Vector3(sign * slopeAng, 0, 0);
        mesh.material = battenMat;
        mesh.metadata = { dynamic: true, roofTiles: true, layer: "battens", slope: `hip-${face}` };
        result.battens.push(mesh);
      }

      addHipBatten(`${prefix}batten-hip-${face}-ridge`, RIDGE_MARGIN);
      for (let i = 0; i < numB; i++) {
        addHipBatten(`${prefix}batten-hip-${face}-${i}`, (i + 1) * BATTEN_SPECS.spacing_mm);
      }
      addHipBatten(`${prefix}batten-hip-${face}-eaves`, hipFaceLen_mm - EAVES_MARGIN);
    }

    console.log(`[ROOF-TILES] Hipped end slopes: 2 slabs + membranes + battens`);
  }

  // ------------------------------------------------------------------
  // Phase 4: HIP RIDGE CAPS (4 diagonal ridges from corners to ridge ends)
  // ------------------------------------------------------------------
  {
    const RIDGE_CAP_WING_MM     = 127;
    const RIDGE_CAP_THK_MM      = 6;
    const RIDGE_CAP_EXPOSED_MM  = 382;
    const CAP_GAP_MM            = 4;

    const ridgeCapMat = getRidgeCapMaterial(scene);

    // Hip ridge Y at the top (ridge end) — same as main ridge
    const hipTopY_mm = memberD_mm + rise_mm
      + sinT * ridgeExt_mm
      + cosT * (tileCentreOffset_mm + TILE_THK_MM / 2)
      + RIDGE_CAP_THK_MM / 2;

    // Hip ridge Y at the bottom (eaves corner) — at tile surface at eaves
    const hipBotY_mm = memberD_mm
      + cosT * (tileCentreOffset_mm + TILE_THK_MM / 2)
      + RIDGE_CAP_THK_MM / 2;

    // 4 hip ridges: FL, FR, BL, BR
    const hipDefs = [
      { name: "FL", cornerX: 0,    cornerZ: 0,    ridgeX: halfSpan_mm, ridgeZ: ridgeStartZ_mm },
      { name: "FR", cornerX: A_mm, cornerZ: 0,    ridgeX: halfSpan_mm, ridgeZ: ridgeStartZ_mm },
      { name: "BL", cornerX: 0,    cornerZ: B_mm, ridgeX: halfSpan_mm, ridgeZ: ridgeEndZ_mm   },
      { name: "BR", cornerX: A_mm, cornerZ: B_mm, ridgeX: halfSpan_mm, ridgeZ: ridgeEndZ_mm   },
    ];

    for (const hip of hipDefs) {
      // Direction vector from corner to ridge end
      const dx = hip.ridgeX - hip.cornerX;
      const dz = hip.ridgeZ - hip.cornerZ;
      const planLen = Math.sqrt(dx * dx + dz * dz);  // = halfSpan * sqrt(2)
      const hipLen  = Math.sqrt(planLen * planLen + rise_mm * rise_mm);

      // Angle in XZ plane from corner to ridge
      const planAngle = Math.atan2(dz, dx);

      // Number of caps along this hip ridge
      const numFull  = Math.floor(hipLen / RIDGE_CAP_EXPOSED_MM);
      const remain   = hipLen - (numFull * RIDGE_CAP_EXPOSED_MM);
      const total    = remain > 20 ? numFull + 1 : numFull;

      for (let i = 0; i < total; i++) {
        const isLast      = (i >= numFull);
        const rawDepth_mm = isLast ? remain : RIDGE_CAP_EXPOSED_MM;
        const capDepth_mm = rawDepth_mm - CAP_GAP_MM;
        if (capDepth_mm < 10) continue;

        // Distance along hip ridge to cap centre
        const s_mm = (i * RIDGE_CAP_EXPOSED_MM) + rawDepth_mm / 2;
        const frac = s_mm / hipLen;  // 0 at corner, 1 at ridge end

        // Interpolate position
        const cx_mm = hip.cornerX + frac * (hip.ridgeX - hip.cornerX);
        const cy_mm = hipBotY_mm  + frac * (hipTopY_mm - hipBotY_mm);
        const cz_mm = hip.cornerZ + frac * (hip.ridgeZ - hip.cornerZ);

        // Each cap has two wings (left/right of the hip ridge)
        // Wings slope down perpendicular to the hip ridge direction.
        // For simplicity, use a single flat box per cap rotated to the hip slope.
        const mesh = BABYLON.MeshBuilder.CreateBox(
          `${prefix}ridgecap-hip-${hip.name}-${i}`, {
            width:  (RIDGE_CAP_WING_MM * 2) / 1000,  // full width across both wings
            height: RIDGE_CAP_THK_MM / 1000,
            depth:  capDepth_mm / 1000,
          }, scene
        );

        mesh.parent = roofRoot;
        mesh.position = new BABYLON.Vector3(cx_mm / 1000, cy_mm / 1000, cz_mm / 1000);

        // Align cap along the hip ridge:
        // 1. Y-rotation aligns box depth (local Z) with hip plan direction
        // 2. X-rotation tilts up the slope
        // Order: first Y (plan), then X (tilt) = qX * qY in quaternion math
        const yRot = -(planAngle - Math.PI / 2);
        const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yRot);
        const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, hipSlopeAng);
        mesh.rotationQuaternion = qX.multiply(qY);

        mesh.material = ridgeCapMat;
        mesh.metadata = { dynamic: true, roofTiles: true, layer: "ridgeCaps", type: "hip", hip: hip.name };

        result.ridgeCaps.push(mesh);
      }
    }

    console.log(`[ROOF-TILES] Hipped hip ridges: ${result.ridgeCaps.length - (ridgeLen_mm > 0 ? result.ridgeCaps.filter(m => m.metadata?.type === "main").length : 0)} hip cap pieces`);
  }

  const totalMeshes = result.membrane.length + result.battens.length + result.tiles.length + result.ridgeCaps.length;
  console.log(`[ROOF-TILES] Hipped TOTAL: ${totalMeshes} meshes`);
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
  for (const name of ["roofTiles-ridgeCap", "roofTiles-slate"]) {
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
