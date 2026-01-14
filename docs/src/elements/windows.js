/**
 * windows.js - Window geometry builder for parametric shed
 * 
 * Builds actual window geometry to fill wall openings.
 * Creates framed glass windows with optional glazing bars.
 * 
 * All dimensions in millimeters.
 */

/**
 * Build all windows for the shed
 * @param {object} state - The shed state containing walls.openings
 * @param {{scene: BABYLON.Scene, materials: object}} ctx - Babylon context
 */
export function build3D(state, ctx, sectionContext) {
  const { scene, materials } = ctx;

  // Section context is OPTIONAL - when undefined, behaves exactly as legacy single-building mode
  // sectionContext = { sectionId: string, position: { x: number, y: number, z: number } }
  const sectionId = sectionContext?.sectionId;
  const sectionPos = sectionContext?.position || { x: 0, y: 0, z: 0 };

  // Dispose existing meshes for this section (or all window meshes in legacy mode)
  const meshPrefix = sectionId ? `section-${sectionId}-` : "";
  const windowPrefix = meshPrefix + "window-";

  scene.meshes
    .filter((m) => m.metadata && m.metadata.dynamic === true && m.name.startsWith(windowPrefix))
    .forEach((m) => {
      if (!m.isDisposed()) m.dispose(false, true);
    });

  const openings = Array.isArray(state.walls?.openings) ? state.walls.openings : [];
  const windows = openings.filter((o) => o && o.type === "window" && o.enabled !== false);

  if (windows.length === 0) return;

  // Get frame dimensions
  const dims = {
    w: Math.max(1, Math.floor(state.w)),
    d: Math.max(1, Math.floor(state.d)),
  };

  const variant = state.walls?.variant || "insulated";
  const prof = resolveProfile(state, variant);
  const wallThk = prof.studH;
  const plateY = prof.studW;

  // Wall rise from index.js
  const WALL_RISE_MM = 168;

  // Create window materials if not present
  ensureWindowMaterials(scene, materials);

  windows.forEach((win, index) => {
    const wallId = win.wall || "front";

    // Get window dimensions
    const winWidth = Math.max(100, Math.floor(win.width_mm || 600));
    const winHeight = Math.max(100, Math.floor(win.height_mm || 600));
    const winX = Math.floor(win.x_mm || 0);
    const winY = Math.max(0, Math.floor(win.y_mm || 800)); // Height from floor

    // FIX: For front/back walls, window frame is asymmetric (left upright extends studW left, right extends 0)
    // Shift window LEFT by half studW to center in the visual frame
    const studW = prof.studW;
    const isLeftRight = (wallId === "left" || wallId === "right");
    const adjustedWinX = isLeftRight ? winX : (winX - studW / 2);

    // Calculate window position based on wall (with section offset)
    const pos = getWindowPosition(wallId, dims, wallThk, adjustedWinX, winWidth, winHeight, winY, plateY, WALL_RISE_MM, sectionPos);

    buildWindow(scene, win, pos, winWidth, winHeight, index, materials, meshPrefix);
  });
}

/**
 * Ensure window-specific materials exist
 */
