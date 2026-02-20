/**
 * @fileoverview Roof Builder - Creates pent and apex roof structures
 * 
 * Supports two roof styles:
 * - **Pent (lean-to)**: Single slope from high edge to low edge
 * - **Apex (gabled)**: Two slopes meeting at a central ridge
 * 
 * ## Pent Roof Components
 * - Rafters running down the slope
 * - Rim joists at front and back
 * - OSB sheathing on top of rafters
 * - Felt covering with fold-down edges
 * - Fascia boards at all edges
 * 
 * ## Apex Roof Components
 * - Trusses at regular intervals (default 600mm)
 *   - Two rafters meeting at peak
 *   - Tie beam at eaves level (or raised option)
 *   - Optional kingpost
 * - Purlins running along the roof at 609mm centres (OSB edge support)
 * - OSB sheathing in individual 8×4ft sheets
 * - Felt covering with fold-down edges
 * - Ridge cap at peak
 * - Fascia boards at eaves and verges
 * 
 * ## Mesh Naming Convention
 * All roof meshes use the pattern: `${meshPrefix}roof-${part}-${index}`
 * Where meshPrefix includes section ID for multi-section buildings.
 * 
 * ## Key Measurements
 * - Rafter section: 100mm × 50mm (W × D)
 * - Purlin spacing: 609mm (half of 1220mm OSB width)
 * - Truss spacing: 600mm (configurable via trussCount)
 * - OSB thickness: 18mm
 * - Covering thickness: 2mm
 * - Fascia: 20mm × 135mm
 * 
 * @module elements/roof
 */

import { CONFIG, resolveDims } from "../params.js";
import { buildTileLayers, disposeTileMeshes } from "./roof-tiles.js?_v=9";
import { getSkylightOpenings } from "./skylights.js?_v=11";

/**
 * Builds the 3D roof geometry for the current building state.
 * Dispatches to buildPent() or buildApex() based on roof style.
 * 
 * @param {Object} state - The building state object containing all parameters
 * @param {Object} ctx - Babylon.js context containing scene and materials
 * @param {BABYLON.Scene} ctx.scene - The Babylon.js scene
 * @param {Object} ctx.materials - Material definitions (timber, osb, etc.)
 * @param {Object} [sectionContext] - Optional section context for multi-section buildings
 * @param {string} [sectionContext.sectionId] - Unique identifier for this section
 * @param {Object} [sectionContext.position] - Position offset {x, y, z} in mm
 */
export function build3D(state, ctx, sectionContext) {
  console.log("[ROOF] build3D called", { state: !!state, ctx: !!ctx, sectionContext });
  const { scene, materials } = ctx || {};
  if (!scene) {
    console.log("[ROOF] No scene, early return");
    return;
  }

  // Section context is OPTIONAL - when undefined, behaves exactly as legacy single-building mode
  // sectionContext = { sectionId: string, position: { x: number, y: number, z: number } }
  const sectionId = sectionContext?.sectionId;
  const sectionPos = sectionContext?.position || { x: 0, y: 0, z: 0 };

  // Create section-aware mesh prefix
  const meshPrefix = sectionId ? `section-${sectionId}-` : "";
  const roofPrefix = meshPrefix + "roof-";
  console.log("[ROOF] meshPrefix:", meshPrefix, "sectionPos:", sectionPos);

  // ---- Remove any prior APEX cladding-trim hooks/cutters (order-independent rebuild safety) ----
  try {
    if (scene._apexCladdingTrimObserver) {
      scene.onNewMeshAddedObservable.remove(scene._apexCladdingTrimObserver);
      scene._apexCladdingTrimObserver = null;
    }
    if (scene._apexCladdingTrimCutter && !scene._apexCladdingTrimCutter.isDisposed()) {
      scene._apexCladdingTrimCutter.dispose(false, false);
    }
    scene._apexCladdingTrimCutter = null;
    scene._apexRoofUnderside = null;
  } catch (e) {}

  // ---- HARD DISPOSAL (meshes + transform nodes), children before parents ----
  // Dispose only meshes for this section (or all roof meshes in legacy mode)
  const roofMeshes = [];
  const roofNodes = new Set();

  for (let i = 0; i < (scene.meshes || []).length; i++) {
    const m = scene.meshes[i];
    if (!m) continue;
    const nm = String(m.name || "");
    const isRoof = nm.startsWith(roofPrefix) && m.metadata && m.metadata.dynamic === true;
    if (isRoof) roofMeshes.push(m);
  }

  for (let i = 0; i < (scene.transformNodes || []).length; i++) {
    const n = scene.transformNodes[i];
    if (!n) continue;
    const nm = String(n.name || "");
    const rootName = meshPrefix + "roof-root";
    if (nm === rootName || nm.startsWith(roofPrefix)) roofNodes.add(n);
  }

  for (let i = 0; i < roofMeshes.length; i++) {
    const m = roofMeshes[i];
    try {
      if (m && !m.isDisposed()) m.dispose(false, false);
    } catch (e) {}
  }

  const nodesArr = Array.from(roofNodes);
  nodesArr.sort((a, b) => {
    const depth = (n) => {
      let d = 0;
      let p = n && n.parent;
      while (p) {
        d++;
        p = p.parent;
      }
      return d;
    };
    return depth(b) - depth(a);
  });
  for (let i = 0; i < nodesArr.length; i++) {
    const n = nodesArr[i];
    try {
      if (n) n.dispose(false);
    } catch (e) {}
  }

  const style = String(state && state.roof && state.roof.style ? state.roof.style : "apex");
  console.log("[ROOF] Roof style:", style);

  if (style === "pent") {
    console.log("[ROOF] Building pent roof");
    try {
      buildPent(state, ctx, meshPrefix, sectionPos, sectionId);
      console.log("[ROOF] Pent roof build COMPLETE");
      // Build tile layers if enabled
      const tilesEnabled = state?.roof?.tiles?.enabled !== false;
      if (tilesEnabled) {
        console.log("[ROOF] Building tile layers (pent)...");
        buildTileLayers(state, ctx, null, state?.roof?.tiles || {});
      }
    } catch (e) {
      console.error("[ROOF] Pent roof build FAILED:", e);
    }
    return;
  }

  if (style === "apex") {
    console.log("[ROOF] Building apex roof");
    try {
      buildApex(state, ctx, meshPrefix, sectionPos, sectionId);
      console.log("[ROOF] Apex roof build COMPLETE");
      // Build tile layers if enabled (default to enabled for testing)
      const tilesEnabled = state?.roof?.tiles?.enabled !== false;
      if (tilesEnabled) {
        console.log("[ROOF] Building tile layers...");
        buildTileLayers(state, ctx, null, state?.roof?.tiles || {});
      }
    } catch (e) {
      console.error("[ROOF] Apex roof build FAILED:", e);
    }
    return;
  }

  if (style === "hipped") {
    console.log("[ROOF] Building hipped roof");
    try {
      buildHipped(state, ctx, meshPrefix, sectionPos, sectionId);
      console.log("[ROOF] Hipped roof build COMPLETE");
      // Build tile layers if enabled
      const tilesEnabled = state?.roof?.tiles?.enabled !== false;
      if (tilesEnabled) {
        console.log("[ROOF] Building tile layers (hipped)...");
        buildTileLayers(state, ctx, null, state?.roof?.tiles || {});
      }
    } catch (e) {
      console.error("[ROOF] Hipped roof build FAILED:", e);
    }
    return;
  }

  console.log("[ROOF] Unsupported roof style:", style);
  // Unsupported styles: do nothing.
}

/**
 * Updates the Bill of Materials (BOM) table for roof components.
 * Populates the #roofBomTable element with cutting list data.
 * Dispatches to updateBOM_Pent() or updateBOM_Apex() based on roof style.
 * 
 * @param {Object} state - The building state object
 */
export function updateBOM(state) {
  const tbody = document.getElementById("roofBomTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  const style = String(state && state.roof && state.roof.style ? state.roof.style : "apex");

  if (style === "pent") {
    updateBOM_Pent(state, tbody);
    return;
  }

  if (style === "apex") {
    updateBOM_Apex(state, tbody);
    return;
  }

  if (style === "hipped") {
    updateBOM_Hipped(state, tbody);
    return;
  }

  appendPlaceholderRow(tbody, "Roof not enabled.");
}

/* ----------------------------- PENT (existing) ----------------------------- */

/**
 * Builds a pent (lean-to) roof with single slope.
 * Creates rafters, rim joists, OSB sheathing, felt covering, and fascia boards.
 * 
 * The roof is built in local coordinates under a roofRoot transform node,
 * then positioned and rotated to sit on top of the walls.
 * 
 * @param {Object} state - Building state with roof.pent parameters
 * @param {Object} ctx - Babylon.js context {scene, materials}
 * @param {string} [meshPrefix=""] - Prefix for mesh names (for multi-section)
 * @param {Object} [sectionPos={x:0,y:0,z:0}] - Section position offset in mm
 * @param {string|null} [sectionId=null] - Section identifier for metadata
 * @private
 */
function buildPent(state, ctx, meshPrefix = "", sectionPos = { x: 0, y: 0, z: 0 }, sectionId = null) {
  const { scene, materials } = ctx || {};
  if (!scene) return;
  if (!isPentEnabled(state)) return;

  const roofParts = getRoofParts(state);

  const data = computeRoofData_Pent(state);
  const dims = resolveDims(state);

  const ovh = (dims && dims.overhang) ? dims.overhang : { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };
  const l_mm = Math.max(0, Math.floor(Number(ovh.l_mm || 0)));
  const r_mm = Math.max(0, Math.floor(Number(ovh.r_mm || 0)));
  const f_mm = Math.max(0, Math.floor(Number(ovh.f_mm || 0)));
  const b_mm = Math.max(0, Math.floor(Number(ovh.b_mm || 0)));

  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 1)));

  // Analytic pent heights (authoritative for roof bearing)
  const minH_mm = Math.max(100, Math.floor(Number(data.minH_mm || 2400)));
  const maxH_mm = Math.max(100, Math.floor(Number(data.maxH_mm || 2400)));

  // Materials
  const joistMat = materials && materials.timber ? materials.timber : null;

  const osbMat = (() => {
    try {
      if (scene._roofOsbMat) return scene._roofOsbMat;
      const m = new BABYLON.StandardMaterial("roofOsbMat", scene);
      m.diffuseColor = new BABYLON.Color3(0.75, 0.62, 0.45);
      scene._roofOsbMat = m;
      return m;
    } catch (e) {
      return null;
    }
  })();

  const coveringMat = (() => {
    try {
      if (scene._roofCoveringMat) return scene._roofCoveringMat;
      const m = new BABYLON.StandardMaterial("roofCoveringMat", scene);
      m.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Black
      scene._roofCoveringMat = m;
      return m;
    } catch (e) {
      return null;
    }
  })();

  function mkBoxBottomLocal(name, Lx_mm, Ly_mm, Lz_mm, x_mm, yBottom_m, z_mm, parentNode, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(
      name,
      { width: Lx_mm / 1000, height: Ly_mm / 1000, depth: Lz_mm / 1000 },
      scene
    );

    mesh.position = new BABYLON.Vector3(
      (x_mm + Lx_mm / 2) / 1000,
      yBottom_m + (Ly_mm / 2) / 1000,
      (z_mm + Lz_mm / 2) / 1000
    );

    mesh.material = mat;
    mesh.metadata = Object.assign({ dynamic: true, sectionId: sectionId || null }, meta || {});
    if (parentNode) mesh.parent = parentNode;
    return mesh;
  }

  // ---- Build rigid roof assembly under roofRoot at identity (local underside y=0) ----
  const roofRoot = new BABYLON.TransformNode(`${meshPrefix}roof-root`, scene);
  roofRoot.metadata = { dynamic: true, sectionId: sectionId || null };
  roofRoot.position = new BABYLON.Vector3(sectionPos.x / 1000, sectionPos.y / 1000, sectionPos.z / 1000);
  roofRoot.rotationQuaternion = BABYLON.Quaternion.Identity();

  // ---- NEW: slope (hypotenuse) correction so roof reaches high wall (pent only) ----
  // Keep the pitch angle consistent with current logic (rise/run over the frame span),
  // but extend the physical sloped span so its horizontal projection still matches plan.
  const rise_mm = Math.max(0, Math.floor((maxH_mm - minH_mm)));
  const slopeAlongWorldX = !!data.isWShort;
  const run_mm = Math.max(1, Math.floor(slopeAlongWorldX ? frameW_mm : frameD_mm));
  const slopeLen_mm = Math.max(1, Math.round(Math.sqrt(run_mm * run_mm + rise_mm * rise_mm)));
  const slopeScale = run_mm > 0 ? (slopeLen_mm / run_mm) : 1;

  const A_phys_mm = Math.max(1, Math.round(data.A_mm * slopeScale));
  // ---- END slope correction inputs ----

  const rimThkA_mm = data.rafterW_mm;
  const rimRunB_mm = data.B_mm;
  const rimBackA0_mm = Math.max(0, A_phys_mm - rimThkA_mm);

  function mapABtoLocalXZ(a0, b0, aLen, bLen, isWShort) {
    if (isWShort) return { x0: a0, z0: b0, lenX: aLen, lenZ: bLen }; // A->X, B->Z
    return { x0: b0, z0: a0, lenX: bLen, lenZ: aLen }; // A->Z, B->X
  }

  if (roofParts.structure) {
    // Rim joists (front/back at ends of A; run along B)
    {
      const m = mapABtoLocalXZ(0, 0, rimThkA_mm, rimRunB_mm, data.isWShort);
      mkBoxBottomLocal(
        `${meshPrefix}roof-rim-front`,
        m.lenX,
        data.rafterD_mm,
        m.lenZ,
        m.x0,
        0,
        m.z0,
        roofRoot,
        joistMat,
        { roof: "pent", part: "rim", edge: "front" }
      );
    }
    {
      const m = mapABtoLocalXZ(rimBackA0_mm, 0, rimThkA_mm, rimRunB_mm, data.isWShort);
      mkBoxBottomLocal(
        `${meshPrefix}roof-rim-back`,
        m.lenX,
        data.rafterD_mm,
        m.lenZ,
        m.x0,
        0,
        m.z0,
        roofRoot,
        joistMat,
        { roof: "pent", part: "rim", edge: "back" }
      );
    }

    // Rafters (span A, placed along B @600)
    for (let i = 0; i < data.rafters.length; i++) {
      const r = data.rafters[i];
      const mapped = mapABtoLocalXZ(0, r.b0_mm, A_phys_mm, data.rafterW_mm, data.isWShort);

      mkBoxBottomLocal(
        `${meshPrefix}roof-rafter-${i}`,
        mapped.lenX,
        data.rafterD_mm,
        mapped.lenZ,
        mapped.x0,
        0,
        mapped.z0,
        roofRoot,
        joistMat,
        { roof: "pent", part: "rafter" }
      );
    }
  }

  if (roofParts.osb) {
    // OSB (bottom on top of rafters)
    const osbBottomY_m_local = data.rafterD_mm / 1000;

    // Get skylight openings for pent roof (empty array if no skylights)
    let skyOpeningsPent = [];
    try { skyOpeningsPent = getSkylightOpenings(state, "pent") || []; } catch(e) { /* safe fallback */ }

    let osbIdx = 0;
    for (let i = 0; i < data.osb.all.length; i++) {
      const p = data.osb.all[i];

      let x0_mm = p.x0_mm;
      let z0_mm = p.z0_mm;
      let xLen_mm = p.xLen_mm;
      let zLen_mm = p.zLen_mm;

      // Scale only along the sloped span axis so plan projection remains unchanged after pitch
      if (data.isWShort) {
        x0_mm = Math.round(Number(x0_mm) * slopeScale);
        xLen_mm = Math.max(1, Math.round(Number(xLen_mm) * slopeScale));
      } else {
        z0_mm = Math.round(Number(z0_mm) * slopeScale);
        zLen_mm = Math.max(1, Math.round(Number(zLen_mm) * slopeScale));
      }

      // Convert OSB piece to a/b format for splitRectAroundHoles (a=X slope dir, b=Z depth dir)
      const osbRect = { a0_mm: x0_mm, b0_mm: z0_mm, aLen_mm: xLen_mm, bLen_mm: zLen_mm };

      // Split around skylight openings if any
      const pieces = skyOpeningsPent.length > 0
        ? splitRectAroundHoles(osbRect, skyOpeningsPent)
        : [osbRect];

      for (const sp of pieces) {
        const osbMesh = mkBoxBottomLocal(
          `${meshPrefix}roof-osb-${osbIdx++}`,
          sp.aLen_mm,
          data.osbThickness_mm,
          sp.bLen_mm,
          sp.a0_mm,
          osbBottomY_m_local,
          sp.b0_mm,
          roofRoot,
          osbMat,
          { roof: "pent", part: "osb", kind: sp.kind || p.kind }
        );
      
        // Add witness lines (edge rendering) to show sheet cut boundaries
        if (osbMesh && osbMesh.enableEdgesRendering) {
          osbMesh.enableEdgesRendering();
          osbMesh.edgesWidth = 3;
          osbMesh.edgesColor = new BABYLON.Color4(0, 0, 0, 1);
        }
      }
    }
  }

// Roof covering (felt/membrane) - 2mm thick black sheet over OSB
  // Folds down 100mm at all edges to cover fascia/purlin/rafter ends
  if (roofParts.covering) {
    const COVERING_THK_MM = 2;
    const FOLD_DOWN_MM = 100;
    
    // Covering sits on top of OSB
    const osbTopY_m_local = (data.rafterD_mm + data.osbThickness_mm) / 1000;
    
    // Main covering panel dimensions (same as OSB, no extension)
    // Physical dimensions need slope scaling like OSB
    let coveringX_mm = data.roofW_mm;
    let coveringZ_mm = data.roofD_mm;
    
    // Apply slope scaling to the sloped dimension
    if (data.isWShort) {
      coveringX_mm = Math.round(coveringX_mm * slopeScale);
    } else {
      coveringZ_mm = Math.round(coveringZ_mm * slopeScale);
    }
    
    // Main covering panel — split around skylight openings if any
    // Get skylight openings (reuse from OSB section or fetch fresh)
    let skyOpeningsCov = [];
    try { skyOpeningsCov = getSkylightOpenings(state, "pent") || []; } catch(e) { /* safe */ }

    // Covering rect in a/b format (a=X slope dir, b=Z depth dir)
    const covRect = { a0_mm: 0, b0_mm: 0, aLen_mm: coveringX_mm, bLen_mm: coveringZ_mm };

    if (skyOpeningsCov.length > 0) {
      const covPieces = splitRectAroundHoles(covRect, skyOpeningsCov);
      for (let ci = 0; ci < covPieces.length; ci++) {
        mkBoxBottomLocal(
          `${meshPrefix}roof-covering-${ci}`,
          covPieces[ci].aLen_mm,
          COVERING_THK_MM,
          covPieces[ci].bLen_mm,
          covPieces[ci].a0_mm,
          osbTopY_m_local,
          covPieces[ci].b0_mm,
          roofRoot,
          coveringMat,
          { roof: "pent", part: "covering" }
        );
      }
    } else {
      // No skylights — single panel as before
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering`,
        coveringX_mm,
        COVERING_THK_MM,
        coveringZ_mm,
        0,
        osbTopY_m_local,
        0,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering" }
      );
    }
    
    // OSB top surface Y in local coords (for fold positioning)
    const osbTopY_mm = data.rafterD_mm + data.osbThickness_mm;
    
    // Eaves fold (low edge of slope - at x=0 for isWShort, z=0 otherwise)
    // This is a vertical strip hanging down from the low edge
    if (data.isWShort) {
      // Slope runs along X, eaves at X=0
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-eaves`,
        COVERING_THK_MM,
        FOLD_DOWN_MM,
        coveringZ_mm,
        -COVERING_THK_MM,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        0,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-eaves" }
      );
    } else {
      // Slope runs along Z, eaves at Z=0
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-eaves`,
        coveringX_mm,
        FOLD_DOWN_MM,
        COVERING_THK_MM,
        0,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        -COVERING_THK_MM,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-eaves" }
      );
    }
    
    // Ridge fold (high edge of slope - at x=coveringX for isWShort, z=coveringZ otherwise)
    if (data.isWShort) {
      // Slope runs along X, ridge at X=coveringX_mm
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-ridge`,
        COVERING_THK_MM,
        FOLD_DOWN_MM,
        coveringZ_mm,
        coveringX_mm,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        0,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-ridge" }
      );
    } else {
      // Slope runs along Z, ridge at Z=coveringZ_mm
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-ridge`,
        coveringX_mm,
        FOLD_DOWN_MM,
        COVERING_THK_MM,
        0,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        coveringZ_mm,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-ridge" }
      );
    }
    
    // Left verge fold (at z=0 for isWShort, x=0 otherwise)
    if (data.isWShort) {
      // Verge at Z=0, runs along X (sloped)
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-verge-left`,
        coveringX_mm,
        FOLD_DOWN_MM,
        COVERING_THK_MM,
        0,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        -COVERING_THK_MM,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-verge", edge: "left" }
      );
    } else {
      // Verge at X=0, runs along Z (sloped)
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-verge-left`,
        COVERING_THK_MM,
        FOLD_DOWN_MM,
        coveringZ_mm,
        -COVERING_THK_MM,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        0,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-verge", edge: "left" }
      );
    }
    
    // Right verge fold (at z=coveringZ for isWShort, x=coveringX otherwise)
    if (data.isWShort) {
      // Verge at Z=coveringZ_mm, runs along X (sloped)
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-verge-right`,
        coveringX_mm,
        FOLD_DOWN_MM,
        COVERING_THK_MM,
        0,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        coveringZ_mm,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-verge", edge: "right" }
      );
    } else {
      // Verge at X=coveringX_mm, runs along Z (sloped)
      mkBoxBottomLocal(
        `${meshPrefix}roof-covering-verge-right`,
        COVERING_THK_MM,
        FOLD_DOWN_MM,
        coveringZ_mm,
        coveringX_mm,
        osbTopY_m_local - (FOLD_DOWN_MM / 1000),
        0,
        roofRoot,
        coveringMat,
        { roof: "pent", part: "covering-verge", edge: "right" }
      );
    }
  }
