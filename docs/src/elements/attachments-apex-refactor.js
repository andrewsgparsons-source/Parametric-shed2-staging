/**
 * REFACTORED buildApexRoof for attachments
 * Matches the primary building's apex roof construction approach
 * 
 * Key differences from old version:
 * 1. Uses surface-following positioning (sample point + perpendicular offset)
 * 2. Proper coordinate handling for both orientations
 * 3. No CreatePolygon (avoids earcut dependency)
 * 4. Consistent with primary roof geometry
 */

function buildApexRoof_v2(scene, root, attId, extentX, extentZ, roofBaseY, attachWall, attachment, joistMat, osbMat, coveringMat, claddingMat, memberW_mm, memberD_mm, mainFasciaBottom) {
  // Constants matching primary roof
  const ROOF_OSB_MM = 18;
  const COVERING_MM = 2;
  const FASCIA_THK_MM = 20;
  const FASCIA_DEPTH_MM = 135;
  const CLAD_T_MM = 20;
  
  // Get overhang values
  const apexOvh = attachment?.roof?.apex?.overhang || {};
  const ovhEaves_mm = apexOvh.eaves_mm ?? 75;
  const ovhVergeL_mm = apexOvh.vergeLeft_mm ?? 75;
  const ovhVergeR_mm = apexOvh.vergeRight_mm ?? 75;

  // Calculate crest height with constraints
  const CREST_CLEARANCE_MM = 50;
  const maxCrestHeight = (mainFasciaBottom || 1800) - CREST_CLEARANCE_MM;
  let crestHeightAbs = attachment.roof?.apex?.crestHeight_mm || maxCrestHeight;
  if (crestHeightAbs > maxCrestHeight) crestHeightAbs = maxCrestHeight;
  
  const rise_mm = Math.max(100, crestHeightAbs - roofBaseY);

  // Ridge direction based on attachment wall
  // Left/Right: ridge along X, slopes face Z
  // Front/Back: ridge along Z, slopes face X
  const ridgeAlongX = (attachWall === "left" || attachWall === "right");

  // Dimensions in world coords
  const span_mm = ridgeAlongX ? extentZ : extentX;   // perpendicular to ridge
  const ridge_mm = ridgeAlongX ? extentX : extentZ;  // along ridge
  const halfSpan_mm = span_mm / 2;

  // Slope geometry
  const rafterLen_mm = Math.sqrt(halfSpan_mm * halfSpan_mm + rise_mm * rise_mm);
  const slopeAng = Math.atan2(rise_mm, halfSpan_mm);
  const sinT = Math.sin(slopeAng);
  const cosT = Math.cos(slopeAng);

  // Timber dimensions
  const MEMBER_W = memberW_mm || 75;
  const MEMBER_D = memberD_mm || 50;
  const TRUSS_SPACING = 600;

  console.log("[apex-v2] Building apex roof:", attId,
    "ridgeAlongX:", ridgeAlongX,
    "span:", span_mm, "ridge:", ridge_mm, "rise:", rise_mm,
    "rafterLen:", Math.round(rafterLen_mm), "slope:", (slopeAng * 180 / Math.PI).toFixed(1) + "°");

  // Create roof root node
  // Position at eaves height (roofBaseY is absolute, but root is parented to attachment root)
  const roofRoot = new BABYLON.TransformNode(`att-${attId}-apex-roof-root`, scene);
  roofRoot.metadata = { dynamic: true, attachmentId: attId };
  roofRoot.parent = root;
  roofRoot.position = new BABYLON.Vector3(0, roofBaseY / 1000, 0);

  // ========== HELPER FUNCTIONS ==========
  
  // Create box centered at position (in mm, converted to meters)
  function mkBox(name, w, h, d, cx, cy, cz, mat, meta) {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: w / 1000, height: h / 1000, depth: d / 1000
    }, scene);
    mesh.position = new BABYLON.Vector3(cx / 1000, cy / 1000, cz / 1000);
    mesh.material = mat;
    mesh.parent = roofRoot;
    mesh.metadata = Object.assign({ dynamic: true, attachmentId: attId, type: 'roof' }, meta || {});
    return mesh;
  }

  // Create a sloped panel (covering/OSB) using surface-following positioning
  // This matches the primary roof's approach
  function createSlopedPanel(name, side, length_mm, width_mm, thickness_mm, perpOffset_mm, mat, meta) {
    // side: 'L' (left/lower index slope) or 'R' (right/higher index slope)
    // length_mm: dimension down the slope
    // width_mm: dimension along ridge
    // perpOffset_mm: perpendicular distance from rafter surface to panel center
    
    // Sample point at mid-slope
    const sMid = length_mm / 2;  // distance down slope from ridge
    const runMid = sMid * cosT;  // horizontal distance from ridge
    const dropMid = sMid * sinT; // vertical drop from ridge
    
    // Surface Y at mid-slope (in local coords where tie beam top = MEMBER_D)
    const ySurfMid = MEMBER_D + (rise_mm - dropMid);
    
    // Normal direction for this slope (pointing outward from surface)
    // Left slope: normal points toward -spanAxis and +Y
    // Right slope: normal points toward +spanAxis and +Y
    const normalSpan = (side === 'L') ? -sinT : sinT;
    const normalY = cosT;
    
    // Panel center position
    let cx, cy, cz;
    
    if (ridgeAlongX) {
      // Slopes face Z direction
      // Left slope: Z decreases from ridge (halfSpan) toward 0
      // Right slope: Z increases from ridge toward span_mm
      const spanPos = (side === 'L') 
        ? (halfSpan_mm - runMid)  // left slope
        : (halfSpan_mm + runMid); // right slope
      
      cx = ridge_mm / 2;  // centered along ridge
      cy = ySurfMid + normalY * perpOffset_mm;
      cz = spanPos + normalSpan * perpOffset_mm;
    } else {
      // Slopes face X direction
      const spanPos = (side === 'L')
        ? (halfSpan_mm - runMid)
        : (halfSpan_mm + runMid);
      
      cx = spanPos + normalSpan * perpOffset_mm;
      cy = ySurfMid + normalY * perpOffset_mm;
      cz = ridge_mm / 2;  // centered along ridge
    }
    
    // Create panel
    const mesh = mkBox(name, 
      ridgeAlongX ? width_mm : length_mm,  // width in X
      thickness_mm,
      ridgeAlongX ? length_mm : width_mm,  // depth in Z
      cx, cy, cz, mat, meta);
    
    // Rotate to match slope
    const rotAngle = (side === 'L') ? slopeAng : -slopeAng;
    if (ridgeAlongX) {
      mesh.rotation = new BABYLON.Vector3(-rotAngle, 0, 0);  // rotate around X
    } else {
      mesh.rotation = new BABYLON.Vector3(0, 0, rotAngle);   // rotate around Z
    }
    
    return mesh;
  }

  // ========== 1. TRUSSES ==========
  const trussPositions = [];
  for (let p = 0; p <= ridge_mm - MEMBER_W; p += TRUSS_SPACING) {
    trussPositions.push(p);
  }
  // Ensure end truss
  const lastPos = ridge_mm - MEMBER_W;
  if (trussPositions.length === 0 || trussPositions[trussPositions.length - 1] < lastPos) {
    trussPositions.push(lastPos);
  }

  trussPositions.forEach((pos, idx) => {
    const trussCenterAlongRidge = pos + MEMBER_W / 2;
    
    // Tie beam at bottom
    const tieCx = ridgeAlongX ? trussCenterAlongRidge : halfSpan_mm;
    const tieCy = MEMBER_D / 2;
    const tieCz = ridgeAlongX ? halfSpan_mm : trussCenterAlongRidge;
    const tieW = ridgeAlongX ? MEMBER_W : span_mm;
    const tieD = ridgeAlongX ? span_mm : MEMBER_W;
    
    mkBox(`att-${attId}-truss-${idx}-tie`, tieW, MEMBER_D, tieD, tieCx, tieCy, tieCz,
      joistMat, { part: 'truss', member: 'tie' });
    
    // Rafters
    const rafterCy = MEMBER_D + rise_mm / 2;  // vertical center of rafter
    
    ['L', 'R'].forEach(side => {
      const spanOffset = (rafterLen_mm / 2) * cosT;  // horizontal offset from ridge to rafter center
      const spanPos = (side === 'L') 
        ? (halfSpan_mm - spanOffset)
        : (halfSpan_mm + spanOffset);
      
      let cx, cz;
      if (ridgeAlongX) {
        cx = trussCenterAlongRidge;
        cz = spanPos;
      } else {
        cx = spanPos;
        cz = trussCenterAlongRidge;
      }
      
      const rafter = mkBox(`att-${attId}-truss-${idx}-rafter-${side}`,
        ridgeAlongX ? MEMBER_W : rafterLen_mm,
        MEMBER_D,
        ridgeAlongX ? rafterLen_mm : MEMBER_W,
        cx, rafterCy, cz, joistMat, { part: 'truss', member: `rafter-${side}` });
      
      // Rotate rafter
      const rotAngle = (side === 'L') ? slopeAng : -slopeAng;
      if (ridgeAlongX) {
        rafter.rotation = new BABYLON.Vector3(-rotAngle, 0, 0);
      } else {
        rafter.rotation = new BABYLON.Vector3(0, 0, rotAngle);
      }
    });
  });

  // ========== 2. OSB ==========
  // OSB sits on rafters, offset perpendicular by half rafter depth
  const osbPerpOffset = MEMBER_D / 2 + ROOF_OSB_MM / 2 + 2;  // +2 for clearance
  
  createSlopedPanel(`att-${attId}-osb-L`, 'L', rafterLen_mm, ridge_mm, ROOF_OSB_MM, osbPerpOffset, osbMat, { part: 'osb', side: 'L' });
  createSlopedPanel(`att-${attId}-osb-R`, 'R', rafterLen_mm, ridge_mm, ROOF_OSB_MM, osbPerpOffset, osbMat, { part: 'osb', side: 'R' });

  // ========== 3. COVERING ==========
  // Covering sits on top of OSB
  const coverPerpOffset = osbPerpOffset + ROOF_OSB_MM / 2 + COVERING_MM / 2 + 1;
  
  // Extend covering past eaves by ovhEaves_mm
  const coverLen = rafterLen_mm + ovhEaves_mm;
  
  // Need to offset center position for the extended length
  // The extension is at the eaves (outer) end, so shift center outward
  const coverExtensionShift = ovhEaves_mm / 2 * cosT;  // horizontal shift
  
  ['L', 'R'].forEach(side => {
    const sMid = coverLen / 2;
    const runMid = (sMid - ovhEaves_mm / 2) * cosT;  // adjust for extension
    const dropMid = (sMid - ovhEaves_mm / 2) * sinT;
    const ySurfMid = MEMBER_D + (rise_mm - dropMid);
    
    const normalSpan = (side === 'L') ? -sinT : sinT;
    const normalY = cosT;
    
    let cx, cy, cz;
    if (ridgeAlongX) {
      const spanPos = (side === 'L')
        ? (halfSpan_mm - runMid - coverExtensionShift)
        : (halfSpan_mm + runMid + coverExtensionShift);
      cx = ridge_mm / 2;
      cy = ySurfMid + normalY * coverPerpOffset;
      cz = spanPos + normalSpan * coverPerpOffset;
    } else {
      const spanPos = (side === 'L')
        ? (halfSpan_mm - runMid - coverExtensionShift)
        : (halfSpan_mm + runMid + coverExtensionShift);
      cx = spanPos + normalSpan * coverPerpOffset;
      cy = ySurfMid + normalY * coverPerpOffset;
      cz = ridge_mm / 2;
    }
    
    const cover = mkBox(`att-${attId}-covering-${side}`,
      ridgeAlongX ? ridge_mm : coverLen,
      COVERING_MM,
      ridgeAlongX ? coverLen : ridge_mm,
      cx, cy, cz, coveringMat, { part: 'covering', side });
    
    const rotAngle = (side === 'L') ? slopeAng : -slopeAng;
    if (ridgeAlongX) {
      cover.rotation = new BABYLON.Vector3(-rotAngle, 0, 0);
    } else {
      cover.rotation = new BABYLON.Vector3(0, 0, rotAngle);
    }
  });

  // ========== 4. FASCIA ==========
  // Fascia hangs down at eaves edges
  const fasciaTopY = MEMBER_D + osbPerpOffset + ROOF_OSB_MM / 2;
  const fasciaCy = fasciaTopY - FASCIA_DEPTH_MM / 2;
  
  if (ridgeAlongX) {
    // Eaves fascia at Z=0 and Z=span_mm
    mkBox(`att-${attId}-fascia-eaves-L`, ridge_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM,
      ridge_mm / 2, fasciaCy, -FASCIA_THK_MM / 2, joistMat, { part: 'fascia', edge: 'eaves-L' });
    mkBox(`att-${attId}-fascia-eaves-R`, ridge_mm, FASCIA_DEPTH_MM, FASCIA_THK_MM,
      ridge_mm / 2, fasciaCy, span_mm + FASCIA_THK_MM / 2, joistMat, { part: 'fascia', edge: 'eaves-R' });
    
    // Verge fascia at X=0 and X=ridge_mm
    mkBox(`att-${attId}-fascia-verge-F`, FASCIA_THK_MM, FASCIA_DEPTH_MM, span_mm + 2 * FASCIA_THK_MM,
      -FASCIA_THK_MM / 2, fasciaCy, halfSpan_mm, joistMat, { part: 'fascia', edge: 'verge-F' });
    mkBox(`att-${attId}-fascia-verge-B`, FASCIA_THK_MM, FASCIA_DEPTH_MM, span_mm + 2 * FASCIA_THK_MM,
      ridge_mm + FASCIA_THK_MM / 2, fasciaCy, halfSpan_mm, joistMat, { part: 'fascia', edge: 'verge-B' });
  } else {
    // Eaves fascia at X=0 and X=span_mm
    mkBox(`att-${attId}-fascia-eaves-L`, FASCIA_THK_MM, FASCIA_DEPTH_MM, ridge_mm,
      -FASCIA_THK_MM / 2, fasciaCy, ridge_mm / 2, joistMat, { part: 'fascia', edge: 'eaves-L' });
    mkBox(`att-${attId}-fascia-eaves-R`, FASCIA_THK_MM, FASCIA_DEPTH_MM, ridge_mm,
      span_mm + FASCIA_THK_MM / 2, fasciaCy, ridge_mm / 2, joistMat, { part: 'fascia', edge: 'eaves-R' });
    
    // Verge fascia at Z=0 and Z=ridge_mm
    mkBox(`att-${attId}-fascia-verge-F`, span_mm + 2 * FASCIA_THK_MM, FASCIA_DEPTH_MM, FASCIA_THK_MM,
      halfSpan_mm, fasciaCy, -FASCIA_THK_MM / 2, joistMat, { part: 'fascia', edge: 'verge-F' });
    mkBox(`att-${attId}-fascia-verge-B`, span_mm + 2 * FASCIA_THK_MM, FASCIA_DEPTH_MM, FASCIA_THK_MM,
      halfSpan_mm, fasciaCy, ridge_mm + FASCIA_THK_MM / 2, joistMat, { part: 'fascia', edge: 'verge-B' });
  }

  // ========== 5. GABLE ENDS ==========
  // Skip for now - need to use CSG or ExtrudePolygon approach
  // TODO: Implement proper gable cladding without earcut
  console.log("[apex-v2] Skipping gable ends (TODO: implement without CreatePolygon)");
}

// Export for testing
if (typeof module !== 'undefined') module.exports = { buildApexRoof_v2 };
