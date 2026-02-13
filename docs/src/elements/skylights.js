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

/**
 * Build all skylight meshes for the current building state.
 *
 * @param {Object}  state          – The building state
 * @param {Object}  ctx            – { scene, materials }
 * @param {Object} [sectionCtx]    – Optional section context { sectionId, position }
 */
export function build3D(state, ctx, sectionCtx) {
  const { scene, materials } = ctx || {};
  if (!scene) return;

  const sectionId  = sectionCtx?.sectionId;
  const sectionPos = sectionCtx?.position || { x: 0, y: 0, z: 0 };
  const meshPrefix = sectionId ? `section-${sectionId}-` : "";

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
      frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm);
  } else if (roofStyle === "pent") {
    buildPentSkylights(active, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
      frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm);
  } else if (roofStyle === "hipped") {
    buildHippedSkylights(active, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
      frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// APEX SKYLIGHTS
// ════════════════════════════════════════════════════════════════════════════

function buildApexSkylights(skylights, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
    frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm) {

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

  skylights.forEach((sky, idx) => {
    const face = sky.face || "front";
    if (face !== "front" && face !== "back") return; // apex only has front/back

    // Wall-referenced coordinates
    const skyX_mm = Math.max(0, Math.floor(sky.x_mm || 0));     // from left wall
    const skyY_mm = Math.max(0, Math.floor(sky.y_mm || 300));    // up from wall plate
    const skyW_mm = Math.max(100, Math.floor(sky.width_mm || 600));
    const skyH_mm = Math.max(100, Math.floor(sky.height_mm || 800));

    // Convert wall-referenced X to roof-local X
    // Wall starts at overhang l_mm in roof coords
    // Ridge runs along Z, so skylight X is along the eaves
    const roofLocalZ = f_mm + skyX_mm;

    // Convert wall-referenced Y (up from wall plate, along slope) to roof-local position
    // The slope starts at the eaves (at the wall plate).
    // y_mm is the distance along the slope surface from the eaves.
    // We need to find the position on the sloped surface.

    // For front slope: eaves is at X=0 (roof local), ridge at X=halfSpan
    // For back slope: eaves is at X=A_mm, ridge at X=halfSpan
    // Distance along slope from eaves = skyY_mm
    // Horizontal component = skyY_mm * cos(slopeAng)
    // Vertical component = skyY_mm * sin(slopeAng)

    const horizDist = skyY_mm * Math.cos(slopeAng);
    const vertDist  = skyY_mm * Math.sin(slopeAng);

    let roofLocalX, pivotY;

    if (face === "front") {
      // Front slope goes from X=0 (eaves) up to X=halfSpan (ridge)
      // Eaves is at the bottom, skylight positioned up the slope
      roofLocalX = horizDist;
      pivotY = vertDist;
    } else {
      // Back slope goes from X=A_mm (eaves) down to X=halfSpan (ridge)
      roofLocalX = A_mm - horizDist;
      pivotY = vertDist;
    }

    // The skylight center on the slope
    const centerAlongSlope = skyY_mm + skyH_mm / 2;
    const cHoriz = centerAlongSlope * Math.cos(slopeAng);
    const cVert  = centerAlongSlope * Math.sin(slopeAng);

    let cx, cy;
    if (face === "front") {
      cx = cHoriz;
      cy = cVert;
    } else {
      cx = A_mm - cHoriz;
      cy = cVert;
    }

    const cz = roofLocalZ + skyW_mm / 2;

    // Determine rotation — skylight lies on the slope
    // Front slope tilts backward (positive rotation around Z axis)
    // Back slope tilts forward (negative rotation)
    const tiltAngle = (face === "front") ? slopeAng : -slopeAng;

    buildSkylightMesh(scene, sky, idx, meshPrefix, sectionPos, sectionId, mats,
      cx, cy, cz, skyW_mm, skyH_mm, tiltAngle, face, "apex");
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PENT SKYLIGHTS
// ════════════════════════════════════════════════════════════════════════════

function buildPentSkylights(skylights, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
    frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm) {

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
      cx, cy, cz, skyW_mm, skyH_mm, tiltAngle, "pent", "pent");
  });
}

// ════════════════════════════════════════════════════════════════════════════
// HIPPED SKYLIGHTS
// ════════════════════════════════════════════════════════════════════════════

function buildHippedSkylights(skylights, state, scene, dims, meshPrefix, sectionPos, sectionId, mats,
    frameW_mm, frameD_mm, roofW_mm, roofD_mm, l_mm, r_mm, f_mm, b_mm) {

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
        cx, cy, roofLocalZ, skyW_mm, skyH_mm, tiltAngle, face, "hipped");

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
        roofLocalX, cVert, cz, skyW_mm, skyH_mm, tiltAngle, face);
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
    cx_mm, cy_mm, cz_mm, width_mm, height_mm, tiltAngle, face, roofType) {

  const name = `${meshPrefix}roof-skylight-${idx}`;
  const meta = { dynamic: true, sectionId: sectionId || null, skylight: true, face, roofType };

  // Parent transform — positioned in roof-local coordinates
  const group = new BABYLON.TransformNode(`${name}-group`, scene);
  group.metadata = meta;
  group.position = new BABYLON.Vector3(
    (sectionPos.x + cx_mm) / 1000,
    (sectionPos.y + cy_mm) / 1000,
    (sectionPos.z + cz_mm) / 1000
  );

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
    cx_mm, cy_mm, cz_mm, width_mm, height_mm, tiltAngle, face) {

  const name = `${meshPrefix}roof-skylight-${idx}`;
  const meta = { dynamic: true, sectionId: sectionId || null, skylight: true, face, roofType: "hipped" };

  const group = new BABYLON.TransformNode(`${name}-group`, scene);
  group.metadata = meta;
  group.position = new BABYLON.Vector3(
    (sectionPos.x + cx_mm) / 1000,
    (sectionPos.y + cy_mm) / 1000,
    (sectionPos.z + cz_mm) / 1000
  );

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

  // Glass — blue-tinted, semi-transparent
  const glassMat = new BABYLON.StandardMaterial("skylightGlassMat", scene);
  glassMat.diffuseColor = new BABYLON.Color3(0.55, 0.70, 0.82);
  glassMat.alpha = 0.45;
  glassMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
  glassMat.specularPower = 64;
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