// Roof fascia boards - 20mm thick x 135mm deep timber trim around roof perimeter
  if (roofParts.covering) {
    const FASCIA_THK_MM = 20;
    const FASCIA_DEPTH_MM = 135;
    
    // Use wood grain fascia material from babylon.js if available
    const fasciaMat = scene._fasciaMat || joistMat;
    
    // Covering dimensions (already slope-scaled)
    let fasciaX_mm = data.roofW_mm;
    let fasciaZ_mm = data.roofD_mm;
    if (data.isWShort) {
      fasciaX_mm = Math.round(fasciaX_mm * slopeScale);
    } else {
      fasciaZ_mm = Math.round(fasciaZ_mm * slopeScale);
    }
    
    // Y position: fascia hangs down from underside of roof structure
    // Top of fascia aligns with top of OSB
    const osbTopY_m_local = (data.rafterD_mm + data.osbThickness_mm) / 1000;
    const fasciaTopY_m = osbTopY_m_local;
    const fasciaBottomY_m = fasciaTopY_m - (FASCIA_DEPTH_MM / 1000);
    
    if (data.isWShort) {
      // Slope runs along X
      // Eaves fascia (low edge at X=0, runs along Z)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-eaves`,
        FASCIA_THK_MM,
        FASCIA_DEPTH_MM,
        fasciaZ_mm + 2 * FASCIA_THK_MM, // extend to cover corners
        -FASCIA_THK_MM,
        fasciaBottomY_m,
        -FASCIA_THK_MM,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "eaves" }
      );
      
      // Ridge fascia (high edge at X=fasciaX_mm, runs along Z)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-ridge`,
        FASCIA_THK_MM,
        FASCIA_DEPTH_MM,
        fasciaZ_mm + 2 * FASCIA_THK_MM,
        fasciaX_mm,
        fasciaBottomY_m,
        -FASCIA_THK_MM,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "ridge" }
      );
      
      // Left verge fascia (at Z=0, runs along X slope)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-verge-left`,
        fasciaX_mm,
        FASCIA_DEPTH_MM,
        FASCIA_THK_MM,
        0,
        fasciaBottomY_m,
        -FASCIA_THK_MM,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "verge-left" }
      );
      
      // Right verge fascia (at Z=fasciaZ_mm, runs along X slope)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-verge-right`,
        fasciaX_mm,
        FASCIA_DEPTH_MM,
        FASCIA_THK_MM,
        0,
        fasciaBottomY_m,
        fasciaZ_mm,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "verge-right" }
      );
    } else {
      // Slope runs along Z
      // Eaves fascia (low edge at Z=0, runs along X)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-eaves`,
        fasciaX_mm + 2 * FASCIA_THK_MM,
        FASCIA_DEPTH_MM,
        FASCIA_THK_MM,
        -FASCIA_THK_MM,
        fasciaBottomY_m,
        -FASCIA_THK_MM,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "eaves" }
      );
      
      // Ridge fascia (high edge at Z=fasciaZ_mm, runs along X)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-ridge`,
        fasciaX_mm + 2 * FASCIA_THK_MM,
        FASCIA_DEPTH_MM,
        FASCIA_THK_MM,
        -FASCIA_THK_MM,
        fasciaBottomY_m,
        fasciaZ_mm,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "ridge" }
      );
      
      // Left verge fascia (at X=0, runs along Z slope)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-verge-left`,
        FASCIA_THK_MM,
        FASCIA_DEPTH_MM,
        fasciaZ_mm,
        -FASCIA_THK_MM,
        fasciaBottomY_m,
        0,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "verge-left" }
      );
      
      // Right verge fascia (at X=fasciaX_mm, runs along Z slope)
      mkBoxBottomLocal(
        `${meshPrefix}roof-fascia-verge-right`,
        FASCIA_THK_MM,
        FASCIA_DEPTH_MM,
        fasciaZ_mm,
        fasciaX_mm,
        fasciaBottomY_m,
        0,
        roofRoot,
        fasciaMat,
        { roof: "pent", part: "fascia", edge: "verge-right" }
      );
    }
  }
  // ---- PENT ROOF INSULATION (PIR panels between rafters, interior side) ----
  // Only for insulated variant. Panels sit below rafters, between them.
  if (roofParts.insulation && data.rafters.length >= 2) {
    const INS_THICKNESS_MM = 50; // 50mm PIR
    const insBottomY_m = -INS_THICKNESS_MM / 1000; // Below rafter underside (local y=0 is rafter bottom)

    const insMat = new BABYLON.StandardMaterial(`${meshPrefix}roofInsMat-pent`, scene);
    insMat.diffuseColor = new BABYLON.Color3(0.75, 0.85, 0.45); // Green PIR

    for (let i = 0; i < data.rafters.length - 1; i++) {
      const bayStart_b = data.rafters[i].b0_mm + data.rafterW_mm; // inside edge of rafter i
      const bayEnd_b = data.rafters[i + 1].b0_mm;                  // inside edge of rafter i+1
      const bayWidth_b = bayEnd_b - bayStart_b;
      if (bayWidth_b <= 0) continue;

      // Insulation panel runs along A (slope axis), same length as rafters but slope-scaled
      const insLen_a = A_phys_mm;

      const m = mapABtoLocalXZ(0, bayStart_b, insLen_a, bayWidth_b, data.isWShort);
      mkBoxBottomLocal(
        `${meshPrefix}roof-ins-bay${i}`,
        m.lenX,
        INS_THICKNESS_MM,
        m.lenZ,
        m.x0,
        insBottomY_m,
        m.z0,
        roofRoot,
        insMat,
        { roof: "pent", part: "insulation", bay: i }
      );
    }
    console.log('[ROOF_INS] Pent: Created insulation for', data.rafters.length - 1, 'bays');
  }

  // ---- PENT ROOF INTERIOR PLYWOOD (12mm lining below insulation) ----
  // Only for insulated variant. Continuous sheet below insulation.
  if (roofParts.ply && data.rafters.length >= 2) {
    const INS_THICKNESS_MM = 50;
    const PLY_THICKNESS_MM = 12;
    // Plywood sits below insulation
    const plyBottomY_m = -(INS_THICKNESS_MM + PLY_THICKNESS_MM) / 1000;

    const plyMat = new BABYLON.StandardMaterial(`${meshPrefix}roofPlyMat-pent`, scene);
    plyMat.diffuseColor = new BABYLON.Color3(0.85, 0.75, 0.65); // Light wood

    // Full panel spanning entire roof interior (between first and last rafter)
    const plyStart_b = data.rafters[0].b0_mm;
    const plyEnd_b = data.rafters[data.rafters.length - 1].b0_mm + data.rafterW_mm;
    const plyWidth_b = plyEnd_b - plyStart_b;
    const plyLen_a = A_phys_mm;

    const m = mapABtoLocalXZ(0, plyStart_b, plyLen_a, plyWidth_b, data.isWShort);
    mkBoxBottomLocal(
      `${meshPrefix}roof-ply`,
      m.lenX,
      PLY_THICKNESS_MM,
      m.lenZ,
      m.x0,
      plyBottomY_m,
      m.z0,
      roofRoot,
      plyMat,
      { roof: "pent", part: "ply" }
    );
    console.log('[ROOF_PLY] Pent: Created interior plywood lining');
  }

  // ---- Analytic alignment (no wall mesh queries) ----
  // Authoritative roof plan extents in world:
  // - Frame is at world X:[0..frameW], Z:[0..frameD]
  // - Roof should cover X:[-l..frameW+r], Z:[-f..frameD+b]
  const targetMinX_m = (-l_mm) / 1000;
  const targetMinZ_m = (-f_mm) / 1000;

  // Rotation:
  // - Pent slope follows the shortest plan dimension:
  //   - If roofW <= roofD: slope along WORLD +X (span width)
  //   - If roofW >  roofD: slope along WORLD +Z (span depth)
  const slopeAxisWorld = slopeAlongWorldX ? new BABYLON.Vector3(1, 0, 0) : new BABYLON.Vector3(0, 0, 1);
  const pitchAxisWorld = slopeAlongWorldX ? new BABYLON.Vector3(0, 0, 1) : new BABYLON.Vector3(1, 0, 0);

  // Source axis in roof local that represents A (rafter span axis):
  // data.isWShort => A maps to local X, else A maps to local Z
  const slopeAxisLocal = data.isWShort ? new BABYLON.Vector3(1, 0, 0) : new BABYLON.Vector3(0, 0, 1);

  // Yaw around Y to align slopeAxisLocal -> slopeAxisWorld
  const dotYaw = clamp((slopeAxisLocal.x * slopeAxisWorld.x + slopeAxisLocal.z * slopeAxisWorld.z), -1, 1);
  const crossYawY = (slopeAxisLocal.x * slopeAxisWorld.z - slopeAxisLocal.z * slopeAxisWorld.x);
  let yaw = (Math.acos(dotYaw)) * (crossYawY >= 0 ? 1 : -1);
  const qYaw = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), yaw);

  // Pitch angle derived from analytic rise/run over the SHORT frame span
  const rise_m = (maxH_mm - minH_mm) / 1000;
  const run_m = Math.max(1e-6, (slopeAlongWorldX ? frameW_mm : frameD_mm) / 1000);
  const angle = Math.atan2(rise_m, run_m);
  const qPitch = BABYLON.Quaternion.RotationAxis(pitchAxisWorld, slopeAlongWorldX ? angle : -angle);

  roofRoot.rotationQuaternion = qPitch.multiply(qYaw);

  // Step 1: translate in X/Z so rotated roof's PLAN min corner lands on targetMinX/Z.
  // Compute 4 plan corners of the *roof rectangle* in local (0..roofW, 0..roofD).
  const roofW_mm = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? data.roofW_mm ?? 1)));
  const roofD_mm = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? data.roofD_mm ?? 1)));

  let roofW_phys_mm = roofW_mm;
  let roofD_phys_mm = roofD_mm;
  if (slopeAlongWorldX) roofW_phys_mm = Math.max(1, Math.round(roofW_mm * slopeScale));
  else roofD_phys_mm = Math.max(1, Math.round(roofD_mm * slopeScale));

  const cornersLocal = [
    new BABYLON.Vector3(0 / 1000, 0, 0 / 1000),
    new BABYLON.Vector3(roofW_phys_mm / 1000, 0, 0 / 1000),
    new BABYLON.Vector3(0 / 1000, 0, roofD_phys_mm / 1000),
    new BABYLON.Vector3(roofW_phys_mm / 1000, 0, roofD_phys_mm / 1000),
  ];

  function worldOfLocal(pLocal) {
    try {
      const wm = roofRoot.getWorldMatrix();
      return BABYLON.Vector3.TransformCoordinates(pLocal, wm);
    } catch (e) {
      return null;
    }
  }

  // With position at (0,0,0), get minX/minZ in world for the rotated corners
  let minCornerX = Infinity;
  let minCornerZ = Infinity;
  for (let i = 0; i < cornersLocal.length; i++) {
    const wpt = worldOfLocal(cornersLocal[i]);
    if (!wpt) continue;
    if (Number.isFinite(wpt.x) && wpt.x < minCornerX) minCornerX = wpt.x;
    if (Number.isFinite(wpt.z) && wpt.z < minCornerZ) minCornerZ = wpt.z;
  }
  if (!Number.isFinite(minCornerX)) minCornerX = 0;
  if (!Number.isFinite(minCornerZ)) minCornerZ = 0;

  roofRoot.position.x += (targetMinX_m - minCornerX);
  roofRoot.position.z += (targetMinZ_m - minCornerZ);

  // Step 2: translate Y so the underside at the LOW edge hits minH,
  // and (by construction) the HIGH edge hits maxH.
  // Choose two analytic bearing sample points at mid of the other frame axis.
  let pLowLocal = null;
  let pHighLocal = null;

  if (slopeAlongWorldX) {
    const midFrameZ_mm = Math.floor(frameD_mm / 2);
    pLowLocal = new BABYLON.Vector3((Math.round((l_mm) * slopeScale)) / 1000, 0, (f_mm + midFrameZ_mm) / 1000);
    pHighLocal = new BABYLON.Vector3((Math.round((l_mm + frameW_mm) * slopeScale)) / 1000, 0, (f_mm + midFrameZ_mm) / 1000);
  } else {
    const midFrameX_mm = Math.floor(frameW_mm / 2);
    pLowLocal = new BABYLON.Vector3((l_mm + midFrameX_mm) / 1000, 0, (Math.round((f_mm) * slopeScale)) / 1000);
    pHighLocal = new BABYLON.Vector3((l_mm + midFrameX_mm) / 1000, 0, (Math.round((f_mm + frameD_mm) * slopeScale)) / 1000);
  }

  const worldLow = worldOfLocal(pLowLocal);
  if (worldLow) {
    const targetYLow_m = (minH_mm / 1000);
    roofRoot.position.y += (targetYLow_m - worldLow.y);
  } else {
    roofRoot.position.y = (minH_mm / 1000);
  }

  // Debug-only: report high-edge error after final placement
  let worldHigh = null;
  let highError_m = null;
  try {
    worldHigh = worldOfLocal(pHighLocal);
    if (worldHigh) {
      const targetYHigh_m = (maxH_mm / 1000);
      highError_m = targetYHigh_m - worldHigh.y;
    }
  } catch (e) {}

  // ---- Debug visuals + dbg object (roof.js only) ----
  function mkDbgSphere(name, x_m, y_m, z_m, isGood) {
    try {
      const s = BABYLON.MeshBuilder.CreateSphere(name, { diameter: 0.06 }, scene);
      s.position = new BABYLON.Vector3(x_m, y_m, z_m);
      const mat = new BABYLON.StandardMaterial(name + "-mat", scene);
      if (isGood) mat.emissiveColor = new BABYLON.Color3(0.1, 0.9, 0.1);
      else mat.emissiveColor = new BABYLON.Color3(0.9, 0.1, 0.1);
      s.material = mat;
      s.metadata = { dynamic: true, sectionId: sectionId || null };
      return s;
    } catch (e) {
      return null;
    }
  }

  try {
    if (roofParts.structure && typeof window !== "undefined" && window.__dbg) {
      const lowW = worldOfLocal(pLowLocal);
      const highW = worldOfLocal(pHighLocal);

      window.__dbg.roofFit = {
        mode: "analytic-bearing-lines",
        frame: { w_mm: frameW_mm, d_mm: frameD_mm },
        overhang_mm: { l: l_mm, r: r_mm, f: f_mm, b: b_mm },
        heights_mm: { minH: minH_mm, maxH: maxH_mm },
        rise_m: rise_m,
        run_m: run_m,
        angle: angle,
        highError_mm: highError_m == null ? null : (highError_m * 1000),
        run_mm: run_mm,
        rise_mm: rise_mm,
        slopeLen_mm: slopeLen_mm
      };

      // Visualize analytic bearing samples
      if (lowW) mkDbgSphere(`${meshPrefix}roof-dbg-bearing-low`, lowW.x, lowW.y, lowW.z, true);
      if (highW) mkDbgSphere(`${meshPrefix}roof-dbg-bearing-high`, highW.x, highW.y, highW.z, false);
    }
  } catch (e) {}
}

