/**
 * skylights.js - Roof skylight geometry builder for parametric shed
 *
 * Places glazed openings on roof slopes. Skylights are positioned using
 * wall-referenced coordinates so they don't move when overhangs change:
 *   x_mm = distance from left wall along eaves direction
 *   y_mm = distance up from wall plate along the slope
 *
 * Supports apex (front/back), pent (single face), and hipped (all four faces).
 *
 * All dimensions in millimeters.
 *
 * @module elements/skylights
 */

import { CONFIG, resolveDims } from "../params.js";

// ── Constants ──────────────────────────────────────────────────────────────
const FRAME_THK_MM  = 35;   // Frame section thickness
const FRAME_DEPTH_MM = 60;  // Frame depth (protrudes above roof surface)
const GLASS_THK_MM  = 10;   // Glass pane thickness
const SURFACE_OFFSET_MM = 5; // Lift above roof surface to prevent z-fighting
const MIN_EDGE_GAP_MM = 30; // Minimum gap from skylight edge to ridge/eaves

/**
 * Clamp a skylight's height so it can't extend past the ridge or below the eaves.
 * Both the mesh builder and opening calculator must use this to stay aligned.
 *
 * @param {number} skyY_mm   - Distance up from wall plate along slope
 * @param {number} skyH_mm   - Requested height (along slope)
 * @param {number} slopeLen  - Total slope length (eaves to ridge)
 * @returns {{y: number, h: number}} Clamped y and height values
 */
function clampSkylightToSlope(skyY_mm, skyH_mm, slopeLen) {
  const maxY = Math.max(0, slopeLen - MIN_EDGE_GAP_MM);
  const y = Math.min(skyY_mm, maxY);
  // Top edge can't go beyond ridge (slopeLen - MIN_EDGE_GAP_MM)
  const maxH = Math.max(50, slopeLen - y - MIN_EDGE_GAP_MM);
  const h = Math.min(skyH_mm, maxH);
  return { y, h: Math.max(50, h) };
}

/**
 * Get skylight opening rectangles in slope-local coordinates for the roof builder.
 * Used by roof.js to split OSB/covering panels around skylight openings.
 *
 * Coordinate system matches the OSB builder:
 *   a = distance down slope from ridge (0 = ridge edge)
 *   b = distance along ridge from front edge (0 = front verge)
 *
 * @param {Object} state - Building state
 * @param {string} side  - "L" (front/left slope) or "R" (back/right slope)
 * @returns {Array<{a0_mm: number, b0_mm: number, aLen_mm: number, bLen_mm: number}>}
 */
export function getSkylightOpenings(state, side) {
  const skylights = Array.isArray(state.roof?.skylights) ? state.roof.skylights : [];
  const active = skylights.filter(s => s && s.enabled !== false);
  if (active.length === 0) return [];

  const roofStyle = state.roof?.style || "apex";
  if (roofStyle !== "apex") return []; // TODO: support pent/hipped later

  const dims = resolveDims(state);
  const ovh = dims?.overhang || { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };
  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const roofW_mm  = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const f_mm = Math.max(0, Math.floor(Number(ovh.f_mm || 0)));

  const apex = state.roof?.apex || {};
  const eavesH = Number(apex.heightToEaves_mm || apex.eavesHeight_mm || apex.eaves_mm) || 1850;
  const crestH = Number(apex.heightToCrest_mm || apex.crestHeight_mm || apex.crest_mm) || 2200;
  const halfSpan = roofW_mm / 2;
  const OSB_THK = 18;
  const delta = Math.max(OSB_THK, Math.floor(crestH - eavesH));
  const rise_mm = solveRise(delta, halfSpan, OSB_THK);
  const rafterLen_mm = Math.round(Math.sqrt(halfSpan * halfSpan + rise_mm * rise_mm));

  const openings = [];

  for (const sky of active) {
    const face = sky.face || "front";
    // Front slope = "L", Back slope = "R"
    if (side === "L" && face !== "front") continue;
    if (side === "R" && face !== "back") continue;

    const skyX_mm = Math.max(0, Math.floor(sky.x_mm || 0));
    const rawY = Math.max(0, Math.floor(sky.y_mm || 300));
    const skyW_mm = Math.max(100, Math.floor(sky.width_mm || 600));
    const rawH = Math.max(100, Math.floor(sky.height_mm || 800));

    // Clamp to slope — same function used by mesh builder
    const clamped = clampSkylightToSlope(rawY, rawH, rafterLen_mm);
    const skyY_mm = clamped.y;
    const skyH_mm = clamped.h;

    // Convert to slope-local OSB coords:
    //   a = distance from ridge down slope (a=0 at ridge)
    //   b = distance along ridge from front verge (b=0 at front edge)
    // Top of skylight is at skyY + skyH from eaves = rafterLen - (skyY+skyH) from ridge
    const a0 = rafterLen_mm - (skyY_mm + skyH_mm);
    const b0 = f_mm + skyX_mm;

    if (skyH_mm < 50) continue;

    openings.push({
      a0_mm: a0,
      b0_mm: b0,
      aLen_mm: skyH_mm,
      bLen_mm: skyW_mm
    });
  }

  return openings;
}

