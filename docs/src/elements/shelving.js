/**
 * shelving.js - Parametric shelving system for sheds
 * 
 * Builds simple horizontal shelves with triangular timber brackets.
 * Shelves mount to any interior wall face.
 * 
 * Data model: state.shelving[] array of shelf objects:
 *   {
 *     wall: "back",           // front|back|left|right
 *     side: "inside",         // inside|outside (inside = faces interior)
 *     x_mm: 500,              // position along wall (from left edge looking at wall)
 *     y_mm: 1200,             // height from floor to shelf top surface
 *     length_mm: 800,         // shelf length along wall
 *     depth_mm: 300,          // how far shelf sticks out from wall
 *     thickness_mm: 25,       // shelf board thickness
 *     bracket_size_mm: 250,   // triangle bracket leg length
 *     enabled: true
 *   }
 * 
 * All dimensions in millimeters.
 */

// ─── Constants ───────────────────────────────────────────────────────
const BRACKET_TIMBER_W = 45;    // bracket timber width (mm)
const BRACKET_TIMBER_D = 20;    // bracket timber depth/thickness (mm)
const MIN_SHELF_LENGTH = 200;
const MIN_SHELF_DEPTH = 100;
const MIN_BRACKET_SIZE = 100;

// ─── Materials ───────────────────────────────────────────────────────