function updateBOM_Pent(state, tbody) {
  if (!isPentEnabled(state)) {
    appendPlaceholderRow(tbody, "Roof not enabled.");
    return;
  }

  const data = computeRoofData_Pent(state);

  // ---- NEW: match buildPent() slope-stretch so BOM matches 3D geometry ----
  // buildPent() scales the physical sloped axis by slopeScale to preserve plan projection after pitching.
  const rise_mm = Math.max(0, Math.floor((data.maxH_mm - data.minH_mm)));
  const run_mm = Math.max(1, Math.floor(data.isWShort ? data.frameW_mm : data.frameD_mm));
  const slopeLen_mm = Math.max(1, Math.round(Math.sqrt(run_mm * run_mm + rise_mm * rise_mm)));
  const slopeScale = run_mm > 0 ? (slopeLen_mm / run_mm) : 1;

  const rafterLenPhys_mm = Math.max(1, Math.round(Number(data.rafterLen_mm || 0) * slopeScale));
  // ---- END slope-scale for BOM ----

  const rows = [];

  // Rim joists (2x) (run along B, not slope-stretched)
  rows.push({
    item: "Roof Rim Joist",
    qty: 2,
    L: data.isWShort ? data.roofD_mm : data.roofW_mm,
    W: data.rafterW_mm,
    notes: "D (mm): " + String(data.rafterD_mm),
  });

  // Rafters (physical length along sloped axis)
  rows.push({
    item: "Roof Rafter",
    qty: data.rafters.length,
    L: rafterLenPhys_mm,
    W: data.rafterW_mm,
    notes:
      "D (mm): " +
      String(data.rafterD_mm) +
      "; spacing @600mm; pent roof; slopeLen_mm=" +
      String(slopeLen_mm),
  });

  // OSB pieces (group identical cut sizes)
  // buildPent() scales ONLY the sloped axis (A), which corresponds to p.W_mm in our AB piece representation.
  const osbPieces = [];
  for (let i = 0; i < data.osb.all.length; i++) {
    const p = data.osb.all[i];
    const Wplan = Math.max(1, Math.floor(p.W_mm));
    const Lplan = Math.max(1, Math.floor(p.L_mm));

    osbPieces.push({
      L: Lplan,
      W: Math.max(1, Math.round(Wplan * slopeScale)),
      notes: "18mm OSB; " + (p.kind === "std" ? "standard sheet" : "rip/trim"),
    });
  }

  const grouped = groupByLWN(osbPieces);
  const gKeys = Object.keys(grouped);
  gKeys.sort((a, b) => String(a).localeCompare(String(b)));

  for (let i = 0; i < gKeys.length; i++) {
    const k = gKeys[i];
    const g = grouped[k];
    rows.push({
      item: "Roof OSB",
      qty: g.qty,
      L: g.L,
      W: g.W,
      notes: g.notes,
    });
  }

  rows.sort((a, b) => {
    const ai = String(a.item), bi = String(b.item);
    if (ai !== bi) return ai.localeCompare(bi);
    const aL = Number(a.L), bL = Number(b.L);
    if (aL !== bL) return aL - bL;
    const aW = Number(a.W), bW = Number(b.W);
    if (aW !== bW) return aW - bW;
    return String(a.notes).localeCompare(String(b.notes));
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    appendRow5(tbody, [r.item, String(r.qty), String(r.L), String(r.W), r.notes]);
  }

  // Calculate total frame timber (exclude OSB)
  const FRAME_STOCK_LENGTH = 6200;
  const rimJoistLen = data.isWShort ? data.roofD_mm : data.roofW_mm;
  let totalFrameLength_mm = 0;
  totalFrameLength_mm += 2 * rimJoistLen;                    // Rim Joists
  totalFrameLength_mm += data.rafters.length * rafterLenPhys_mm;  // Rafters

  const totalFrameStockPieces = Math.ceil(totalFrameLength_mm / FRAME_STOCK_LENGTH);
  appendRow5(tbody, [
    "TOTAL FRAME",
    String(totalFrameStockPieces),
    String(FRAME_STOCK_LENGTH),
    "",
    `Total: ${Math.round(totalFrameLength_mm / 1000 * 10) / 10}m linear; ${totalFrameStockPieces} × ${FRAME_STOCK_LENGTH}mm lengths`
  ]);

  if (!rows.length) appendPlaceholderRow(tbody, "Roof cutting list not yet generated.");
}

function isPentEnabled(state) {
  return !!(state && state.roof && String(state.roof.style || "") === "pent");
}

/**
 * Computes all dimensions and positions for pent roof components.
 * Returns a data object used by both 3D builder and BOM calculator.
 * 
 * @param {Object} state - Building state object
 * @returns {Object} Computed roof data:
 *   - roofW_mm, roofD_mm: outer roof plan dimensions
 *   - frameW_mm, frameD_mm: wall frame dimensions
 *   - A_mm, B_mm: slope span and rafter run dimensions
 *   - rafterW_mm, rafterD_mm: rafter cross-section
 *   - rafters: array of rafter positions [{b0_mm}]
 *   - osb: {all: [], totalArea_mm2} OSB piece data
 *   - minH_mm, maxH_mm: wall heights at low/high edges
 * @private
 */
export function computeRoofData_Pent(state) {
  const dims = resolveDims(state);

  const roofW = Math.max(1, Math.floor(Number(dims?.roof?.w_mm)));
  const roofD = Math.max(1, Math.floor(Number(dims?.roof?.d_mm)));

  const frameW = Math.max(1, Math.floor(Number(dims?.frame?.w_mm)));
  const frameD = Math.max(1, Math.floor(Number(dims?.frame?.d_mm)));

  const originX_mm = 0;
  const originZ_mm = 0;

// Slope always runs along X (width), rafters span along Z (depth)
  const A = roofW;  // slope dimension (always width)
  const B = roofD;  // rafter run dimension (always depth)
  const isWShort = true;  // always treat as if width is the slope direction

  const spacing = 600;

  const g = getRoofFrameGauge(state);
  const baseW = Math.max(1, Math.floor(Number(g.thickness_mm)));
  const baseD = Math.max(1, Math.floor(Number(g.depth_mm)));

  const rafterW_mm = baseD;
  const rafterD_mm = baseW;

  const rafterLen_mm = A;

  const pos = [];
  const maxP = Math.max(0, B - rafterW_mm);

  let p = 0;
  while (p <= maxP) {
    pos.push(Math.floor(p));
    p += spacing;
  }
  if (pos.length) {
    const last = pos[pos.length - 1];
    if (Math.abs(last - maxP) > 0) pos.push(Math.floor(maxP));
  } else {
    pos.push(0);
  }

  const rafters = [];
  for (let i = 0; i < pos.length; i++) rafters.push({ b0_mm: pos[i] });

  const osbAB = computeOsbPiecesNoStagger(A, B);

  const mappedAll = [];
  for (let i = 0; i < osbAB.all.length; i++) {
    const p2 = osbAB.all[i];
    if (isWShort) {
      mappedAll.push({
        kind: p2.kind,
        x0_mm: originX_mm + p2.a0_mm,
        z0_mm: originZ_mm + p2.b0_mm,
        xLen_mm: p2.W_mm,
        zLen_mm: p2.L_mm,
        L_mm: p2.L_mm,
        W_mm: p2.W_mm,
      });
    } else {
      mappedAll.push({
        kind: p2.kind,
        x0_mm: originX_mm + p2.b0_mm,
        z0_mm: originZ_mm + p2.a0_mm,
        xLen_mm: p2.L_mm,
        zLen_mm: p2.W_mm,
        L_mm: p2.L_mm,
        W_mm: p2.W_mm,
      });
    }
  }

  const baseH_mm = Math.max(
    100,
    Math.floor(
      Number(state && state.walls && state.walls.height_mm != null ? state.walls.height_mm : 2400)
    )
  );
// For pent roofs, UI values are TOTAL building height (ground to roof top).
  // We need to subtract floor and roof stacks to get wall frame height.
  // FLOOR_STACK = grid (50) + frame depth + floor OSB (18)
  // ROOF_STACK = rafter depth + roof OSB (18)
  // NOTE: plateThickness is NOT included in FLOOR_STACK — it's part of the wall frame,
  // not the floor. This must match walls.js pentStackAdjust calculation.
  const GRID_HEIGHT_MM = 50;
  const OSB_THK_MM = 18;
  const frameDepth_mm = Math.floor(Number(CONFIG?.timber?.d ?? 100));
  const rafterDepth_mm = baseW; // rafter depth = baseW (timber thickness)
  const FLOOR_STACK_MM = GRID_HEIGHT_MM + frameDepth_mm + OSB_THK_MM;
  const ROOF_STACK_MM = rafterDepth_mm + OSB_THK_MM;
  const pentStackAdjust = FLOOR_STACK_MM + ROOF_STACK_MM;
  const minH = Math.max(
    100,
    Math.floor(
      Number(
        state && state.roof && state.roof.pent && state.roof.pent.minHeight_mm != null
          ? state.roof.pent.minHeight_mm - pentStackAdjust
          : baseH_mm - pentStackAdjust
      )
    )
  );
  const maxH = Math.max(
    100,
    Math.floor(
      Number(
        state && state.roof && state.roof.pent && state.roof.pent.maxHeight_mm != null
          ? state.roof.pent.maxHeight_mm - pentStackAdjust
          : baseH_mm - pentStackAdjust
      )
    )
  );

  return {
    roofW_mm: roofW,
    roofD_mm: roofD,
    frameW_mm: frameW,
    frameD_mm: frameD,
    originX_mm,
    originZ_mm,
    A_mm: A,
    B_mm: B,
    isWShort: isWShort,
    rafterW_mm,
    rafterD_mm,
    rafterLen_mm,
    rafters,
    osbThickness_mm: 18,
    osb: {
      all: mappedAll,
      totalArea_mm2: osbAB.totalArea_mm2,
    },
    minH_mm: minH,
    maxH_mm: maxH,
  };
}
function computeWaste(extA, extB, sheetA, sheetB) {
  // Calculate total waste for a given sheet orientation
  const A = Math.max(1, Math.floor(extA));
  const B = Math.max(1, Math.floor(extB));
  
  const aFull = Math.floor(A / sheetA);
  const bFull = Math.floor(B / sheetB);
  
  const aRem = A - aFull * sheetA;
  const bRem = B - bFull * sheetB;
  
  // Total area needed
  const totalArea = A * B;
  
  // Sheets used (counting partial sheets as full for waste calculation)
  const sheetsA = aFull + (aRem > 0 ? 1 : 0);
  const sheetsB = bFull + (bRem > 0 ? 1 : 0);
  const sheetArea = sheetA * sheetB;
  const totalSheetArea = sheetsA * sheetsB * sheetArea;
  
  return totalSheetArea - totalArea;
}

function computeOsbPiecesForSlope(extA, extB, sheetA, sheetB) {
  // Similar to computeOsbPiecesNoStagger but with configurable sheet dimensions
  // extA = extent down slope, extB = extent along ridge
  // sheetA = sheet dim down slope, sheetB = sheet dim along ridge
  const A = Math.max(1, Math.floor(extA));
  const B = Math.max(1, Math.floor(extB));

  const aFull = Math.floor(A / sheetA);
  const bFull = Math.floor(B / sheetB);

  const aRem = A - aFull * sheetA;
  const bRem = B - bFull * sheetB;

  const all = [];

  function pushPiece(kind, a0, b0, aLen, bLen) {
    all.push({ kind: kind, a0_mm: a0, b0_mm: b0, aLen_mm: aLen, bLen_mm: bLen });
  }

  // Full sheets
  for (let bi = 0; bi < bFull; bi++) {
    for (let ai = 0; ai < aFull; ai++) {
      pushPiece("std", ai * sheetA, bi * sheetB, sheetA, sheetB);
    }
  }

  // Remainder column (down slope edge)
  if (aRem > 0 && bFull > 0) {
    for (let bi = 0; bi < bFull; bi++) {
      pushPiece("rip", aFull * sheetA, bi * sheetB, aRem, sheetB);
    }
  }

  // Remainder row (along ridge edge)
  if (bRem > 0 && aFull > 0) {
    for (let ai = 0; ai < aFull; ai++) {
      pushPiece("rip", ai * sheetA, bFull * sheetB, sheetA, bRem);
    }
  }

  // Corner remainder
  if (aRem > 0 && bRem > 0) {
    pushPiece("rip", aFull * sheetA, bFull * sheetB, aRem, bRem);
  }

  return all;
}
/**
 * Split a rectangular panel around rectangular holes.
 * Returns an array of sub-rectangles that tile the original rect minus the holes.
 * Uses a simple 2D grid decomposition: collects all X and Y edges from the rect
 * and all holes, creates a grid, and keeps cells that don't overlap any hole.
 *
 * @param {{a0: number, b0: number, aLen: number, bLen: number}} rect - Original panel
 * @param {Array<{a0_mm: number, b0_mm: number, aLen_mm: number, bLen_mm: number}>} holes - Holes to cut
 * @returns {Array<{a0_mm: number, b0_mm: number, aLen_mm: number, bLen_mm: number, kind: string}>}
 */
function splitRectAroundHoles(rect, holes) {
  if (!holes || holes.length === 0) return [rect];

  const ra0 = rect.a0_mm, ra1 = rect.a0_mm + rect.aLen_mm;
  const rb0 = rect.b0_mm, rb1 = rect.b0_mm + rect.bLen_mm;

  // Collect unique sorted edges along A axis
  const aEdges = [ra0, ra1];
  // Collect unique sorted edges along B axis
  const bEdges = [rb0, rb1];

  for (const h of holes) {
    const ha0 = Math.max(ra0, h.a0_mm);
    const ha1 = Math.min(ra1, h.a0_mm + h.aLen_mm);
    const hb0 = Math.max(rb0, h.b0_mm);
    const hb1 = Math.min(rb1, h.b0_mm + h.bLen_mm);
    if (ha0 < ha1 && hb0 < hb1) {
      aEdges.push(ha0, ha1);
      bEdges.push(hb0, hb1);
    }
  }

  // Deduplicate and sort
  const sortUniq = arr => [...new Set(arr)].sort((a, b) => a - b);
  const aS = sortUniq(aEdges);
  const bS = sortUniq(bEdges);

  const result = [];
  const MIN_SIZE = 5; // Ignore tiny slivers

  for (let ai = 0; ai < aS.length - 1; ai++) {
    for (let bi = 0; bi < bS.length - 1; bi++) {
      const ca0 = aS[ai], ca1 = aS[ai + 1];
      const cb0 = bS[bi], cb1 = bS[bi + 1];
      const cw = ca1 - ca0;
      const ch = cb1 - cb0;
      if (cw < MIN_SIZE || ch < MIN_SIZE) continue;

      // Check if this cell overlaps any hole
      let inHole = false;
      const cellMidA = (ca0 + ca1) / 2;
      const cellMidB = (cb0 + cb1) / 2;
      for (const h of holes) {
        if (cellMidA > h.a0_mm && cellMidA < h.a0_mm + h.aLen_mm &&
            cellMidB > h.b0_mm && cellMidB < h.b0_mm + h.bLen_mm) {
          inHole = true;
          break;
        }
      }
      if (!inHole) {
        result.push({
          a0_mm: ca0,
          b0_mm: cb0,
          aLen_mm: cw,
          bLen_mm: ch,
          kind: "cut"
        });
      }
    }
  }

  return result;
}

function computeOsbPiecesNoStagger(A_mm, B_mm) {
  const A = Math.max(1, Math.floor(A_mm));
  const B = Math.max(1, Math.floor(B_mm));

  const SHEET_A = 1220;
  const SHEET_B = 2440;

  const aFull = Math.floor(A / SHEET_A);
  const bFull = Math.floor(B / SHEET_B);

  const aRem = A - aFull * SHEET_A;
  const bRem = B - bFull * SHEET_B;

  const all = [];

  function pushPiece(kind, a0, b0, W, L) {
    all.push({ kind, a0_mm: a0, b0_mm: b0, W_mm: W, L_mm: L });
  }

  for (let bi = 0; bi < bFull; bi++) {
    for (let ai = 0; ai < aFull; ai++) {
      pushPiece("std", ai * SHEET_A, bi * SHEET_B, SHEET_A, SHEET_B);
    }
  }

  if (aRem > 0 && bFull > 0) {
    for (let bi = 0; bi < bFull; bi++) {
      pushPiece("rip", aFull * SHEET_A, bi * SHEET_B, aRem, SHEET_B);
    }
  }

  if (bRem > 0 && aFull > 0) {
    for (let ai = 0; ai < aFull; ai++) {
      pushPiece("rip", ai * SHEET_A, bFull * SHEET_B, SHEET_A, bRem);
    }
  }

  if (aRem > 0 && bRem > 0) {
    pushPiece("rip", aFull * SHEET_A, bFull * SHEET_B, aRem, bRem);
  }

  let area = 0;
  for (let i = 0; i < all.length; i++) {
    area += Math.max(0, all[i].W_mm) * Math.max(0, all[i].L_mm);
  }

  return { all, totalArea_mm2: area };
}

/* ------------------------------ APEX (new) ------------------------------ */

/**
 * Builds an apex (gabled) roof with two slopes meeting at a central ridge.
 * Creates trusses, purlins, ridge beam, OSB sheathing, felt covering, and fascia boards.
 * 
 * Components built:
 * - Trusses: tie beam + two rafters + kingpost at regular intervals
 * - Ridge beam: runs along the peak
 * - Purlins: horizontal battens on top of rafters at 609mm centres
 * - OSB: individual 8×4ft sheets on each slope
 * - Covering: felt/membrane with fold-down edges
 * - Fascia: trim boards at eaves and verges
 * 
 * @param {Object} state - Building state with roof.apex parameters
 * @param {Object} ctx - Babylon.js context {scene, materials}
 * @param {string} [meshPrefix=""] - Prefix for mesh names (for multi-section)
 * @param {Object} [sectionPos={x:0,y:0,z:0}] - Section position offset in mm
 * @param {string|null} [sectionId=null] - Section identifier for metadata
 * @private
 */
function buildApex(state, ctx, meshPrefix = "", sectionPos = { x: 0, y: 0, z: 0 }, sectionId = null) {
  const { scene, materials } = ctx || {};
  if (!scene) return;

  const roofParts = getRoofParts(state);

  const dims = resolveDims(state);

// Helper: check if a wall has a door that extends into the gable area
  function getGableDoorForWall(wallId) {
    const openings = (state && state.walls && Array.isArray(state.walls.openings)) ? state.walls.openings : [];
    const doors = openings.filter(o => o && o.type === "door" && o.enabled !== false && String(o.wall || "front") === wallId);
    
    if (!doors.length) return null;
    
    // Get eaves height to determine if door extends into gable
    const apex = (state && state.roof && state.roof.apex) ? state.roof.apex : null;
    const eavesH = Number(apex && (apex.heightToEaves_mm || apex.eavesHeight_mm || apex.eaves_mm)) || 1850;
    const WALL_RISE_MM = 168;
    const plateY = 50;
    const studW = 50;
    const WALL_OVERHANG_MM = 25;
    
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      const doorTopY = WALL_RISE_MM + plateY + Math.floor(Number(d.height_mm || 0));
      // Door extends into gable if its top is above eaves
      if (doorTopY > eavesH) {
        // Door x_mm is in wall-local coordinates
        // Wall is shifted by -WALL_OVERHANG_MM in index.js
        // Roof is also shifted by -WALL_OVERHANG_MM
        // So relative to roof local coords, door position needs adjustment
        const doorX_wallLocal = Math.floor(Number(d.x_mm || 0));
        const doorWidth = Math.floor(Number(d.width_mm || 800));
        
        // In roof local coordinates:
        // - Roof spans 0 to A_mm (which equals roofW_mm)
        // - Wall frame starts at overhang l_mm in roof coords
        // - Door x is relative to wall frame start
        // The door uprights in walls.js are at:
        //   left upright: origin.x + doorX0 - studW = wallOrigin + x_mm - studW
        //   right upright: origin.x + doorX1 = wallOrigin + x_mm + width_mm
        // After wall shift of -WALL_OVERHANG_MM, world positions are:
        //   left upright start: x_mm - studW - WALL_OVERHANG_MM
        //   right upright end: x_mm + width_mm + studW - WALL_OVERHANG_MM
        // Roof is shifted by -WALL_OVERHANG_MM too, so in roof-local coords:
        //   left upright start: x_mm - studW + l_mm
        //   right upright end: x_mm + width_mm + studW + l_mm
        
        return {
          id: d.id,
          x_mm: doorX_wallLocal,
          width_mm: doorWidth,
          height_mm: Math.floor(Number(d.height_mm || 2000)),
          doorTopY: doorTopY,
          studW: studW
        };
      }
    }
    return null;
  }

  const frontGableDoor = getGableDoorForWall("front");
  const backGableDoor = getGableDoorForWall("back");

  const ovh = (dims && dims.overhang) ? dims.overhang : { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };
  const l_mm = Math.max(0, Math.floor(Number(ovh.l_mm || 0)));
  const r_mm = Math.max(0, Math.floor(Number(ovh.r_mm || 0)));
  const f_mm = Math.max(0, Math.floor(Number(ovh.f_mm || 0)));
  const b_mm = Math.max(0, Math.floor(Number(ovh.b_mm || 0)));

  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 1)));

  // Roof plan (outer) in mm
  const roofW_mm = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const roofD_mm = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? frameD_mm)));

  // Truss layout (fixed orientation):
  // A = span axis across WIDTH (world X), B = ridge/run axis along DEPTH (world Z)
  const A_mm = roofW_mm;
  const B_mm = roofD_mm;

  // --- APEX HEIGHT CONTROLS (ground-referenced, mm) ---
  // UI intent:
  // - "Height to Eaves"  => ground -> UNDERSIDE of eaves at the wall line (mm)
  // - "Height to Crest"  => ground -> HIGHEST roof point (top of OSB at ridge/crest) (mm)
  //
  // Deterministic correction:
  // - If crest < eaves, we clamp crest := eaves (prevents inverted roof).
  // - Additionally, because eaves is an UNDERSIDE reference and crest is a TOP reference,
  //   we enforce crest >= eaves + OSB_THK_MM. If violated, clamp crest := eaves + OSB_THK_MM.
  //
  // NOTE: If either control is missing/unset, we keep legacy behavior (rise derived from span).
  const OSB_THK_MM = 18;

  function _numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function _firstFinite(/*...vals*/) {
    for (let i = 0; i < arguments.length; i++) {
      const n = _numOrNull(arguments[i]);
      if (n != null) return n;
    }
    return null;
  }

  const apex = (state && state.roof && state.roof.apex) ? state.roof.apex : null;

  // Support a few likely key names without renaming state keys.
  const eavesCtl_mm = _firstFinite(
    apex && apex.eavesHeight_mm,
    apex && apex.heightToEaves_mm,
    apex && apex.eaves_mm,
    apex && apex.heightEaves_mm
  );

  const crestCtl_mm = _firstFinite(
    apex && apex.crestHeight_mm,
    apex && apex.heightToCrest_mm,
    apex && apex.crest_mm,
    apex && apex.ridgeHeight_mm,
    apex && apex.heightCrest_mm
  );

  // Legacy rise (used when controls are absent)
  let rise_mm = clamp(Math.floor(A_mm * 0.20), 200, 900);

  // Resolved targets (used only when BOTH are present)
  let eavesTargetAbs_mm = null;
  let crestTargetAbs_mm = null;

  if (eavesCtl_mm != null && crestCtl_mm != null) {
    const e0 = Math.max(0, Math.floor(eavesCtl_mm));
    let c0 = Math.max(0, Math.floor(crestCtl_mm));

    // Clamp crest >= eaves (deterministic)
    if (c0 < e0) c0 = e0;

    // Enforce crest >= eaves + OSB thickness (top vs underside reference)
    if (c0 < (e0 + OSB_THK_MM)) c0 = (e0 + OSB_THK_MM);

    eavesTargetAbs_mm = e0;
    crestTargetAbs_mm = c0;

    // Solve rise so that:
    // (crestTop - eavesUnderside) == rise + cos(theta)*OSB_THK_MM,
    // where theta is the roof pitch angle and cos(theta) depends on rise and half-span.
    const halfSpan_mm = Math.max(1, Math.floor(A_mm / 2));
    const delta_mm = Math.max(0, Math.floor(crestTargetAbs_mm - eavesTargetAbs_mm));

    const solveRiseFromDelta = (delta, halfSpan, osbThk) => {
      // If delta is smaller than OSB thickness, the best we can do is a "flat" roof (rise ~ 0),
      // but crest is still a TOP reference and eaves is an UNDERSIDE reference.
      // We deterministically treat delta := max(delta, osbThk).
      const target = Math.max(osbThk, Math.floor(delta));

      // f(rise) = rise + cos(theta(rise))*osbThk, monotonic increasing in rise.
      const f = (r) => {
        const rr = Math.max(0, Number(r));
        const den = Math.sqrt(halfSpan * halfSpan + rr * rr);
        const cosT = den > 1e-6 ? (halfSpan / den) : 1;
        return rr + (cosT * osbThk);
      };

      // Binary search (deterministic) on [0 .. hi]
      let lo = 0;
      let hi = Math.max(target + 2000, 1); // generous upper bound; avoids accidental clipping
      for (let it = 0; it < 32; it++) {
        const mid = (lo + hi) / 2;
        if (f(mid) >= target) hi = mid;
        else lo = mid;
      }
      return Math.max(0, Math.floor(hi));
    };

    rise_mm = solveRiseFromDelta(delta_mm, halfSpan_mm, OSB_THK_MM);
  }
  // --- END APEX HEIGHT CONTROLS ---

  // Timber section (matches existing roof timber orientation policy: uses thickness/depth swapped)
  const g = getRoofFrameGauge(state);
  const baseW = Math.max(1, Math.floor(Number(g.thickness_mm)));
  const baseD = Math.max(1, Math.floor(Number(g.depth_mm)));
  const memberW_mm = baseD; // width in plan
  const memberD_mm = baseW; // vertical depth

  const joistMat = materials && materials.timber ? materials.timber : null;

  const osbMat = (() => {
    try {
      if (scene._roofOsbMat) return scene._roofOsbMat;
      const m = new BABYLON.StandardMaterial("roofOsbMat", scene);
      m.diffuseColor = new BABYLON.Color3(0.75, 0.62, 0.45);
      scene._roofOsbMat = m;
      return m;
    } catch (e) {
      return null;
    }
  })();
  
  const coveringMat = (() => {
    try {
      if (scene._roofCoveringMat) return scene._roofCoveringMat;
      const m = new BABYLON.StandardMaterial("roofCoveringMat", scene);
      m.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Black
      scene._roofCoveringMat = m;
      return m;
    } catch (e) {
      return null;
    }
  })();

  function mkBoxBottomLocal(name, Lx_mm, Ly_mm, Lz_mm, x_mm, yBottom_m, z_mm, parentNode, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(
      name,
      { width: Lx_mm / 1000, height: Ly_mm / 1000, depth: Lz_mm / 1000 },
      scene
    );
    mesh.position = new BABYLON.Vector3(
      (x_mm + Lx_mm / 2) / 1000,
      yBottom_m + (Ly_mm / 2) / 1000,
      (z_mm + Lz_mm / 2) / 1000
    );
    mesh.material = mat;
    mesh.metadata = Object.assign({ dynamic: true, sectionId: sectionId || null }, meta || {});
    if (parentNode) mesh.parent = parentNode;
    return mesh;
  }

  function mkBoxCenteredLocal(name, Lx_mm, Ly_mm, Lz_mm, cx_mm, cy_mm, cz_mm, parentNode, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(
      name,
      { width: Lx_mm / 1000, height: Ly_mm / 1000, depth: Lz_mm / 1000 },
      scene
    );
    mesh.position = new BABYLON.Vector3(cx_mm / 1000, cy_mm / 1000, cz_mm / 1000);
    mesh.material = mat;
    mesh.metadata = Object.assign({ dynamic: true, sectionId: sectionId || null }, meta || {});
    if (parentNode) mesh.parent = parentNode;
    return mesh;
  }

  // Root at identity in local coords:
  // local X = span axis A, local Z = ridge axis B, local Y up.
  const roofRoot = new BABYLON.TransformNode(`${meshPrefix}roof-root`, scene);
  roofRoot.metadata = { dynamic: true, sectionId: sectionId || null };
  roofRoot.position = new BABYLON.Vector3(sectionPos.x / 1000, sectionPos.y / 1000, sectionPos.z / 1000);
  roofRoot.rotationQuaternion = BABYLON.Quaternion.Identity();

  // Truss spacing along B:
  // RULE: gable-end trusses must align flush with WALL frame ends (no overhang from trusses).
  // Overhang at gable ends is expressed by purlins/OSB spanning the full roof plan.
  //
  // Trusses are placed along the ridge axis (local Z), but their usable range is the FRAME ridge length,
  // offset inward from the roof plan by the overhang on the ridge-min side.
  //
  // - Legacy (default): @600 with last forced to maxP (prior behavior, but on FRAME ridge span)
  // - New (when state.roof.apex.trussCount >= 2): evenly spaced across FRAME ridge span incl. both ends
  const spacing = 600;
  const trussPos = [];

  const ridgeFrameLen_mm = frameD_mm;
  const ridgeStart_mm = f_mm;

  const minP = Math.max(0, Math.floor(ridgeStart_mm));
  const maxP = Math.max(minP, Math.floor(ridgeStart_mm + ridgeFrameLen_mm - memberW_mm));

  let desiredCount = null;
  try {
    desiredCount = state && state.roof && state.roof.apex && state.roof.apex.trussCount != null
      ? Math.floor(Number(state.roof.apex.trussCount))
      : null;
  } catch (e) { desiredCount = null; }

  if (Number.isFinite(desiredCount) && desiredCount >= 2) {
    const n = desiredCount;
    const denom = (n - 1);
    const span = Math.max(0, Math.floor(maxP - minP));

    for (let i = 0; i < n; i++) {
      let z0 = minP;
      if (i === 0) z0 = minP;
      else if (i === (n - 1)) z0 = maxP;
      else z0 = Math.round(minP + (span * i) / denom);

      trussPos.push(Math.max(minP, Math.min(maxP, Math.floor(z0))));
    }
  } else {
    let p = minP;
    while (p <= maxP) { trussPos.push(Math.floor(p)); p += spacing; }
    if (trussPos.length) {
      const last = trussPos[trussPos.length - 1];
      if (Math.abs(last - maxP) > 0) trussPos.push(Math.floor(maxP));
    } else {
      trussPos.push(minP);
    }
  }

  // Geometry helpers for sloped rafters in local X-Y plane (depth extrudes along Z by memberW)
  const halfSpan_mm = A_mm / 2;
  const rafterLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const slopeAng = Math.atan2(rise_mm, halfSpan_mm);

  // Tie beam position setting: "eaves" (at bottom) or "raised" (1/3 up rafters)
  const tieBeamSetting = (apex && apex.tieBeam) || "eaves";
  
  // For raised tie: calculate position at 3/8 up the rise
  const raisedTieRatio = 3 / 8;
  const raisedTieY_mm = rise_mm * raisedTieRatio;
  // At this Y, the rafter X positions (from center) narrow proportionally
  const raisedTieHalfSpan_mm = halfSpan_mm * (1 - raisedTieRatio);
  const raisedTieSpan_mm = raisedTieHalfSpan_mm * 2;

function buildTruss(idx, z0_mm, gableDoor, isGableEnd) {
    // gableDoor: if provided, this is a gable-end truss with a door extending into it
    // - tie beam should be cut around the door
    // - kingpost should be skipped (walls.js generates the door cripple instead)
    
    const tr = new BABYLON.TransformNode(`${meshPrefix}roof-truss-${idx}`, scene);
    tr.metadata = { dynamic: true, sectionId: sectionId || null };
    tr.parent = roofRoot;
    tr.position = new BABYLON.Vector3(0, 0, z0_mm / 1000);

// Bottom chord (tie) along span at y=0
    // If gableDoor exists, cut the tie beam around the door opening
    if (gableDoor) {
      const studW = gableDoor.studW || 50; // Door upright width
      
      // Door coordinates in roof-local space
      // The roof local X=0 corresponds to the left overhang edge
      // The wall frame starts at X = l_mm (front overhang)
      // Door x_mm is relative to wall frame origin (which is at world X=0 before shift)
      // After all shifts, in roof local coords:
      //   door left upright LEFT edge = l_mm + door.x_mm - studW
      //   door right upright RIGHT edge = l_mm + door.x_mm + door.width_mm + studW
      
      const doorLeftEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) - studW;
      const doorRightEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) + Math.floor(Number(gableDoor.width_mm || 800)) + studW;
      
      // Left piece of tie beam (from 0 to door left edge)
      const leftTieLen = Math.max(0, doorLeftEdge);
      if (leftTieLen > memberW_mm) {
        mkBoxBottomLocal(
          `${meshPrefix}roof-truss-${idx}-tie-left`,
          leftTieLen,
          memberD_mm,
          memberW_mm,
          0,
          0,
          0,
          tr,
          joistMat,
          { roof: "apex", part: "truss", member: "tie-left" }
        );
      }
      
      // Right piece of tie beam (from door right edge to end)
      const rightTieStart = doorRightEdge;
      const rightTieLen = Math.max(0, A_mm - rightTieStart);
      if (rightTieLen > memberW_mm) {
        mkBoxBottomLocal(
          `${meshPrefix}roof-truss-${idx}-tie-right`,
          rightTieLen,
          memberD_mm,
          memberW_mm,
          rightTieStart,
          0,
          0,
          tr,
          joistMat,
          { roof: "apex", part: "truss", member: "tie-right" }
        );
      }
    } else {
      // Check if this is a raised tie beam (only for internal trusses, not gable ends)
      const useRaisedTie = tieBeamSetting === "raised" && !isGableEnd;
      
      if (useRaisedTie) {
        // Raised tie beam - positioned 1/3 up the rafters
        // The tie spans between the rafters at the raised height
        const tieY_mm = raisedTieY_mm;
        const tieStartX_mm = halfSpan_mm - raisedTieHalfSpan_mm;  // Left rafter intersection
        const tieLen_mm = raisedTieSpan_mm;
        
        mkBoxBottomLocal(
          `${meshPrefix}roof-truss-${idx}-tie`,
          tieLen_mm,
          memberD_mm,
          memberW_mm,
          tieStartX_mm,
          tieY_mm / 1000,
          0,
          tr,
          joistMat,
          { roof: "apex", part: "truss", member: "tie-raised" }
        );
      } else {
        // Normal full tie beam at eaves (y=0)
        mkBoxBottomLocal(
          `${meshPrefix}roof-truss-${idx}-tie`,
          A_mm,
          memberD_mm,
          memberW_mm,
          0,
          0,
          0,
          tr,
          joistMat,
          { roof: "apex", part: "truss", member: "tie" }
        );
      }
    }

    // Left rafter: from x=0,y=0 up to ridge at x=halfSpan,y=rise
    {
      const cx = halfSpan_mm / 2;
      const cy = rise_mm / 2 + memberD_mm / 2;
      const r = mkBoxCenteredLocal(
        `${meshPrefix}roof-truss-${idx}-rafter-L`,
        rafterLen_mm,
        memberD_mm,
        memberW_mm,
        cx,
        cy,
        memberW_mm / 2,
        tr,
        joistMat,
        { roof: "apex", part: "truss", member: "rafterL" }
      );
      r.rotation = new BABYLON.Vector3(0, 0, slopeAng);
    }

    // Right rafter: mirrored about center
    {
      const cx = halfSpan_mm + (halfSpan_mm / 2);
      const cy = rise_mm / 2 + memberD_mm / 2;
      const r = mkBoxCenteredLocal(
        `${meshPrefix}roof-truss-${idx}-rafter-R`,
        rafterLen_mm,
        memberD_mm,
        memberW_mm,
        cx,
        cy,
        memberW_mm / 2,
        tr,
        joistMat,
        { roof: "apex", part: "truss", member: "rafterR" }
      );
      r.rotation = new BABYLON.Vector3(0, 0, -slopeAng);
    }

    // King post: single vertical strut from tie midpoint to apex
    // Skip if this is a gable-end truss with a door (walls.js generates the door cripple instead)
    if (!gableDoor) {
      // For raised tie, king post starts from the raised tie position
      const useRaisedTie = tieBeamSetting === "raised" && !isGableEnd;
      const tieTopY_mm = useRaisedTie ? (raisedTieY_mm + memberD_mm) : memberD_mm;
      const bottomY_mm = tieTopY_mm;
      const postH_mm = Math.max(1, Math.floor(rise_mm - bottomY_mm));

      const capH_mm = Math.max(20, Math.min(Math.floor(postH_mm * 0.35), Math.floor(memberW_mm * 0.9)));
      const bodyH_mm = Math.max(1, postH_mm - capH_mm);

      const post = BABYLON.MeshBuilder.CreateBox(
        `${meshPrefix}roof-truss-${idx}-kingpost`,
        { width: memberW_mm / 1000, height: bodyH_mm / 1000, depth: memberD_mm / 1000 },
        scene
      );

      post.position = new BABYLON.Vector3(
        halfSpan_mm / 1000,
        (bottomY_mm + (bodyH_mm / 2)) / 1000,
        (memberW_mm / 2) / 1000
      );

      post.material = joistMat;
      post.metadata = Object.assign({ dynamic: true, sectionId: sectionId || null }, { roof: "apex", part: "truss", member: "kingpost" });
      post.parent = tr;

      const halfRun_mm = Math.max(1, Math.round(capH_mm / Math.max(1e-6, Math.tan(slopeAng))));
      const cap = BABYLON.MeshBuilder.ExtrudeShape(
        `${meshPrefix}roof-truss-${idx}-kingpost-cap`,
        {
          shape: [
            new BABYLON.Vector3(-halfRun_mm / 1000, 0, 0),
            new BABYLON.Vector3(0, capH_mm / 1000, 0),
            new BABYLON.Vector3(halfRun_mm / 1000, 0, 0),
            new BABYLON.Vector3(-halfRun_mm / 1000, 0, 0)
          ],
          path: [
            new BABYLON.Vector3(0, 0, -memberW_mm / 2000),
            new BABYLON.Vector3(0, 0, memberW_mm / 2000)
          ],
          cap: BABYLON.Mesh.CAP_ALL
        },
        scene
      );

      cap.position = new BABYLON.Vector3(
        halfSpan_mm / 1000,
        (bottomY_mm + bodyH_mm) / 1000,
        (memberW_mm / 2) / 1000
      );

      cap.material = joistMat;
      cap.metadata = post.metadata;
      cap.parent = tr;
    }
  }