/**
 * Build all skylight meshes for the current building state.
 *
 * @param {Object}  state          – The building state
 * @param {Object}  ctx            – { scene, materials }
 * @param {Object} [sectionCtx]    – Optional section context { sectionId, position }
 * @param {Object} [roofShift]     – { x, y, z } mm offset already applied to roof meshes
 */
export function build3D(state, ctx, sectionCtx, roofShift) {
  const { scene, materials } = ctx || {};
  if (!scene) return;

  const sectionId  = sectionCtx?.sectionId;
  const sectionPos = sectionCtx?.position || { x: 0, y: 0, z: 0 };
  const meshPrefix = sectionId ? `section-${sectionId}-` : "";

  // Find the roof-root TransformNode so skylights can be parented to it
  // (roof meshes live in roof-root local space, not world space)
  const roofRootName = meshPrefix ? `${meshPrefix}roof-root` : "roof-root";
  const roofRoot = (scene.transformNodes || []).find(
    n => n.name === roofRootName
  ) || null;

  // ── Dispose previous skylight meshes ──
  const prefix = meshPrefix + "roof-skylight-";
  for (let i = scene.meshes.length - 1; i >= 0; i--) {
    const m = scene.meshes[i];
    if (m && m.metadata?.dynamic && typeof m.name === "string" && m.name.startsWith(prefix)) {
      if (!m.isDisposed()) m.dispose(false, true);
    }
  }
  // Dispose transform nodes too
  for (let i = (scene.transformNodes || []).length - 1; i >= 0; i--) {
    const n = scene.transformNodes[i];
    if (n && n.metadata?.dynamic && typeof n.name === "string" && n.name.startsWith(prefix)) {
      if (!n.isDisposed()) n.dispose(false, false);
    }
  }

  // ── Read skylight definitions ──
  const skylights = Array.isArray(state.roof?.skylights) ? state.roof.skylights : [];
  const active = skylights.filter(s => s && s.enabled !== false);
  if (active.length === 0) return;

  // ── Resolve roof geometry ──
  const roofStyle = state.roof?.style || "apex";
  const dims = resolveDims(state);
  const ovh = dims?.overhang || { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };

  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 1)));
  const roofW_mm  = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const roofD_mm  = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? frameD_mm)));

  const l_mm = Math.max(0, Math.floor(Number(ovh.l_mm || 0)));
  const r_mm = Math.max(0, Math.floor(Number(ovh.r_mm || 0)));
  const f_mm = Math.max(0, Math.floor(Number(ovh.f_mm || 0)));
  const b_mm = Math.max(0, Math.floor(Number(ovh.b_mm || 0)));

  // ── Ensure materials ──
  ensureSkylightMaterials(scene);
  const mats = scene._skylightMaterials;

  // ── Build per roof style ──
  if (roofStyle === "apex") {
    buildApexSkylights(active, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
      frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm, roofRoot);
  } else if (roofStyle === "pent") {
    buildPentSkylights(active, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
      frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm, roofRoot);
  } else if (roofStyle === "hipped") {
    buildHippedSkylights(active, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
      frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm, roofRoot);
  }

  // ── Cut openings through roof surfaces (OSB + covering) ──
  // DISABLED: CSG subtraction corrupts/destroys roof meshes (bakeCurrentTransform
  // + reparent cycle fails for rotated slope geometry).  Skylight frame sitting
  // on top of the roof surface looks fine without actual cutouts.
  // TODO: revisit with Babylon.js MeshBuilder boolean ops if needed later.
  // cutRoofOpenings(scene, meshPrefix, roofRoot);
}

