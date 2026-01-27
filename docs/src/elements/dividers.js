// FILE: docs/src/elements/dividers.js
/**
 * Internal Divider Panels
 * - Partition walls that divide internal space
 * - X-axis dividers run front-to-back (position is X coordinate)
 * - Z-axis dividers run left-to-right (position is Z coordinate)
 * - Support door openings within dividers
 * - Independent covering on each side (OSB, cladding, or none)
 */

import { resolveDims } from "../params.js";

// Constants matching walls.js
const STUD_W = 50;        // Stud width (same as walls)
const STUD_H = 75;        // Stud depth/thickness (basic wall profile)
const SPACING = 400;      // Stud spacing
const PLATE_Y = 50;       // Plate height
const OSB_THK = 18;       // OSB thickness
const CLAD_THK = 20;      // Cladding thickness
const WALL_RISE_MM = 168; // Same as walls - Y offset from floor

/**
 * Build internal divider panels.
 * @param {object} state - Full application state
 * @param {{scene: BABYLON.Scene, materials: object}} ctx - Babylon context
 * @param {object} sectionContext - Optional section context for multi-section mode
 */
export function build3D(state, ctx, sectionContext) {
  const { scene, materials } = ctx || {};
  if (!scene) return;

  const sectionId = sectionContext?.sectionId;
  const sectionPos = sectionContext?.position || { x: 0, y: 0, z: 0 };

  // Create section-aware mesh prefix
  const meshPrefix = sectionId ? `section-${sectionId}-` : "";
  const dividerPrefix = meshPrefix + "divider-";

  // Dispose existing divider meshes for this section
  const toDispose = [];
  for (let i = 0; i < (scene.meshes || []).length; i++) {
    const m = scene.meshes[i];
    if (!m) continue;
    const nm = String(m.name || "");
    if (nm.startsWith(dividerPrefix) && m.metadata && m.metadata.dynamic === true) {
      toDispose.push(m);
    }
  }
  for (let i = 0; i < toDispose.length; i++) {
    try {
      if (toDispose[i] && !toDispose[i].isDisposed()) {
        toDispose[i].dispose(false, true);
      }
    } catch (e) {}
  }

  // Get dividers from state
  const dividers = (state && state.dividers && Array.isArray(state.dividers.items))
    ? state.dividers.items
    : [];

  if (dividers.length === 0) return;

  // Resolve dimensions
  const dims = resolveDims(state);
  const variant = (state && state.walls && state.walls.variant) || "basic";
  const wallThk = variant === "insulated" ? 100 : 75;

  // Internal space boundaries (in frame coordinates)
  const internalOriginX = wallThk;
  const internalOriginZ = wallThk;
  const internalEndX = dims.frame.w_mm - wallThk;
  const internalEndZ = dims.frame.d_mm - wallThk;
  const internalW = internalEndX - internalOriginX;
  const internalD = internalEndZ - internalOriginZ;

  // Get roof info for height calculations
  const roofStyle = (state && state.roof && state.roof.style) ? state.roof.style : "apex";
  let eavesHeight = 2400;
  let crestHeight = 2400;
  let pentMinH = 2100;
  let pentMaxH = 2300;
  
  if (roofStyle === "apex" && state.roof && state.roof.apex) {
    eavesHeight = Number(state.roof.apex.heightToEaves_mm || state.roof.apex.eavesHeight_mm) || 1850;
    crestHeight = Number(state.roof.apex.heightToCrest_mm || state.roof.apex.crestHeight_mm) || 2200;
  } else if (roofStyle === "pent" && state.roof && state.roof.pent) {
    pentMinH = Number(state.roof.pent.minHeight_mm) || 2100;
    pentMaxH = Number(state.roof.pent.maxHeight_mm) || 2300;
    eavesHeight = pentMinH;
    crestHeight = pentMaxH;
  } else if (state && state.walls && state.walls.height_mm) {
    eavesHeight = Math.floor(Number(state.walls.height_mm));
    crestHeight = eavesHeight;
  }

  // Build each divider
  for (let i = 0; i < dividers.length; i++) {
    const divider = dividers[i];
    if (!divider || divider.enabled === false) continue;
    
    // Calculate height based on heightMode
    const heightMode = divider.heightMode || "walls";
    let dividerHeight;
    
    if (heightMode === "roof") {
      // For roof mode, use crest height (simplified - full gable profile could be added later)
      dividerHeight = Math.max(100, crestHeight - WALL_RISE_MM);
    } else {
      // For walls mode, use eaves height
      dividerHeight = Math.max(100, eavesHeight - WALL_RISE_MM);
    }

    buildDivider(
      divider,
      scene,
      materials,
      dividerHeight,
      {
        internalOriginX,
        internalOriginZ,
        internalEndX,
        internalEndZ,
        internalW,
        internalD,
        wallThk
      },
      dividerPrefix,
      sectionPos,
      sectionId
    );
  }
}