if (roofParts.structure) {
    for (let i = 0; i < trussPos.length; i++) {
      // Check if this is a gable-end truss with a door
      let gableDoor = null;
      if (i === 0 && frontGableDoor) {
        // First truss is at front gable
        gableDoor = frontGableDoor;
      } else if (i === trussPos.length - 1 && backGableDoor) {
        // Last truss is at back gable
        gableDoor = backGableDoor;
      }
      // First and last trusses are at gable ends
      const isGableEnd = (i === 0 || i === trussPos.length - 1);
      buildTruss(i, trussPos[i], gableDoor, isGableEnd);
    }

    // Ridge beam along B at (x=A/2, y=rise)
    mkBoxBottomLocal(
      `${meshPrefix}roof-ridge`,
      memberW_mm,
      memberD_mm,
      B_mm,
      Math.max(0, Math.floor(halfSpan_mm - memberW_mm / 2)),
      rise_mm / 1000,
      0,
      roofRoot,
      joistMat,
      { roof: "apex", part: "ridge" }
    );

    // Purlins (apex):
    // - Exactly TWO at the ridge zone (one per slope).
    // - Then continue down each slope at 609mm centres measured ALONG SLOPE.
    // - Bottom purlin aligns to the overhang-defined eaves edge (outer roof edge), and final gap never exceeds 609mm.
    // - Cross-section matches rafters (memberW_mm x memberD_mm).
    const PURLIN_STEP_MM = 609;
    const PURLIN_CLEAR_MM = 1;

    const sinT = Math.sin(slopeAng);
    const cosT = Math.cos(slopeAng);

    // Offset outward from the roof surface so purlins sit on top of rafters (no visible embedding).
    // When rotated about Z by slopeAng, local +Y points outward normal for each slope.
    const purlinOutOffset_mm = (memberD_mm / 2) + PURLIN_CLEAR_MM;

    function mkPurlin(side, idx, cx_mm, cy_mm) {
      const name = `${meshPrefix}roof-purlin-${side}-${idx}`;
      const m = mkBoxCenteredLocal(
        name,
        memberW_mm,
        memberD_mm,
        B_mm,
        cx_mm,
        cy_mm,
        B_mm / 2,
        roofRoot,
        joistMat,
        { roof: "apex", part: "purlin", side: side }
      );
      m.rotation = new BABYLON.Vector3(0, 0, side === "L" ? slopeAng : -slopeAng);
      return m;
    }

    // Compute slope-distance for the bottom-edge purlin using outer-edge alignment in X.
    // For a box rotated about Z, half-width projects to X by cosT; outward normal contributes X by ±sinT.
    // Left slope: outer edge at x=0. Right slope: outer edge at x=A_mm.
    const xSurfBottomL_mm = Math.max(
      0,
      Math.min(
        halfSpan_mm,
        Math.round((memberW_mm / 2) * cosT + (sinT * purlinOutOffset_mm))
      )
    );
    const runBottom_mm = Math.max(0, Math.round(halfSpan_mm - xSurfBottomL_mm));
    const sBottom_mm = cosT > 1e-6 ? (runBottom_mm / cosT) : rafterLen_mm;

    // Generate slope stations: start at ridge (0), step 609, and ALWAYS include bottom station.
    const sList = [0];
    let sNext = PURLIN_STEP_MM;
    while (sNext < sBottom_mm) {
      sList.push(Math.round(sNext));
      sNext += PURLIN_STEP_MM;
    }
    const sBottomRounded = Math.round(sBottom_mm);
    if (sList[sList.length - 1] !== sBottomRounded) sList.push(sBottomRounded);

    for (let i = 0; i < sList.length; i++) {
      const s_mm = Math.max(0, Math.floor(Number(sList[i] || 0)));

      // Clamp within usable slope length
      const run_mm = Math.min(halfSpan_mm, Math.max(0, Math.round(s_mm * cosT)));
      const drop_mm = Math.min(rise_mm, Math.max(0, Math.round(s_mm * sinT)));

      // Roof surface (top of tie baseline at memberD_mm) in local XY:
      const ySurf_mm = memberD_mm + (rise_mm - drop_mm);

      // LEFT slope purlin
      {
        const xSurf_mm = Math.max(0, Math.min(halfSpan_mm, Math.round(halfSpan_mm - run_mm)));
        const cx_mm = xSurf_mm + (-sinT) * purlinOutOffset_mm;
        const cy_mm = ySurf_mm + (cosT) * purlinOutOffset_mm;
        mkPurlin("L", i, cx_mm, cy_mm);
      }

      // RIGHT slope purlin
      {
        const xSurf_mm = Math.max(halfSpan_mm, Math.min(A_mm, Math.round(halfSpan_mm + run_mm)));
        const cx_mm = xSurf_mm + (sinT) * purlinOutOffset_mm;
        const cy_mm = ySurf_mm + (cosT) * purlinOutOffset_mm;
        mkPurlin("R", i, cx_mm, cy_mm);
      }
    }
  }

if (roofParts.osb) {
    // OSB sheathing as individual 8x4ft sheet pieces with witness lines
    // Each slope is a rectangle: rafterLen_mm (down slope) x B_mm (along ridge)
    // Sheet orientation: optimize for minimum waste
    const osbThk = OSB_THK_MM;

    const OSB_CLEAR_MM = 1;

    const sinT = Math.sin(slopeAng);
    const cosT = Math.cos(slopeAng);

    // Offset from roof plane -> purlin outer face -> OSB underside
    const osbOutOffset_mm = memberD_mm + OSB_CLEAR_MM;

    // Calculate sheet layout for each slope
    // A_slope = dimension down the slope (rafterLen_mm)
    // B_slope = dimension along ridge (B_mm)
    // Determine optimal orientation: compare waste for both orientations
// Calculate sheet layout for each slope
    // A_slope = dimension down the slope (rafterLen_mm)
    // B_slope = dimension along ridge (B_mm)
    // Orientation: 2440mm (8ft) runs DOWN the slope for fewer cuts
    const SHEET_SHORT = 1220;
    const SHEET_LONG = 2440;
    
    const sheetA = SHEET_SHORT;  // 1220mm down slope 
    const sheetB = SHEET_LONG;   // 2440mm along ridge (parallel to purlins)
    
    // Compute pieces using the chosen orientation
    const osbPieces = computeOsbPiecesForSlope(rafterLen_mm, B_mm, sheetA, sheetB);

    // Helper to create OSB piece at a specific position on a slope
    function createOsbPiece(side, idx, a0_mm, b0_mm, aLen_mm, bLen_mm, kind) {
      // a0_mm = position down slope from eaves (0 = eaves edge)
      // b0_mm = position along ridge from front
      // aLen_mm = length down slope
      // bLen_mm = length along ridge
      
      // Calculate center position in slope-local coords (before rotation)
      // Down-slope axis maps to local X after rotation
      const aMid_mm = a0_mm + aLen_mm / 2;
      const bMid_mm = b0_mm + bLen_mm / 2;
      
      // Sample point on roof surface at this slope position
      const s_mm = aMid_mm;  // distance down slope from ridge
      const run_mm = Math.round(s_mm * cosT);
      const drop_mm = Math.round(s_mm * sinT);
      const ySurf_mm = memberD_mm + (rise_mm - drop_mm);
      
      // Position in world X (before considering side)
      let cx, cy;
      const osbCenterOffset_mm = osbOutOffset_mm + (osbThk / 2);
      
      if (side === "L") {
        const xSurf_mm = (halfSpan_mm - run_mm);
        cx = xSurf_mm + (-sinT) * osbCenterOffset_mm;
        cy = ySurf_mm + (cosT) * osbCenterOffset_mm;
      } else {
        const xSurf_mm = (halfSpan_mm + run_mm);
        cx = xSurf_mm + (sinT) * osbCenterOffset_mm;
        cy = ySurf_mm + (cosT) * osbCenterOffset_mm;
      }
      
      const mesh = mkBoxCenteredLocal(
        `${meshPrefix}roof-apex-osb-${side}-${idx}`,
        aLen_mm,
        osbThk,
        bLen_mm,
        cx,
        cy,
        bMid_mm,
        roofRoot,
        osbMat,
        { roof: "apex", part: "osb", side: side, kind: kind }
      );
      mesh.rotation = new BABYLON.Vector3(0, 0, side === "L" ? slopeAng : -slopeAng);
      
      // Add witness lines (edge rendering) to show sheet cut boundaries
      if (mesh && mesh.enableEdgesRendering) {
        mesh.enableEdgesRendering();
        mesh.edgesWidth = 3;
        mesh.edgesColor = new BABYLON.Color4(0, 0, 0, 1);
      }
      
      return mesh;
    }
    
    // Get skylight openings for each slope (empty array if no skylights)
    let skyOpeningsL = [], skyOpeningsR = [];
    try { skyOpeningsL = getSkylightOpenings(state, "L") || []; } catch(e) { /* safe fallback */ }
    try { skyOpeningsR = getSkylightOpenings(state, "R") || []; } catch(e) { /* safe fallback */ }

    // Create pieces for left slope (split around skylights if any)
    let osbIdx = 0;
    for (let i = 0; i < osbPieces.length; i++) {
      const p = osbPieces[i];
      if (skyOpeningsL.length > 0) {
        const subPieces = splitRectAroundHoles(p, skyOpeningsL);
        for (const sp of subPieces) {
          createOsbPiece("L", osbIdx++, sp.a0_mm, sp.b0_mm, sp.aLen_mm, sp.bLen_mm, sp.kind || p.kind);
        }
      } else {
        createOsbPiece("L", osbIdx++, p.a0_mm, p.b0_mm, p.aLen_mm, p.bLen_mm, p.kind);
      }
    }
    
    // Create pieces for right slope (split around skylights if any)
    osbIdx = 0;
    for (let i = 0; i < osbPieces.length; i++) {
      const p = osbPieces[i];
      if (skyOpeningsR.length > 0) {
        const subPieces = splitRectAroundHoles(p, skyOpeningsR);
        for (const sp of subPieces) {
          createOsbPiece("R", osbIdx++, sp.a0_mm, sp.b0_mm, sp.aLen_mm, sp.bLen_mm, sp.kind || p.kind);
        }
      } else {
        createOsbPiece("R", osbIdx++, p.a0_mm, p.b0_mm, p.aLen_mm, p.bLen_mm, p.kind);
      }
    }
  }

// Roof covering (felt/membrane) - 2mm thick black sheet over OSB
  // Folds down 100mm at eaves and verges to cover fascia/purlin/truss ends
  // No overhang at ridge - the two slopes just meet there
  if (roofParts.covering) {
    const COVERING_THK_MM = 2;
    const FOLD_DOWN_MM = 100;
    
    const sinT = Math.sin(slopeAng);
    const cosT = Math.cos(slopeAng);
    
    // OSB positioning (must match OSB section exactly)
    const OSB_CLEAR_MM = 1;
    const osbOutOffset_mm = memberD_mm + OSB_CLEAR_MM;
    
    // Covering sits ON TOP of OSB (OSB top surface + half covering thickness)
    const coveringOutOffset_mm = osbOutOffset_mm + OSB_THK_MM + (COVERING_THK_MM / 2);
    
// Main covering panel dimensions
    // Extend slightly past ridge so the two panels overlap/meet at the peak
    const RIDGE_OVERLAP_MM = 20;  // Extra length past ridge to ensure no gap
    const coveringLen_mm = rafterLen_mm + RIDGE_OVERLAP_MM;  // down slope, extended at ridge
    const coveringWidth_mm = B_mm;        // along ridge
    
    // Helper: create a covering piece at given slope-local coords
    // a0 = distance from ridge down slope, b0 = along ridge from front
    function createCoveringPiece(side, idx, a0, b0, aLen, bLen) {
      const rotZ = (side === "L") ? slopeAng : -slopeAng;
      const normalX = (side === "L") ? -sinT : sinT;
      const normalY = cosT;

      // Compute center position from piece's midpoint on slope
      const aMid = a0 + aLen / 2;
      const bMid = b0 + bLen / 2;
      const s_mm = aMid;  // distance from ridge along slope
      const runMid_mm = Math.round(s_mm * cosT);
      const dropMid_mm = Math.round(s_mm * sinT);
      const ySurfMid_mm = memberD_mm + (rise_mm - dropMid_mm);
      const xSurfMid_mm = (side === "L")
        ? (halfSpan_mm - runMid_mm)
        : (halfSpan_mm + runMid_mm);
      const cx = xSurfMid_mm + normalX * coveringOutOffset_mm;
      const cy = ySurfMid_mm + normalY * coveringOutOffset_mm;

      const mesh = mkBoxCenteredLocal(
        `${meshPrefix}roof-covering-${side}-${idx}`,
        aLen,
        COVERING_THK_MM,
        bLen,
        cx,
        cy,
        bMid,
        roofRoot,
        coveringMat,
        { roof: "apex", part: "covering", side: side }
      );
      mesh.rotation = new BABYLON.Vector3(0, 0, rotZ);
      return mesh;
    }

    function createSlopeCovering(side) {
      const normalX = (side === "L") ? -sinT : sinT;
      const normalY = cosT;

      // Get skylight openings for this slope
      let skyOpenings = [];
      try { skyOpenings = getSkylightOpenings(state, side) || []; } catch(e) { /* safe */ }

      // Main covering: a from -RIDGE_OVERLAP to rafterLen, b from 0 to B
      const mainRect = { a0_mm: -RIDGE_OVERLAP_MM, b0_mm: 0, aLen_mm: coveringLen_mm, bLen_mm: coveringWidth_mm };

      if (skyOpenings.length > 0) {
        // Split covering around skylight openings
        const pieces = splitRectAroundHoles(mainRect, skyOpenings);
        for (let pi = 0; pi < pieces.length; pi++) {
          createCoveringPiece(side, pi, pieces[pi].a0_mm, pieces[pi].b0_mm, pieces[pi].aLen_mm, pieces[pi].bLen_mm);
        }
      } else {
        // No skylights — single panel as before
        createCoveringPiece(side, 0, -RIDGE_OVERLAP_MM, 0, coveringLen_mm, coveringWidth_mm);
      }
      
      // Compute midpoint values for fold-down positioning (unchanged from original)
      const _sMid = (rafterLen_mm / 2) - (RIDGE_OVERLAP_MM / 2);
      const _runMid = Math.round(_sMid * cosT);
      const _dropMid = Math.round(_sMid * sinT);
      const _ySurfMid = memberD_mm + (rise_mm - _dropMid);
      const _xSurfMid = (side === "L") ? (halfSpan_mm - _runMid) : (halfSpan_mm + _runMid);
      const cx = _xSurfMid + normalX * coveringOutOffset_mm;
      const cy = _ySurfMid + normalY * coveringOutOffset_mm;
      const rotZ = (side === "L") ? slopeAng : -slopeAng;

      // Eaves fold-down (at bottom/outer edge of slope - away from ridge)
      // Top of fold connects to outer edge of main panel
      {
        // Eaves position: outer end of slope (x=0 for L, x=A_mm for R)
        const eavesX_mm = (side === "L") ? 0 : A_mm;
        
        // OSB top surface Y at eaves (roof surface + OSB stack)
        const ySurfEaves_mm = memberD_mm;  // At eaves, drop = full rise, so ySurf = memberD
        const osbTopY_eaves_mm = ySurfEaves_mm + normalY * (osbOutOffset_mm + OSB_THK_MM);
        
        // Fold center Y: starts at OSB top, extends down
        const foldCenterY_mm = osbTopY_eaves_mm - (FOLD_DOWN_MM / 2);
        
        // Fold X: flush with outer edge of OSB
        const osbOuterX_mm = eavesX_mm + normalX * (osbOutOffset_mm + OSB_THK_MM);
        const foldCenterX_mm = osbOuterX_mm + normalX * (COVERING_THK_MM / 2);
        
        mkBoxCenteredLocal(
          `${meshPrefix}roof-covering-${side}-eaves`,
          COVERING_THK_MM,
          FOLD_DOWN_MM,
          coveringWidth_mm,
          foldCenterX_mm,
          foldCenterY_mm,
          B_mm / 2,
          roofRoot,
          coveringMat,
          { roof: "apex", part: "covering-eaves", side: side }
        );
      }
      
      // Front verge fold-down (at z = 0, covers front gable purlin/truss ends)
      // This fold follows the roof slope angle
      {
        // Z position: outer face of fold flush with front edge of OSB
        const foldZ_mm = -(COVERING_THK_MM / 2);
        
        // The fold hangs down from the outer edge of the main covering panel
        // Y center is offset down from the covering surface by half the fold height
        const foldCenterY_mm = cy - (FOLD_DOWN_MM / 2) * cosT;
        const foldCenterX_mm = cx - (FOLD_DOWN_MM / 2) * sinT * ((side === "L") ? -1 : 1);
        
        const vergeFront = mkBoxCenteredLocal(
          `${meshPrefix}roof-covering-${side}-verge-front`,
          coveringLen_mm,
          FOLD_DOWN_MM,
          COVERING_THK_MM,
          foldCenterX_mm,
          foldCenterY_mm,
          foldZ_mm,
          roofRoot,
          coveringMat,
          { roof: "apex", part: "covering-verge", side: side, edge: "front" }
        );
        vergeFront.rotation = new BABYLON.Vector3(0, 0, rotZ);
      }
      
      // Back verge fold-down (at z = B_mm, covers back gable purlin/truss ends)
      {
        const foldZ_mm = B_mm + (COVERING_THK_MM / 2);
        
        const foldCenterY_mm = cy - (FOLD_DOWN_MM / 2) * cosT;
        const foldCenterX_mm = cx - (FOLD_DOWN_MM / 2) * sinT * ((side === "L") ? -1 : 1);
        
        const vergeBack = mkBoxCenteredLocal(
          `${meshPrefix}roof-covering-${side}-verge-back`,
          coveringLen_mm,
          FOLD_DOWN_MM,
          COVERING_THK_MM,
          foldCenterX_mm,
          foldCenterY_mm,
          foldZ_mm,
          roofRoot,
          coveringMat,
          { roof: "apex", part: "covering-verge", side: side, edge: "back" }
        );
        vergeBack.rotation = new BABYLON.Vector3(0, 0, rotZ);
      }
    }
    
    createSlopeCovering("L");
    createSlopeCovering("R");
  }