function ensureShelvingMaterials(scene, materials) {
  if (!materials.shelfBoard) {
    const mat = new BABYLON.StandardMaterial("shelfBoardMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.76, 0.60, 0.42); // light timber
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    materials.shelfBoard = mat;
  }
  if (!materials.shelfBracket) {
    const mat = new BABYLON.StandardMaterial("shelfBracketMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.65, 0.50, 0.35); // slightly darker timber
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    materials.shelfBracket = mat;
  }
}

// ─── Wall positioning ────────────────────────────────────────────────

/**
 * Calculate world position and rotation for a shelf on a given wall.
 * 
 * @param {string} wallId - front|back|left|right
 * @param {string} side - inside|outside
 * @param {object} dims - { w, d } shed dimensions in mm
 * @param {number} wallThk - wall thickness (studH) in mm
 * @param {number} shelfX - position along wall from left edge (mm)
 * @param {number} shelfY - height from floor to shelf top (mm)
 * @param {number} shelfLength - shelf length along wall (mm)
 * @param {number} shelfDepth - shelf depth (protrusion from wall) (mm)
 * @param {number} wallRise - floor frame rise (168mm)
 * @param {object} sectionPos - section offset { x, y, z }
 * @param {number} innerLining - additional inner lining thickness in mm (e.g. 12mm plywood for insulated)
 * @returns {{ position: BABYLON.Vector3, rotation: number, depthDir: number }}
 */
function getShelfTransform(wallId, side, dims, wallThk, shelfX, shelfY, shelfLength, shelfDepth, wallRise, sectionPos, innerLining) {
  const isInside = side === "inside";
  // Convert all mm inputs to scene units (metres) — scene uses metres throughout
  const S = 1 / 1000; // mm → scene units
  const halfLen = (shelfLength / 2) * S;
  const yPos = (sectionPos.y + wallRise + shelfY) * S;
  const depthHalf = (shelfDepth / 2) * S;
  // Total wall thickness from outside to inner surface:
  // basic: studH only; insulated: studH + plywood lining
  const wallT = (wallThk + (isInside ? (innerLining || 0) : 0)) * S;
  const sx = sectionPos.x * S;
  const sz = sectionPos.z * S;
  const dW = dims.w * S;
  const dD = dims.d * S;
  const xOff = shelfX * S;

  switch (wallId) {
    case "front": {
      const zSurface = isInside ? sz + wallT : sz;
      const depthDir = isInside ? 1 : -1;
      return {
        position: new BABYLON.Vector3(
          sx + xOff + halfLen,
          yPos,
          zSurface + depthDir * depthHalf
        ),
        rotation: 0,
        depthDir,
        wallNormal: depthDir
      };
    }
    case "back": {
      const zSurface = isInside ? sz + dD - wallT : sz + dD;
      const depthDir = isInside ? -1 : 1;
      return {
        position: new BABYLON.Vector3(
          sx + xOff + halfLen,
          yPos,
          zSurface + depthDir * depthHalf
        ),
        rotation: 0,
        depthDir,
        wallNormal: depthDir
      };
    }
    case "left": {
      const xSurface = isInside ? sx + wallT : sx;
      const depthDir = isInside ? 1 : -1;
      return {
        position: new BABYLON.Vector3(
          xSurface + depthDir * depthHalf,
          yPos,
          sz + xOff + halfLen
        ),
        rotation: Math.PI / 2,
        depthDir,
        wallNormal: depthDir
      };
    }
    case "right": {
      const xSurface = isInside ? sx + dW - wallT : sx + dW;
      const depthDir = isInside ? -1 : 1;
      return {
        position: new BABYLON.Vector3(
          xSurface + depthDir * depthHalf,
          yPos,
          sz + xOff + halfLen
        ),
        rotation: Math.PI / 2,
        depthDir,
        wallNormal: depthDir
      };
    }
    default:
      return {
        position: new BABYLON.Vector3(sx, yPos, sz),
        rotation: 0,
        depthDir: 1,
        wallNormal: 1
      };
  }
}

// ─── Geometry builders ───────────────────────────────────────────────

/**
 * Build a single triangular bracket.
 * Right-angle triangle: vertical leg against wall, horizontal leg under shelf.
 * 
 * Built in local space (XY plane), then positioned by caller.
 * Triangle vertices (looking at the bracket face):
 *   - Bottom-left (0, 0): wall corner
 *   - Top-left (0, bracketSize): top of vertical leg  
 *   - Bottom-right (bracketSize, 0): end of horizontal leg
 */
function createBracket(scene, name, bracketSize, materials) {
  // Convert mm → scene units (metres)
  const S = 1 / 1000;
  const bS = bracketSize * S;
  const tW = BRACKET_TIMBER_W * S;
  const tD = BRACKET_TIMBER_D * S;

  // Build bracket hanging DOWN from origin (y=0 is top, under the shelf board).
  // Horizontal arm at top, vertical arm hangs down the wall, diagonal braces them.

  // Horizontal arm: runs outward from wall (along +X), sits right under shelf
  const horizBar = BABYLON.MeshBuilder.CreateBox(name + "-horiz", {
    width: bS,
    height: tD,
    depth: tW
  }, scene);
  horizBar.position.x = bS / 2;
  horizBar.position.y = -tD / 2;

  // Vertical arm: flat against wall, hangs downward
  const vertBar = BABYLON.MeshBuilder.CreateBox(name + "-vert", {
    width: tD,
    height: bS,
    depth: tW
  }, scene);
  vertBar.position.x = tD / 2;
  vertBar.position.y = -bS / 2;

  // Diagonal brace: connects bottom of vertical arm to end of horizontal arm
  const diagLength = Math.sqrt(bS * bS + bS * bS);
  const diagBar = BABYLON.MeshBuilder.CreateBox(name + "-diag", {
    width: diagLength - tD * 2, // trim to fit inside corner
    height: tD,
    depth: tW
  }, scene);
  diagBar.position.x = bS / 2;
  diagBar.position.y = -bS / 2;
  diagBar.rotation.z = Math.PI / 4;

  // Apply material
  [vertBar, horizBar, diagBar].forEach(m => {
    m.material = materials.shelfBracket;
  });

  // Merge into single mesh
  const merged = BABYLON.Mesh.MergeMeshes(
    [vertBar, horizBar, diagBar],
    true,   // disposeSource
    true,   // allow32BitsIndices
    undefined,
    false,  // multiMaterial
    true    // subdivideWithSubMeshes
  );
  if (merged) {
    merged.name = name;
    merged.material = materials.shelfBracket;
  }
  return merged;
}

// ─── Main build3D ────────────────────────────────────────────────────

/**
 * Build all shelves for the shed.
 * @param {object} state - The shed state containing state.shelving[]
 * @param {{scene: BABYLON.Scene, materials: object}} ctx - Babylon context
 * @param {object} [sectionContext] - Optional section context for multi-building
 */
export function build3D(state, ctx, sectionContext) {
  const { scene, materials } = ctx;
  const sectionId = sectionContext?.sectionId;
  const sectionPos = sectionContext?.position || { x: 0, y: 0, z: 0 };

  // Dispose existing shelf meshes
  const meshPrefix = sectionId ? `section-${sectionId}-` : "";
  const shelfPrefix = meshPrefix + "shelf-";

  scene.meshes
    .filter(m => m.metadata && m.metadata.dynamic === true && m.name.startsWith(shelfPrefix))
    .forEach(m => { if (!m.isDisposed()) m.dispose(false, true); });

  const shelves = Array.isArray(state.shelving) ? state.shelving : [];
  const activeShelves = shelves.filter(s => s && s.enabled !== false);

  if (activeShelves.length === 0) return;

  // Get wall dimensions
  const dims = {
    w: Math.max(1, Math.floor(state.w)),
    d: Math.max(1, Math.floor(state.d)),
  };

  const variant = state.walls?.variant || "insulated";
  const prof = resolveProfile(state, variant);
  const wallThk = prof.studH;
  const WALL_RISE_MM = 168;
  const WALL_OVERHANG_MM = 25; // walls are shifted by -25mm in X and Z (see index.js)

  // Inner lining thickness: insulated walls have 12mm plywood on interior face
  // Basic walls have no inner lining — shelf sits against stud face
  const PLY_THICKNESS = 12; // must match walls.js
  const innerLining = variant === "insulated" ? PLY_THICKNESS : 0;

  // Apply the same overhang shift as walls get in index.js
  // Walls are shifted by (-WALL_OVERHANG, WALL_RISE, -WALL_OVERHANG)
  // We account for WALL_RISE in getShelfTransform's wallRise param,
  // but we need to offset sectionPos for the X/Z overhang shift.
  const adjustedSectionPos = {
    x: sectionPos.x - WALL_OVERHANG_MM,
    y: sectionPos.y,
    z: sectionPos.z - WALL_OVERHANG_MM
  };

  ensureShelvingMaterials(scene, materials);

  activeShelves.forEach((shelf, index) => {
    const wallId = shelf.wall || "back";
    const side = shelf.side || "inside";
    const shelfLength = Math.max(MIN_SHELF_LENGTH, Math.floor(shelf.length_mm || 800));
    const shelfDepth = Math.max(MIN_SHELF_DEPTH, Math.floor(shelf.depth_mm || 300));
    const shelfThickness = Math.max(15, Math.floor(shelf.thickness_mm || 25));
    const shelfY = Math.max(200, Math.floor(shelf.y_mm || 1200));
    const shelfX = Math.floor(shelf.x_mm || 0);
    const bracketSize = Math.max(MIN_BRACKET_SIZE, Math.floor(shelf.bracket_size_mm || 250));

    const transform = getShelfTransform(
      wallId, side, dims, wallThk, shelfX, shelfY,
      shelfLength, shelfDepth, WALL_RISE_MM, adjustedSectionPos, innerLining
    );

    // mm → scene units
    const S = 1 / 1000;

    // ── Shelf board ──
    // In local space: length along X, depth along Z, thickness along Y
    const board = BABYLON.MeshBuilder.CreateBox(`${shelfPrefix}${index}-board`, {
      width: shelfLength * S,
      height: shelfThickness * S,
      depth: shelfDepth * S
    }, scene);
    board.material = materials.shelfBoard;
    board.metadata = { dynamic: true };

    // Position: transform already in scene units; adjust Y so shelf top is at shelfY
    board.position = transform.position.clone();
    board.position.y = transform.position.y - (shelfThickness / 2) * S;
    board.rotation.y = transform.rotation;

    // ── Brackets ──
    // Place 2 brackets at 1/4 and 3/4 along the shelf length
    const bracketPositions = [0.25, 0.75];

    bracketPositions.forEach((frac, bIdx) => {
      const bracket = createBracket(
        scene,
        `${shelfPrefix}${index}-bracket-${bIdx}`,
        bracketSize,   // still in mm — createBracket converts internally
        materials
      );
      if (!bracket) return;

      bracket.metadata = { dynamic: true };

      // Local offset along shelf length from center (in scene units)
      const alongOffset = (frac - 0.5) * shelfLength * S;

      // Clone the shelf position (already in scene units)
      const bPos = transform.position.clone();
      
      // Bracket origin (y=0) sits at shelf underside; bracket hangs downward
      bPos.y = transform.position.y - shelfThickness * S;

      // Offset along the wall (shelf length direction)
      if (wallId === "left" || wallId === "right") {
        bPos.z += alongOffset;
      } else {
        bPos.x += alongOffset;
      }

      // Move bracket flush against wall surface.
      // Bracket local X=0 is the wall-side face of the vertical arm.
      // Shelf centre is at depthHalf from wall, so shift bracket back by depthHalf
      // so its X=0 aligns with the wall inner surface.
      const wallShift = (shelfDepth / 2) * S;
      if (wallId === "front" || wallId === "back") {
        bPos.z -= transform.depthDir * wallShift;
      } else {
        bPos.x -= transform.depthDir * wallShift;
      }

      bracket.position = bPos;

      // Rotate bracket so horizontal arm (local X) points OUTWARD from wall
      // (i.e. in the shelf depth direction, toward shed centre)
      // Vertical arm (local Y) stays vertical — always correct.
      // depthDir tells us which world direction is "outward":
      //   front inside: +Z   → need local X → +Z  → rotation.y = -π/2
      //   back  inside: -Z   → need local X → -Z  → rotation.y = +π/2
      //   left  inside: +X   → need local X → +X  → rotation.y = 0
      //   right inside: -X   → need local X → -X  → rotation.y = π
      if (wallId === "front") {
        bracket.rotation.y = side === "inside" ? -Math.PI / 2 : Math.PI / 2;
      } else if (wallId === "back") {
        bracket.rotation.y = side === "inside" ? Math.PI / 2 : -Math.PI / 2;
      } else if (wallId === "left") {
        bracket.rotation.y = side === "inside" ? 0 : Math.PI;
      } else if (wallId === "right") {
        bracket.rotation.y = side === "inside" ? Math.PI : 0;
      }
    });
  });

  console.log(`[SHELVING] Built ${activeShelves.length} shelf/shelves`);
}

// ─── BOM ─────────────────────────────────────────────────────────────

/**
 * Generate Bill of Materials entries for shelving.
 * @param {object} state
 * @returns {{ sections: Array }}
 */
export function updateBOM(state) {
  const shelves = Array.isArray(state.shelving) ? state.shelving : [];
  const active = shelves.filter(s => s && s.enabled !== false);

  if (active.length === 0) return { sections: [] };

  const rows = active.map((shelf, i) => {
    const length = Math.max(MIN_SHELF_LENGTH, Math.floor(shelf.length_mm || 800));
    const depth = Math.max(MIN_SHELF_DEPTH, Math.floor(shelf.depth_mm || 300));
    const thickness = Math.max(15, Math.floor(shelf.thickness_mm || 25));
    const bracketSize = Math.max(MIN_BRACKET_SIZE, Math.floor(shelf.bracket_size_mm || 250));
    const wall = shelf.wall || "back";

    return [
      {
        item: `Shelf ${i + 1} board (${wall} wall)`,
        qty: 1,
        section: `${thickness} × ${depth}`,
        length_mm: length,
        material: "Timber"
      },
      {
        item: `Shelf ${i + 1} bracket vertical`,
        qty: 2,
        section: `${BRACKET_TIMBER_D} × ${BRACKET_TIMBER_W}`,
        length_mm: bracketSize,
        material: "Timber"
      },
      {
        item: `Shelf ${i + 1} bracket horizontal`,
        qty: 2,
        section: `${BRACKET_TIMBER_D} × ${BRACKET_TIMBER_W}`,
        length_mm: bracketSize,
        material: "Timber"
      },
      {
        item: `Shelf ${i + 1} bracket diagonal`,
        qty: 2,
        section: `${BRACKET_TIMBER_D} × ${BRACKET_TIMBER_W}`,
        length_mm: Math.ceil(Math.sqrt(2) * bracketSize),
        material: "Timber"
      }
    ];
  }).flat();

  return {
    sections: [{
      title: "SHELVING",
      rows
    }]
  };
}

// ─── Profile resolver (copied from walls.js for independence) ────────

function resolveProfile(state, variant) {
  const defaults =
    variant === "insulated"
      ? { studW: 50, studH: 100, spacing: 400 }
      : { studW: 50, studH: 75, spacing: null };

  const fg = state?.frameGauge;
  const fgW = Math.floor(Number(fg?.thickness_mm));
  const fgH = Math.floor(Number(fg?.depth_mm));

  const cfg = state?.walls?.[variant];
  const w = Math.floor(Number(cfg?.section?.w));
  const h = Math.floor(Number(cfg?.section?.h));

  let studW = Number.isFinite(w) && w > 0 ? w : defaults.studW;
  let studH = Number.isFinite(h) && h > 0 ? h : defaults.studH;

  if (Number.isFinite(fgW) && fgW > 0) studW = fgW;
  if (Number.isFinite(fgH) && fgH > 0) studH = fgH;

  return { studW, studH, spacing: defaults.spacing };
}