/**
 * Build a single divider panel
 */
function buildDivider(divider, scene, materials, height, bounds, prefix, sectionPos, sectionId) {
  const axis = divider.axis || "x";
  const pos = Math.floor(Number(divider.position_mm || 0));
  const divId = String(divider.id || "");
  const namePrefix = prefix + divId + "-";

  // Calculate divider origin and length based on axis
  let origin, length;

  if (axis === "x") {
    // X-axis divider: runs front-to-back (along Z)
    // Position is an X coordinate within internal space
    origin = {
      x: bounds.internalOriginX + pos - STUD_H / 2,
      y: 0,
      z: bounds.internalOriginZ
    };
    length = bounds.internalD;
  } else {
    // Z-axis divider: runs left-to-right (along X)
    // Position is a Z coordinate within internal space
    origin = {
      x: bounds.internalOriginX,
      y: 0,
      z: bounds.internalOriginZ + pos - STUD_H / 2
    };
    length = bounds.internalW;
  }

  // Get openings for this divider
  const openings = Array.isArray(divider.openings)
    ? divider.openings.filter(o => o && o.enabled !== false)
    : [];

  const doorIntervals = openings
    .filter(o => o.type === "door")
    .map(o => ({
      id: o.id,
      x0: Math.floor(Number(o.position_mm || 0)),
      x1: Math.floor(Number(o.position_mm || 0)) + Math.floor(Number(o.width_mm || 800)),
      w: Math.floor(Number(o.width_mm || 800)),
      h: Math.floor(Number(o.height_mm || 1900))
    }));

  // Helper function to create box meshes
  function mkBox(name, Lx, Ly, Lz, boxOrigin, mat) {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: Lx / 1000,
      height: Ly / 1000,
      depth: Lz / 1000
    }, scene);

    // Position at center of box (Babylon uses center-origin)
    mesh.position = new BABYLON.Vector3(
      (boxOrigin.x + Lx / 2 + sectionPos.x) / 1000,
      (boxOrigin.y + Ly / 2 + sectionPos.y) / 1000,
      (boxOrigin.z + Lz / 2 + sectionPos.z) / 1000
    );

    mesh.material = mat || materials.timber;
    mesh.metadata = { dynamic: true, type: "divider", dividerId: divId, sectionId: sectionId || null };
    return mesh;
  }

  // Check if position is inside any opening
  function isInsideOpening(posAlongLength) {
    for (let i = 0; i < doorIntervals.length; i++) {
      const d = doorIntervals[i];
      if (posAlongLength >= d.x0 && posAlongLength < d.x1) return true;
    }
    return false;
  }

  const studLen = Math.max(1, height - 2 * PLATE_Y);

  if (axis === "x") {
    // Divider runs along Z axis
    buildFrameAlongZ(namePrefix, origin, length, height, studLen, doorIntervals, isInsideOpening, mkBox, materials);
  } else {
    // Divider runs along X axis
    buildFrameAlongX(namePrefix, origin, length, height, studLen, doorIntervals, isInsideOpening, mkBox, materials);
  }

  // Add coverings
  addDividerCovering(
    divider,
    origin,
    axis,
    length,
    height,
    scene,
    materials,
    namePrefix,
    sectionPos,
    sectionId,
    doorIntervals
  );
}