// Roof fascia boards - 20mm thick x 135mm deep timber trim around roof perimeter
// Roof fascia boards - 20mm thick x 135mm deep timber trim around roof perimeter
  if (roofParts.covering) {
    const FASCIA_THK_MM = 20;
    const FASCIA_DEPTH_MM = 135;
    
    // Use wood grain fascia material from babylon.js if available
    const fasciaMat = scene._fasciaMat || joistMat;
    
    const sinT = Math.sin(slopeAng);
    const cosT = Math.cos(slopeAng);
    
    // OSB positioning (must match OSB section)
    const OSB_CLEAR_MM = 1;
    const osbOutOffset_mm = memberD_mm + OSB_CLEAR_MM;
    
    // Check if slate tiles are used - fascia needs to be raised to cover batten end grain
    const covering = (state && state.roof && state.roof.covering) ? state.roof.covering : "felt";
    const isSlate = covering === "slate";
    // Slate tiles add: membrane (1mm) + battens (25mm) + extra clearance (10mm) = 36mm above OSB
    const SLATE_BATTEN_HEIGHT_MM = 36;
    const fasciaExtraHeight_mm = isSlate ? SLATE_BATTEN_HEIGHT_MM : 0;
    
    // Fascia hangs down from top of OSB (or top of battens for slate)
    // Position fascia so its top edge covers the batten end grain
    
    function createSlopeFascia(side) {
      const rotZ = (side === "L") ? slopeAng : -slopeAng;
      const normalX = (side === "L") ? -sinT : sinT;
      const normalY = cosT;
      
      // Eaves fascia (horizontal board at bottom of slope)
      // Positioned at outer edge of roof (x=0 for L, x=A_mm for R)
      {
        const eavesX_mm = (side === "L") ? 0 : A_mm;
        
        // OSB top surface Y at eaves
        const ySurfEaves_mm = memberD_mm;
        const osbTopY_eaves_mm = ySurfEaves_mm + normalY * (osbOutOffset_mm + OSB_THK_MM);
        
        // Fascia center position - raised by batten height when slate tiles are used
        const fasciaTopY_mm = osbTopY_eaves_mm + fasciaExtraHeight_mm;
        const fasciaCenterY_mm = fasciaTopY_mm - (FASCIA_DEPTH_MM / 2);
        const fasciaCenterX_mm = eavesX_mm + normalX * (osbOutOffset_mm + OSB_THK_MM + FASCIA_THK_MM / 2);
        
        mkBoxCenteredLocal(
          `${meshPrefix}roof-fascia-eaves-${side}`,
          FASCIA_THK_MM,
          FASCIA_DEPTH_MM,
          B_mm,
          fasciaCenterX_mm,
          fasciaCenterY_mm,
          B_mm / 2,
          roofRoot,
          fasciaMat,
          { roof: "apex", part: "fascia", side: side, edge: "eaves" }
        );
      }
      
      // Barge board (sloped board along gable end at z=0)
      {
        // Barge board runs along the slope from eaves to ridge
        // Center point at mid-slope
        const sMid_mm = rafterLen_mm / 2;
        const runMid_mm = Math.round(sMid_mm * cosT);
        const dropMid_mm = Math.round(sMid_mm * sinT);
        const ySurfMid_mm = memberD_mm + (rise_mm - dropMid_mm);
        
        const xSurfMid_mm = (side === "L") 
          ? (halfSpan_mm - runMid_mm)
          : (halfSpan_mm + runMid_mm);
        
        // Position barge board outside the OSB edge
        // Raised by batten height when slate tiles are used
        const osbOuterOffset_mm = osbOutOffset_mm + OSB_THK_MM;
        const bargeCenterX_mm = xSurfMid_mm + normalX * osbOuterOffset_mm;
        const bargeCenterY_mm = ySurfMid_mm + normalY * (osbOuterOffset_mm + fasciaExtraHeight_mm) - (FASCIA_DEPTH_MM / 2) * cosT;
        
        // Front barge (z = 0)
        const bargeFront = mkBoxCenteredLocal(
          `${meshPrefix}roof-fascia-barge-${side}-front`,
          rafterLen_mm,
          FASCIA_DEPTH_MM,
          FASCIA_THK_MM,
          bargeCenterX_mm,
          bargeCenterY_mm,
          -FASCIA_THK_MM / 2,
          roofRoot,
          fasciaMat,
          { roof: "apex", part: "fascia", side: side, edge: "barge-front" }
        );
        bargeFront.rotation = new BABYLON.Vector3(0, 0, rotZ);
        
        // Back barge (z = B_mm)
        const bargeBack = mkBoxCenteredLocal(
          `${meshPrefix}roof-fascia-barge-${side}-back`,
          rafterLen_mm,
          FASCIA_DEPTH_MM,
          FASCIA_THK_MM,
          bargeCenterX_mm,
          bargeCenterY_mm,
          B_mm + FASCIA_THK_MM / 2,
          roofRoot,
          fasciaMat,
          { roof: "apex", part: "fascia", side: side, edge: "barge-back" }
        );
        bargeBack.rotation = new BABYLON.Vector3(0, 0, rotZ);
      }
    }
    
    createSlopeFascia("L");
    createSlopeFascia("R");
    
    // Diamond ridge caps at apex (front and back gables)
    // These cover the joint where the two barge boards meet at the ridge
    {
      const DIAMOND_SIZE_MM = 120; // Size of diamond (corner to corner)
      const DIAMOND_THK_MM = 20;   // Same thickness as fascia
      
      // OSB top at ridge
      const osbOuterOffset_mm = osbOutOffset_mm + OSB_THK_MM;
      const ridgeY_mm = memberD_mm + rise_mm + cosT * osbOuterOffset_mm;
      
      // Diamond center X is at the ridge (halfSpan)
      const diamondCenterX_mm = halfSpan_mm;
      // Diamond center Y - positioned so it covers the barge board joint
      // Raised slightly to ensure full coverage of the ridge gap
      const diamondCenterY_mm = ridgeY_mm - (FASCIA_DEPTH_MM / 2) * cosT + DIAMOND_SIZE_MM / 2;
      
      // Front diamond (z = 0)
      const diamondFront = BABYLON.MeshBuilder.CreateBox(
        `${meshPrefix}roof-fascia-diamond-front`,
        { 
          width: DIAMOND_SIZE_MM / 1000, 
          height: DIAMOND_SIZE_MM / 1000, 
          depth: DIAMOND_THK_MM / 1000 
        },
        scene
      );
      diamondFront.position = new BABYLON.Vector3(
        diamondCenterX_mm / 1000,
        diamondCenterY_mm / 1000,
        -DIAMOND_THK_MM / 2 / 1000
      );
      diamondFront.rotation = new BABYLON.Vector3(0, 0, Math.PI / 4); // 45 degree rotation to make diamond
      diamondFront.material = fasciaMat;
      diamondFront.metadata = { dynamic: true, sectionId: sectionId || null, roof: "apex", part: "fascia", edge: "diamond-front" };
      diamondFront.parent = roofRoot;

      // Back diamond (z = B_mm)
      const diamondBack = BABYLON.MeshBuilder.CreateBox(
        `${meshPrefix}roof-fascia-diamond-back`,
        {
          width: DIAMOND_SIZE_MM / 1000,
          height: DIAMOND_SIZE_MM / 1000,
          depth: DIAMOND_THK_MM / 1000
        },
        scene
      );
      diamondBack.position = new BABYLON.Vector3(
        diamondCenterX_mm / 1000,
        diamondCenterY_mm / 1000,
        (B_mm + DIAMOND_THK_MM / 2) / 1000
      );
      diamondBack.rotation = new BABYLON.Vector3(0, 0, Math.PI / 4);
      diamondBack.material = fasciaMat;
      diamondBack.metadata = { dynamic: true, sectionId: sectionId || null, roof: "apex", part: "fascia", edge: "diamond-back" };
      diamondBack.parent = roofRoot;
    }
  }

  // ---- ROOF INSULATION (PIR panels between rafters and tie beams) ----
  // Only for raised tie beam configuration
  const showRoofIns = (state.vis?.roofIns !== false) && (state.vis?.ins !== false);
  
  if (showRoofIns && tieBeamSetting === "raised" && trussPos.length >= 2) {
    console.log('[ROOF_INS] Building roof insulation - trussCount:', trussPos.length, 'bays:', trussPos.length - 1);
    
    // Insulation material (green PIR - same as wall insulation)
    const roofInsMat = new BABYLON.StandardMaterial('roofInsMat-' + Date.now(), scene);
    roofInsMat.diffuseColor = new BABYLON.Color3(0.75, 0.85, 0.45); // Green PIR
    
    const INS_THICKNESS_MM = 50; // 50mm PIR insulation
    const sinT = Math.sin(slopeAng);
    const cosT = Math.cos(slopeAng);
    
    // Small gap between panels and structure
    const INS_GAP_MM = 2;
    
    // For each bay between trusses
    for (let bayIdx = 0; bayIdx < trussPos.length - 1; bayIdx++) {
      const z0_mm = trussPos[bayIdx] + memberW_mm; // After front truss
      const z1_mm = trussPos[bayIdx + 1];          // Before back truss
      const bayDepth_mm = Math.max(1, z1_mm - z0_mm);
      
      if (bayDepth_mm < 50) continue; // Skip tiny bays
      
      const bayZ_mm = z0_mm + bayDepth_mm / 2; // Center Z of bay
      
      console.log('[ROOF_INS] Bay', bayIdx, '- z:', z0_mm, 'to', z1_mm, 'depth:', bayDepth_mm);
      
      // --- SLOPED PANELS (left and right) ---
      // Insulation sits IN the rafter cavity with TOP surface flush with rafter top (purlin bottom)
      // 
      // The sloped panels extend from eaves UP to where they meet the horizontal panel.
      // The horizontal panel sits at tie beam level.
      // 
      // KEY: Sloped panel TOP must be at rafter surface level (where purlins sit)
      //      So panel CENTER is offset INWARD by INS_THICKNESS_MM/2 from rafter surface
      
      // Slope from eaves to tie beam level
      const slopeRunX_mm = halfSpan_mm - raisedTieHalfSpan_mm;
      const slopeRiseY_mm = raisedTieY_mm;
      const slopedLen_mm = Math.sqrt(slopeRunX_mm * slopeRunX_mm + slopeRiseY_mm * slopeRiseY_mm);
      
      // Panel dimensions
      const slopedPanelLen_mm = slopedLen_mm - INS_GAP_MM;
      const slopedPanelDepth_mm = bayDepth_mm - INS_GAP_MM * 2;
      
      // Midpoint along the rafter surface (before any offset)
      // LEFT slope: from (0, memberD_mm) to (slopeRunX_mm, slopeRiseY_mm + memberD_mm)
      const midX_L_mm = slopeRunX_mm / 2;
      const midY_mm = memberD_mm + slopeRiseY_mm / 2;
      
      // Offset CENTER inward from rafter surface so TOP is flush with rafter top
      // Normal to left slope (outward): (+sinT, +cosT) after rotation
      // So inward offset (for CENTER) is: (-sinT, -cosT) * INS_THICKNESS_MM/2
      const offsetX_mm = sinT * (INS_THICKNESS_MM / 2);
      const offsetY_mm = cosT * (INS_THICKNESS_MM / 2);
      
      // LEFT sloped panel - offset INWARD (toward interior, into cavity)
      {
        const cx_mm = midX_L_mm + offsetX_mm;  // +X is toward interior for left slope
        const cy_mm = midY_mm - offsetY_mm;   // -Y is toward interior (down into cavity)
        
        const insLeft = mkBoxCenteredLocal(
          `${meshPrefix}roof-ins-bay${bayIdx}-L`,
          slopedPanelLen_mm,
          INS_THICKNESS_MM,
          slopedPanelDepth_mm,
          cx_mm,
          cy_mm,
          bayZ_mm,
          roofRoot,
          roofInsMat,
          { roof: "apex", part: "insulation", bay: bayIdx, side: "L" }
        );
        if (insLeft) {
          insLeft.rotation = new BABYLON.Vector3(0, 0, slopeAng);
          insLeft.enableEdgesRendering();
          insLeft.edgesWidth = 1;
          insLeft.edgesColor = new BABYLON.Color4(0.5, 0.6, 0.3, 1);
        }
      }
      
      // RIGHT sloped panel (mirror of left)
      {
        const midX_R_mm = A_mm - slopeRunX_mm / 2;
        const cx_mm = midX_R_mm - offsetX_mm;  // -X is toward interior for right slope
        const cy_mm = midY_mm - offsetY_mm;    // -Y is toward interior
        
        const insRight = mkBoxCenteredLocal(
          `${meshPrefix}roof-ins-bay${bayIdx}-R`,
          slopedPanelLen_mm,
          INS_THICKNESS_MM,
          slopedPanelDepth_mm,
          cx_mm,
          cy_mm,
          bayZ_mm,
          roofRoot,
          roofInsMat,
          { roof: "apex", part: "insulation", bay: bayIdx, side: "R" }
        );
        if (insRight) {
          insRight.rotation = new BABYLON.Vector3(0, 0, -slopeAng);
          insRight.enableEdgesRendering();
          insRight.edgesWidth = 1;
          insRight.edgesColor = new BABYLON.Color4(0.5, 0.6, 0.3, 1);
        }
      }
      
      // --- HORIZONTAL PANEL (between tie beams) ---
      // Sits at tie beam level with TOP flush with tie beam top surface
      // This creates a flat ceiling between the raised tie beams
      {
        const horizWidth_mm = raisedTieSpan_mm - INS_GAP_MM * 2;
        const horizDepth_mm = slopedPanelDepth_mm;
        
        // Position: centered on ridge, TOP at tie beam top level
        const cx_mm = halfSpan_mm;
        const cy_mm = raisedTieY_mm + memberD_mm - INS_THICKNESS_MM / 2; // TOP at tie beam top
        
        const insHoriz = mkBoxCenteredLocal(
          `${meshPrefix}roof-ins-bay${bayIdx}-H`,
          horizWidth_mm,
          INS_THICKNESS_MM,
          horizDepth_mm,
          cx_mm,
          cy_mm,
          bayZ_mm,
          roofRoot,
          roofInsMat,
          { roof: "apex", part: "insulation", bay: bayIdx, side: "H" }
        );
        if (insHoriz) {
          insHoriz.enableEdgesRendering();
          insHoriz.edgesWidth = 1;
          insHoriz.edgesColor = new BABYLON.Color4(0.5, 0.6, 0.3, 1);
        }
      }
    }
    
    console.log('[ROOF_INS] Created insulation for', trussPos.length - 1, 'bays');
    
    // ---- GABLE END INSULATION (TRAPEZOIDAL) ----
    // Fills the gable WALL area: from wall top plate (Y=0) up to the raised tie beam underside
    // Shape is trapezoidal because the left/right edges follow the rafter slope
    // These sit INSIDE the truss cavity, behind the gable truss face
    
    const gableInsDepth_mm = INS_THICKNESS_MM; // 50mm depth into building (Z dimension)
    
    // Key positions:
    // - Y=0 is wall top plate level (eaves)
    // - Y=raisedTieY_mm is raised tie beam underside (top of gable wall area)
    // - Rafter inner face position varies with height (follows slope)
    
    // Rafter slope: at height Y, the rafter BOTTOM is at X position where:
    //   Y = memberD_mm + (X / halfSpan_mm) * rise_mm
    // Solving for X: X = (Y - memberD_mm) * halfSpan_mm / rise_mm
    // But below Y=memberD_mm (where rafter sits on wall plate), use X=0
    
    // For the gable insulation, we care about the rafter INNER face
    // Left rafter inner face (right side of rafter) is offset by memberW_mm from the roof edge
    
    const topY_mm = raisedTieY_mm - INS_GAP_MM; // Top of insulation (just below tie beam)
    const bottomY_mm = 0; // Bottom at wall plate level
    
    // King post edges
    const kingPostLeftX_mm = halfSpan_mm - memberW_mm / 2;
    const kingPostRightX_mm = halfSpan_mm + memberW_mm / 2;
    
    // Calculate X position of rafter inner face at a given Y
    // Left rafter: inner face is at X = memberW_mm + max(0, (Y - memberD_mm)) * halfSpan_mm / rise_mm
    // (Starts at memberW_mm at Y=0, then follows slope once above memberD_mm)
    function leftRafterInnerX(y_mm) {
      if (y_mm <= memberD_mm) {
        // Below rafter bottom - use the rafter width as boundary
        return memberW_mm;
      }
      // Above rafter bottom - follows the slope
      // Rafter bottom X at height Y: (Y - memberD_mm) * halfSpan_mm / rise_mm
      // Inner face is offset by memberW_mm from left edge
      return memberW_mm + (y_mm - memberD_mm) * halfSpan_mm / rise_mm;
    }
    
    // Right rafter: inner face mirrors the left
    function rightRafterInnerX(y_mm) {
      return A_mm - leftRafterInnerX(y_mm);
    }
    
    // Build trapezoidal gable insulation for one side of king post
    function buildGableInsTrapezoid(gableEnd, side, gableDoor) {
      // gableEnd: "front" or "back"
      // side: "L" (left of king post) or "R" (right of king post)
      // gableDoor: door info if a door extends into this gable, or null
      
      // Z position: flush with inside surface of gable frame
      // Extrusion goes from z_mm (front face) to z_mm + gableInsDepth_mm (back face)
      let z_mm;
      if (gableEnd === "front") {
        // Interior is toward +Z, so BACK face should be flush with inner face of front gable
        // Inner face of front gable is at trussPos[0] + memberW_mm
        z_mm = trussPos[0] + memberW_mm - gableInsDepth_mm;
      } else {
        // Interior is toward -Z, so FRONT face should be flush with inner face of back gable
        // Inner face of back gable is at trussPos[last] (front face of back truss member)
        z_mm = trussPos[trussPos.length - 1];
      }
      
      // Build the 2D trapezoid shape (XY cross-section)
      let shape = [];
      
      if (side === "L") {
        // LEFT trapezoid: from left rafter inner face to king post left edge
        const bottomLeftX = leftRafterInnerX(bottomY_mm);
        const topLeftX = leftRafterInnerX(topY_mm);
        const bottomRightX = kingPostLeftX_mm;
        const topRightX = kingPostLeftX_mm;
        
        // Check if there's a door cutout needed
        if (gableDoor) {
          // Door coordinates in roof-local space
          const doorLeftEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) - (gableDoor.studW || 50);
          const doorRightEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) + Math.floor(Number(gableDoor.width_mm || 800)) + (gableDoor.studW || 50);
          const doorTopY = Math.floor(Number(gableDoor.doorTopY || 0)) - (Number(apex?.heightToEaves_mm || apex?.eavesHeight_mm) || 1850);
          
          // Only cut if door overlaps this trapezoid
          if (doorLeftEdge < bottomRightX && doorRightEdge > bottomLeftX && doorTopY > bottomY_mm) {
            // Door overlaps - create shape with notch
            // Start from bottom-left, go clockwise
            const cutLeft = Math.max(doorLeftEdge, bottomLeftX);
            const cutRight = Math.min(doorRightEdge, bottomRightX);
            const cutTop = Math.min(doorTopY, topY_mm);
            
            // Trapezoid with rectangular notch cut from bottom
            shape = [
              new BABYLON.Vector3(bottomLeftX / 1000, bottomY_mm / 1000, 0),           // BL corner
              new BABYLON.Vector3(cutLeft / 1000, bottomY_mm / 1000, 0),               // Before door
              new BABYLON.Vector3(cutLeft / 1000, cutTop / 1000, 0),                   // Up to door top
              new BABYLON.Vector3(cutRight / 1000, cutTop / 1000, 0),                  // Across door top
              new BABYLON.Vector3(cutRight / 1000, bottomY_mm / 1000, 0),              // Down after door
              new BABYLON.Vector3(bottomRightX / 1000, bottomY_mm / 1000, 0),          // BR corner
              new BABYLON.Vector3(topRightX / 1000, topY_mm / 1000, 0),                // TR corner
              new BABYLON.Vector3(topLeftX / 1000, topY_mm / 1000, 0),                 // TL corner
            ];
          } else {
            // No overlap - simple trapezoid
            shape = [
              new BABYLON.Vector3(bottomLeftX / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(bottomRightX / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(topRightX / 1000, topY_mm / 1000, 0),
              new BABYLON.Vector3(topLeftX / 1000, topY_mm / 1000, 0),
            ];
          }
        } else {
          // No door - simple trapezoid
          shape = [
            new BABYLON.Vector3(bottomLeftX / 1000, bottomY_mm / 1000, 0),
            new BABYLON.Vector3(bottomRightX / 1000, bottomY_mm / 1000, 0),
            new BABYLON.Vector3(topRightX / 1000, topY_mm / 1000, 0),
            new BABYLON.Vector3(topLeftX / 1000, topY_mm / 1000, 0),
          ];
        }
      } else {
        // RIGHT trapezoid: from king post right edge to right rafter inner face
        const bottomLeftX = kingPostRightX_mm;
        const topLeftX = kingPostRightX_mm;
        const bottomRightX = rightRafterInnerX(bottomY_mm);
        const topRightX = rightRafterInnerX(topY_mm);
        
        // Check if there's a door cutout needed
        if (gableDoor) {
          const doorLeftEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) - (gableDoor.studW || 50);
          const doorRightEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) + Math.floor(Number(gableDoor.width_mm || 800)) + (gableDoor.studW || 50);
          const doorTopY = Math.floor(Number(gableDoor.doorTopY || 0)) - (Number(apex?.heightToEaves_mm || apex?.eavesHeight_mm) || 1850);
          
          if (doorLeftEdge < bottomRightX && doorRightEdge > bottomLeftX && doorTopY > bottomY_mm) {
            const cutLeft = Math.max(doorLeftEdge, bottomLeftX);
            const cutRight = Math.min(doorRightEdge, bottomRightX);
            const cutTop = Math.min(doorTopY, topY_mm);
            
            shape = [
              new BABYLON.Vector3(bottomLeftX / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(cutLeft / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(cutLeft / 1000, cutTop / 1000, 0),
              new BABYLON.Vector3(cutRight / 1000, cutTop / 1000, 0),
              new BABYLON.Vector3(cutRight / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(bottomRightX / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(topRightX / 1000, topY_mm / 1000, 0),
              new BABYLON.Vector3(topLeftX / 1000, topY_mm / 1000, 0),
            ];
          } else {
            shape = [
              new BABYLON.Vector3(bottomLeftX / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(bottomRightX / 1000, bottomY_mm / 1000, 0),
              new BABYLON.Vector3(topRightX / 1000, topY_mm / 1000, 0),
              new BABYLON.Vector3(topLeftX / 1000, topY_mm / 1000, 0),
            ];
          }
        } else {
          shape = [
            new BABYLON.Vector3(bottomLeftX / 1000, bottomY_mm / 1000, 0),
            new BABYLON.Vector3(bottomRightX / 1000, bottomY_mm / 1000, 0),
            new BABYLON.Vector3(topRightX / 1000, topY_mm / 1000, 0),
            new BABYLON.Vector3(topLeftX / 1000, topY_mm / 1000, 0),
          ];
        }
      }
      
      // Close the shape
      shape.push(shape[0].clone());
      
      // Extrude along Z
      const path = [
        new BABYLON.Vector3(0, 0, z_mm / 1000),
        new BABYLON.Vector3(0, 0, (z_mm + gableInsDepth_mm) / 1000)
      ];
      
      const meshName = `${meshPrefix}roof-ins-gable-${gableEnd}-${side}`;
      const gableIns = BABYLON.MeshBuilder.ExtrudeShape(
        meshName,
        {
          shape: shape,
          path: path,
          cap: BABYLON.Mesh.CAP_ALL
        },
        scene
      );
      
      gableIns.material = roofInsMat;
      gableIns.metadata = { dynamic: true, sectionId: sectionId || null, roof: "apex", part: "insulation-gable", end: gableEnd, side: side };
      gableIns.parent = roofRoot;
      
      if (gableIns.enableEdgesRendering) {
        gableIns.enableEdgesRendering();
        gableIns.edgesWidth = 1;
        gableIns.edgesColor = new BABYLON.Color4(0.5, 0.6, 0.3, 1);
      }
      
      return gableIns;
    }
    
    // Create gable insulation trapezoids (only if there's a raised tie beam area to fill)
    if (raisedTieY_mm > INS_GAP_MM * 2) {
      // Front gable
      buildGableInsTrapezoid("front", "L", frontGableDoor);
      buildGableInsTrapezoid("front", "R", frontGableDoor);
      
      // Back gable
      buildGableInsTrapezoid("back", "L", backGableDoor);
      buildGableInsTrapezoid("back", "R", backGableDoor);
      
      console.log('[ROOF_INS] Created gable end insulation trapezoids');
    }
  }

  // ---- ROOF INTERIOR PLYWOOD LINING (12mm boards covering insulation) ----
  // Only for raised tie beam configuration with insulated variant
  const showRoofPly = (state.vis?.roofParts?.ply !== false) && (state.walls?.variant === "insulated");
  
  if (showRoofPly && tieBeamSetting === "raised" && trussPos.length >= 2) {
    console.log('[ROOF_PLY] Building roof interior plywood - trussCount:', trussPos.length, 'bays:', trussPos.length - 1);
    
    // Plywood material (light wood color - same as wall plywood)
    const roofPlyMat = new BABYLON.StandardMaterial('roofPlyMat-' + Date.now(), scene);
    roofPlyMat.diffuseColor = new BABYLON.Color3(0.85, 0.75, 0.65); // Light wood
    
    const PLY_THICKNESS_MM = 12; // 12mm plywood
    const INS_THICKNESS_MM = 50; // 50mm insulation (to calculate offset)
    const sinT = Math.sin(slopeAng);
    const cosT = Math.cos(slopeAng);
    
    // Small gap between panels
    const PLY_GAP_MM = 2;
    
    // For each bay between trusses
    for (let bayIdx = 0; bayIdx < trussPos.length - 1; bayIdx++) {
      const z0_mm = trussPos[bayIdx] + memberW_mm; // After front truss
      const z1_mm = trussPos[bayIdx + 1];          // Before back truss
      const bayDepth_mm = Math.max(1, z1_mm - z0_mm);
      
      if (bayDepth_mm < 50) continue; // Skip tiny bays
      
      const bayZ_mm = z0_mm + bayDepth_mm / 2; // Center Z of bay
      
      // --- SLOPED PLYWOOD PANELS (left and right) ---
      // Plywood sits on the INTERIOR side of insulation
      // The sloped panels extend from eaves UP to where they meet the horizontal ceiling
      
      // Slope from eaves to tie beam level
      const slopeRunX_mm = halfSpan_mm - raisedTieHalfSpan_mm;
      const slopeRiseY_mm = raisedTieY_mm;
      const slopedLen_mm = Math.sqrt(slopeRunX_mm * slopeRunX_mm + slopeRiseY_mm * slopeRiseY_mm);
      
      // Panel dimensions - plywood goes all the way to meet horizontal ceiling
      const slopedPanelLen_mm = slopedLen_mm - PLY_GAP_MM;
      const slopedPanelDepth_mm = bayDepth_mm - PLY_GAP_MM * 2;
      
      // Midpoint along the rafter surface (before any offset)
      const midX_L_mm = slopeRunX_mm / 2;
      const midY_mm = memberD_mm + slopeRiseY_mm / 2;
      
      // Offset CENTER inward from rafter surface - plywood is INSIDE the insulation
      // Total offset = insulation thickness + half of plywood thickness
      const totalOffset_mm = INS_THICKNESS_MM + PLY_THICKNESS_MM / 2;
      const offsetX_mm = sinT * totalOffset_mm;
      const offsetY_mm = cosT * totalOffset_mm;
      
      // LEFT sloped plywood panel
      {
        const cx_mm = midX_L_mm + offsetX_mm;
        const cy_mm = midY_mm - offsetY_mm;
        
        const plyLeft = mkBoxCenteredLocal(
          `${meshPrefix}roof-ply-bay${bayIdx}-L`,
          slopedPanelLen_mm,
          PLY_THICKNESS_MM,
          slopedPanelDepth_mm,
          cx_mm,
          cy_mm,
          bayZ_mm,
          roofRoot,
          roofPlyMat,
          { roof: "apex", part: "ply", bay: bayIdx, side: "L" }
        );
        if (plyLeft) {
          plyLeft.rotation = new BABYLON.Vector3(0, 0, slopeAng);
          plyLeft.enableEdgesRendering();
          plyLeft.edgesWidth = 1;
          plyLeft.edgesColor = new BABYLON.Color4(0.6, 0.5, 0.4, 1);
        }
      }
      
      // RIGHT sloped plywood panel (mirror of left)
      {
        const midX_R_mm = A_mm - slopeRunX_mm / 2;
        const cx_mm = midX_R_mm - offsetX_mm;
        const cy_mm = midY_mm - offsetY_mm;
        
        const plyRight = mkBoxCenteredLocal(
          `${meshPrefix}roof-ply-bay${bayIdx}-R`,
          slopedPanelLen_mm,
          PLY_THICKNESS_MM,
          slopedPanelDepth_mm,
          cx_mm,
          cy_mm,
          bayZ_mm,
          roofRoot,
          roofPlyMat,
          { roof: "apex", part: "ply", bay: bayIdx, side: "R" }
        );
        if (plyRight) {
          plyRight.rotation = new BABYLON.Vector3(0, 0, -slopeAng);
          plyRight.enableEdgesRendering();
          plyRight.edgesWidth = 1;
          plyRight.edgesColor = new BABYLON.Color4(0.6, 0.5, 0.4, 1);
        }
      }
      
      // --- HORIZONTAL CEILING PLYWOOD (between sloped sections) ---
      // This is the flat ceiling at tie beam level - UNDERSIDE visible from below
      {
        const horizWidth_mm = raisedTieSpan_mm - PLY_GAP_MM * 2;
        const horizDepth_mm = slopedPanelDepth_mm;
        
        // Position: centered on ridge, BOTTOM at insulation bottom level
        // Insulation bottom is at: raisedTieY_mm + memberD_mm - INS_THICKNESS_MM
        // Plywood top should be at insulation bottom, so plywood center is offset down by PLY_THICKNESS_MM/2
        const cx_mm = halfSpan_mm;
        const cy_mm = raisedTieY_mm + memberD_mm - INS_THICKNESS_MM - PLY_THICKNESS_MM / 2;
        
        const plyHoriz = mkBoxCenteredLocal(
          `${meshPrefix}roof-ply-bay${bayIdx}-H`,
          horizWidth_mm,
          PLY_THICKNESS_MM,
          horizDepth_mm,
          cx_mm,
          cy_mm,
          bayZ_mm,
          roofRoot,
          roofPlyMat,
          { roof: "apex", part: "ply", bay: bayIdx, side: "H" }
        );
        if (plyHoriz) {
          plyHoriz.enableEdgesRendering();
          plyHoriz.edgesWidth = 1;
          plyHoriz.edgesColor = new BABYLON.Color4(0.6, 0.5, 0.4, 1);
        }
      }
    }
    
    console.log('[ROOF_PLY] Created plywood lining for', trussPos.length - 1, 'bays');
    
    // ---- GABLE END PLYWOOD (TRAPEZOIDAL) ----
    // Same shape as gable insulation but thinner (12mm) and offset inward
    
    const gablePlyDepth_mm = PLY_THICKNESS_MM; // 12mm depth
    const topY_mm = raisedTieY_mm - PLY_GAP_MM;
    const bottomY_mm = 0;
    const kingPostLeftX_mm = halfSpan_mm - memberW_mm / 2;
    const kingPostRightX_mm = halfSpan_mm + memberW_mm / 2;
    
    // Rafter inner face position calculator (same as insulation)
    function leftRafterInnerX(y_mm) {
      if (y_mm <= memberD_mm) return memberW_mm;
      return memberW_mm + (y_mm - memberD_mm) * halfSpan_mm / rise_mm;
    }
    function rightRafterInnerX(y_mm) {
      return A_mm - leftRafterInnerX(y_mm);
    }
    
    // Build trapezoidal gable plywood for one side of king post
    // Now with door cutout support (same as gable insulation)
    function buildGablePlyTrapezoid(gableEnd, side, gableDoor) {
      // Z position: offset INWARD from gable frame by insulation thickness + ply position
      let z_mm;
      const gableOffset_mm = INS_THICKNESS_MM; // After insulation
      if (gableEnd === "front") {
        z_mm = trussPos[0] + memberW_mm + gableOffset_mm;
      } else {
        z_mm = trussPos[trussPos.length - 1] - gableOffset_mm - gablePlyDepth_mm;
      }
      
      // Trapezoid corner positions (same as insulation trapezoid)
      const leftAtBottom = leftRafterInnerX(bottomY_mm);
      const leftAtTop = leftRafterInnerX(topY_mm);
      const rightAtBottom = rightRafterInnerX(bottomY_mm);
      const rightAtTop = rightRafterInnerX(topY_mm);
      
      let x0_bottom, x1_bottom, x0_top, x1_top;
      if (side === "L") {
        x0_bottom = leftAtBottom + PLY_GAP_MM;
        x1_bottom = kingPostLeftX_mm - PLY_GAP_MM;
        x0_top = leftAtTop + PLY_GAP_MM;
        x1_top = kingPostLeftX_mm - PLY_GAP_MM;
      } else {
        x0_bottom = kingPostRightX_mm + PLY_GAP_MM;
        x1_bottom = rightAtBottom - PLY_GAP_MM;
        x0_top = kingPostRightX_mm + PLY_GAP_MM;
        x1_top = rightAtTop - PLY_GAP_MM;
      }
      
      // Build 2D shape - either simple trapezoid or with door notch
      let shape = [];
      
      if (gableDoor) {
        // Calculate door position in roof-local coordinates
        const doorLeftEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) - (gableDoor.studW || 50);
        const doorRightEdge = l_mm + Math.floor(Number(gableDoor.x_mm || 0)) + Math.floor(Number(gableDoor.width_mm || 800)) + (gableDoor.studW || 50);
        const eavesH = Number(apex?.heightToEaves_mm || apex?.eavesHeight_mm) || 1850;
        const doorTopY = Math.floor(Number(gableDoor.doorTopY || 0)) - eavesH;
        
        // Check if door overlaps this trapezoid
        if (doorLeftEdge < x1_bottom && doorRightEdge > x0_bottom && doorTopY > bottomY_mm) {
          // Door overlaps - create shape with notch cut from bottom
          const cutLeft = Math.max(doorLeftEdge, x0_bottom);
          const cutRight = Math.min(doorRightEdge, x1_bottom);
          const cutTop = Math.min(doorTopY, topY_mm);
          
          console.log('[ROOF_PLY] Cutting door notch in gable ply', gableEnd, side, 
            'door:', doorLeftEdge, '-', doorRightEdge, 'y:', doorTopY,
            'cut:', cutLeft, '-', cutRight, 'top:', cutTop);
          
          // Trapezoid with rectangular notch - go clockwise from bottom-left
          shape = [
            new BABYLON.Vector3(x0_bottom / 1000, bottomY_mm / 1000, 0),    // BL corner
            new BABYLON.Vector3(cutLeft / 1000, bottomY_mm / 1000, 0),      // Before door
            new BABYLON.Vector3(cutLeft / 1000, cutTop / 1000, 0),          // Up to door header
            new BABYLON.Vector3(cutRight / 1000, cutTop / 1000, 0),         // Across door header
            new BABYLON.Vector3(cutRight / 1000, bottomY_mm / 1000, 0),     // Down after door
            new BABYLON.Vector3(x1_bottom / 1000, bottomY_mm / 1000, 0),    // BR corner
            new BABYLON.Vector3(x1_top / 1000, topY_mm / 1000, 0),          // TR corner
            new BABYLON.Vector3(x0_top / 1000, topY_mm / 1000, 0),          // TL corner
          ];
        } else {
          // No overlap - simple trapezoid
          shape = [
            new BABYLON.Vector3(x0_bottom / 1000, bottomY_mm / 1000, 0),
            new BABYLON.Vector3(x1_bottom / 1000, bottomY_mm / 1000, 0),
            new BABYLON.Vector3(x1_top / 1000, topY_mm / 1000, 0),
            new BABYLON.Vector3(x0_top / 1000, topY_mm / 1000, 0),
          ];
        }
      } else {
        // No door - simple trapezoid
        shape = [
          new BABYLON.Vector3(x0_bottom / 1000, bottomY_mm / 1000, 0),
          new BABYLON.Vector3(x1_bottom / 1000, bottomY_mm / 1000, 0),
          new BABYLON.Vector3(x1_top / 1000, topY_mm / 1000, 0),
          new BABYLON.Vector3(x0_top / 1000, topY_mm / 1000, 0),
        ];
      }
      
      // Extrusion path along Z
      const extrusionPath = [
        new BABYLON.Vector3(0, 0, z_mm / 1000),
        new BABYLON.Vector3(0, 0, (z_mm + gablePlyDepth_mm) / 1000)
      ];
      
      const gablePly = BABYLON.MeshBuilder.ExtrudeShape(
        `${meshPrefix}roof-ply-gable-${gableEnd}-${side}`,
        { shape: shape, path: extrusionPath, cap: BABYLON.Mesh.CAP_ALL, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
        scene
      );
      gablePly.material = roofPlyMat;
      gablePly.parent = roofRoot;
      gablePly.metadata = { dynamic: true, sectionId: sectionId || null, roof: "apex", part: "ply-gable", end: gableEnd, side: side };
      gablePly.enableEdgesRendering();
      gablePly.edgesWidth = 1;
      gablePly.edgesColor = new BABYLON.Color4(0.6, 0.5, 0.4, 1);
    }
    
    // Only build gable plywood if we have gable insulation area (raised tie beam gives headroom)
    if (raisedTieY_mm > 50) {
      buildGablePlyTrapezoid("front", "L", frontGableDoor);
      buildGablePlyTrapezoid("front", "R", frontGableDoor);
      buildGablePlyTrapezoid("back", "L", backGableDoor);
      buildGablePlyTrapezoid("back", "R", backGableDoor);
      console.log('[ROOF_PLY] Created gable end plywood trapezoids');
    }
  }

  // ---- Placement in world: align plan min corner to [-l,-f], then lift to wall height ----
  const targetMinX_m = (-l_mm) / 1000;
  const targetMinZ_m = (-f_mm) / 1000;

  // Fixed apex orientation: ridge axis is world Z (no yaw).
  const yaw = 0;
  roofRoot.rotationQuaternion = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), yaw);

  // Corners of local roof rectangle (0..localW, 0..localD) in LOCAL XZ:
  // Our constructed roof rectangle is A x B in local XZ.
  const localW_mm = A_mm;
  const localD_mm = B_mm;

  const cornersLocal = [
    new BABYLON.Vector3(0, 0, 0),
    new BABYLON.Vector3(localW_mm / 1000, 0, 0),
    new BABYLON.Vector3(0, 0, localD_mm / 1000),
    new BABYLON.Vector3(localW_mm / 1000, 0, localD_mm / 1000),
  ];

  function worldOfLocal(pLocal) {
    try {
      const wm = roofRoot.getWorldMatrix();
      return BABYLON.Vector3.TransformCoordinates(pLocal, wm);
    } catch (e) {
      return null;
    }
  }

  let minCornerX = Infinity;
  let minCornerZ = Infinity;
  for (let i = 0; i < cornersLocal.length; i++) {
    const wpt = worldOfLocal(cornersLocal[i]);
    if (!wpt) continue;
    if (Number.isFinite(wpt.x) && wpt.x < minCornerX) minCornerX = wpt.x;
    if (Number.isFinite(wpt.z) && wpt.z < minCornerZ) minCornerZ = wpt.z;
  }
  if (!Number.isFinite(minCornerX)) minCornerX = 0;
  if (!Number.isFinite(minCornerZ)) minCornerZ = 0;

  roofRoot.position.x += (targetMinX_m - minCornerX);
  roofRoot.position.z += (targetMinZ_m - minCornerZ);

  const WALL_RISE_MM = 168;  // Floor rise (applied externally in index.js)

  // APEX height positioning:
  // - Height-to-Eaves is the DRIVING dimension = absolute height of TIE BEAM UNDERSIDE (not OSB underside)
  // - Wall height is DERIVED from eaves height
  // - Trusses sit ON TOP of the wall plate
  //
  // IMPORTANT: index.js applies an external shift of +WALL_RISE_MM (168mm) to ALL roof meshes via shiftRoofMeshes().
  // So roofRoot.position.y here is in "pre-shift" local coordinates.

  let wallH_mm;

  if (Number.isFinite(eavesTargetAbs_mm) && Number.isFinite(crestTargetAbs_mm)) {
    // HEIGHT TO EAVES = underside of truss tie beams (world Y coordinate)
    // Position roof so tie beam underside (at local y=0) is at eavesTargetAbs_mm
    //
    // Calculation:
    // - Tie beam underside (world) = roofRoot.y + WALL_RISE_MM = eavesTargetAbs_mm
    // - Therefore: roofRoot.y = eavesTargetAbs_mm - WALL_RISE_MM
    const roofRootY_mm = Math.floor(eavesTargetAbs_mm - WALL_RISE_MM);
    roofRoot.position.y = roofRootY_mm / 1000;

    // Wall height is derived: wall top plate must align with tie beam bottom
    // Wall frame height (in local coords, before WALL_RISE shift) = eavesTargetAbs_mm - WALL_RISE_MM
    wallH_mm = eavesTargetAbs_mm - WALL_RISE_MM;

    // DEBUG: Verify the positioning
    const tieBeamBottomWorldY = roofRootY_mm + WALL_RISE_MM;
    const wallPlateTopY_mm = wallH_mm + WALL_RISE_MM;
    const gap_mm = tieBeamBottomWorldY - wallPlateTopY_mm;

    // Calculate OSB underside for informational purposes
    const OSB_CLEAR_MM = 1;
    const halfSpan_mm = Math.max(1, Math.floor(A_mm / 2));
    const den = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
    const cosT = den > 1e-6 ? (halfSpan_mm / den) : 1;
    const eavesUnderLocalY_mm = memberD_mm + cosT * (memberD_mm + OSB_CLEAR_MM);
    const osbUndersideWorldY = tieBeamBottomWorldY + eavesUnderLocalY_mm;

    console.log(`[APEX_ROOF] === POSITIONING DEBUG ===`);
    console.log(`[APEX_ROOF] Height to Eaves (INPUT): ${eavesTargetAbs_mm}mm = tie beam underside`);
    console.log(`[APEX_ROOF] WALL_RISE: ${WALL_RISE_MM}mm`);
    console.log(`[APEX_ROOF] Derived wall frame height: ${wallH_mm}mm`);
    console.log(`[APEX_ROOF] roofRoot.y (pre-shift): ${roofRootY_mm}mm`);
    console.log(`[APEX_ROOF] Tie beam underside (world): ${tieBeamBottomWorldY.toFixed(2)}mm ✓ MATCHES EAVES TARGET`);
    console.log(`[APEX_ROOF] Wall plate top (world): ${wallPlateTopY_mm.toFixed(2)}mm`);
    console.log(`[APEX_ROOF] Gap (tie beam - wall plate): ${gap_mm.toFixed(2)}mm ✓ SHOULD BE 0`);
    console.log(`[APEX_ROOF] OSB underside (world): ${osbUndersideWorldY.toFixed(2)}mm (for info only)`);
  } else {
    // Legacy: no eaves/crest controls, use wall height from state
    wallH_mm = Math.max(100, Math.floor(Number(state && state.walls && state.walls.height_mm != null ? state.walls.height_mm : 2400)));
    roofRoot.position.y = wallH_mm / 1000;
  }

  // ---- Debug ----
  try {
    if (typeof window !== "undefined" && window.__dbg) {
      window.__dbg.roofFit = {
        mode: "apex-gable",
        frame: { w_mm: frameW_mm, d_mm: frameD_mm },
        overhang_mm: { l: l_mm, r: r_mm, f: f_mm, b: b_mm },
        spanA_mm: A_mm,
        runB_mm: B_mm,
        rise_mm: rise_mm,
        ridgeAlongWorldX: false,
        osbOffset_mm: (memberD_mm / 2) + (18 / 2)
      };
    }
  } catch (e) {}

  // ---- APEX ONLY: deterministically trim wall cladding to roof UNDERSIDE (no roof geometry edits) ----
  // Uses analytic underside planes (function of X only) + CSG subtract (no rendering hacks).
  try {
    installApexCladdingTrim(scene, roofRoot, {
      A_mm: A_mm,
      B_mm: B_mm,
      rise_mm: rise_mm,
      memberD_mm: memberD_mm
    });
  } catch (e) {}
}