function ensureWindowMaterials(scene, materials) {
  if (!scene._windowMaterials) {
    scene._windowMaterials = {};
  }

  // Window frame material
  if (!scene._windowMaterials.frame) {
    const mat = new BABYLON.StandardMaterial("windowFrameMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.75, 0.58, 0.40);
    mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    scene._windowMaterials.frame = mat;
  }

  // Glass material
  if (!scene._windowMaterials.glass) {
    const mat = new BABYLON.StandardMaterial("windowGlassMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.6, 0.75, 0.85);
    mat.alpha = 0.4;
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    scene._windowMaterials.glass = mat;
  }
}

/**
 * Calculate window world position based on wall
 * sectionPos is optional - defaults to origin (0,0,0) for legacy mode
 */
function getWindowPosition(wallId, dims, wallThk, winX, winWidth, winHeight, winY, plateY, wallRise, sectionPos = { x: 0, y: 0, z: 0 }) {
  const offset = 2; // Small offset to place window just outside wall surface

  // Window center Y
  const yCenter = wallRise + plateY + winY + winHeight / 2;

  switch (wallId) {
    case "front":
      return {
        x: sectionPos.x + winX + winWidth / 2,
        y: sectionPos.y + yCenter,
        z: sectionPos.z - offset,
        rotation: Math.PI  // Match door rotation - face outward
      };
    case "back":
      return {
        x: sectionPos.x + winX + winWidth / 2,
        y: sectionPos.y + yCenter,
        z: sectionPos.z + dims.d + offset,
        rotation: 0  // Opposite of front
      };
    case "left":
      return {
        x: sectionPos.x - offset,
        y: sectionPos.y + yCenter,
        z: sectionPos.z + winX + winWidth / 2,
        rotation: -Math.PI / 2
      };
    case "right":
      return {
        x: sectionPos.x + dims.w + offset,
        y: sectionPos.y + yCenter,
        z: sectionPos.z + winX + winWidth / 2,
        rotation: Math.PI / 2
      };
    default:
      return { x: sectionPos.x, y: sectionPos.y + yCenter, z: sectionPos.z, rotation: 0 };
  }
}

/**
 * Build a window with frame and glass
 */
function buildWindow(scene, win, pos, winWidth, winHeight, index, materials, meshPrefix = "") {
  // Dimensions in mm
  const frameThickness_mm = 40;
  const frameDepth_mm = 50;
  const glazingBarWidth_mm = 20;

  console.log(`[WINDOW_ASSEMBLY] WindowID=${win.id}, Wall=${win.wall}, winWidth=${winWidth}, winHeight=${winHeight}, pos.x=${pos.x}, pos.z=${pos.z}`);

  const mats = scene._windowMaterials;

  // Create window group
  const windowGroup = new BABYLON.TransformNode(`${meshPrefix}window-${index}-group`, scene);
  windowGroup.position = new BABYLON.Vector3(pos.x / 1000, pos.y / 1000, pos.z / 1000);
  windowGroup.rotation.y = pos.rotation;

  // Top frame
  const frameTop = BABYLON.MeshBuilder.CreateBox(
    `${meshPrefix}window-${index}-frame-top`,
    {
      width: winWidth / 1000,
      height: frameThickness_mm / 1000,
      depth: frameDepth_mm / 1000
    },
    scene
  );
  frameTop.position = new BABYLON.Vector3(0, (winHeight / 2 - frameThickness_mm / 2) / 1000, 0);
  frameTop.parent = windowGroup;
  frameTop.material = mats.frame;
  frameTop.metadata = { dynamic: true, windowId: win.id };

  // Bottom frame
  const frameBottom = BABYLON.MeshBuilder.CreateBox(
    `${meshPrefix}window-${index}-frame-bottom`,
    {
      width: winWidth / 1000,
      height: frameThickness_mm / 1000,
      depth: frameDepth_mm / 1000
    },
    scene
  );
  frameBottom.position = new BABYLON.Vector3(0, (-winHeight / 2 + frameThickness_mm / 2) / 1000, 0);
  frameBottom.parent = windowGroup;
  frameBottom.material = mats.frame;
  frameBottom.metadata = { dynamic: true, windowId: win.id };

  // Left frame
  const frameLeft = BABYLON.MeshBuilder.CreateBox(
    `${meshPrefix}window-${index}-frame-left`,
    {
      width: frameThickness_mm / 1000,
      height: (winHeight - frameThickness_mm * 2) / 1000,
      depth: frameDepth_mm / 1000
    },
    scene
  );
  frameLeft.position = new BABYLON.Vector3((-winWidth / 2 + frameThickness_mm / 2) / 1000, 0, 0);
  frameLeft.parent = windowGroup;
  frameLeft.material = mats.frame;
  frameLeft.metadata = { dynamic: true, windowId: win.id };

  // Right frame
  const frameRight = BABYLON.MeshBuilder.CreateBox(
    `${meshPrefix}window-${index}-frame-right`,
    {
      width: frameThickness_mm / 1000,
      height: (winHeight - frameThickness_mm * 2) / 1000,
      depth: frameDepth_mm / 1000
    },
    scene
  );
  frameRight.position = new BABYLON.Vector3((winWidth / 2 - frameThickness_mm / 2) / 1000, 0, 0);
  frameRight.parent = windowGroup;
  frameRight.material = mats.frame;
  frameRight.metadata = { dynamic: true, windowId: win.id };

  // Glass pane
  const glassWidth = winWidth - frameThickness_mm * 2;
  const glassHeight = winHeight - frameThickness_mm * 2;

  const glass = BABYLON.MeshBuilder.CreateBox(
    `${meshPrefix}window-${index}-glass`,
    {
      width: glassWidth / 1000,
      height: glassHeight / 1000,
      depth: 6 / 1000
    },
    scene
  );
  glass.position = new BABYLON.Vector3(0, 0, 0);
  glass.parent = windowGroup;
  glass.material = mats.glass;
  glass.metadata = { dynamic: true, windowId: win.id };

// Glazing bars removed - single pane glass only

  windowGroup.metadata = { dynamic: true, windowId: win.id };
}

/**
 * Resolve wall profile (same as walls.js)
 */
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

/**
 * Generate BOM for windows
 */
export function updateBOM(state) {
  const sections = [];
  const openings = Array.isArray(state.walls?.openings) ? state.walls.openings : [];
  const windows = openings.filter((o) => o && o.type === "window" && o.enabled !== false);

  if (windows.length === 0) {
    return { sections: [] };
  }

  sections.push(["WINDOWS", "", "", "", "", ""]);

  windows.forEach((win, index) => {
    const winWidth = Math.max(100, Math.floor(win.width_mm || 600));
    const winHeight = Math.max(100, Math.floor(win.height_mm || 600));
    const wallId = win.wall || "front";

    sections.push([`  Window ${index + 1}`, "", "", "", "", `Wall: ${wallId}, ${winWidth}×${winHeight}mm`]);

    // Frame pieces
    const frameThickness = 40;
    const frameDepth = 50;

    sections.push([`    Frame Rails`, 2, winWidth, frameThickness, frameDepth, "Top and bottom"]);
    sections.push([`    Frame Stiles`, 2, winHeight - frameThickness * 2, frameThickness, frameDepth, "Left and right"]);

    // Glass
    const glassWidth = winWidth - frameThickness * 2;
    const glassHeight = winHeight - frameThickness * 2;
    sections.push([`    Glass Pane`, 1, glassHeight, glassWidth, 6, "Tempered glass"]);

// Single pane glass - no glazing bars
  });

  return { sections };
}