/**
 * Build frame running along Z axis (front-to-back)
 */
function buildFrameAlongZ(prefix, origin, length, height, studLen, openings, isInsideOpening, mkBox, materials) {
  // Bottom plate - full length along Z
  mkBox(prefix + "plate-bottom", STUD_H, PLATE_Y, length,
    { x: origin.x, y: origin.y, z: origin.z }, materials.plate || materials.timber);

  // Top plate - full length along Z
  mkBox(prefix + "plate-top", STUD_H, PLATE_Y, length,
    { x: origin.x, y: origin.y + height - PLATE_Y, z: origin.z }, materials.plate || materials.timber);

  // End studs (if not blocked by openings)
  if (!isInsideOpening(0)) {
    mkBox(prefix + "stud-start", STUD_H, studLen, STUD_W,
      { x: origin.x, y: origin.y + PLATE_Y, z: origin.z }, materials.timber);
  }
  if (!isInsideOpening(length - STUD_W)) {
    mkBox(prefix + "stud-end", STUD_H, studLen, STUD_W,
      { x: origin.x, y: origin.y + PLATE_Y, z: origin.z + length - STUD_W }, materials.timber);
  }

  // Intermediate studs at spacing intervals
  let studIdx = 0;
  let zPos = SPACING;
  while (zPos <= length - STUD_W - 1) {
    if (Math.abs(zPos - (length - STUD_W)) < 1) break;
    if (!isInsideOpening(zPos)) {
      mkBox(prefix + "stud-" + studIdx++, STUD_H, studLen, STUD_W,
        { x: origin.x, y: origin.y + PLATE_Y, z: origin.z + zPos }, materials.timber);
    }
    zPos += SPACING;
  }

  // Door framing
  for (let i = 0; i < openings.length; i++) {
    const door = openings[i];
    addDoorFramingAlongZ(prefix, origin, door, height, studLen, mkBox, materials);
  }
}

/**
 * Build frame running along X axis (left-to-right)
 */
function buildFrameAlongX(prefix, origin, length, height, studLen, openings, isInsideOpening, mkBox, materials) {
  // Bottom plate - full length along X
  mkBox(prefix + "plate-bottom", length, PLATE_Y, STUD_H,
    { x: origin.x, y: origin.y, z: origin.z }, materials.plate || materials.timber);

  // Top plate - full length along X
  mkBox(prefix + "plate-top", length, PLATE_Y, STUD_H,
    { x: origin.x, y: origin.y + height - PLATE_Y, z: origin.z }, materials.plate || materials.timber);

  // End studs (if not blocked by openings)
  if (!isInsideOpening(0)) {
    mkBox(prefix + "stud-start", STUD_W, studLen, STUD_H,
      { x: origin.x, y: origin.y + PLATE_Y, z: origin.z }, materials.timber);
  }
  if (!isInsideOpening(length - STUD_W)) {
    mkBox(prefix + "stud-end", STUD_W, studLen, STUD_H,
      { x: origin.x + length - STUD_W, y: origin.y + PLATE_Y, z: origin.z }, materials.timber);
  }

  // Intermediate studs at spacing intervals
  let studIdx = 0;
  let xPos = SPACING;
  while (xPos <= length - STUD_W - 1) {
    if (Math.abs(xPos - (length - STUD_W)) < 1) break;
    if (!isInsideOpening(xPos)) {
      mkBox(prefix + "stud-" + studIdx++, STUD_W, studLen, STUD_H,
        { x: origin.x + xPos, y: origin.y + PLATE_Y, z: origin.z }, materials.timber);
    }
    xPos += SPACING;
  }

  // Door framing
  for (let i = 0; i < openings.length; i++) {
    const door = openings[i];
    addDoorFramingAlongX(prefix, origin, door, height, studLen, mkBox, materials);
  }
}