function updateBOM_Apex(state, tbody) {
  const dims = resolveDims(state);

  const roofW_mm = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? state?.w ?? 1)));
  const roofD_mm = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? state?.d ?? 1)));

  const A_mm = roofW_mm;
  const B_mm = roofD_mm;

  const g = getRoofFrameGauge(state);
  const baseW = Math.max(1, Math.floor(Number(g.thickness_mm)));
  const baseD = Math.max(1, Math.floor(Number(g.depth_mm)));
  const memberW_mm = baseD;
  const memberD_mm = baseW;

  const rise_mm = clamp(Math.floor(A_mm * 0.20), 200, 900);
  const halfSpan_mm = A_mm / 2;
  const rafterLen_mm = Math.round(Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm));

  // Truss quantity must match 3D logic:
  // - If trussCount >= 2 => use that exact count
  // - Else => fallback to legacy @600 spacing logic (but on FRAME ridge span, not roof overhang span)
  let desiredCount = null;
  try {
    desiredCount = state && state.roof && state.roof.apex && state.roof.apex.trussCount != null
      ? Math.floor(Number(state.roof.apex.trussCount))
      : null;
  } catch (e) { desiredCount = null; }

  let trussQty = null;

  if (Number.isFinite(desiredCount) && desiredCount >= 2) {
    trussQty = desiredCount;
  } else {
    const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? roofW_mm)));
    const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? roofD_mm)));

    const ovh = (dims && dims.overhang) ? dims.overhang : { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };
    const l_mm = Math.max(0, Math.floor(Number(ovh.l_mm || 0)));
    const r_mm = Math.max(0, Math.floor(Number(ovh.r_mm || 0)));
    const f_mm = Math.max(0, Math.floor(Number(ovh.f_mm || 0)));
    const b_mm = Math.max(0, Math.floor(Number(ovh.b_mm || 0)));

    const ridgeFrameLen_mm = frameD_mm;
    const ridgeStart_mm = f_mm;

    const spacing = 600;
    const pos = [];

    const minP = Math.max(0, Math.floor(ridgeStart_mm));
    const maxP = Math.max(minP, Math.floor(ridgeStart_mm + ridgeFrameLen_mm - memberW_mm));

    let p = minP;
    while (p <= maxP) { pos.push(Math.floor(p)); p += spacing; }
    if (pos.length) {
      const last = pos[pos.length - 1];
      if (Math.abs(last - maxP) > 0) pos.push(Math.floor(maxP));
    } else {
      pos.push(minP);
    }

    trussQty = pos.length;
  }

  const rows = [];

  rows.push({
    item: "Roof Truss (assembly)",
    qty: trussQty,
    L: B_mm,
    W: A_mm,
    notes: "apex; spacing @600mm; rise_mm=" + String(rise_mm),
  });

  rows.push({
    item: "Truss Tie (bottom chord)",
    qty: trussQty,
    L: A_mm,
    W: memberW_mm,
    notes: "D (mm): " + String(memberD_mm),
  });

  rows.push({
    item: "Truss Rafter",
    qty: trussQty * 2,
    L: rafterLen_mm,
    W: memberW_mm,
    notes: "D (mm): " + String(memberD_mm),
  });

  rows.push({
    item: "Ridge Beam",
    qty: 1,
    L: B_mm,
    W: memberW_mm,
    notes: "D (mm): " + String(memberD_mm),
  });

  // Purlin quantity must match buildApex():
  // - stations along slope: start at ridge (0), step 609mm along slope, always include bottom station
  // - TWO purlins per station (L + R)
  const slopeAng = Math.atan2(rise_mm, halfSpan_mm);
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);

  const PURLIN_STEP_MM = 609;
  const PURLIN_CLEAR_MM = 1;
  const purlinOutOffset_mm = (memberD_mm / 2) + PURLIN_CLEAR_MM;

  const xSurfBottomL_mm = Math.max(
    0,
    Math.min(
      halfSpan_mm,
      Math.round((memberW_mm / 2) * cosT + (sinT * purlinOutOffset_mm))
    )
  );
  const runBottom_mm = Math.max(0, Math.round(halfSpan_mm - xSurfBottomL_mm));
  const sBottom_mm = cosT > 1e-6 ? (runBottom_mm / cosT) : rafterLen_mm;

  const sList = [0];
  let sNext = PURLIN_STEP_MM;
  while (sNext < sBottom_mm) {
    sList.push(Math.round(sNext));
    sNext += PURLIN_STEP_MM;
  }
  const sBottomRounded = Math.round(sBottom_mm);
  if (sList[sList.length - 1] !== sBottomRounded) sList.push(sBottomRounded);

  const purlinQty = 2 * sList.length;

  rows.push({
    item: "Purlin",
    qty: purlinQty,
    L: B_mm,
    W: memberW_mm,
    notes: "D (mm): " + String(memberD_mm) + "; stations=" + String(sList.length) + "; step=609mm",
  });

// Calculate OSB pieces for BOM (same logic as build3D)
  // Orientation: 2440mm (8ft) runs DOWN the slope for fewer cuts
  const SHEET_SHORT = 1220;
  const SHEET_LONG = 2440;
  
  const sheetA = SHEET_SHORT;  // 1220mm down slope
  const sheetB = SHEET_LONG;   // 2440mm along ridge (parallel to purlins)
  
  const osbPieces = computeOsbPiecesForSlope(rafterLen_mm, B_mm, sheetA, sheetB);
  
  // Group by size and kind
  const osbGroups = {};
  for (let i = 0; i < osbPieces.length; i++) {
    const p = osbPieces[i];
    const key = `${p.aLen_mm}x${p.bLen_mm}|${p.kind}`;
    if (!osbGroups[key]) {
      osbGroups[key] = { qty: 0, L: p.aLen_mm, W: p.bLen_mm, kind: p.kind };
    }
    osbGroups[key].qty += 2;  // x2 for both slopes
  }
  
  const osbKeys = Object.keys(osbGroups).sort();
  for (let i = 0; i < osbKeys.length; i++) {
    const g = osbGroups[osbKeys[i]];
    const isStd = (g.L === sheetA && g.W === sheetB) || (g.L === sheetB && g.W === sheetA);
    rows.push({
      item: "Roof OSB",
      qty: g.qty,
      L: g.L,
      W: g.W,
      notes: "18mm OSB; " + (isStd ? "standard sheet" : "rip/trim cut") + "; apex",
    });
  }

  rows.sort((a, b) => String(a.item).localeCompare(String(b.item)));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    appendRow5(tbody, [r.item, String(r.qty), String(r.L), String(r.W), r.notes || ""]);
  }

  // Calculate total frame timber (exclude OSB)
  const FRAME_STOCK_LENGTH = 6200;
  let totalFrameLength_mm = 0;
  totalFrameLength_mm += trussQty * A_mm;           // Truss Ties
  totalFrameLength_mm += (trussQty * 2) * rafterLen_mm;  // Truss Rafters
  totalFrameLength_mm += 1 * B_mm;                  // Ridge Beam
  totalFrameLength_mm += purlinQty * B_mm;          // Purlins

  const totalFrameStockPieces = Math.ceil(totalFrameLength_mm / FRAME_STOCK_LENGTH);
  appendRow5(tbody, [
    "TOTAL FRAME",
    String(totalFrameStockPieces),
    String(FRAME_STOCK_LENGTH),
    "",
    `Total: ${Math.round(totalFrameLength_mm / 1000 * 10) / 10}m linear; ${totalFrameStockPieces} × ${FRAME_STOCK_LENGTH}mm lengths`
  ]);

  if (!rows.length) appendPlaceholderRow(tbody, "Roof cutting list not yet generated.");
}

/* ------------------------------ HIPPED (new) ------------------------------ */

/**
 * Builds a hipped roof with four sloping sides meeting at a ridge (or point for square plans).
 * Creates hip rafters, jack rafters, common rafters, ridge, OSB sheathing, covering, and fascia.
 * 
 * Components built:
 * - Ridge board: shortened (length = depth - width, or none for square plans)
 * - Hip rafters: 4 diagonal rafters from corners to ridge ends (or peak)
 * - Common rafters: standard rafters in the middle section (if rectangular)
 * - Jack rafters: shortened rafters from wall plate to hip rafters
 * - OSB: 4 roof planes (2 trapezoids + 2 triangles, or 4 triangles if square)
 * - Covering: felt/membrane over OSB
 * - Fascia: trim boards around perimeter and along hips
 * 
 * @param {Object} state - Building state with roof.hipped parameters
 * @param {Object} ctx - Babylon.js context {scene, materials}
 * @param {string} [meshPrefix=""] - Prefix for mesh names (for multi-section)
 * @param {Object} [sectionPos={x:0,y:0,z:0}] - Section position offset in mm
 * @param {string|null} [sectionId=null] - Section identifier for metadata
 * @private
 */
