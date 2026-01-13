/**
 * doors.js - Door geometry builder for parametric shed
 * 
 * Builds actual door geometry to fill wall openings.
 * Supports three styles:
 *   - standard: Vertical T&G boards with Z-pattern ledges/braces
 *   - french: Double doors with glass panels and kickboard
 *   - mortise-tenon: Traditional joinery with back frame
 * 
 * All dimensions in millimeters.
 */

/**
 * Build all doors for the shed
 * @param {object} state - The shed state containing walls.openings
 * @param {{scene: BABYLON.Scene, materials: object}} ctx - Babylon context
 */
export function build3D(state, ctx) {
  const { scene, materials } = ctx;

  // Clean up existing door meshes
  scene.meshes
    .filter((m) => m.metadata && m.metadata.dynamic === true && m.name.startsWith("door-"))
    .forEach((m) => {
      if (!m.isDisposed()) m.dispose(false, true);
    });

  const openings = Array.isArray(state.walls?.openings) ? state.walls.openings : [];
  const doors = openings.filter((o) => o && o.type === "door" && o.enabled !== false);

  if (doors.length === 0) return;

  // Get frame dimensions
  const dims = {
    w: Math.max(1, Math.floor(state.w)),
    d: Math.max(1, Math.floor(state.d)),
  };

  const variant = state.walls?.variant || "insulated";
  const prof = resolveProfile(state, variant);
  const wallThk = prof.studH;
  const plateY = prof.studW;

  // Wall rise from index.js (walls are shifted up by this amount)
  const WALL_RISE_MM = 168;

  // Create door materials if not present
  ensureDoorMaterials(scene, materials);

  doors.forEach((door, index) => {
    const style = door.style || "standard";
    const wallId = door.wall || "front";

    // Get door dimensions
    const doorWidth = Math.max(100, Math.floor(door.width_mm || 800));
    const doorHeight = Math.max(100, Math.floor(door.height_mm || 2000));
    const doorX = Math.floor(door.x_mm || 0);

   // Calculate door position based on wall
    console.log("DOOR_POS_DEBUG", { wallId, doorX, doorWidth, doorHeight, wallThk, dimsW: dims.w, dimsD: dims.d });
    const pos = getDoorPosition(wallId, dims, wallThk, doorX, doorWidth, doorHeight, plateY, WALL_RISE_MM);
    console.log("DOOR_POS_RESULT", pos);

    // Build the appropriate door style
    switch (style) {
      case "french":
      case "double-standard":
        buildFrenchDoor(scene, door, pos, doorWidth, doorHeight, index, materials);
        break;
      case "mortise-tenon":
        buildMortiseTenon(scene, door, pos, doorWidth, doorHeight, index, materials);
        break;
      case "standard":
      default:
        buildStandardDoor(scene, door, pos, doorWidth, doorHeight, index, materials);
        break;
    }
  });
}

/**
 * Ensure door-specific materials exist
 */