/**
 * Add door framing for Z-axis divider
 */
function addDoorFramingAlongZ(prefix, origin, door, height, studLen, mkBox, materials) {
  const doorX0 = door.x0;
  const doorX1 = door.x1;
  const doorH = Math.min(door.h, height - 2 * PLATE_Y);
  const headerY = PLATE_Y + doorH;
  const headerH = STUD_W;

  // Left jack stud (at door start)
  mkBox(prefix + "door-" + door.id + "-jack-left", STUD_H, doorH, STUD_W,
    { x: origin.x, y: origin.y + PLATE_Y, z: origin.z + doorX0 - STUD_W }, materials.timber);

  // Right jack stud (at door end)
  mkBox(prefix + "door-" + door.id + "-jack-right", STUD_H, doorH, STUD_W,
    { x: origin.x, y: origin.y + PLATE_Y, z: origin.z + doorX1 }, materials.timber);

  // Header above door
  const headerLen = doorX1 - doorX0 + 2 * STUD_W;
  mkBox(prefix + "door-" + door.id + "-header", STUD_H, headerH, headerLen,
    { x: origin.x, y: origin.y + headerY, z: origin.z + doorX0 - STUD_W }, materials.timber);

  // Cripple studs above header if space allows
  const crippleLen = height - PLATE_Y - headerY - headerH;
  if (crippleLen > STUD_W) {
    // Center cripple
    const centerZ = doorX0 + (doorX1 - doorX0) / 2 - STUD_W / 2;
    mkBox(prefix + "door-" + door.id + "-cripple", STUD_H, crippleLen, STUD_W,
      { x: origin.x, y: origin.y + headerY + headerH, z: origin.z + centerZ }, materials.timber);
  }
}

/**
 * Add door framing for X-axis divider
 */
function addDoorFramingAlongX(prefix, origin, door, height, studLen, mkBox, materials) {
  const doorX0 = door.x0;
  const doorX1 = door.x1;
  const doorH = Math.min(door.h, height - 2 * PLATE_Y);
  const headerY = PLATE_Y + doorH;
  const headerH = STUD_W;

  // Left jack stud (at door start)
  mkBox(prefix + "door-" + door.id + "-jack-left", STUD_W, doorH, STUD_H,
    { x: origin.x + doorX0 - STUD_W, y: origin.y + PLATE_Y, z: origin.z }, materials.timber);

  // Right jack stud (at door end)
  mkBox(prefix + "door-" + door.id + "-jack-right", STUD_W, doorH, STUD_H,
    { x: origin.x + doorX1, y: origin.y + PLATE_Y, z: origin.z }, materials.timber);

  // Header above door
  const headerLen = doorX1 - doorX0 + 2 * STUD_W;
  mkBox(prefix + "door-" + door.id + "-header", headerLen, headerH, STUD_H,
    { x: origin.x + doorX0 - STUD_W, y: origin.y + headerY, z: origin.z }, materials.timber);

  // Cripple studs above header if space allows
  const crippleLen = height - PLATE_Y - headerY - headerH;
  if (crippleLen > STUD_W) {
    // Center cripple
    const centerX = doorX0 + (doorX1 - doorX0) / 2 - STUD_W / 2;
    mkBox(prefix + "door-" + door.id + "-cripple", STUD_W, crippleLen, STUD_H,
      { x: origin.x + centerX, y: origin.y + headerY + headerH, z: origin.z }, materials.timber);
  }
}

/**
 * Add covering panels to divider
 */