function buildHipped(state, ctx, meshPrefix = "", sectionPos = { x: 0, y: 0, z: 0 }, sectionId = null) {
  const { scene, materials } = ctx || {};
  if (!scene) return;

  const roofParts = getRoofParts(state);
  const dims = resolveDims(state);

  const ovh = (dims && dims.overhang) ? dims.overhang : { l_mm: 0, r_mm: 0, f_mm: 0, b_mm: 0 };
  const l_mm = Math.max(0, Math.floor(Number(ovh.l_mm || 0)));
  const r_mm = Math.max(0, Math.floor(Number(ovh.r_mm || 0)));
  const f_mm = Math.max(0, Math.floor(Number(ovh.f_mm || 0)));
  const b_mm = Math.max(0, Math.floor(Number(ovh.b_mm || 0)));

  const frameW_mm = Math.max(1, Math.floor(Number(dims?.frame?.w_mm ?? state?.w ?? 1)));
  const frameD_mm = Math.max(1, Math.floor(Number(dims?.frame?.d_mm ?? state?.d ?? 1)));

  // Roof plan (outer) in mm - includes overhang
  const roofW_mm = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? frameW_mm)));
  const roofD_mm = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? frameD_mm)));

  // For hipped roof: A = width (X), B = depth (Z)
  const A_mm = roofW_mm;
  const B_mm = roofD_mm;

  // Determine if rectangular (has ridge) or square (pyramid peak)
  const isSquare = Math.abs(A_mm - B_mm) < 100; // Within 100mm = treat as square
  
  // Ridge length (0 for square/pyramid)
  const ridgeLen_mm = isSquare ? 0 : Math.max(0, B_mm - A_mm);
  
  // Ridge starts/ends positions along Z
  const ridgeStartZ_mm = A_mm / 2;
  const ridgeEndZ_mm = B_mm - (A_mm / 2);

  // Height controls - use apex settings if available
  const hipped = (state && state.roof && state.roof.hipped) ? state.roof.hipped : null;
  const apex = (state && state.roof && state.roof.apex) ? state.roof.apex : null;
  
  const eavesH_mm = Number(hipped?.heightToEaves_mm || apex?.heightToEaves_mm || apex?.eavesHeight_mm) || 1850;
  const crestH_mm = Number(hipped?.heightToCrest_mm || apex?.heightToCrest_mm || apex?.crestHeight_mm) || 2400;
  
  // Calculate rise from eaves to crest
  const rise_mm = Math.max(100, crestH_mm - eavesH_mm);

  // Timber section
  // For load-bearing rafters, timber should be "on its side" (tall and narrow)
  // g.thickness_mm = narrow dimension (e.g., 50mm)
  // g.depth_mm = tall dimension (e.g., 75 or 100mm)
  const g = getRoofFrameGauge(state);
  const baseW = Math.max(1, Math.floor(Number(g.thickness_mm)));  // e.g., 50
  const baseD = Math.max(1, Math.floor(Number(g.depth_mm)));      // e.g., 75/100
  const memberW_mm = baseW; // width in plan = narrow (50mm)
  const memberD_mm = baseD; // vertical depth = tall (75/100mm) - load bearing

  // Materials
  const joistMat = materials && materials.timber ? materials.timber : null;

  const osbMat = (() => {
    try {
      if (scene._roofOsbMat) return scene._roofOsbMat;
      const m = new BABYLON.StandardMaterial("roofOsbMat", scene);
      m.diffuseColor = new BABYLON.Color3(0.75, 0.62, 0.45);
      scene._roofOsbMat = m;
      return m;
    } catch (e) {
      return null;
    }
  })();

  const coveringMat = (() => {
    try {
      if (scene._roofCoveringMat) return scene._roofCoveringMat;
      const m = new BABYLON.StandardMaterial("roofCoveringMat", scene);
      m.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Black
      scene._roofCoveringMat = m;
      return m;
    } catch (e) {
      return null;
    }
  })();

  // Helper functions
  function mkBoxBottomLocal(name, Lx_mm, Ly_mm, Lz_mm, x_mm, yBottom_m, z_mm, parentNode, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(
      name,
      { width: Lx_mm / 1000, height: Ly_mm / 1000, depth: Lz_mm / 1000 },
      scene
    );
    mesh.position = new BABYLON.Vector3(
      (x_mm + Lx_mm / 2) / 1000,
      yBottom_m + (Ly_mm / 2) / 1000,
      (z_mm + Lz_mm / 2) / 1000
    );
    mesh.material = mat;
    mesh.metadata = Object.assign({ dynamic: true, sectionId: sectionId || null }, meta || {});
    if (parentNode) mesh.parent = parentNode;
    return mesh;
  }

  function mkBoxCenteredLocal(name, Lx_mm, Ly_mm, Lz_mm, cx_mm, cy_mm, cz_mm, parentNode, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(
      name,
      { width: Lx_mm / 1000, height: Ly_mm / 1000, depth: Lz_mm / 1000 },
      scene
    );
    mesh.position = new BABYLON.Vector3(cx_mm / 1000, cy_mm / 1000, cz_mm / 1000);
    mesh.material = mat;
    mesh.metadata = Object.assign({ dynamic: true, sectionId: sectionId || null }, meta || {});
    if (parentNode) mesh.parent = parentNode;
    return mesh;
  }

  // Root transform node
  const roofRoot = new BABYLON.TransformNode(`${meshPrefix}roof-root`, scene);
  roofRoot.metadata = { dynamic: true, sectionId: sectionId || null };
  roofRoot.position = new BABYLON.Vector3(sectionPos.x / 1000, sectionPos.y / 1000, sectionPos.z / 1000);
  roofRoot.rotationQuaternion = BABYLON.Quaternion.Identity();

  // Calculate geometry
  const halfSpan_mm = A_mm / 2; // Half width for common rafter rise calculation
  const commonRafterLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const commonSlopeAng = Math.atan2(rise_mm, halfSpan_mm);
  
  // Hip rafter geometry (runs at 45° in plan from corners to ridge ends)
  // Plan length = halfSpan * sqrt(2) (diagonal of half-width square)
  const hipPlanLen_mm = halfSpan_mm * Math.SQRT2;
  const hipRafterLen_mm = Math.sqrt(hipPlanLen_mm * hipPlanLen_mm + rise_mm * rise_mm);
  const hipSlopeAng = Math.atan2(rise_mm, hipPlanLen_mm);

  // Jack rafter spacing (same as common rafters)
  const rafterSpacing_mm = 600;

  if (roofParts.structure) {
    // === RIDGE BOARD (only if rectangular) ===
    // Ridge top should be at rise_mm (where rafters meet), not bottom
    if (ridgeLen_mm > 0) {
      mkBoxBottomLocal(
        `${meshPrefix}roof-hipped-ridge`,
        memberW_mm,
        memberD_mm,
        ridgeLen_mm,
        Math.floor(halfSpan_mm - memberW_mm / 2),
        (rise_mm - memberD_mm) / 1000,  // Position so TOP is at rise_mm
        ridgeStartZ_mm,
        roofRoot,
        joistMat,
        { roof: "hipped", part: "ridge" }
      );
    }

    // === HIP RAFTERS (4 diagonal rafters from corners to ridge ends/peak) ===
    // Each hip rafter runs from a corner (at y=0) to the ridge end (at y=rise)
    // In plan view, they run at 45° from the corners
    
    const hipCorners = [
      { name: "FL", x: 0, z: 0, ridgeX: halfSpan_mm, ridgeZ: ridgeStartZ_mm }, // Front-Left
      { name: "FR", x: A_mm, z: 0, ridgeX: halfSpan_mm, ridgeZ: ridgeStartZ_mm }, // Front-Right
      { name: "BL", x: 0, z: B_mm, ridgeX: halfSpan_mm, ridgeZ: ridgeEndZ_mm }, // Back-Left
      { name: "BR", x: A_mm, z: B_mm, ridgeX: halfSpan_mm, ridgeZ: ridgeEndZ_mm }, // Back-Right
    ];

    for (let i = 0; i < hipCorners.length; i++) {
      const hip = hipCorners[i];
      
      // Calculate center position and rotation for hip rafter
      const dx = hip.ridgeX - hip.x;
      const dz = hip.ridgeZ - hip.z;
      const planAngle = Math.atan2(dz, dx); // Angle in XZ plane
      
      // Center of hip rafter (midpoint between eaves at y=0 and ridge at y=rise)
      const cx_mm = (hip.x + hip.ridgeX) / 2;
      const cy_mm = rise_mm / 2;  // Center height between eaves (0) and ridge (rise)
      const cz_mm = (hip.z + hip.ridgeZ) / 2;

      const hipMesh = mkBoxCenteredLocal(
        `${meshPrefix}roof-hipped-hip-${hip.name}`,
        hipRafterLen_mm,
        memberD_mm,
        memberW_mm,
        cx_mm,
        cy_mm,
        cz_mm,
        roofRoot,
        joistMat,
        { roof: "hipped", part: "hip-rafter", corner: hip.name }
      );
      
      // Rotate: first rotate about Z for slope, then about Y for plan direction
      // Create rotation from Euler angles
      hipMesh.rotation = new BABYLON.Vector3(0, -planAngle, hipSlopeAng);
    }

    // === COMMON RAFTERS (only in middle section if rectangular) ===
    // These run perpendicular to the ridge, from ridge to wall plate
    if (ridgeLen_mm > 0) {
      const commonStartZ = ridgeStartZ_mm + memberW_mm; // After first hip connection
      const commonEndZ = ridgeEndZ_mm - memberW_mm; // Before last hip connection
      
      // Generate positions along the ridge
      const commonPositions = [];
      let z = commonStartZ;
      while (z < commonEndZ) {
        commonPositions.push(z);
        z += rafterSpacing_mm;
      }
      
      for (let i = 0; i < commonPositions.length; i++) {
        const z_mm = commonPositions[i];
        
        // Left common rafter (from ridge to left wall)
        {
          const cx_mm = halfSpan_mm / 2;
          const cy_mm = rise_mm / 2;  // Center height between eaves (0) and ridge (rise)
          
          const leftRafter = mkBoxCenteredLocal(
            `${meshPrefix}roof-hipped-common-L-${i}`,
            commonRafterLen_mm,
            memberD_mm,
            memberW_mm,
            cx_mm,
            cy_mm,
            z_mm + memberW_mm / 2,
            roofRoot,
            joistMat,
            { roof: "hipped", part: "common-rafter", side: "L" }
          );
          leftRafter.rotation = new BABYLON.Vector3(0, 0, commonSlopeAng);
        }
        
        // Right common rafter (from ridge to right wall)
        {
          const cx_mm = halfSpan_mm + halfSpan_mm / 2;
          const cy_mm = rise_mm / 2;  // Center height between eaves (0) and ridge (rise)
          
          const rightRafter = mkBoxCenteredLocal(
            `${meshPrefix}roof-hipped-common-R-${i}`,
            commonRafterLen_mm,
            memberD_mm,
            memberW_mm,
            cx_mm,
            cy_mm,
            z_mm + memberW_mm / 2,
            roofRoot,
            joistMat,
            { roof: "hipped", part: "common-rafter", side: "R" }
          );
          rightRafter.rotation = new BABYLON.Vector3(0, 0, -commonSlopeAng);
        }
      }
    }

    // === JACK RAFTERS (shortened rafters on hip end slopes) ===
    // Jack rafters are like common rafters but truncated by hip rafters at corners.
    // They land on the FRONT/BACK wall plates and run along Z (parallel to common rafters).
    // At the hip end, they form pairs on either side of each hip rafter.
    
    // FRONT HIP END - jack rafters landing on FRONT wall plate (Z=0)
    // Run from front wall toward back, truncated by hip rafters
    {
      // Left side of front hip end (left of center, truncated by FL hip)
      // Jack at X position meets FL hip at Z = X (since hip is 45° in plan)
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const xPos = j * rafterSpacing_mm;  // Position along front wall from left corner
        
        if (xPos >= halfSpan_mm) break;  // Stop at ridge centerline
        
        // Hip is at Z = xPos at this X position
        const jackRunZ = xPos;  // Length of horizontal run (to hip)
        const heightAtHip = jackRunZ * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunZ * jackRunZ + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        // Jack lands on front wall at (xPos, 0, 0), rises to hip at (xPos, heightAtHip, xPos)
        const cx_mm = xPos;
        const cy_mm = heightAtHip / 2;
        const cz_mm = jackRunZ / 2;  // Centered along Z run from wall
        
        const jackAngle = Math.atan2(heightAtHip, jackRunZ);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-FL-${j}`,
          memberW_mm,  // width along X
          memberD_mm,
          jackLen_mm,  // length along Z (slope)
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", end: "front", side: "L" }
        );
        jack.rotation = new BABYLON.Vector3(-jackAngle, 0, 0);
        
        console.log(`[JACK_RAFTERS] FL-${j}: xPos=${xPos}mm, jackLen=${jackLen_mm}mm at (${cx_mm}, ${cy_mm}, ${cz_mm})`);
      }
      
      // Right side of front hip end (right of center, truncated by FR hip)
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const xPos = A_mm - j * rafterSpacing_mm;  // Position from right corner
        
        if (xPos <= halfSpan_mm) break;  // Stop at ridge centerline
        
        // Hip is at Z = (A_mm - xPos) at this X position
        const distFromRightCorner = A_mm - xPos;
        const jackRunZ = distFromRightCorner;
        const heightAtHip = jackRunZ * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunZ * jackRunZ + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        const cx_mm = xPos;
        const cy_mm = heightAtHip / 2;
        const cz_mm = jackRunZ / 2;
        
        const jackAngle = Math.atan2(heightAtHip, jackRunZ);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-FR-${j}`,
          memberW_mm,
          memberD_mm,
          jackLen_mm,
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", end: "front", side: "R" }
        );
        jack.rotation = new BABYLON.Vector3(-jackAngle, 0, 0);
        
        console.log(`[JACK_RAFTERS] FR-${j}: xPos=${xPos}mm, jackLen=${jackLen_mm}mm`);
      }
    }
    
    // BACK HIP END - jack rafters landing on BACK wall plate (Z=B)
    {
      // Left side of back hip end (truncated by BL hip)
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const xPos = j * rafterSpacing_mm;
        
        if (xPos >= halfSpan_mm) break;
        
        const jackRunZ = xPos;
        const heightAtHip = jackRunZ * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunZ * jackRunZ + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        // Jack lands on back wall at (xPos, 0, B), rises toward ridge
        const cx_mm = xPos;
        const cy_mm = heightAtHip / 2;
        const cz_mm = B_mm - jackRunZ / 2;  // Centered from back wall
        
        const jackAngle = Math.atan2(heightAtHip, jackRunZ);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-BL-${j}`,
          memberW_mm,
          memberD_mm,
          jackLen_mm,
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", end: "back", side: "L" }
        );
        jack.rotation = new BABYLON.Vector3(jackAngle, 0, 0);
      }
      
      // Right side of back hip end (truncated by BR hip)
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const xPos = A_mm - j * rafterSpacing_mm;
        
        if (xPos <= halfSpan_mm) break;
        
        const distFromRightCorner = A_mm - xPos;
        const jackRunZ = distFromRightCorner;
        const heightAtHip = jackRunZ * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunZ * jackRunZ + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        const cx_mm = xPos;
        const cy_mm = heightAtHip / 2;
        const cz_mm = B_mm - jackRunZ / 2;
        
        const jackAngle = Math.atan2(heightAtHip, jackRunZ);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-BR-${j}`,
          memberW_mm,
          memberD_mm,
          jackLen_mm,
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", end: "back", side: "R" }
        );
        jack.rotation = new BABYLON.Vector3(jackAngle, 0, 0);
      }
    }
    
    // === PAIRED SIDE SLOPE JACKS ===
    // These land on LEFT/RIGHT wall plates and pair with the front/back jacks at the hip
    
    // LEFT slope - jacks landing on LEFT wall (X=0), pairing with FL/BL jacks
    {
      // Front portion - pairs with FL jacks
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const zPos = j * rafterSpacing_mm;  // Position along left wall from front corner
        
        if (zPos >= ridgeStartZ_mm) break;  // Stop at ridge start
        
        // Hip at this Z position is at X = zPos (45° angle)
        const jackRunX = zPos;  // Run from left wall to hip
        const heightAtHip = jackRunX * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunX * jackRunX + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        // Jack lands on left wall at (0, 0, zPos), rises to hip
        const cx_mm = jackRunX / 2;
        const cy_mm = heightAtHip / 2;
        const cz_mm = zPos;
        
        const jackAngle = Math.atan2(heightAtHip, jackRunX);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-LS-F-${j}`,
          jackLen_mm,  // length along X
          memberD_mm,
          memberW_mm,  // width along Z
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", slope: "left", end: "front" }
        );
        jack.rotation = new BABYLON.Vector3(0, 0, jackAngle);
      }
      
      // Back portion - pairs with BL jacks
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const zPos = B_mm - j * rafterSpacing_mm;
        
        if (zPos <= ridgeEndZ_mm) break;
        
        const distFromBackCorner = B_mm - zPos;
        const jackRunX = distFromBackCorner;
        const heightAtHip = jackRunX * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunX * jackRunX + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        const cx_mm = jackRunX / 2;
        const cy_mm = heightAtHip / 2;
        const cz_mm = zPos;
        
        const jackAngle = Math.atan2(heightAtHip, jackRunX);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-LS-B-${j}`,
          jackLen_mm,
          memberD_mm,
          memberW_mm,
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", slope: "left", end: "back" }
        );
        jack.rotation = new BABYLON.Vector3(0, 0, jackAngle);
      }
    }
    
    // RIGHT slope - jacks landing on RIGHT wall (X=A), pairing with FR/BR jacks
    {
      // Front portion - pairs with FR jacks
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const zPos = j * rafterSpacing_mm;
        
        if (zPos >= ridgeStartZ_mm) break;
        
        const jackRunX = zPos;  // Run from right wall to hip (toward center)
        const heightAtHip = jackRunX * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunX * jackRunX + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        // Jack lands on right wall at (A, 0, zPos), rises toward hip at (A-zPos, height, zPos)
        const cx_mm = A_mm - jackRunX / 2;
        const cy_mm = heightAtHip / 2;
        const cz_mm = zPos;
        
        const jackAngle = Math.atan2(heightAtHip, jackRunX);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-RS-F-${j}`,
          jackLen_mm,
          memberD_mm,
          memberW_mm,
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", slope: "right", end: "front" }
        );
        jack.rotation = new BABYLON.Vector3(0, 0, -jackAngle);  // Negative for right side
      }
      
      // Back portion - pairs with BR jacks
      for (let j = 1; j <= Math.floor(halfSpan_mm / rafterSpacing_mm); j++) {
        const zPos = B_mm - j * rafterSpacing_mm;
        
        if (zPos <= ridgeEndZ_mm) break;
        
        const distFromBackCorner = B_mm - zPos;
        const jackRunX = distFromBackCorner;
        const heightAtHip = jackRunX * (rise_mm / halfSpan_mm);
        const jackLen_mm = Math.sqrt(jackRunX * jackRunX + heightAtHip * heightAtHip);
        
        if (jackLen_mm < memberW_mm * 2) continue;
        
        const cx_mm = A_mm - jackRunX / 2;
        const cy_mm = heightAtHip / 2;
        const cz_mm = zPos;
        
        const jackAngle = Math.atan2(heightAtHip, jackRunX);
        
        const jack = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-jack-RS-B-${j}`,
          jackLen_mm,
          memberD_mm,
          memberW_mm,
          cx_mm,
          cy_mm,
          cz_mm,
          roofRoot,
          joistMat,
          { roof: "hipped", part: "jack-rafter", slope: "right", end: "back" }
        );
        jack.rotation = new BABYLON.Vector3(0, 0, -jackAngle);
      }
    }
  }

  // === OSB SHEATHING - Proper Hipped Roof Geometry ===
  // 2 Rectangles (saddle sections) + 8 Triangles (hip end panels)
  if (roofParts.osb) {
    const osbThk = 18;
    
    const sinT = Math.sin(commonSlopeAng);
    const cosT = Math.cos(commonSlopeAng);
    const hipSinT = Math.sin(hipSlopeAng);
    const hipCosT = Math.cos(hipSlopeAng);
    
    // OSB sits on top of rafters (at rafter top surface)
    const osbOffset_mm = memberD_mm;
    
    // ============================================
    // RECTANGLES: 2 saddle sections (main slopes)
    // ============================================
    // These span from front hip to back hip along the ridge.
    // Split around skylight openings if any.
    if (ridgeLen_mm > 0) {
      // Get skylight openings for each slope
      let skyOpeningsL = [], skyOpeningsR = [];
      try { skyOpeningsL = getSkylightOpenings(state, "L") || []; } catch(e) { /* safe */ }
      try { skyOpeningsR = getSkylightOpenings(state, "R") || []; } catch(e) { /* safe */ }

      // Helper: create a saddle OSB piece from slope-local sub-rect.
      // a = distance from ridge down slope (0 at ridge), b = along ridge from front (0 at ridgeStartZ)
      function createSaddleOsbPiece(side, idx, a0, b0, aLen, bLen) {
        const slopeLen_mm = commonRafterLen_mm;
        const rotZ = (side === "L") ? commonSlopeAng : -commonSlopeAng;
        const normalX = (side === "L") ? -sinT : sinT;
        const normalY = cosT;

        // Center of this sub-piece on the slope
        const aMid = a0 + aLen / 2;
        const bMid = b0 + bLen / 2;
        const runMid_mm = aMid * cosT;
        const dropMid_mm = aMid * sinT;
        const ySurf_mm = osbOffset_mm + (rise_mm - dropMid_mm);
        const xSurf_mm = (side === "L")
          ? (halfSpan_mm - runMid_mm)
          : (halfSpan_mm + runMid_mm);
        const cx = xSurf_mm + normalX * (osbThk / 2);
        const cy = ySurf_mm + normalY * (osbThk / 2);
        const cz = ridgeStartZ_mm + bMid;

        const mesh = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-osb-saddle-${side}-${idx}`,
          aLen,
          osbThk,
          bLen,
          cx,
          cy,
          cz,
          roofRoot,
          osbMat,
          { roof: "hipped", part: "osb", type: "saddle", side: side }
        );
        mesh.rotation = new BABYLON.Vector3(0, 0, rotZ);
        if (mesh.enableEdgesRendering) {
          mesh.enableEdgesRendering();
          mesh.edgesWidth = 2;
          mesh.edgesColor = new BABYLON.Color4(0.3, 0.2, 0.1, 1);
        }
      }

      // Full saddle rect in slope-local coords
      const fullRect = { a0_mm: 0, b0_mm: 0, aLen_mm: commonRafterLen_mm, bLen_mm: ridgeLen_mm };

      // Left saddle
      if (skyOpeningsL.length > 0) {
        const pieces = splitRectAroundHoles(fullRect, skyOpeningsL);
        for (let pi = 0; pi < pieces.length; pi++) {
          createSaddleOsbPiece("L", pi, pieces[pi].a0_mm, pieces[pi].b0_mm, pieces[pi].aLen_mm, pieces[pi].bLen_mm);
        }
      } else {
        createSaddleOsbPiece("L", 0, 0, 0, commonRafterLen_mm, ridgeLen_mm);
      }

      // Right saddle
      if (skyOpeningsR.length > 0) {
        const pieces = splitRectAroundHoles(fullRect, skyOpeningsR);
        for (let pi = 0; pi < pieces.length; pi++) {
          createSaddleOsbPiece("R", pi, pieces[pi].a0_mm, pieces[pi].b0_mm, pieces[pi].aLen_mm, pieces[pi].bLen_mm);
        }
      } else {
        createSaddleOsbPiece("R", 0, 0, 0, commonRafterLen_mm, ridgeLen_mm);
      }
    }
    
    // ============================================
    // TRIANGLES: 8 hip end panels (4 per hip end)
    // ============================================
    // Each hip end has 4 triangles:
    // - 2 on the main slope sides (meeting the saddle rectangles)
    // - Each split by the hip rafter into left/right
    
    // Helper to create a triangular OSB panel
    function createTriangleOSB(name, p1, p2, p3, normal, metadata) {
      // p1, p2, p3 are Vector3 positions in mm
      // Create a triangle mesh using vertex data
      
      const positions = [
        p1.x / 1000, p1.y / 1000, p1.z / 1000,
        p2.x / 1000, p2.y / 1000, p2.z / 1000,
        p3.x / 1000, p3.y / 1000, p3.z / 1000
      ];
      
      // Two triangles (front and back faces)
      const indices = [0, 1, 2, 2, 1, 0];
      
      // Normals for both faces
      const normals = [
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z
      ];
      
      const vertexData = new BABYLON.VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      
      const mesh = new BABYLON.Mesh(name, scene);
      vertexData.applyToMesh(mesh);
      mesh.material = osbMat;
      mesh.metadata = Object.assign({ dynamic: true, sectionId: sectionId || null }, metadata || {});
      if (roofRoot) mesh.parent = roofRoot;
      
      if (mesh.enableEdgesRendering) {
        mesh.enableEdgesRendering();
        mesh.edgesWidth = 2;
        mesh.edgesColor = new BABYLON.Color4(0.3, 0.2, 0.1, 1);
      }
      
      return mesh;
    }
    
    // Calculate key points for hip triangles
    // Front hip end (at Z = 0 to ridgeStartZ_mm)
    // Back hip end (at Z = ridgeEndZ_mm to B_mm)
    
    // Base Y for OSB - should sit ON TOP of rafters at eaves level
    // Using just memberD_mm to sit right on the rafters (not offset above)
    const osbY = memberD_mm;
    
    // FRONT HIP END - 4 triangles
    {
      // Ridge end point (where front hip meets ridge)
      const ridgeFrontX = halfSpan_mm;
      const ridgeFrontY = osbOffset_mm + rise_mm + osbThk / 2;
      const ridgeFrontZ = ridgeStartZ_mm;
      
      // Eaves corners
      const eavesFL_X = 0;
      const eavesFL_Y = osbY;
      const eavesFL_Z = 0;
      
      const eavesFR_X = A_mm;
      const eavesFR_Y = osbY;
      const eavesFR_Z = 0;
      
      // Mid-point of front eaves (where hip rafter meets eaves)
      const eavesFMid_X = halfSpan_mm;
      const eavesFMid_Y = osbY;
      const eavesFMid_Z = 0;
      
      // Left saddle junction (where left saddle meets front hip)
      const saddleFLjunc_X = 0;
      const saddleFLjunc_Y = osbY;
      const saddleFLjunc_Z = ridgeStartZ_mm;
      
      // Right saddle junction
      const saddleFRjunc_X = A_mm;
      const saddleFRjunc_Y = osbY;
      const saddleFRjunc_Z = ridgeStartZ_mm;
      
      // Triangle FL-1: Left side of front hip (main slope side)
      // From: ridge front -> left saddle junction -> left eaves corner
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-FL1`,
        new BABYLON.Vector3(ridgeFrontX, ridgeFrontY, ridgeFrontZ),
        new BABYLON.Vector3(saddleFLjunc_X, saddleFLjunc_Y, saddleFLjunc_Z),
        new BABYLON.Vector3(eavesFL_X, eavesFL_Y, eavesFL_Z),
        new BABYLON.Vector3(-0.5, 0.5, -0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "FL1" }
      );
      
      // Triangle FL-2: Left side of front hip (hip slope side)
      // From: ridge front -> left eaves corner -> front mid eaves
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-FL2`,
        new BABYLON.Vector3(ridgeFrontX, ridgeFrontY, ridgeFrontZ),
        new BABYLON.Vector3(eavesFL_X, eavesFL_Y, eavesFL_Z),
        new BABYLON.Vector3(eavesFMid_X, eavesFMid_Y, eavesFMid_Z),
        new BABYLON.Vector3(0, 0.5, -0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "FL2" }
      );
      
      // Triangle FR-1: Right side of front hip (main slope side)
      // From: ridge front -> right eaves corner -> right saddle junction
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-FR1`,
        new BABYLON.Vector3(ridgeFrontX, ridgeFrontY, ridgeFrontZ),
        new BABYLON.Vector3(eavesFR_X, eavesFR_Y, eavesFR_Z),
        new BABYLON.Vector3(saddleFRjunc_X, saddleFRjunc_Y, saddleFRjunc_Z),
        new BABYLON.Vector3(0.5, 0.5, -0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "FR1" }
      );
      
      // Triangle FR-2: Right side of front hip (hip slope side)
      // From: ridge front -> front mid eaves -> right eaves corner
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-FR2`,
        new BABYLON.Vector3(ridgeFrontX, ridgeFrontY, ridgeFrontZ),
        new BABYLON.Vector3(eavesFMid_X, eavesFMid_Y, eavesFMid_Z),
        new BABYLON.Vector3(eavesFR_X, eavesFR_Y, eavesFR_Z),
        new BABYLON.Vector3(0, 0.5, -0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "FR2" }
      );
    }
    
    // BACK HIP END - 4 triangles (mirror of front)
    {
      // Ridge end point (where back hip meets ridge)
      const ridgeBackX = halfSpan_mm;
      const ridgeBackY = osbOffset_mm + rise_mm + osbThk / 2;
      const ridgeBackZ = ridgeEndZ_mm;
      
      // Eaves corners
      const eavesBL_X = 0;
      const eavesBL_Y = osbY;
      const eavesBL_Z = B_mm;
      
      const eavesBR_X = A_mm;
      const eavesBR_Y = osbY;
      const eavesBR_Z = B_mm;
      
      // Mid-point of back eaves
      const eavesBMid_X = halfSpan_mm;
      const eavesBMid_Y = osbY;
      const eavesBMid_Z = B_mm;
      
      // Left saddle junction
      const saddleBLjunc_X = 0;
      const saddleBLjunc_Y = osbY;
      const saddleBLjunc_Z = ridgeEndZ_mm;
      
      // Right saddle junction
      const saddleBRjunc_X = A_mm;
      const saddleBRjunc_Y = osbY;
      const saddleBRjunc_Z = ridgeEndZ_mm;
      
      // Triangle BL-1: Left side of back hip (main slope side)
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-BL1`,
        new BABYLON.Vector3(ridgeBackX, ridgeBackY, ridgeBackZ),
        new BABYLON.Vector3(eavesBL_X, eavesBL_Y, eavesBL_Z),
        new BABYLON.Vector3(saddleBLjunc_X, saddleBLjunc_Y, saddleBLjunc_Z),
        new BABYLON.Vector3(-0.5, 0.5, 0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "BL1" }
      );
      
      // Triangle BL-2: Left side of back hip (hip slope side)
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-BL2`,
        new BABYLON.Vector3(ridgeBackX, ridgeBackY, ridgeBackZ),
        new BABYLON.Vector3(eavesBMid_X, eavesBMid_Y, eavesBMid_Z),
        new BABYLON.Vector3(eavesBL_X, eavesBL_Y, eavesBL_Z),
        new BABYLON.Vector3(0, 0.5, 0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "BL2" }
      );
      
      // Triangle BR-1: Right side of back hip (main slope side)
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-BR1`,
        new BABYLON.Vector3(ridgeBackX, ridgeBackY, ridgeBackZ),
        new BABYLON.Vector3(saddleBRjunc_X, saddleBRjunc_Y, saddleBRjunc_Z),
        new BABYLON.Vector3(eavesBR_X, eavesBR_Y, eavesBR_Z),
        new BABYLON.Vector3(0.5, 0.5, 0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "BR1" }
      );
      
      // Triangle BR-2: Right side of back hip (hip slope side)
      createTriangleOSB(
        `${meshPrefix}roof-hipped-osb-tri-BR2`,
        new BABYLON.Vector3(ridgeBackX, ridgeBackY, ridgeBackZ),
        new BABYLON.Vector3(eavesBR_X, eavesBR_Y, eavesBR_Z),
        new BABYLON.Vector3(eavesBMid_X, eavesBMid_Y, eavesBMid_Z),
        new BABYLON.Vector3(0, 0.5, 0.5).normalize(),
        { roof: "hipped", part: "osb", type: "triangle", id: "BR2" }
      );
    }
  }
  // === COVERING (FELT) ===
  if (roofParts.covering) {
    const coveringThk = 2;
    const sinT_cov = Math.sin(commonSlopeAng);
    const cosT_cov = Math.cos(commonSlopeAng);
    const osbOutOffset_mm = memberD_mm + 1 + 18; // On top of OSB
    
    // Main covering panels — split around skylight openings
    if (ridgeLen_mm > 0) {
      const RIDGE_OVERLAP_MM = 20;
      const coveringLen_mm = commonRafterLen_mm + RIDGE_OVERLAP_MM;
      const coveringWidth_mm = ridgeLen_mm;

      // Get skylight openings for each slope
      let skyOpeningsL_cov = [], skyOpeningsR_cov = [];
      try { skyOpeningsL_cov = getSkylightOpenings(state, "L") || []; } catch(e) { /* safe */ }
      try { skyOpeningsR_cov = getSkylightOpenings(state, "R") || []; } catch(e) { /* safe */ }

      // Helper: create a covering piece from slope-local sub-rect
      function createHippedCoveringPiece(side, idx, a0, b0, aLen, bLen) {
        const rotZ = (side === "L") ? commonSlopeAng : -commonSlopeAng;
        const normalX = (side === "L") ? -sinT_cov : sinT_cov;
        const normalY = cosT_cov;

        const aMid = a0 + aLen / 2;
        const bMid = b0 + bLen / 2;
        const runMid_mm = Math.round(aMid * cosT_cov);
        const dropMid_mm = Math.round(aMid * sinT_cov);
        const ySurfMid_mm = memberD_mm + (rise_mm - dropMid_mm);
        const xSurfMid_mm = (side === "L")
          ? (halfSpan_mm - runMid_mm)
          : (halfSpan_mm + runMid_mm);
        const cx = xSurfMid_mm + normalX * (osbOutOffset_mm + coveringThk / 2);
        const cy = ySurfMid_mm + normalY * (osbOutOffset_mm + coveringThk / 2);
        const cz = ridgeStartZ_mm + bMid;

        const mesh = mkBoxCenteredLocal(
          `${meshPrefix}roof-hipped-covering-${side}-${idx}`,
          aLen,
          coveringThk,
          bLen,
          cx,
          cy,
          cz,
          roofRoot,
          coveringMat,
          { roof: "hipped", part: "covering", side: side }
        );
        mesh.rotation = new BABYLON.Vector3(0, 0, rotZ);
      }

      // Full covering rect: a starts at -RIDGE_OVERLAP (past ridge), b = full ridge width
      const fullCovRect = { a0_mm: -RIDGE_OVERLAP_MM, b0_mm: 0, aLen_mm: coveringLen_mm, bLen_mm: coveringWidth_mm };

      // Left covering
      if (skyOpeningsL_cov.length > 0) {
        const pieces = splitRectAroundHoles(fullCovRect, skyOpeningsL_cov);
        for (let pi = 0; pi < pieces.length; pi++) {
          createHippedCoveringPiece("L", pi, pieces[pi].a0_mm, pieces[pi].b0_mm, pieces[pi].aLen_mm, pieces[pi].bLen_mm);
        }
      } else {
        createHippedCoveringPiece("L", 0, -RIDGE_OVERLAP_MM, 0, coveringLen_mm, coveringWidth_mm);
      }

      // Right covering
      if (skyOpeningsR_cov.length > 0) {
        const pieces = splitRectAroundHoles(fullCovRect, skyOpeningsR_cov);
        for (let pi = 0; pi < pieces.length; pi++) {
          createHippedCoveringPiece("R", pi, pieces[pi].a0_mm, pieces[pi].b0_mm, pieces[pi].aLen_mm, pieces[pi].bLen_mm);
        }
      } else {
        createHippedCoveringPiece("R", 0, -RIDGE_OVERLAP_MM, 0, coveringLen_mm, coveringWidth_mm);
      }
    }
  }

  // === FASCIA BOARDS ===
  if (roofParts.covering) {
    const fasciaThk = 20;
    const fasciaDepth = 135;
    const fasciaMat = scene._fasciaMat || joistMat;
    
    // Eaves fascia runs around the entire perimeter at eaves level
    const osbTop_mm = memberD_mm + 18 + 1;
    const fasciaTopY_mm = osbTop_mm;
    const fasciaCenterY_mm = fasciaTopY_mm - fasciaDepth / 2;
    
    // Front fascia
    mkBoxCenteredLocal(
      `${meshPrefix}roof-hipped-fascia-front`,
      A_mm,
      fasciaDepth,
      fasciaThk,
      halfSpan_mm,
      fasciaCenterY_mm,
      -fasciaThk / 2,
      roofRoot,
      fasciaMat,
      { roof: "hipped", part: "fascia", edge: "front" }
    );
    
    // Back fascia
    mkBoxCenteredLocal(
      `${meshPrefix}roof-hipped-fascia-back`,
      A_mm,
      fasciaDepth,
      fasciaThk,
      halfSpan_mm,
      fasciaCenterY_mm,
      B_mm + fasciaThk / 2,
      roofRoot,
      fasciaMat,
      { roof: "hipped", part: "fascia", edge: "back" }
    );
    
    // Left fascia
    mkBoxCenteredLocal(
      `${meshPrefix}roof-hipped-fascia-left`,
      fasciaThk,
      fasciaDepth,
      B_mm,
      -fasciaThk / 2,
      fasciaCenterY_mm,
      B_mm / 2,
      roofRoot,
      fasciaMat,
      { roof: "hipped", part: "fascia", edge: "left" }
    );
    
    // Right fascia
    mkBoxCenteredLocal(
      `${meshPrefix}roof-hipped-fascia-right`,
      fasciaThk,
      fasciaDepth,
      B_mm,
      A_mm + fasciaThk / 2,
      fasciaCenterY_mm,
      B_mm / 2,
      roofRoot,
      fasciaMat,
      { roof: "hipped", part: "fascia", edge: "right" }
    );
  }

  // === FINAL POSITIONING ===
  // Align roof to wall plate level
  const targetMinX_m = (-l_mm) / 1000;
  const targetMinZ_m = (-f_mm) / 1000;
  
  roofRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
  
  // Position based on overhang
  roofRoot.position.x = targetMinX_m;
  roofRoot.position.z = targetMinZ_m;
  
  // Height positioning
  // shiftRoofMeshes() in index.js adds WALL_RISE_MM (168mm) to all roof mesh positions.
  // Wall plates are at frame height = eavesH_mm - WALL_RISE_MM (in local coords).
  // Rafter geometry has y=0 at eaves level. After shift, meshes at local y=0 
  // end up at world y = roofRoot.y + 0 + shift = roofRoot.y + WALL_RISE_MM.
  // For rafters to sit on wall plates: roofRoot.y + WALL_RISE_MM = eavesH_mm
  // Therefore: roofRoot.y = eavesH_mm - WALL_RISE_MM
  const WALL_RISE_MM = 168;
  roofRoot.position.y = (eavesH_mm - WALL_RISE_MM) / 1000;

  console.log(`[HIPPED_ROOF] Built hipped roof: ${A_mm}mm x ${B_mm}mm`);
  console.log(`[HIPPED_ROOF] eavesH_mm=${eavesH_mm}, crestH_mm=${crestH_mm}, rise_mm=${rise_mm}`);
  console.log(`[HIPPED_ROOF] roofRoot.position.y=${roofRoot.position.y}m (world)`);
  console.log(`[HIPPED_ROOF] memberW_mm=${memberW_mm}, memberD_mm=${memberD_mm}`);
}