function ensureDoorMaterials(scene, materials) {
  if (!scene._doorMaterials) {
    scene._doorMaterials = {};
  }

 // Door board material - use wood grain from babylon.js if available
  if (!scene._doorMaterials.door) {
    if (scene._doorMat) {
      scene._doorMaterials.door = scene._doorMat;
    } else {
      const mat = new BABYLON.StandardMaterial("doorMat", scene);
      mat.diffuseColor = new BABYLON.Color3(0.78, 0.55, 0.35);
      mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
      mat.ambientColor = new BABYLON.Color3(0.45, 0.35, 0.25);
      scene._doorMaterials.door = mat;
    }
  }

  // Frame/ledge material (darker timber)
  if (!scene._doorMaterials.frame) {
    const mat = new BABYLON.StandardMaterial("doorFrameMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.70, 0.50, 0.32);
    mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    mat.ambientColor = new BABYLON.Color3(0.40, 0.30, 0.20);
    scene._doorMaterials.frame = mat;
  }

  // Hinge material (black iron)
  if (!scene._doorMaterials.hinge) {
    const mat = new BABYLON.StandardMaterial("doorHingeMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    scene._doorMaterials.hinge = mat;
  }

  // Glass material
  if (!scene._doorMaterials.glass) {
    const mat = new BABYLON.StandardMaterial("doorGlassMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.6, 0.75, 0.85);
    mat.alpha = 0.4;
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    scene._doorMaterials.glass = mat;
  }
}

/**
 * Calculate door world position based on wall
 */
function getDoorPosition(wallId, dims, wallThk, doorX, doorWidth, doorHeight, plateY, wallRise) {
  const offset = 2; // Small offset to place door just outside wall surface
  // Door center Y is at half door height, shifted by wall rise and plate
  const yCenter = wallRise + plateY + doorHeight / 2;
  switch (wallId) {
    case "front":
      return {
        x: doorX + doorWidth / 2,
        y: yCenter,
        z: -offset,
        rotation: Math.PI, // Door faces outward (negative Z)
        outward: -1
      };
    case "back":
      return {
        x: doorX + doorWidth / 2,
        y: yCenter,
        z: dims.d + offset,
        rotation: 0, // Door faces outward (positive Z)
        outward: 1
      };
    case "left":
      return {
        x: -offset,
        y: yCenter,
        z: doorX + doorWidth / 2,
        rotation: -Math.PI / 2, // Door faces outward (negative X)
        outward: -1
      };
    case "right":
      return {
        x: dims.w + offset,
        y: yCenter,
        z: doorX + doorWidth / 2,
        rotation: Math.PI / 2, // Door faces outward (positive X)
        outward: 1
      };
    default:
      return { x: 0, y: yCenter, z: 0, rotation: 0, outward: 1 };
  }
}

/**
 * Build a standard ledged and braced door
 */
function buildStandardDoor(scene, door, pos, doorWidth, doorHeight, index, materials) {
  const hingeSide = door.handleSide || "left";
  const isOpen = door.isOpen || false;

  // Dimensions in mm
  const boardWidth_mm = 100;
  const doorThickness_mm = 35;
  const ledgeHeight_mm = 120;
  const ledgeDepth_mm = 50;

  const numBoards = Math.ceil(doorWidth / boardWidth_mm);

  // Create door group (transform node for rotation)
  const doorGroup = new BABYLON.TransformNode(`door-${index}-group`, scene);

// For side walls (left/right), hinge direction is inverted due to rotation
  const isLeftRightWall = door.wall === "left" || door.wall === "right";
  const hingeOffset = hingeSide === "left" 
    ? (isLeftRightWall ? doorWidth / 2 : -doorWidth / 2)
    : (isLeftRightWall ? -doorWidth / 2 : doorWidth / 2);

  // Apply rotation to hinge offset
  const cosR = Math.cos(pos.rotation);
  const sinR = Math.sin(pos.rotation);
  const hingeWorldX = pos.x + hingeOffset * cosR;
  const hingeWorldZ = pos.z + hingeOffset * sinR;

  doorGroup.position = new BABYLON.Vector3(
    hingeWorldX / 1000,
    pos.y / 1000,
    hingeWorldZ / 1000
  );
  doorGroup.rotation.y = pos.rotation;

  const mats = scene._doorMaterials;
  const componentOffset = hingeSide === "left" ? doorWidth / 2 : -doorWidth / 2;

  // Create vertical boards
  for (let i = 0; i < numBoards; i++) {
    const boardW = i === numBoards - 1 
      ? doorWidth - (numBoards - 1) * boardWidth_mm 
      : boardWidth_mm;

    const board = BABYLON.MeshBuilder.CreateBox(
      `door-${index}-board-${i}`,
      {
        width: (boardW - 5) / 1000,
        height: (doorHeight - 40) / 1000,
        depth: doorThickness_mm / 1000
      },
      scene
    );

    const boardOffsetFromHinge = i * boardWidth_mm + boardW / 2;
    const boardX = hingeSide === "left" ? boardOffsetFromHinge : -boardOffsetFromHinge;

    board.position = new BABYLON.Vector3(boardX / 1000, 0, 10 / 1000);
    board.parent = doorGroup;

    board.material = mats.door;
    board.metadata = { dynamic: true, doorId: door.id };
  }

  // Ledge positions (Y from door center)
  const topLedgeY = doorHeight / 2 - 150;
  const middleLedgeY = 0;
  const bottomLedgeY = -doorHeight / 2 + 150;

  // Create three horizontal ledges
  [topLedgeY, middleLedgeY, bottomLedgeY].forEach((ledgeY, li) => {
    const ledge = BABYLON.MeshBuilder.CreateBox(
      `door-${index}-ledge-${li}`,
      {
        width: (doorWidth - 40) / 1000,
        height: ledgeHeight_mm / 1000,
        depth: ledgeDepth_mm / 1000
      },
      scene
    );
    ledge.position = new BABYLON.Vector3(
      componentOffset / 1000,
      ledgeY / 1000,
      -ledgeDepth_mm / 2 / 1000
    );
    ledge.parent = doorGroup;
    ledge.material = mats.frame;
    ledge.metadata = { dynamic: true, doorId: door.id };
  });

  // Create diagonal braces (Z pattern)
  const braceHeight_mm = 120;
  const braceDepth_mm = 50;
  const braceHorizontalSpan = doorWidth - 40;

  // Upper brace: from hinge at top to opposite at middle
  const upperBraceLength = Math.sqrt(
    Math.pow(braceHorizontalSpan, 2) + Math.pow(topLedgeY - middleLedgeY, 2)
  );

  const upperBrace = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-brace-upper`,
    {
      width: upperBraceLength / 1000,
      height: braceHeight_mm / 1000,
      depth: braceDepth_mm / 1000
    },
    scene
  );

  const upperBraceX = hingeSide === "left" ? braceHorizontalSpan / 2 : -braceHorizontalSpan / 2;
  const upperBraceY = (topLedgeY + middleLedgeY) / 2;
  const upperBraceAngle = hingeSide === "left"
    ? -Math.atan2(topLedgeY - middleLedgeY, braceHorizontalSpan)
    : Math.atan2(topLedgeY - middleLedgeY, braceHorizontalSpan);

  upperBrace.position = new BABYLON.Vector3(
    upperBraceX / 1000,
    upperBraceY / 1000,
    -ledgeDepth_mm / 2 / 1000
  );
  upperBrace.rotation.z = upperBraceAngle;
  upperBrace.parent = doorGroup;
  upperBrace.material = mats.frame;
  upperBrace.metadata = { dynamic: true, doorId: door.id };

  // Lower brace: from hinge at bottom to opposite at middle
  const lowerBraceLength = Math.sqrt(
    Math.pow(braceHorizontalSpan, 2) + Math.pow(middleLedgeY - bottomLedgeY, 2)
  );

  const lowerBrace = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-brace-lower`,
    {
      width: lowerBraceLength / 1000,
      height: braceHeight_mm / 1000,
      depth: braceDepth_mm / 1000
    },
    scene
  );

  const lowerBraceX = hingeSide === "left" ? braceHorizontalSpan / 2 : -braceHorizontalSpan / 2;
  const lowerBraceY = (bottomLedgeY + middleLedgeY) / 2;
  const lowerBraceAngle = hingeSide === "left"
    ? Math.atan2(middleLedgeY - bottomLedgeY, braceHorizontalSpan)
    : -Math.atan2(middleLedgeY - bottomLedgeY, braceHorizontalSpan);

  lowerBrace.position = new BABYLON.Vector3(
    lowerBraceX / 1000,
    lowerBraceY / 1000,
    -ledgeDepth_mm / 2 / 1000
  );
  lowerBrace.rotation.z = lowerBraceAngle;
  lowerBrace.parent = doorGroup;
  lowerBrace.material = mats.frame;
  lowerBrace.metadata = { dynamic: true, doorId: door.id };

  // T-Hinges
  buildTHinge(scene, doorGroup, 0, topLedgeY, hingeSide, doorThickness_mm, mats.hinge, index, "top");
  buildTHinge(scene, doorGroup, 0, bottomLedgeY, hingeSide, doorThickness_mm, mats.hinge, index, "bottom");

  // Handle open state
  if (isOpen) {
    doorGroup.rotation.y += hingeSide === "left" ? -Math.PI / 2 : Math.PI / 2;
  }

  doorGroup.metadata = { dynamic: true, doorId: door.id };
}

/**
 * Build a T-hinge
 */
function buildTHinge(scene, parent, xPos, yPos, hingeSide, doorThickness, material, doorIndex, position) {
  const hingeWidth_mm = 150;
  const hingeBarWidth_mm = 20;
  const hingeThickness_mm = 3;
  const hingeDepth_mm = 10;

  // Hinge bar (vertical piece at hinge edge)
  const hingeBar = BABYLON.MeshBuilder.CreateBox(
    `door-${doorIndex}-hinge-${position}-bar`,
    {
      width: hingeBarWidth_mm / 1000,
      height: 250 / 1000,
      depth: hingeDepth_mm / 1000
    },
    scene
  );
  hingeBar.position = new BABYLON.Vector3(
    xPos / 1000,
    yPos / 1000,
    (doorThickness / 2 + hingeDepth_mm / 2) / 1000
  );
  hingeBar.parent = parent;
  hingeBar.material = material;
  hingeBar.metadata = { dynamic: true };

  // Hinge plate (horizontal piece extending onto door)
  const hingePlate = BABYLON.MeshBuilder.CreateBox(
    `door-${doorIndex}-hinge-${position}-plate`,
    {
      width: hingeWidth_mm / 1000,
      height: hingeBarWidth_mm / 1000,
      depth: hingeDepth_mm / 1000
    },
    scene
  );
  const plateX = hingeSide === "left" ? hingeWidth_mm / 2 : -hingeWidth_mm / 2;
  hingePlate.position = new BABYLON.Vector3(
    plateX / 1000,
    yPos / 1000,
    (doorThickness / 2 + hingeDepth_mm / 2) / 1000
  );
  hingePlate.parent = parent;
  hingePlate.material = material;
  hingePlate.metadata = { dynamic: true };

  // Hinge pin (cylinder)
  const hingePin = BABYLON.MeshBuilder.CreateCylinder(
    `door-${doorIndex}-hinge-${position}-pin`,
    {
      diameter: hingeThickness_mm / 1000,
      height: (hingeWidth_mm + hingeBarWidth_mm) / 1000
    },
    scene
  );
  hingePin.rotation.x = Math.PI / 2;
  hingePin.position = new BABYLON.Vector3(
    xPos / 1000,
    yPos / 1000,
    (doorThickness / 2 + hingeDepth_mm + hingeThickness_mm / 2) / 1000
  );
  hingePin.parent = parent;
  hingePin.material = material;
  hingePin.metadata = { dynamic: true };
}

/**
 * Build French doors (double doors with glass panels)
 */
function buildFrenchDoor(scene, door, pos, doorWidth, doorHeight, index, materials) {
  const isOpen = door.isOpen || false;
  const handleSide = door.handleSide || "right";

  // Dimensions in mm
  const doorThickness_mm = 40;
  const frameWidth_mm = 60;
  const kickboardHeight_mm = Math.floor(doorHeight * 0.18);
  const glassHeight_mm = doorHeight - kickboardHeight_mm - frameWidth_mm * 2;
  const panelWidth_mm = doorWidth / 2;
  const centerStileWidth_mm = 50;

  const mats = scene._doorMaterials;

  // Create door group
  const doorGroup = new BABYLON.TransformNode(`door-${index}-french-group`, scene);
  doorGroup.position = new BABYLON.Vector3(pos.x / 1000, pos.y / 1000, pos.z / 1000);
  doorGroup.rotation.y = pos.rotation;

  // Build left panel
  buildFrenchDoorPanel(
    scene, doorGroup,
    -panelWidth_mm / 2,
    panelWidth_mm, doorHeight, glassHeight_mm, kickboardHeight_mm,
    frameWidth_mm, doorThickness_mm,
    mats, index, "left"
  );

  // Build right panel
  buildFrenchDoorPanel(
    scene, doorGroup,
    panelWidth_mm / 2,
    panelWidth_mm, doorHeight, glassHeight_mm, kickboardHeight_mm,
    frameWidth_mm, doorThickness_mm,
    mats, index, "right"
  );

  // Center stile (where doors meet)
  const centerStile = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-french-center-stile`,
    {
      width: centerStileWidth_mm / 1000,
      height: (doorHeight - 20) / 1000,
      depth: doorThickness_mm / 1000
    },
    scene
  );
  centerStile.position = new BABYLON.Vector3(0, 0, 10 / 1000);
  centerStile.parent = doorGroup;
  centerStile.material = mats.door;
  centerStile.metadata = { dynamic: true, doorId: door.id };

  // Hinges on outer edges
  const hingeY_top = doorHeight / 2 - 150;
  const hingeY_bottom = -doorHeight / 2 + 150;

  buildFrenchHinge(scene, doorGroup, -doorWidth / 2 + 30, hingeY_top, doorThickness_mm, mats.hinge, index, "top_left");
  buildFrenchHinge(scene, doorGroup, -doorWidth / 2 + 30, hingeY_bottom, doorThickness_mm, mats.hinge, index, "bottom_left");
  buildFrenchHinge(scene, doorGroup, doorWidth / 2 - 30, hingeY_top, doorThickness_mm, mats.hinge, index, "top_right");
  buildFrenchHinge(scene, doorGroup, doorWidth / 2 - 30, hingeY_bottom, doorThickness_mm, mats.hinge, index, "bottom_right");

  if (isOpen) {
    const openAngle = handleSide === "left" ? -Math.PI / 2 : Math.PI / 2;
    doorGroup.rotation.y += openAngle;
  }

  doorGroup.metadata = { dynamic: true, doorId: door.id };
}

/**
 * Build a single panel of a French door
 */
function buildFrenchDoorPanel(scene, parent, xOffset, panelWidth, doorHeight, glassHeight, kickboardHeight, frameWidth, doorThickness, mats, index, side) {
  const innerWidth = panelWidth - frameWidth * 2 - 20;

  // Top rail
  const topRail = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-french-top-rail-${side}`,
    {
      width: (panelWidth - 20) / 1000,
      height: frameWidth / 1000,
      depth: doorThickness / 1000
    },
    scene
  );
  topRail.position = new BABYLON.Vector3(
    xOffset / 1000,
    (doorHeight / 2 - frameWidth / 2) / 1000,
    10 / 1000
  );
  topRail.parent = parent;
  topRail.material = mats.door;
  topRail.metadata = { dynamic: true };

  // Bottom rail
  const bottomRail = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-french-bottom-rail-${side}`,
    {
      width: (panelWidth - 20) / 1000,
      height: frameWidth / 1000,
      depth: doorThickness / 1000
    },
    scene
  );
  bottomRail.position = new BABYLON.Vector3(
    xOffset / 1000,
    (-doorHeight / 2 + frameWidth / 2) / 1000,
    10 / 1000
  );
  bottomRail.parent = parent;
  bottomRail.material = mats.door;
  bottomRail.metadata = { dynamic: true };

  // Outer stile
  const outerStileX = side === "left"
    ? xOffset - panelWidth / 2 + frameWidth / 2
    : xOffset + panelWidth / 2 - frameWidth / 2;

  const outerStile = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-french-outer-stile-${side}`,
    {
      width: frameWidth / 1000,
      height: (doorHeight - frameWidth * 2) / 1000,
      depth: doorThickness / 1000
    },
    scene
  );
  outerStile.position = new BABYLON.Vector3(outerStileX / 1000, 0, 10 / 1000);
  outerStile.parent = parent;
  outerStile.material = mats.door;
  outerStile.metadata = { dynamic: true };

  // Inner stile
  const innerStileX = side === "left"
    ? xOffset + panelWidth / 2 - frameWidth / 2 - 10
    : xOffset - panelWidth / 2 + frameWidth / 2 + 10;

  const innerStile = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-french-inner-stile-${side}`,
    {
      width: frameWidth / 1000,
      height: (doorHeight - frameWidth * 2) / 1000,
      depth: doorThickness / 1000
    },
    scene
  );
  innerStile.position = new BABYLON.Vector3(innerStileX / 1000, 0, 10 / 1000);
  innerStile.parent = parent;
  innerStile.material = mats.door;
  innerStile.metadata = { dynamic: true };

  // Middle rail (separates glass from kickboard)
  const midRailY = -doorHeight / 2 + kickboardHeight + frameWidth / 2;

  const midRail = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-french-mid-rail-${side}`,
    {
      width: (panelWidth - 20) / 1000,
      height: frameWidth / 1000,
      depth: doorThickness / 1000
    },
    scene
  );
  midRail.position = new BABYLON.Vector3(xOffset / 1000, midRailY / 1000, 10 / 1000);
  midRail.parent = parent;
  midRail.material = mats.door;
  midRail.metadata = { dynamic: true };

  // Glass pane
  const glassY = midRailY + frameWidth / 2 + glassHeight / 2;

  const glass = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-french-glass-${side}`,
    {
      width: (innerWidth - frameWidth) / 1000,
      height: (glassHeight - frameWidth) / 1000,
      depth: 6 / 1000
    },
    scene
  );
  glass.position = new BABYLON.Vector3(xOffset / 1000, glassY / 1000, 10 / 1000);
  glass.parent = parent;
  glass.material = mats.glass;
  glass.metadata = { dynamic: true };

  // Kickboard - tongue and groove boards
  const kickboardY = -doorHeight / 2 + frameWidth + kickboardHeight / 2;
  const boardWidth = 60;
  const numBoards = Math.ceil(innerWidth / boardWidth);

  for (let i = 0; i < numBoards; i++) {
    const boardX = xOffset - innerWidth / 2 + boardWidth / 2 + i * boardWidth + frameWidth / 2;
    if (boardX > xOffset + innerWidth / 2 - frameWidth / 2) break;

    const board = BABYLON.MeshBuilder.CreateBox(
      `door-${index}-french-kickboard-${side}-${i}`,
      {
        width: (boardWidth - 4) / 1000,
        height: (kickboardHeight - frameWidth - 20) / 1000,
        depth: (doorThickness - 10) / 1000
      },
      scene
    );
    board.position = new BABYLON.Vector3(boardX / 1000, kickboardY / 1000, 10 / 1000);
    board.parent = parent;

    board.material = mats.door;
    board.metadata = { dynamic: true };
  }
}

/**
 * Build a French door hinge (simple cylinder)
 */
function buildFrenchHinge(scene, parent, x, y, doorThickness, material, index, position) {
  const hinge = BABYLON.MeshBuilder.CreateCylinder(
    `door-${index}-french-hinge-${position}`,
    {
      height: 80 / 1000,
      diameter: 20 / 1000
    },
    scene
  );
  hinge.position = new BABYLON.Vector3(x / 1000, y / 1000, (doorThickness / 2 + 10) / 1000);
  hinge.rotation.x = Math.PI / 2;
  hinge.parent = parent;
  hinge.material = material;
  hinge.metadata = { dynamic: true };
}

/**
 * Build mortise-tenon door (traditional joinery)
 */
function buildMortiseTenon(scene, door, pos, doorWidth, doorHeight, index, materials) {
  const hingeSide = door.handleSide || "left";
  const isOpen = door.isOpen || false;

  // Dimensions in mm
  const doorThickness_mm = 35;
  const boardWidth_mm = 100;
  const numBoards = Math.ceil(doorWidth / boardWidth_mm);

  const mats = scene._doorMaterials;

  // Create door group at hinge edge
  const doorGroup = new BABYLON.TransformNode(`door-${index}-mortise-group`, scene);

 // For side walls (left/right), hinge direction is inverted due to rotation
  const isLeftRightWall = door.wall === "left" || door.wall === "right";
  const hingeOffset = hingeSide === "left" 
    ? (isLeftRightWall ? doorWidth / 2 : -doorWidth / 2)
    : (isLeftRightWall ? -doorWidth / 2 : doorWidth / 2);
  const cosR = Math.cos(pos.rotation);
  const sinR = Math.sin(pos.rotation);
  const hingeWorldX = pos.x + hingeOffset * cosR;
  const hingeWorldZ = pos.z + hingeOffset * sinR;

  doorGroup.position = new BABYLON.Vector3(
    hingeWorldX / 1000,
    pos.y / 1000,
    hingeWorldZ / 1000
  );
  doorGroup.rotation.y = pos.rotation;

  const componentOffset = hingeSide === "left" ? doorWidth / 2 : -doorWidth / 2;

  // Front side: vertical tongue-and-groove boards
  for (let i = 0; i < numBoards; i++) {
    const boardW = i === numBoards - 1
      ? doorWidth - (numBoards - 1) * boardWidth_mm
      : boardWidth_mm;

    const board = BABYLON.MeshBuilder.CreateBox(
      `door-${index}-mortise-board-${i}`,
      {
        width: (boardW - 5) / 1000,
        height: (doorHeight - 20) / 1000,
        depth: (doorThickness_mm * 0.6) / 1000
      },
      scene
    );

    const boardOffsetFromHinge = i * boardWidth_mm + boardW / 2;
    const boardX = hingeSide === "left" ? boardOffsetFromHinge : -boardOffsetFromHinge;

    board.position = new BABYLON.Vector3(boardX / 1000, 0, (doorThickness_mm * 0.3) / 1000);
    board.parent = doorGroup;

    board.material = mats.door;
    board.metadata = { dynamic: true, doorId: door.id };
  }

  // Back side frame
  const frameDepth = doorThickness_mm * 0.5;
  const stileWidth = 70;
  const railHeight = 80;

  // Left stile
  const leftStileOffset = hingeSide === "left" ? stileWidth / 2 : -doorWidth + stileWidth / 2;
  const leftStile = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-left-stile`,
    {
      width: stileWidth / 1000,
      height: doorHeight / 1000,
      depth: frameDepth / 1000
    },
    scene
  );
  leftStile.position = new BABYLON.Vector3(leftStileOffset / 1000, 0, -frameDepth / 2 / 1000);
  leftStile.parent = doorGroup;
  leftStile.material = mats.frame;
  leftStile.metadata = { dynamic: true, doorId: door.id };

  // Right stile
  const rightStileOffset = hingeSide === "left" ? doorWidth - stileWidth / 2 : -stileWidth / 2;
  const rightStile = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-right-stile`,
    {
      width: stileWidth / 1000,
      height: doorHeight / 1000,
      depth: frameDepth / 1000
    },
    scene
  );
  rightStile.position = new BABYLON.Vector3(rightStileOffset / 1000, 0, -frameDepth / 2 / 1000);
  rightStile.parent = doorGroup;
  rightStile.material = mats.frame;
  rightStile.metadata = { dynamic: true, doorId: door.id };

  // Top rail
  const topRail = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-top-rail`,
    {
      width: (doorWidth - stileWidth * 2) / 1000,
      height: railHeight / 1000,
      depth: frameDepth / 1000
    },
    scene
  );
  topRail.position = new BABYLON.Vector3(
    componentOffset / 1000,
    (doorHeight / 2 - railHeight / 2 - 20) / 1000,
    -frameDepth / 2 / 1000
  );
  topRail.parent = doorGroup;
  topRail.material = mats.frame;
  topRail.metadata = { dynamic: true, doorId: door.id };

  // Middle rail
  const middleRail = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-mid-rail`,
    {
      width: (doorWidth - stileWidth * 2) / 1000,
      height: railHeight / 1000,
      depth: frameDepth / 1000
    },
    scene
  );
  middleRail.position = new BABYLON.Vector3(componentOffset / 1000, 0, -frameDepth / 2 / 1000);
  middleRail.parent = doorGroup;
  middleRail.material = mats.frame;
  middleRail.metadata = { dynamic: true, doorId: door.id };

  // Bottom rail
  const bottomRail = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-bottom-rail`,
    {
      width: (doorWidth - stileWidth * 2) / 1000,
      height: railHeight / 1000,
      depth: frameDepth / 1000
    },
    scene
  );
  bottomRail.position = new BABYLON.Vector3(
    componentOffset / 1000,
    (-doorHeight / 2 + railHeight / 2 + 20) / 1000,
    -frameDepth / 2 / 1000
  );
  bottomRail.parent = doorGroup;
  bottomRail.material = mats.frame;
  bottomRail.metadata = { dynamic: true, doorId: door.id };

  // Diagonal braces
  const braceWidth = 120;
  const innerWidth = doorWidth - stileWidth * 2;
  const upperSectionHeight = doorHeight / 2 - railHeight / 2 - 20 - railHeight / 2;
  const lowerSectionHeight = doorHeight / 2 - railHeight / 2 - railHeight / 2 - 20;

  const braceHorizontalSpan = innerWidth;
  const upperDiagLength = Math.sqrt(braceHorizontalSpan * braceHorizontalSpan + upperSectionHeight * upperSectionHeight);

  // Upper diagonal
  const upperDiag = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-upper-diag`,
    {
      width: upperDiagLength / 1000,
      height: braceWidth / 1000,
      depth: frameDepth / 1000
    },
    scene
  );
  const upperDiagYOffset = railHeight / 2 + upperSectionHeight / 2;
  const upperDiagX = hingeSide === "left"
    ? braceHorizontalSpan / 2 + stileWidth
    : -braceHorizontalSpan / 2 - stileWidth;
  const upperDiagAngle = hingeSide === "left"
    ? -Math.atan2(upperSectionHeight, braceHorizontalSpan)
    : Math.atan2(upperSectionHeight, braceHorizontalSpan);

  upperDiag.position = new BABYLON.Vector3(upperDiagX / 1000, upperDiagYOffset / 1000, -frameDepth / 2 / 1000);
  upperDiag.rotation.z = upperDiagAngle;
  upperDiag.parent = doorGroup;
  upperDiag.material = mats.frame;
  upperDiag.metadata = { dynamic: true, doorId: door.id };

  // Lower diagonal
  const lowerDiagLength = Math.sqrt(braceHorizontalSpan * braceHorizontalSpan + lowerSectionHeight * lowerSectionHeight);

  const lowerDiag = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-lower-diag`,
    {
      width: lowerDiagLength / 1000,
      height: braceWidth / 1000,
      depth: frameDepth / 1000
    },
    scene
  );
  const lowerDiagYOffset = -railHeight / 2 - lowerSectionHeight / 2;
  const lowerDiagX = hingeSide === "left"
    ? braceHorizontalSpan / 2 + stileWidth
    : -braceHorizontalSpan / 2 - stileWidth;
  const lowerDiagAngle = hingeSide === "left"
    ? Math.atan2(lowerSectionHeight, braceHorizontalSpan)
    : -Math.atan2(lowerSectionHeight, braceHorizontalSpan);

  lowerDiag.position = new BABYLON.Vector3(lowerDiagX / 1000, lowerDiagYOffset / 1000, -frameDepth / 2 / 1000);
  lowerDiag.rotation.z = lowerDiagAngle;
  lowerDiag.parent = doorGroup;
  lowerDiag.material = mats.frame;
  lowerDiag.metadata = { dynamic: true, doorId: door.id };

  // Handle
  const handleX = hingeSide === "left" ? doorWidth - 80 : -doorWidth + 80;

  const handlePlate = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-handle-plate`,
    {
      width: 30 / 1000,
      height: 120 / 1000,
      depth: 8 / 1000
    },
    scene
  );
  handlePlate.position = new BABYLON.Vector3(
    handleX / 1000,
    0,
    (doorThickness_mm * 0.6 + 10) / 1000
  );
  handlePlate.parent = doorGroup;
  handlePlate.material = mats.hinge;
  handlePlate.metadata = { dynamic: true, doorId: door.id };

  const handleLever = BABYLON.MeshBuilder.CreateBox(
    `door-${index}-mortise-handle-lever`,
    {
      width: 80 / 1000,
      height: 15 / 1000,
      depth: 15 / 1000
    },
    scene
  );
  const leverDir = hingeSide === "left" ? -1 : 1;
  handleLever.position = new BABYLON.Vector3(
    (handleX + leverDir * 40) / 1000,
    20 / 1000,
    (doorThickness_mm * 0.6 + 20) / 1000
  );
  handleLever.parent = doorGroup;
  handleLever.material = mats.hinge;
  handleLever.metadata = { dynamic: true, doorId: door.id };

  // T-Hinges
  const topLedgeY = doorHeight / 2 - 150;
  const bottomLedgeY = -doorHeight / 2 + 150;

  buildTHinge(scene, doorGroup, 0, topLedgeY, hingeSide, doorThickness_mm, mats.hinge, index, "top");
  buildTHinge(scene, doorGroup, 0, bottomLedgeY, hingeSide, doorThickness_mm, mats.hinge, index, "bottom");

  if (isOpen) {
    const openAngle = hingeSide === "left" ? -Math.PI / 2 : Math.PI / 2;
    doorGroup.rotation.y += openAngle;
  }

  doorGroup.metadata = { dynamic: true, doorId: door.id };
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
 * Generate BOM for doors
 */
export function updateBOM(state) {
  const sections = [];
  const openings = Array.isArray(state.walls?.openings) ? state.walls.openings : [];
  const doors = openings.filter((o) => o && o.type === "door" && o.enabled !== false);

  if (doors.length === 0) {
    return { sections: [] };
  }

  sections.push(["DOORS", "", "", "", "", ""]);

  doors.forEach((door, index) => {
    const style = door.style || "standard";
    const doorWidth = Math.max(100, Math.floor(door.width_mm || 800));
    const doorHeight = Math.max(100, Math.floor(door.height_mm || 2000));
    const wallId = door.wall || "front";

    sections.push([`  Door ${index + 1} (${style})`, "", "", "", "", `Wall: ${wallId}, ${doorWidth}×${doorHeight}mm`]);

    if (style === "standard" || style === "mortise-tenon") {
      // Vertical boards
      const boardWidth = 100;
      const numBoards = Math.ceil(doorWidth / boardWidth);
      sections.push([`    T&G Boards`, numBoards, doorHeight - 40, boardWidth - 5, 35, "Vertical cladding"]);

      // Ledges
      sections.push([`    Ledges`, 3, doorWidth - 40, 120, 50, "Horizontal battens"]);

      // Braces
      const braceSpan = doorWidth - 40;
      const braceRise = doorHeight / 2 - 150;
      const braceLen = Math.floor(Math.sqrt(braceSpan * braceSpan + braceRise * braceRise));
      sections.push([`    Braces`, 2, braceLen, 120, 50, "Diagonal"]);

      // Hinges
      sections.push([`    T-Hinges`, 2, 150, 250, 3, "Black iron"]);
    }

    if (style === "french" || style === "double-standard") {
      const panelWidth = doorWidth / 2;
      const kickboardHeight = Math.floor(doorHeight * 0.18);
      const glassHeight = doorHeight - kickboardHeight - 60 * 2;

      // Frame pieces (per panel, x2)
      sections.push([`    Frame Rails`, 6, panelWidth - 20, 60, 40, "Top, mid, bottom per panel"]);
      sections.push([`    Frame Stiles`, 4, doorHeight - 120, 60, 40, "Outer + inner per panel"]);
      sections.push([`    Center Stile`, 1, doorHeight - 20, 50, 40, "Where doors meet"]);

      // Glass
      const glassWidth = (panelWidth - 60 * 2 - 20 - 60);
      sections.push([`    Glass Panes`, 2, glassHeight - 60, glassWidth, 6, "Tempered"]);

      // Kickboard
      const numBoards = Math.ceil((panelWidth - 60 * 2 - 20) / 60);
      sections.push([`    Kickboard Boards`, numBoards * 2, kickboardHeight - 80, 56, 30, "T&G panels"]);

      // Hinges
      sections.push([`    Hinges`, 4, 80, 20, 20, "Cylinder hinges"]);
    }

    if (style === "mortise-tenon") {
      // Additional back frame
      sections.push([`    Back Stiles`, 2, doorHeight, 70, 17, "Mortise-tenon frame"]);
      sections.push([`    Back Rails`, 3, doorWidth - 140, 80, 17, "Mortise-tenon frame"]);

      // Diagonals
      const innerWidth = doorWidth - 70 * 2;
      const sectionHeight = doorHeight / 2 - 80;
      const diagLen = Math.floor(Math.sqrt(innerWidth * innerWidth + sectionHeight * sectionHeight));
      sections.push([`    Diagonal Braces`, 2, diagLen, 120, 17, "Back frame"]);
    }
  });

  return { sections };
}