function addDividerCovering(divider, origin, axis, length, height, scene, materials, prefix, sectionPos, sectionId, doorIntervals) {
  const coverLeft = divider.coveringLeft || "none";
  const coverRight = divider.coveringRight || "none";

  if (coverLeft === "none" && coverRight === "none") return;

  // Get or create materials
  const osbMat = materials.osb || materials.deck || materials.timber;
  const cladMat = scene._claddingMatLight || materials.cladding || materials.timber;

  function addCoveringPanel(side, coverType, offset) {
    if (coverType === "none") return;

    const thickness = coverType === "osb" ? OSB_THK : CLAD_THK;
    const mat = coverType === "osb" ? osbMat : cladMat;
    const name = prefix + "covering-" + side;

    let mesh;

    if (axis === "x") {
      // Divider runs along Z, covering faces X direction
      mesh = BABYLON.MeshBuilder.CreateBox(name, {
        width: thickness / 1000,
        height: height / 1000,
        depth: length / 1000
      }, scene);

      mesh.position = new BABYLON.Vector3(
        (origin.x + STUD_H / 2 + offset * (STUD_H / 2 + thickness / 2) + sectionPos.x) / 1000,
        (height / 2 + sectionPos.y) / 1000,
        (origin.z + length / 2 + sectionPos.z) / 1000
      );
    } else {
      // Divider runs along X, covering faces Z direction
      mesh = BABYLON.MeshBuilder.CreateBox(name, {
        width: length / 1000,
        height: height / 1000,
        depth: thickness / 1000
      }, scene);

      mesh.position = new BABYLON.Vector3(
        (origin.x + length / 2 + sectionPos.x) / 1000,
        (height / 2 + sectionPos.y) / 1000,
        (origin.z + STUD_H / 2 + offset * (STUD_H / 2 + thickness / 2) + sectionPos.z) / 1000
      );
    }

    mesh.material = mat;
    mesh.metadata = { dynamic: true, type: "divider-covering", dividerId: divider.id, sectionId: sectionId || null };

    // Cut out door openings using CSG if available
    if (doorIntervals.length > 0 && typeof BABYLON.CSG !== "undefined") {
      try {
        let resultCSG = BABYLON.CSG.FromMesh(mesh);

        for (let i = 0; i < doorIntervals.length; i++) {
          const door = doorIntervals[i];
          const doorW = door.w;
          const doorH = door.h;
          const doorPos = door.x0;

          let cutterMesh;
          if (axis === "x") {
            cutterMesh = BABYLON.MeshBuilder.CreateBox("cutter", {
              width: (thickness + 20) / 1000,
              height: doorH / 1000,
              depth: doorW / 1000
            }, scene);
            cutterMesh.position = new BABYLON.Vector3(
              mesh.position.x,
              (PLATE_Y + doorH / 2 + sectionPos.y) / 1000,
              (origin.z + doorPos + doorW / 2 + sectionPos.z) / 1000
            );
          } else {
            cutterMesh = BABYLON.MeshBuilder.CreateBox("cutter", {
              width: doorW / 1000,
              height: doorH / 1000,
              depth: (thickness + 20) / 1000
            }, scene);
            cutterMesh.position = new BABYLON.Vector3(
              (origin.x + doorPos + doorW / 2 + sectionPos.x) / 1000,
              (PLATE_Y + doorH / 2 + sectionPos.y) / 1000,
              mesh.position.z
            );
          }

          const cutterCSG = BABYLON.CSG.FromMesh(cutterMesh);
          resultCSG = resultCSG.subtract(cutterCSG);
          cutterMesh.dispose();
        }

        const newMesh = resultCSG.toMesh(name, mat, scene);
        newMesh.metadata = mesh.metadata;
        mesh.dispose();
      } catch (e) {
        // CSG failed, keep solid panel
        console.warn("[DIVIDERS] CSG cutout failed:", e);
      }
    }
  }

  // Left side = -1 offset (negative direction), Right side = +1 offset (positive direction)
  addCoveringPanel("left", coverLeft, -1);
  addCoveringPanel("right", coverRight, +1);
}

/**
 * Update Bill of Materials for dividers
 */
export function updateBOM(state) {
  // BOM implementation can be added later if needed
  // Similar pattern to walls.js updateBOM_Pent/Apex
}