/**
 * Updates the Bill of Materials (BOM) for hipped roof components.
 * @param {Object} state - Building state object
 * @param {HTMLTableSectionElement} tbody - Target table body element
 * @private
 */
function updateBOM_Hipped(state, tbody) {
  const dims = resolveDims(state);

  const roofW_mm = Math.max(1, Math.floor(Number(dims?.roof?.w_mm ?? state?.w ?? 1)));
  const roofD_mm = Math.max(1, Math.floor(Number(dims?.roof?.d_mm ?? state?.d ?? 1)));

  const A_mm = roofW_mm;
  const B_mm = roofD_mm;

  const g = getRoofFrameGauge(state);
  const memberW_mm = Math.max(1, Math.floor(Number(g.depth_mm)));
  const memberD_mm = Math.max(1, Math.floor(Number(g.thickness_mm)));

  const hipped = (state && state.roof && state.roof.hipped) ? state.roof.hipped : null;
  const apex = (state && state.roof && state.roof.apex) ? state.roof.apex : null;
  const eavesH_mm = Number(hipped?.heightToEaves_mm || apex?.heightToEaves_mm) || 1850;
  const crestH_mm = Number(hipped?.heightToCrest_mm || apex?.heightToCrest_mm) || 2400;
  const rise_mm = Math.max(100, crestH_mm - eavesH_mm);

  const halfSpan_mm = A_mm / 2;
  const commonRafterLen_mm = Math.round(Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm));
  
  const hipPlanLen_mm = halfSpan_mm * Math.SQRT2;
  const hipRafterLen_mm = Math.round(Math.sqrt(hipPlanLen_mm * hipPlanLen_mm + rise_mm * rise_mm));

  const ridgeLen_mm = Math.max(0, B_mm - A_mm);
  const rafterSpacing_mm = 600;

  const rows = [];

  // Ridge beam
  if (ridgeLen_mm > 0) {
    rows.push({
      item: "Ridge Beam",
      qty: 1,
      L: ridgeLen_mm,
      W: memberW_mm,
      notes: "D (mm): " + String(memberD_mm) + "; hipped roof",
    });
  }

  // Hip rafters (4)
  rows.push({
    item: "Hip Rafter",
    qty: 4,
    L: hipRafterLen_mm,
    W: memberW_mm,
    notes: "D (mm): " + String(memberD_mm) + "; diagonal corners",
  });

  // Common rafters (in middle section)
  if (ridgeLen_mm > 0) {
    const commonCount = Math.floor((ridgeLen_mm - memberW_mm * 2) / rafterSpacing_mm) * 2;
    if (commonCount > 0) {
      rows.push({
        item: "Common Rafter",
        qty: commonCount,
        L: commonRafterLen_mm,
        W: memberW_mm,
        notes: "D (mm): " + String(memberD_mm) + "; @600mm spacing",
      });
    }
  }

  // Jack rafters (estimate based on hip end size)
  const hipEndDepth = halfSpan_mm;
  const jackCountPerEnd = Math.max(0, Math.floor(hipEndDepth / rafterSpacing_mm) - 1);
  const totalJacks = jackCountPerEnd * 4; // 4 sides of 2 hip ends
  
  if (totalJacks > 0) {
    // Average jack length (varies, so use midpoint)
    const avgJackLen = Math.round(commonRafterLen_mm * 0.6);
    rows.push({
      item: "Jack Rafter (avg)",
      qty: totalJacks,
      L: avgJackLen,
      W: memberW_mm,
      notes: "D (mm): " + String(memberD_mm) + "; varying lengths; hipped ends",
    });
  }

  rows.sort((a, b) => String(a.item).localeCompare(String(b.item)));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    appendRow5(tbody, [r.item, String(r.qty), String(r.L), String(r.W), r.notes || ""]);
  }

  // Total frame timber
  const FRAME_STOCK_LENGTH = 6200;
  let totalFrameLength_mm = 0;
  totalFrameLength_mm += ridgeLen_mm; // Ridge
  totalFrameLength_mm += 4 * hipRafterLen_mm; // Hip rafters
  
  if (ridgeLen_mm > 0) {
    const commonCount = Math.floor((ridgeLen_mm - memberW_mm * 2) / rafterSpacing_mm) * 2;
    totalFrameLength_mm += commonCount * commonRafterLen_mm;
  }
  
  const avgJackLen = Math.round(commonRafterLen_mm * 0.6);
  totalFrameLength_mm += totalJacks * avgJackLen;

  const totalFrameStockPieces = Math.ceil(totalFrameLength_mm / FRAME_STOCK_LENGTH);
  appendRow5(tbody, [
    "TOTAL FRAME",
    String(totalFrameStockPieces),
    String(FRAME_STOCK_LENGTH),
    "",
    `Total: ${Math.round(totalFrameLength_mm / 1000 * 10) / 10}m linear; ${totalFrameStockPieces} × ${FRAME_STOCK_LENGTH}mm lengths`
  ]);

  if (!rows.length) appendPlaceholderRow(tbody, "Roof cutting list not yet generated.");
}

/* ------------------------------ Shared helpers ------------------------------ */

/**
 * Gets the timber cross-section dimensions for roof framing.
 * Falls back to CONFIG defaults if not specified in state.
 * 
 * @param {Object} state - Building state object
 * @returns {Object} {thickness_mm, depth_mm} - Timber section dimensions
 * @private
 */
function getRoofFrameGauge(state) {
  var cfgW = Math.floor(Number(CONFIG && CONFIG.timber ? CONFIG.timber.w : 50));
  var cfgD = Math.floor(Number(CONFIG && CONFIG.timber ? CONFIG.timber.d : 100));

  var t = null;
  var d = null;

  try {
    t = (state && state.frame && state.frame.thickness_mm != null) ? Math.floor(Number(state.frame.thickness_mm)) : null;
  } catch (e0) { t = null; }

  try {
    d = (state && state.frame && state.frame.depth_mm != null) ? Math.floor(Number(state.frame.depth_mm)) : null;
  } catch (e1) { d = null; }

  var thickness_mm = (Number.isFinite(t) && t > 0) ? t : ((Number.isFinite(cfgW) && cfgW > 0) ? cfgW : 50);
  var depth_mm = (Number.isFinite(d) && d > 0) ? d : ((Number.isFinite(cfgD) && cfgD > 0) ? cfgD : 100);

  return { thickness_mm: thickness_mm, depth_mm: depth_mm };
}

/**
 * Gets visibility flags for roof components from state.
 * Used to selectively show/hide structure, OSB, and covering.
 * 
 * @param {Object} state - Building state object
 * @returns {Object} {structure, osb, covering} - Boolean visibility flags
 * @private
 */
function getRoofParts(state) {
  var vis = state && state.vis ? state.vis : null;
  var rp = vis && vis.roofParts && typeof vis.roofParts === "object" ? vis.roofParts : null;
  var isInsulated = state && state.walls && state.walls.variant === "insulated";
  return {
    structure: rp ? (rp.structure !== false) : true,
    osb: rp ? (rp.osb !== false) : true,
    covering: rp ? (rp.covering !== false) : true,
    insulation: (rp ? (rp.insulation !== false) : true) && isInsulated,
    ply: (rp ? (rp.ply !== false) : true) && isInsulated
  };
}

/**
 * Appends a row with 5 columns to a table body element.
 * @param {HTMLTableSectionElement} tbody - Target table body
 * @param {Array<string>} cols - Array of 5 cell values
 * @private
 */
function appendRow5(tbody, cols) {
  const tr = document.createElement("tr");
  for (let i = 0; i < cols.length; i++) {
    const td = document.createElement("td");
    td.textContent = cols[i] == null ? "" : String(cols[i]);
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

/**
 * Appends a placeholder row spanning all 5 columns.
 * @param {HTMLTableSectionElement} tbody - Target table body
 * @param {string} msg - Message to display
 * @private
 */
function appendPlaceholderRow(tbody, msg) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 5;
  td.textContent = String(msg || "");
  tr.appendChild(td);
  tbody.appendChild(tr);
}

/**
 * Groups BOM pieces by Length×Width and notes, counting quantities.
 * @param {Array<Object>} pieces - Array of {L, W, notes} objects
 * @returns {Object} Keyed by "LxW|notes" with {qty, L, W, notes}
 * @private
 */
function groupByLWN(pieces) {
  const out = {};
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const L = Math.max(1, Math.floor(Number(p.L || 0)));
    const W = Math.max(1, Math.floor(Number(p.W || 0)));
    const notes = String(p.notes || "");
    const key = String(L) + "x" + String(W) + "|" + notes;
    if (!out[key]) out[key] = { qty: 0, L: L, W: W, notes: notes };
    out[key].qty += 1;
  }
  return out;
}

/**
 * Clamps a number between min and max values.
 * @param {number} n - Value to clamp
 * @param {number} a - Minimum value
 * @param {number} b - Maximum value
 * @returns {number} Clamped value
 * @private
 */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/* ------------------------------ APEX: cladding trim (CSG) ------------------------------ */

/**
 * Installs CSG-based cladding trim for apex roofs.
 * Creates an invisible cutter mesh and sets up an observer to trim
 * wall cladding meshes that intersect with the roof underside.
 * 
 * This ensures wall cladding stops at the roof line rather than
 * poking through the roof surface.
 * 
 * @param {BABYLON.Scene} scene - The Babylon.js scene
 * @param {BABYLON.TransformNode} roofRoot - The roof root transform node
 * @param {Object} params - Roof geometry parameters
 * @param {number} params.A_mm - Roof span (width) in mm
 * @param {number} params.B_mm - Roof run (depth) in mm
 * @param {number} params.rise_mm - Roof rise (height) in mm
 * @param {number} params.memberD_mm - Rafter depth in mm
 * @private
 */
function installApexCladdingTrim(scene, roofRoot, params) {
  if (!scene || !roofRoot || !params) return;
  if (typeof BABYLON === "undefined" || !BABYLON.CSG) return;

  const A_mm = Math.max(1, Math.floor(Number(params.A_mm || 1)));
  const B_mm = Math.max(1, Math.floor(Number(params.B_mm || 1)));
  const rise_mm = Math.max(0, Math.floor(Number(params.rise_mm || 0)));
  const memberD_mm = Math.max(1, Math.floor(Number(params.memberD_mm || 1)));

  const halfSpan_mm = Math.max(1, Math.floor(A_mm / 2));
  const den = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const cosT = den > 1e-6 ? (halfSpan_mm / den) : 1;
  const tanT = halfSpan_mm > 1e-6 ? (rise_mm / halfSpan_mm) : 0;
  const slopeAng = Math.atan2(rise_mm, halfSpan_mm);
  const sinT = Math.sin(slopeAng);

  // IMPORTANT: match buildApex() OSB underside reference used in placement logic.
  // OSB underside plane is offset from the tie-top roof plane along the roof normal.
  const OSB_CLEAR_MM = 1;
  const dNormal_mm = memberD_mm + OSB_CLEAR_MM;
  const offsetAlongY_atFixedX_mm = dNormal_mm / Math.max(1e-6, cosT);

  function yUnderLocal_mm(xLocal_mm) {
    const x = Math.max(0, Math.min(A_mm, Number(xLocal_mm)));
    if (x <= halfSpan_mm) return memberD_mm + tanT * x + offsetAlongY_atFixedX_mm;
    return memberD_mm + tanT * (A_mm - x) + offsetAlongY_atFixedX_mm;
  }

  function yUnderWorld_mm(xWorld_mm) {
    const xLocal_mm = (Number(xWorld_mm) / 1) - (roofRoot.position.x * 1000);
    return (roofRoot.position.y * 1000) + yUnderLocal_mm(xLocal_mm);
  }

  scene._apexRoofUnderside = {
    roof: "apex",
    A_mm,
    B_mm,
    rise_mm,
    memberD_mm,
    osbClear_mm: OSB_CLEAR_MM,
    yUnderAtXWorld_mm: yUnderWorld_mm
  };

  // Build one reusable cutter representing ALL space above the roof underside (union of both slopes).
  const cutter = buildApexUndersideCutter(scene, roofRoot, {
    A_mm,
    B_mm,
    slopeAng,
    sinT,
    cosT,
    yUnderLocal_mm
  });

  scene._apexCladdingTrimCutter = cutter;

  // Trim any existing cladding meshes now (in case walls were built before roof).
  const meshes = (scene.meshes || []).slice();
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    if (!m || m.isDisposed()) continue;
    if (!isLikelyWallCladdingMesh(m)) continue;
    if (m.metadata && m.metadata.trimmedToRoofApex === true) continue;
    trimMeshByApexCutter(scene, m, cutter);
  }

  // Order-independent: trim future cladding meshes as they are created.
    scene._apexCladdingTrimObserver = scene.onNewMeshAddedObservable.add((m) => {
    try {
      if (!m || m.isDisposed()) return;
      if (!isLikelyWallCladdingMesh(m)) return;
      console.log('[ROOF_OBSERVER] Detected cladding mesh:', m.name, 'trimmedToRoofApex=', m.metadata?.trimmedToRoofApex);
      if (m.metadata && m.metadata.trimmedToRoofApex === true) {
        console.log('[ROOF_OBSERVER] Skipping - already trimmed');
        return;
      }
      if (!scene._apexCladdingTrimCutter || scene._apexCladdingTrimCutter.isDisposed()) return;

      console.log('[ROOF_OBSERVER] Trimming mesh:', m.name);
      // Trim the mesh (this may replace internals / drop material)
      trimMeshByApexCutter(scene, m, scene._apexCladdingTrimCutter);

      // AFTER trim: re-apply cladding material if available (walls.js caches it on scene)
      try {
        if (scene._claddingMatLight && m && !m.isDisposed() && m.name && m.name.startsWith("clad-")) {
          m.material = scene._claddingMatLight;
        }
      } catch (e2) {}

    } catch (e) {}
  });

}

function isLikelyWallCladdingMesh(mesh) {
  try {
    const nm = String(mesh && mesh.name ? mesh.name : "");
    if (!nm) return false;
    if (nm.startsWith(`${meshPrefix}roof-`)) return false;
    const md = mesh.metadata && typeof mesh.metadata === "object" ? mesh.metadata : null;

    // Conservative defaults: adjust once you confirm the repo’s real cladding tags.
    const mdHit =
      !!(md && (md.part === "cladding" || md.kind === "cladding" || md.element === "cladding" || md.isCladding === true));
    const nameHit =
      nm.includes("cladding") || nm.includes("clad") || nm.includes("wall-cladding") || nm.startsWith("cladding-");

    if (!(mdHit || nameHit)) return false;

    // CSG needs real geometry (skip instances/empties).
    if (typeof mesh.getTotalVertices === "function" && mesh.getTotalVertices() <= 0) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function buildApexUndersideCutter(scene, roofRoot, p) {
  const A_mm = Math.max(1, Math.floor(Number(p.A_mm || 1)));
  const B_mm = Math.max(1, Math.floor(Number(p.B_mm || 1)));
  const slopeAng = Number(p.slopeAng || 0);
  const sinT = Number(p.sinT || 0);
  const cosT = Number(p.cosT || 1);
  const yUnderLocal_mm = typeof p.yUnderLocal_mm === "function" ? p.yUnderLocal_mm : (() => 0);

  // Oversize cutter so it fully covers any cladding extents (walls + gable triangles).
  const PAD_MM = 4000;
  const W_mm = A_mm + PAD_MM;
  const D_mm = B_mm + PAD_MM;
  const H_mm = Math.max(6000, Math.floor((yUnderLocal_mm(A_mm / 2) + 4000)));

  const mk = (name, rotZ, nx, ny, anchorX_mm) => {
    const box = BABYLON.MeshBuilder.CreateBox(
      name,
      { width: W_mm / 1000, height: H_mm / 1000, depth: D_mm / 1000 },
      scene
    );
    box.rotation = new BABYLON.Vector3(0, 0, rotZ);
    box.isVisible = false;
    box.setEnabled(false);
    box.metadata = { dynamic: true, roof: "apex", part: "cladding-cutter" };

    // Anchor point on underside plane at mid-ridge (z=B/2). Use eaves x for each slope.
    const yAnchor_mm = yUnderLocal_mm(anchorX_mm);
    const pLocal = new BABYLON.Vector3(anchorX_mm / 1000, yAnchor_mm / 1000, (B_mm / 2) / 1000);

    // Move box center so its "bottom" face sits on the plane and it extends outward (above plane).
    const n = new BABYLON.Vector3(nx, ny, 0); // unit normal
    const center = pLocal.add(n.scale((H_mm / 2) / 1000));

    box.position = new BABYLON.Vector3(
      roofRoot.position.x + center.x,
      roofRoot.position.y + center.y,
      roofRoot.position.z + center.z
    );

    return box;
  };

  // Left slope normal after +slopeAng rotation: (-sinT, +cosT)
  const left = mk(`${meshPrefix}roof-apex-cutter-L`, slopeAng, -sinT, cosT, 0);
  // Right slope normal after -slopeAng rotation: (+sinT, +cosT)
  const right = mk(`${meshPrefix}roof-apex-cutter-R`, -slopeAng, sinT, cosT, A_mm);

  const csg = BABYLON.CSG.FromMesh(left).union(BABYLON.CSG.FromMesh(right));
  const cutter = csg.toMesh(`${meshPrefix}roof-apex-cladding-cutter`, null, scene, true);
  cutter.isVisible = false;
  cutter.setEnabled(false);
  cutter.metadata = { dynamic: true, roof: "apex", part: "cladding-cutter" };

  try { left.dispose(false, false); } catch (e) {}
  try { right.dispose(false, false); } catch (e) {}

  return cutter;
}

function trimMeshByApexCutter(scene, mesh, cutter) {
  if (!scene || !mesh || !cutter) return;
  if (mesh.isDisposed() || cutter.isDisposed()) return;
  if (!BABYLON.CSG) return;

  // Save parent reference so we can re-parent the trimmed mesh afterward
  const originalParent = mesh.parent || null;

  let src = null;
  try {
    // Clone with parent=null so we get world-space geometry for CSG
    src = mesh.clone(mesh.name + "__trimSrc", null, false, true);
  } catch (e) {
    src = null;
  }
  if (!src) return;

  src.isVisible = false;
  src.setEnabled(false);
  src.parent = null; // Ensure clone is unparented for world-space CSG

  // Bake the mesh's world transform into vertices for accurate CSG
  try {
    // For parented meshes, we need to compute world matrix and bake it
    if (originalParent) {
      mesh.computeWorldMatrix(true);
      src.computeWorldMatrix(true);
    }
    src.bakeCurrentTransformIntoVertices();
    src.position = new BABYLON.Vector3(0, 0, 0);
    src.rotation = new BABYLON.Vector3(0, 0, 0);
    src.scaling = new BABYLON.Vector3(1, 1, 1);
    src.rotationQuaternion = null;
  } catch (e) {
    console.warn("[trimMeshByApexCutter] Failed to bake transforms:", e);
  }

  let out = null;
  try {
    const res = BABYLON.CSG.FromMesh(src).subtract(BABYLON.CSG.FromMesh(cutter));
    out = res.toMesh(mesh.name, scene._claddingMatLight || mesh.material || null, scene, true);
  } catch (e) {
    console.warn("[trimMeshByApexCutter] CSG operation failed:", e);
    out = null;
  }

  try { src.dispose(false, false); } catch (e) {}
  if (!out) return;

  out.material = scene._claddingMatLight || mesh.material || null;

  out.metadata = Object.assign({}, (mesh.metadata || {}), { trimmedToRoofApex: true });
  out.isVisible = mesh.isVisible;
  out.setEnabled(mesh.isEnabled());
  out.renderingGroupId = mesh.renderingGroupId;

  // Re-parent the trimmed mesh to preserve hierarchy
  if (originalParent) {
    try {
      out.parent = originalParent;
    } catch (e) {
      console.warn("[trimMeshByApexCutter] Failed to re-parent trimmed mesh:", e);
    }
  }

  try { mesh.dispose(false, false); } catch (e) {}
  // Re-apply wood texture in case CSG cleared it
  try { if (scene._reapplyWoodTexture) scene._reapplyWoodTexture(); } catch (e) {}
}