// ════════════════════════════════════════════════════════════════════════════
// APEX SKYLIGHTS
// ════════════════════════════════════════════════════════════════════════════

function buildApexSkylights(skylights, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
    frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm, roofRoot) {

  const A_mm = roofW_mm;   // span axis (X)
  const B_mm = roofD_mm;   // ridge axis (Z)
  const halfSpan = A_mm / 2;

  // Resolve apex heights
  const apex = state.roof?.apex || {};
  const eavesH = Number(apex.heightToEaves_mm || apex.eavesHeight_mm || apex.eaves_mm) || 1850;
  const crestH = Number(apex.heightToCrest_mm || apex.crestHeight_mm || apex.crest_mm) || 2200;

  // Rise from eaves to ridge (simplified — matches roof.js logic)
  const OSB_THK = 18;
  const delta = Math.max(OSB_THK, Math.floor(crestH - eavesH));
  const rise_mm = solveRise(delta, halfSpan, OSB_THK);

  const slopeAng = Math.atan2(rise_mm, halfSpan);
  const slopeLen = Math.sqrt(halfSpan * halfSpan + rise_mm * rise_mm);

  // Normal offset from rafter slope baseline to roof outer surface.
  // In roof-root local space, rafter slopes start above Y=0 (the tie beam
  // sits at Y≈tieBeamDepth, and OSB/covering are stacked outward from there).
  // The full perpendicular stack is: tieBeamDepth (projected onto slope normal)
  // + rafterDepth + osbClear + osbThk + coveringThk + gap.
  // In practice, the tie beam centre Y ≈ 190mm in roof-root local space for
  // standard timber, so we account for that as a Y-direction offset on the slope.
  const rafterD = Number(state.frame?.thickness_mm) || Number(CONFIG.frame?.thickness_mm) || 50;
  const frameD  = Number(state.frame?.depth_mm)     || Number(CONFIG.frame?.depth_mm)     || 75;
  const COVERING_THK = 2;
  const OSB_CLEAR = 1;
  // Perpendicular offset from slope centreline to above outer surface
  const normalOffset_mm = rafterD + OSB_CLEAR + OSB_THK + COVERING_THK + SURFACE_OFFSET_MM;
  // Additional Y offset to match where tie beams / slope actually starts in roof-root space
  // (tie beams are not at Y=0, they sit at approximately tieBeamCentreY = frameD/2 + wallPlate stack)
  const tieBaseY_mm = frameD * 2 + rafterD / 2; // empirical: ~175-200mm for standard 75x50 timber

  skylights.forEach((sky, idx) => {
    const face = sky.face || "front";
    if (face !== "front" && face !== "back") return; // apex only has front/back

    // Wall-referenced coordinates
    const skyX_mm = Math.max(0, Math.floor(sky.x_mm || 0));     // from left wall
    const rawY = Math.max(0, Math.floor(sky.y_mm || 300));       // up from wall plate
    const skyW_mm = Math.max(100, Math.floor(sky.width_mm || 600));
    const rawH = Math.max(100, Math.floor(sky.height_mm || 800));

    // Clamp to slope — same function used by getSkylightOpenings
    const clamped = clampSkylightToSlope(rawY, rawH, slopeLen);
    const skyY_mm = clamped.y;
    const skyH_mm = clamped.h;

    const roofLocalZ = f_mm + skyX_mm;

    // The skylight center on the slope (using clamped values)
    const centerAlongSlope = skyY_mm + skyH_mm / 2;
    const cHoriz = centerAlongSlope * Math.cos(slopeAng);
    const cVert  = centerAlongSlope * Math.sin(slopeAng);

    // Offset perpendicular to slope surface (pushes skylight outward above OSB)
    // Normal direction: (-sin(slopeAng), cos(slopeAng)) for front, (sin, cos) for back
    const nX = (face === "front") ? -Math.sin(slopeAng) : Math.sin(slopeAng);
    const nY = Math.cos(slopeAng);

    let cx, cy;
    if (face === "front") {
      cx = cHoriz + nX * normalOffset_mm;
      cy = cVert  + nY * normalOffset_mm + tieBaseY_mm;
    } else {
      cx = A_mm - cHoriz + nX * normalOffset_mm;
      cy = cVert + nY * normalOffset_mm + tieBaseY_mm;
    }

    const cz = roofLocalZ + skyW_mm / 2;

    // Determine rotation — skylight lies on the slope
    // Front slope tilts backward (positive rotation around Z axis)
    // Back slope tilts forward (negative rotation)
    const tiltAngle = (face === "front") ? slopeAng : -slopeAng;

    buildSkylightMesh(scene, sky, idx, meshPrefix, sectionPos, sectionId, mats,
      cx, cy, cz, skyW_mm, skyH_mm, tiltAngle, face, "apex", roofRoot);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PENT SKYLIGHTS
// ════════════════════════════════════════════════════════════════════════════

function buildPentSkylights(skylights, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
    frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm, roofRoot) {

  const A_mm = roofW_mm;   // slope runs along width (X)
  const B_mm = roofD_mm;

  const pent = state.roof?.pent || {};
  const maxH = Number(pent.maxHeight_mm) || 2500;
  const minH = Number(pent.minHeight_mm) || 2300;
  const rise_mm = Math.max(0, maxH - minH);
  const run_mm = A_mm;

  const slopeAng = Math.atan2(rise_mm, run_mm);

  skylights.forEach((sky, idx) => {
    // Pent has only one face — ignore face selector
    const skyX_mm = Math.max(0, Math.floor(sky.x_mm || 0));
    const skyY_mm = Math.max(0, Math.floor(sky.y_mm || 300));
    const skyW_mm = Math.max(100, Math.floor(sky.width_mm || 600));
    const skyH_mm = Math.max(100, Math.floor(sky.height_mm || 800));

    // X along eaves (Z in roof local = depth direction)
    const roofLocalZ = f_mm + skyX_mm + skyW_mm / 2;

    // Y up slope from high edge (X=0 is high edge for pent)
    const centerAlongSlope = skyY_mm + skyH_mm / 2;
    const cHoriz = centerAlongSlope * Math.cos(slopeAng);
    const cVert  = centerAlongSlope * Math.sin(slopeAng);

    // Pent: high edge at X=0, slopes down to X=A_mm
    // So skylight goes from high side downward
    const cx = cHoriz;
    const cy = -cVert; // slopes downward
    const cz = roofLocalZ;

    // Pent tilts downward (negative slope)
    const tiltAngle = -slopeAng;

    buildSkylightMesh(scene, sky, idx, meshPrefix, sectionPos, sectionId, mats,
      cx, cy, cz, skyW_mm, skyH_mm, tiltAngle, "pent", "pent", roofRoot);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// HIPPED SKYLIGHTS
// ════════════════════════════════════════════════════════════════════════════

function buildHippedSkylights(skylights, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
    frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm, roofRoot) {

  // Hipped roof: main slopes (front/back) + hip triangles (left/right)
  // Main slopes are like apex but with shortened ridge
  const A_mm = roofW_mm;
  const B_mm = roofD_mm;
  const halfSpan = A_mm / 2;

  const apex = state.roof?.apex || {};
  const eavesH = Number(apex.heightToEaves_mm || apex.eavesHeight_mm || apex.eaves_mm) || 1850;
  const crestH = Number(apex.heightToCrest_mm || apex.crestHeight_mm || apex.crest_mm) || 2200;

  const OSB_THK = 18;
  const delta = Math.max(OSB_THK, Math.floor(crestH - eavesH));
  const rise_mm = solveRise(delta, halfSpan, OSB_THK);

  const mainSlopeAng = Math.atan2(rise_mm, halfSpan);

  // Hip triangles: rise is the same, but run is along depth axis
  // Hip run = halfSpan (the hip ridge shortens by halfSpan on each end)
  const hipRun = halfSpan; // From eaves corner to where ridge starts
  const hipSlopeAng = Math.atan2(rise_mm, hipRun);

  skylights.forEach((sky, idx) => {
    const face = sky.face || "front";
    const skyX_mm = Math.max(0, Math.floor(sky.x_mm || 0));
    const skyY_mm = Math.max(0, Math.floor(sky.y_mm || 300));
    const skyW_mm = Math.max(100, Math.floor(sky.width_mm || 600));
    const skyH_mm = Math.max(100, Math.floor(sky.height_mm || 800));

    if (face === "front" || face === "back") {
      // Main slopes — same as apex
      const slopeAng = mainSlopeAng;
      const centerAlongSlope = skyY_mm + skyH_mm / 2;
      const cHoriz = centerAlongSlope * Math.cos(slopeAng);
      const cVert  = centerAlongSlope * Math.sin(slopeAng);

      const roofLocalZ = f_mm + skyX_mm + skyW_mm / 2;

      let cx, cy;
      if (face === "front") {
        cx = cHoriz;
        cy = cVert;
      } else {
        cx = A_mm - cHoriz;
        cy = cVert;
      }

      const tiltAngle = (face === "front") ? slopeAng : -slopeAng;

      buildSkylightMesh(scene, sky, idx, meshPrefix, sectionPos, sectionId, mats,
        cx, cy, roofLocalZ, skyW_mm, skyH_mm, tiltAngle, face, "hipped", roofRoot);

    } else if (face === "left" || face === "right") {
      // Hip triangle slopes
      // These slope from eaves (at the end wall) up to the ridge endpoint
      const slopeAng = hipSlopeAng;
      const centerAlongSlope = skyY_mm + skyH_mm / 2;
      const cHoriz = centerAlongSlope * Math.cos(slopeAng);
      const cVert  = centerAlongSlope * Math.sin(slopeAng);

      // For left hip: eaves at Z=0, slopes toward Z=halfSpan (where ridge starts)
      // For right hip: eaves at Z=B_mm, slopes toward Z=B_mm-halfSpan
      // X position is centered (at halfSpan) adjusted by skyX_mm
      const roofLocalX = l_mm + skyX_mm + skyW_mm / 2;

      let cz;
      if (face === "left") {
        cz = cHoriz;
      } else {
        cz = B_mm - cHoriz;
      }

      const tiltAngle = (face === "left") ? slopeAng : -slopeAng;

      // Hip skylights are rotated 90° around Y vs main slopes
      buildSkylightMeshHip(scene, sky, idx, meshPrefix, sectionPos, sectionId, mats,
        roofLocalX, cVert, cz, skyW_mm, skyH_mm, tiltAngle, face, roofRoot);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MESH BUILDERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a single skylight on a main slope (front/back for apex/hipped, or pent).
 * The skylight frame lies on the slope surface, tilted by tiltAngle around the Z axis.
 */
function buildSkylightMesh(scene, sky, idx, meshPrefix, sectionPos, sectionId, mats,
    cx_mm, cy_mm, cz_mm, width_mm, height_mm, tiltAngle, face, roofType, roofRoot) {

  const name = `${meshPrefix}roof-skylight-${idx}`;
  const meta = { dynamic: true, sectionId: sectionId || null, skylight: true, face, roofType };

  // Parent transform — positioned in roof-local coordinates
  const group = new BABYLON.TransformNode(`${name}-group`, scene);
  group.metadata = meta;
  // Position in roof-local space (same coordinate system as OSB panels, trusses, etc.)
  group.position = new BABYLON.Vector3(
    (sectionPos.x + cx_mm) / 1000,
    (sectionPos.y + cy_mm) / 1000,
    (sectionPos.z + cz_mm) / 1000
  );
  // Parent to roof-root so skylight inherits the roof's world position
  if (roofRoot) group.parent = roofRoot;

  // Tilt to match roof slope (rotate around Z axis for main slopes)
  // Front slope: positive tilt (leans back)
  // Back slope: negative tilt (leans forward)
  group.rotation = new BABYLON.Vector3(0, 0, tiltAngle);

  // Offset above roof surface
  const surfaceNormalY = SURFACE_OFFSET_MM / 1000;

  // Build frame (4 pieces around the opening)
  const fw = FRAME_THK_MM;
  const fd = FRAME_DEPTH_MM;
  const innerW = width_mm - fw * 2;
  const innerH = height_mm - fw * 2;

  // The skylight lies in the slope plane:
  // local X = along the slope (height_mm direction)
  // local Z = across the slope (width_mm direction, along eaves)
  // local Y = normal to slope surface (protrudes upward)

  // Top rail (upslope)
  mkFrame(scene, `${name}-frame-top`, fw, fd, width_mm,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    (height_mm / 2 - fw / 2) / 1000, 0, 0,
    group, mats.frame, meta);

  // Bottom rail (downslope)
  mkFrame(scene, `${name}-frame-bottom`, fw, fd, width_mm,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    -(height_mm / 2 - fw / 2) / 1000, 0, 0,
    group, mats.frame, meta);

  // Left stile
  mkFrame(scene, `${name}-frame-left`, innerH, fd, fw,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    0, 0, -(width_mm / 2 - fw / 2) / 1000,
    group, mats.frame, meta);

  // Right stile
  mkFrame(scene, `${name}-frame-right`, innerH, fd, fw,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    0, 0, (width_mm / 2 - fw / 2) / 1000,
    group, mats.frame, meta);

  // Glass pane
  const glass = BABYLON.MeshBuilder.CreateBox(`${name}-glass`, {
    width: innerH / 1000,     // along slope
    height: GLASS_THK_MM / 1000,
    depth: innerW / 1000      // across slope (along eaves)
  }, scene);
  glass.position = new BABYLON.Vector3(0, surfaceNormalY + GLASS_THK_MM / 2 / 1000, 0);
  glass.parent = group;
  glass.material = mats.glass;
  glass.metadata = Object.assign({}, meta);
}

/**
 * Build a skylight on a hip triangle (left/right).
 * These are rotated 90° vs main slopes — tilt is around X axis.
 */
function buildSkylightMeshHip(scene, sky, idx, meshPrefix, sectionPos, sectionId, mats,
    cx_mm, cy_mm, cz_mm, width_mm, height_mm, tiltAngle, face, roofRoot) {

  const name = `${meshPrefix}roof-skylight-${idx}`;
  const meta = { dynamic: true, sectionId: sectionId || null, skylight: true, face, roofType: "hipped" };

  const group = new BABYLON.TransformNode(`${name}-group`, scene);
  group.metadata = meta;
  group.position = new BABYLON.Vector3(
    (sectionPos.x + cx_mm) / 1000,
    (sectionPos.y + cy_mm) / 1000,
    (sectionPos.z + cz_mm) / 1000
  );
  if (roofRoot) group.parent = roofRoot;

  // Hip slopes tilt around X axis
  group.rotation = new BABYLON.Vector3(tiltAngle, 0, 0);

  const surfaceNormalY = SURFACE_OFFSET_MM / 1000;
  const fw = FRAME_THK_MM;
  const fd = FRAME_DEPTH_MM;
  const innerW = width_mm - fw * 2;
  const innerH = height_mm - fw * 2;

  // Top rail
  mkFrame(scene, `${name}-frame-top`, fw, fd, width_mm,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    0, 0, (height_mm / 2 - fw / 2) / 1000,
    group, mats.frame, meta);

  // Bottom rail
  mkFrame(scene, `${name}-frame-bottom`, fw, fd, width_mm,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    0, 0, -(height_mm / 2 - fw / 2) / 1000,
    group, mats.frame, meta);

  // Left stile
  mkFrame(scene, `${name}-frame-left`, innerH, fd, fw,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    -(width_mm / 2 - fw / 2) / 1000, 0, 0,
    group, mats.frame, meta);

  // Right stile
  mkFrame(scene, `${name}-frame-right`, innerH, fd, fw,
    0, surfaceNormalY + fd / 2 / 1000, 0,
    (width_mm / 2 - fw / 2) / 1000, 0, 0,
    group, mats.frame, meta);

  // Glass pane (rotated for hip orientation)
  const glass = BABYLON.MeshBuilder.CreateBox(`${name}-glass`, {
    width: innerW / 1000,     // across hip
    height: GLASS_THK_MM / 1000,
    depth: innerH / 1000      // along hip slope
  }, scene);
  glass.position = new BABYLON.Vector3(0, surfaceNormalY + GLASS_THK_MM / 2 / 1000, 0);
  glass.parent = group;
  glass.material = mats.glass;
  glass.metadata = Object.assign({}, meta);
}

// ════════════════════════════════════════════════════════════════════════════
// CSG ROOF CUTTING
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cut openings through roof OSB and covering meshes using CSG subtraction.
 * Finds all skylight groups, creates cutter boxes at their positions,
 * and subtracts from roof surface meshes.
 */
function cutRoofOpenings(scene, meshPrefix, roofRoot) {
  const hasCSG = typeof BABYLON !== "undefined" && BABYLON.CSG && typeof BABYLON.CSG.FromMesh === "function";
  if (!hasCSG) { console.warn("[SKYLIGHTS] CSG not available, cannot cut roof openings"); return; }

  // Find all skylight groups
  const skyGroups = (scene.transformNodes || []).filter(
    n => n.metadata?.skylight && n.name?.startsWith(meshPrefix + "roof-skylight-")
  );
  if (skyGroups.length === 0) return;

  // Find roof meshes to cut (OSB panels + covering)
  const roofMeshes = scene.meshes.filter(m => {
    if (!m.metadata?.dynamic) return false;
    const n = m.name || "";
    return (n.includes("osb") || n.includes("covering")) && n.startsWith(meshPrefix + "roof-");
  });
  if (roofMeshes.length === 0) return;

  // For each skylight, determine which roof meshes it overlaps and cut them
  for (const grp of skyGroups) {
    const face = grp.metadata.face;
    // Read the skylight's inner dimensions from its child glass pane
    const glassMesh = scene.meshes.find(m => m.parent === grp && m.name?.includes("glass"));
    if (!glassMesh) continue;

    // The glass bounding box gives us the opening size
    const glassBB = glassMesh.getBoundingInfo().boundingBox;
    const openW = (glassBB.maximum.x - glassBB.minimum.x) * 1000 + FRAME_THK_MM; // slightly larger than glass
    const openH = (glassBB.maximum.z - glassBB.minimum.z) * 1000 + FRAME_THK_MM;

    // Cutter must be large enough to pierce through the entire roof stack.
    // It needs to be oriented to match the slope (same rotation as the skylight group).
    // Strategy: create a box in the group's local space, then bake its world matrix
    // for CSG operations.

    const CUT_DEPTH_MM = 200; // deep enough to cut through OSB + covering + clearance

    // Create temporary cutter box as child of the skylight group (inherits rotation + position)
    const cutter = BABYLON.MeshBuilder.CreateBox("__skylight_cutter__", {
      width: openW / 1000,        // along slope (height direction)
      height: CUT_DEPTH_MM / 1000, // perpendicular to slope (cuts through roof stack)
      depth: openH / 1000          // across slope (width direction)
    }, scene);
    cutter.parent = grp;
    cutter.position = BABYLON.Vector3.Zero();
    // Bake the world transform so CSG sees correct positions
    cutter.computeWorldMatrix(true);
    cutter.bakeCurrentTransformIntoVertices();
    cutter.parent = null;

    // Determine which side (L/R) this skylight is on
    const isLeftSlope = (face === "front");
    const isRightSlope = (face === "back");

    // Cut each relevant roof mesh
    for (const roofMesh of roofMeshes) {
      const rn = roofMesh.name || "";
      // Only cut meshes on the matching slope side
      if (isLeftSlope && !rn.includes("-L")) continue;
      if (isRightSlope && !rn.includes("-R")) continue;

      // Check if this mesh's bounding box overlaps the cutter
      roofMesh.computeWorldMatrix(true);
      cutter.computeWorldMatrix(true);

      try {
        // Temporarily remove parent from roof mesh for CSG (needs world coords)
        const origParent = roofMesh.parent;
        const origPos = roofMesh.position.clone();
        const origRot = roofMesh.rotation?.clone();
        const origRotQ = roofMesh.rotationQuaternion?.clone();

        roofMesh.bakeCurrentTransformIntoVertices();
        roofMesh.parent = null;

        const baseCSG = BABYLON.CSG.FromMesh(roofMesh);
        const cutCSG = BABYLON.CSG.FromMesh(cutter);
        const resultCSG = baseCSG.subtract(cutCSG);

        const resultMesh = resultCSG.toMesh(rn, roofMesh.material, scene, false);
        resultMesh.metadata = Object.assign({}, roofMesh.metadata);

        // Re-parent result mesh
        if (origParent) resultMesh.parent = origParent;

        // Dispose original
        if (!roofMesh.isDisposed()) roofMesh.dispose(false, true);
      } catch (e) {
        console.warn("[SKYLIGHTS] CSG cut failed for", rn, e.message);
      }
    }

    // Dispose cutter
    if (!cutter.isDisposed()) cutter.dispose(false, true);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function mkFrame(scene, name, lengthX_mm, heightY_mm, depthZ_mm,
    pivotX, pivotY, pivotZ, offX, offY, offZ, parent, mat, meta) {
  const mesh = BABYLON.MeshBuilder.CreateBox(name, {
    width: lengthX_mm / 1000,
    height: heightY_mm / 1000,
    depth: depthZ_mm / 1000
  }, scene);
  mesh.position = new BABYLON.Vector3(pivotX + offX, pivotY + offY, pivotZ + offZ);
  mesh.parent = parent;
  mesh.material = mat;
  mesh.metadata = Object.assign({}, meta);
  return mesh;
}

function ensureSkylightMaterials(scene) {
  if (scene._skylightMaterials) return;
  scene._skylightMaterials = {};

  // Frame — dark aluminium grey
  const frameMat = new BABYLON.StandardMaterial("skylightFrameMat", scene);
  frameMat.diffuseColor = new BABYLON.Color3(0.25, 0.25, 0.28);
  frameMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
  scene._skylightMaterials.frame = frameMat;

  // Glass — matches window glass style: light blue, semi-transparent (see-through)
  const glassMat = new BABYLON.StandardMaterial("skylightGlassMat", scene);
  glassMat.diffuseColor = new BABYLON.Color3(0.6, 0.75, 0.85);
  glassMat.alpha = 0.35;
  glassMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
  glassMat.specularPower = 64;
  glassMat.backFaceCulling = false; // visible from both sides
  scene._skylightMaterials.glass = glassMat;
}

/**
 * Solve rise from delta (crest - eaves) given half-span and OSB thickness.
 * Matches the binary search in roof.js buildApex.
 */
function solveRise(delta, halfSpan, osbThk) {
  const target = Math.max(osbThk, Math.floor(delta));
  const f = (r) => {
    const rr = Math.max(0, Number(r));
    const den = Math.sqrt(halfSpan * halfSpan + rr * rr);
    const cosT = den > 1e-6 ? (halfSpan / den) : 1;
    return rr + (cosT * osbThk);
  };
  let lo = 0;
  let hi = Math.max(target + 2000, 1);
  for (let it = 0; it < 32; it++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= target) hi = mid;
    else lo = mid;
  }
  return Math.max(0, Math.floor(hi));
}

// ════════════════════════════════════════════════════════════════════════════
// BOM
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate BOM entries for skylights.
 */
export function updateBOM(state) {
  const sections = [];
  const skylights = Array.isArray(state.roof?.skylights) ? state.roof.skylights : [];
  const active = skylights.filter(s => s && s.enabled !== false);

  if (active.length === 0) return { sections: [] };

  sections.push(["SKYLIGHTS", "", "", "", "", ""]);

  active.forEach((sky, idx) => {
    const w = Math.max(100, Math.floor(sky.width_mm || 600));
    const h = Math.max(100, Math.floor(sky.height_mm || 800));
    const face = sky.face || "front";

    sections.push([`  Skylight ${idx + 1}`, "", "", "", "", `Face: ${face}, ${w}×${h}mm`]);

    // Frame pieces
    sections.push([`    Frame Rails`, 2, w, FRAME_THK_MM, FRAME_DEPTH_MM, "Top and bottom"]);
    sections.push([`    Frame Stiles`, 2, h - FRAME_THK_MM * 2, FRAME_THK_MM, FRAME_DEPTH_MM, "Left and right"]);

    // Glass
    const glassW = w - FRAME_THK_MM * 2;
    const glassH = h - FRAME_THK_MM * 2;
    sections.push([`    Glass Pane`, 1, glassH, glassW, GLASS_THK_MM, "Toughened glass"]);
  });

  return { sections };
}
