// FILE: docs/src/pricing.js
// Price Boundary Calculator — estimates a cost range from BOM quantities + price table
// Shows "likely total range" to help customers understand ballpark cost

import { CONFIG } from './params.js';

let priceTable = null;

/** Load the price table JSON (called once at startup) */
export async function loadPriceTable() {
  try {
    const resp = await fetch('./data/price-table.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    priceTable = await resp.json();
    console.log('[PRICING] Price table loaded:', priceTable.version);
    return true;
  } catch (err) {
    console.warn('[PRICING] Could not load price table:', err.message);
    return false;
  }
}

/** Get the loaded price table (or null) */
export function getPriceTable() { return priceTable; }

/**
 * Calculate price estimate from current state.
 * Returns { low, high, breakdown } or null if price table not loaded.
 */
export function estimatePrice(state) {
  if (!priceTable) return null;

  const pt = priceTable;
  const w_mm = (state.dim && state.dim.frameW_mm) || state.w || 1800;
  const d_mm = (state.dim && state.dim.frameD_mm) || state.d || 2400;
  const footprint_m2 = (w_mm * d_mm) / 1_000_000;
  const isInsulated = state.walls?.variant === 'insulated';
  const roofStyle = state.roof?.style || 'apex';
  const roofCovering = state.roof?.covering || 'felt';

  // ─── VISIBILITY STATE ───
  // If something is hidden via visibility toggles, exclude it from pricing
  const vis = state.vis || {};
  const visBase = vis.baseAll !== false;
  const visWalls = (typeof vis.walls === 'boolean') ? vis.walls : (vis.wallsEnabled !== false);
  const visRoof = vis.roof !== false;
  const visCladding = vis.cladding !== false;
  const visOpenings = vis.openings !== false;
  // Per-wall cladding visibility
  const cladParts = vis.cladParts || {};
  const visCladFront = visCladding && (cladParts.front !== false);
  const visCladBack = visCladding && (cladParts.back !== false);
  const visCladLeft = visCladding && (cladParts.left !== false);
  const visCladRight = visCladding && (cladParts.right !== false);
  // Roof sub-components
  const roofParts = vis.roofParts || {};
  const visRoofOsb = visRoof && (roofParts.osb !== false);
  const visRoofCovering = visRoof && (roofParts.covering !== false);
  const visRoofInsulation = visRoof && (roofParts.insulation !== false);
  const visRoofPly = visRoof && (roofParts.ply !== false);
  // Wall sub-components
  const visWallIns = visWalls && (vis.wallIns !== false);
  const visWallPly = visWalls && (vis.wallPly !== false);
  // Base sub-components — respect individual toggles
  const visBaseGrid = visBase && (vis.base !== false);   // Plastic ground grids
  const visBaseFrame = visBase && (vis.frame !== false);  // Timber frame joists
  const visBaseDeck = visBase && (vis.deck !== false);    // OSB decking
  const visBaseIns = visBase && (vis.ins !== false);      // Floor insulation

  // Count openings from state
  const doors = visOpenings ? countOpenings(state, 'door') : 0;
  const windows = visOpenings ? countOpenings(state, 'window') : 0;
  const skylights = visRoof ? countSkylights(state) : 0;

  const breakdown = {};

  // ─── 1. TIMBER (structural framing) ───
  const timberPerLm = pt.timber.structural_50x100_per_lm;
  // Frame gauge: 100×50 costs ~1/3 more than 75×50
  const section = (isInsulated ? state.walls?.insulated?.section : state.walls?.basic?.section) || {};
  const gaugeMultiplier = (section.h >= 100) ? 1.33 : 1.0;
  // Split timber into base frame vs walls+roof so each respects its visibility toggle
  const timberParts = estimateTimberLinearMetresSplit(state, w_mm, d_mm);
  const timberLm = (visBaseFrame ? timberParts.base : 0)
                 + (visWalls ? timberParts.walls : 0)
                 + (visRoof ? timberParts.roof : 0);
  breakdown.timber = timberLm * timberPerLm * gaugeMultiplier;

  // ─── 1b. BASE GRIDS (plastic ground grids) ───
  // Only priced when Grid is visible in base visibility
  const gridCostPerM2 = pt.base_grids?.cost_per_m2 || 0;
  breakdown.baseGrids = visBaseGrid ? footprint_m2 * gridCostPerM2 : 0;

  // ─── 2. CLADDING ───
  // Per-wall cladding: only price walls that are visible
  const claddingProfile = state.cladding?.style || state.cladding?.profile || 'shiplap';
  const wallArea_m2 = estimateWallArea(state, w_mm, d_mm, roofStyle);
  const claddedWallArea_m2 = estimateCladdedWallArea(state, w_mm, d_mm, roofStyle,
    { front: visCladFront, back: visCladBack, left: visCladLeft, right: visCladRight });
  let claddingCostPerM2;
  if (claddingProfile === 'featherEdge' || claddingProfile === 'feather_edge') {
    claddingCostPerM2 = pt.cladding.feather_edge_175x38_per_lm * (1000 / pt.cladding.feather_edge_cover_mm);
  } else {
    // Default to shiplap
    claddingCostPerM2 = pt.cladding.shiplap_150x25_per_lm * (1000 / pt.cladding.shiplap_cover_mm);
  }
  breakdown.cladding = claddedWallArea_m2 * claddingCostPerM2;

  // ─── 3. OSB DECKING ───
  const sheetArea = (pt.sheets.sheet_w_mm * pt.sheets.sheet_l_mm) / 1_000_000; // ~2.977 m²
  const osbSheets = visBaseDeck ? Math.ceil(footprint_m2 / sheetArea) : 0;
  breakdown.osb = osbSheets * pt.sheets.osb_18mm_per_sheet;

  // ─── 4. INSULATION (floor + walls, if insulated) ───
  breakdown.insulation = 0;
  breakdown.plyLining = 0;
  if (isInsulated) {
    // Floor PIR (only if base insulation visible)
    const pirFloorSheets = visBaseIns ? Math.ceil(footprint_m2 / sheetArea) : 0;
    // Wall PIR (only if wall insulation visible)
    const pirWallSheets = visWallIns ? Math.ceil(wallArea_m2 / sheetArea) : 0;
    breakdown.insulation = (pirFloorSheets + pirWallSheets) * pt.sheets.pir_50mm_per_sheet;

    // Internal lining (floor always ply + walls depend on lining type selection)
    const liningType = state?.walls?.internalLining || "plywood";
    const plyFloorSheets = visBaseDeck ? Math.ceil(footprint_m2 / sheetArea) : 0;
    const floorPlyCost = plyFloorSheets * pt.sheets.ply_12mm_per_sheet;
    
    let wallLiningCost = 0;
    if (visWallPly) {
      if (liningType === "pine-tg" && pt.internal_lining) {
        // Pine T&G: price per m² of wall area
        wallLiningCost = wallArea_m2 * pt.internal_lining.pine_tg_per_m2;
      } else {
        // Plywood sheets
        const plyWallSheets = Math.ceil(wallArea_m2 / sheetArea);
        wallLiningCost = plyWallSheets * pt.sheets.ply_12mm_per_sheet;
      }
    }
    breakdown.plyLining = floorPlyCost + wallLiningCost;
    breakdown.liningLabel = liningType === "pine-tg" ? "Internal lining (Pine T&G)" : "Ply lining";
  }

  // ─── 4b. ROOF OSB / SHEATHING ───
  // Same 18mm OSB sheets as floor, calculated from roof area + 1 extra for waste/damage
  const roofArea_m2 = estimateRoofArea(w_mm, d_mm, roofStyle, state);
  const roofOsbSheets = visRoofOsb ? Math.ceil(roofArea_m2 / sheetArea) + 1 : 0;  // +1 waste board
  breakdown.roofOsb = roofOsbSheets * pt.sheets.osb_18mm_per_sheet;

  // ─── 4c. ROOF INSULATION (PIR, insulated variant only) ───
  breakdown.roofInsulation = 0;
  breakdown.roofPly = 0;
  if (isInsulated) {
    const roofPirSheets = visRoofInsulation ? Math.ceil(roofArea_m2 / sheetArea) : 0;
    breakdown.roofInsulation = roofPirSheets * pt.sheets.pir_50mm_per_sheet;

    // ─── 4d. ROOF INTERIOR PLYWOOD (12mm lining) ───
    const roofPlySheets = visRoofPly ? Math.ceil(roofArea_m2 / sheetArea) : 0;
    breakdown.roofPly = roofPlySheets * pt.sheets.ply_12mm_per_sheet;
  }

  // ─── 5. ROOF COVERING ───
  if (!visRoofCovering) {
    breakdown.roofCovering = 0;
  } else if (roofCovering === 'epdm') {
    breakdown.roofCovering = roofArea_m2 * pt.roofing.epdm_per_m2;
  } else {
    breakdown.roofCovering = roofArea_m2 * pt.roofing.felt_per_m2;
  }

  // ─── 5b. ROOF COMPLEXITY PREMIUM ───
  // Pent = baseline (simple rafters). Apex adds trusses. Hipped adds hip rafters + complex cuts.
  breakdown.roofComplexity = 0;
  const span_m = Math.min(w_mm, d_mm) / 1000;
  const length_m = Math.max(w_mm, d_mm) / 1000;
  if (visRoof && (roofStyle === 'apex' || roofStyle === 'hipped')) {
    // Apex: £15 per truss-metre (truss width × number of trusses)
    const trussSpacing_m = 0.6; // 600mm centres
    const trussCount = Math.ceil(length_m / trussSpacing_m) + 1;
    const trussWidth_m = span_m;
    breakdown.roofComplexity = trussCount * trussWidth_m * 15;
  }
  if (roofStyle === 'hipped') {
    // Hipped: additional £30 per m² of footprint on top of apex premium
    breakdown.roofComplexity += footprint_m2 * 30;
  }

  // ─── 6. OPENINGS ───
  const doorCost = (pt.openings.dgu_per_unit + pt.openings.door_hardware + pt.openings.door_timber_allowance);
  const windowCost = (pt.openings.dgu_per_unit + pt.openings.window_hardware + pt.openings.window_timber_allowance);
  const skylightCost = windowCost + (pt.openings.skylight_premium || 70);
  breakdown.doors = doors * doorCost;
  breakdown.windows = windows * windowCost;
  breakdown.skylights = skylights * skylightCost;

  // ─── 6b. SHELVING ───
  const shelvingArea_m2 = calcShelvingArea(state);
  const shelvingCostPerM2 = pt.shelving?.cost_per_m2 || 25;
  breakdown.shelving = shelvingArea_m2 * shelvingCostPerM2;

  // ─── 6c. INTERNAL DIVIDERS ───
  breakdown.dividers = calcDividerCost(state, pt, w_mm, d_mm);

  // ─── 7. DPC / MEMBRANE ───
  breakdown.dpc = visBase ? footprint_m2 * pt.sundries.dpc_membrane_per_m2 : 0;

  // ─── 7b. ATTACHMENTS ───
  // Each attachment is priced as a mini-building: timber, cladding (3 walls), roof OSB, covering, grids, openings
  breakdown.attachments = 0;
  const attachments = state.sections?.attachments || [];
  const attVis = vis.attachments || {};  // { base: bool, walls: bool, roof: bool, cladding: bool }
  const attVisBase = attVis.base !== false;
  const attVisWalls = attVis.walls !== false;
  const attVisRoof = attVis.roof !== false;
  const attVisCladding = attVis.cladding !== false;

  for (const att of attachments) {
    if (!att || att.enabled === false) continue;

    const attW_mm = att.dimensions?.width_mm || 1800;
    const attD_mm = att.dimensions?.depth_mm || 1200;
    const attFootprint_m2 = (attW_mm * attD_mm) / 1_000_000;
    const attWallHeight_m = (att.walls?.height_mm || state.walls?.height_mm || 2200) / 1000;
    const attW_m = attW_mm / 1000;
    const attD_m = attD_mm / 1000;

    // Attachment has 3 walls (shared wall with main building has no cladding/framing)
    // 1 wall = width (outer), 2 walls = depth (sides)
    const attWallArea_m2 = (attW_m * attWallHeight_m + 2 * attD_m * attWallHeight_m) * 0.85;

    // Timber framing (structural) — simplified linear metre estimate for 3 walls + base + roof
    if (attVisWalls) {
      const attPerimeter3 = attW_m + 2 * attD_m;  // 3 walls only
      const attPlates_lm = attPerimeter3 * 2;  // top + bottom plates
      const attStudCount = Math.ceil(attPerimeter3 / 0.4);
      const attStuds_lm = attStudCount * attWallHeight_m;
      // Base joists
      const attBaseJoists = Math.ceil(attW_m / 0.4) + 2;
      const attBase_lm = attBaseJoists * attD_m + 2 * attW_m;
      // Roof rafters
      const attRafterCount = Math.ceil(attW_m / 0.6) + 1;
      const attRafter_lm = attRafterCount * attD_m * 1.05;
      const attTimber_lm = attPlates_lm + attStuds_lm + attBase_lm + attRafter_lm;
      breakdown.attachments += attTimber_lm * timberPerLm * gaugeMultiplier;
    }

    // Cladding (3 walls only, not the shared wall)
    if (attVisCladding) {
      breakdown.attachments += attWallArea_m2 * claddingCostPerM2;
    }

    // Base: OSB deck + grids + DPC
    if (attVisBase) {
      const attOsbSheets = Math.ceil(attFootprint_m2 / sheetArea);
      breakdown.attachments += attOsbSheets * pt.sheets.osb_18mm_per_sheet;
      breakdown.attachments += attFootprint_m2 * gridCostPerM2;
      breakdown.attachments += attFootprint_m2 * pt.sundries.dpc_membrane_per_m2;
    }

    // Roof: OSB + covering
    if (attVisRoof) {
      const attRoofArea_m2 = attFootprint_m2 * 1.1;  // rough slope factor
      const attRoofOsbSheets = Math.ceil(attRoofArea_m2 / sheetArea) + 1;  // +1 waste
      breakdown.attachments += attRoofOsbSheets * pt.sheets.osb_18mm_per_sheet;
      if (roofCovering === 'epdm') {
        breakdown.attachments += attRoofArea_m2 * pt.roofing.epdm_per_m2;
      } else {
        breakdown.attachments += attRoofArea_m2 * pt.roofing.felt_per_m2;
      }
    }

    // Openings on attachment
    const attOpenings = att.walls?.openings || [];
    for (const op of attOpenings) {
      if (!op || op.enabled === false) continue;
      if (op.type === 'door') breakdown.attachments += doorCost;
      else if (op.type === 'window') breakdown.attachments += windowCost;
    }
  }

  // ─── 8. MATERIALS SUBTOTAL ───
  const materialsSubtotal = Object.values(breakdown).reduce((s, v) => s + v, 0);

  // ─── 9. FIXINGS (% of materials) ───
  breakdown.fixings = materialsSubtotal * pt.sundries.fixings_pct;

  // ─── 10. DELIVERY ───
  breakdown.delivery = pt.sundries.delivery_per_order * pt.sundries.delivery_orders_estimate;

  // ─── TOTAL MATERIALS ───
  const totalMaterials = Object.values(breakdown).reduce((s, v) => s + v, 0);

  // ─── LABOUR ───
  // Base + rate formula: fixed overhead (mobilisation/setup) + per-m² scaling
  // Calibrated 19 Feb 2026: 4m²=4d, 9m²=5d, 24m²=8d (basic, from Andrew)
  // Include attachment footprint in total area for labour calculation
  let totalFootprint_m2 = footprint_m2;
  for (const att of attachments) {
    if (!att || att.enabled === false) continue;
    totalFootprint_m2 += ((att.dimensions?.width_mm || 0) * (att.dimensions?.depth_mm || 0)) / 1_000_000;
  }
  const baseDays = isInsulated ? pt.labour.base_days_insulated : pt.labour.base_days_basic;
  const ratePerM2 = isInsulated ? pt.labour.rate_per_m2_insulated : pt.labour.rate_per_m2_basic;
  const labourDays = Math.max(pt.labour.min_days, Math.round(baseDays + totalFootprint_m2 * ratePerM2));
  const labourCost = labourDays * pt.labour.day_rate;

  // ─── TOTAL COST ───
  const totalCost = totalMaterials + labourCost;

  // ─── SELL PRICE (with margin) ───
  // margin_pct is profit/revenue, so sell = cost / (1 - margin)
  const marginPct = pt.margin.target_pct;
  const bufferPct = pt.margin.range_buffer_pct;
  const sellTarget = totalCost / (1 - marginPct);
  const sellLow = totalCost / (1 - (marginPct - bufferPct));   // Lower margin = lower price
  const sellHigh = totalCost / (1 - (marginPct + bufferPct));  // Higher margin = higher price

  return {
    low: Math.round(sellLow / 50) * 50,        // Round to nearest £50
    high: Math.round(sellHigh / 50) * 50,
    target: Math.round(sellTarget / 50) * 50,
    totalCost: Math.round(totalCost),
    totalMaterials: Math.round(totalMaterials),
    labourCost: Math.round(labourCost),
    labourDays,
    footprint_m2: Math.round(footprint_m2 * 100) / 100,
    isInsulated,
    roofStyle,
    gaugeLabel: (section.h >= 100) ? '100×50' : '75×50',
    doors,
    windows,
    skylights,
    shelvingArea_m2: Math.round(shelvingArea_m2 * 100) / 100,
    attachmentCount: attachments.filter(a => a && a.enabled !== false).length,
    totalFootprint_m2: Math.round(totalFootprint_m2 * 100) / 100,
    dividerCount: (state.dividers?.items || []).filter(d => d && d.enabled !== false).length,
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([k, v]) => [k, Math.round(v)])
    )
  };
}

// ─── Helper: count openings (doors/windows only — skylights counted separately) ───
function countOpenings(state, type) {
  let count = 0;
  const openings = state.walls?.openings;
  if (Array.isArray(openings)) {
    count = openings.filter(o => {
      if (!o.enabled) return false;
      const t = (o.type || '').toLowerCase();
      if (type === 'door') return t.includes('door');
      if (type === 'window') return t.includes('window') && t !== 'skylight';
      return false;
    }).length;
  }
  // Minimum: 1 door if none found
  if (type === 'door' && count === 0) count = 1;
  return count;
}

// ─── Helper: count skylights from roof state ───
function countSkylights(state) {
  const skylights = state.roof?.skylights;
  if (!Array.isArray(skylights)) return 0;
  return skylights.filter(s => s && s.enabled !== false).length;
}

// ─── Helper: calculate total shelving area in m² ───
function calcShelvingArea(state) {
  const shelves = state.shelving;
  if (!Array.isArray(shelves)) return 0;
  let area = 0;
  for (const s of shelves) {
    if (!s || s.enabled === false) continue;
    const len = s.length_mm || 0;
    const depth = s.depth_mm || 0;
    area += (len * depth) / 1_000_000; // mm² → m²
  }
  return area;
}

// ─── Helper: calculate divider cost from timber + coverings ───
function calcDividerCost(state, pt, buildingW_mm, buildingD_mm) {
  const items = state.dividers?.items;
  if (!Array.isArray(items)) return 0;

  const wallHeight_mm = state.walls?.height_mm || 2200;
  let totalCost = 0;

  for (const div of items) {
    if (!div || div.enabled === false) continue;

    // Divider length depends on axis
    const axis = div.axis || 'x';
    const divLength_mm = axis === 'x' ? buildingD_mm : buildingW_mm;
    const divHeight_mm = wallHeight_mm;
    const divArea_m2 = (divLength_mm * divHeight_mm) / 1_000_000;

    // Timber framing: sole plate + top plate + studs at 600mm centres
    const timberPerLm = pt.timber.structural_50x100_per_lm;
    const plates_lm = (divLength_mm * 2) / 1000; // sole + top plate
    const studCount = Math.ceil(divLength_mm / 600) + 1;
    const studs_lm = studCount * (divHeight_mm / 1000);
    const timberCost = (plates_lm + studs_lm) * timberPerLm;

    // Coverings (each side can be none/osb/cladding)
    const sheetArea_m2 = (pt.sheets.sheet_w_mm * pt.sheets.sheet_l_mm) / 1_000_000;
    let coveringCost = 0;

    for (const side of ['coveringLeft', 'coveringRight']) {
      const cover = div[side] || 'none';
      if (cover === 'osb') {
        const sheets = Math.ceil(divArea_m2 / sheetArea_m2);
        coveringCost += sheets * pt.sheets.osb_18mm_per_sheet;
      } else if (cover === 'cladding' || cover === 'clad') {
        // Use whichever cladding profile the building uses
        const claddingProfile = state.cladding?.style || state.cladding?.profile || 'shiplap';
        let costPerM2;
        if (claddingProfile === 'featherEdge' || claddingProfile === 'feather_edge') {
          costPerM2 = pt.cladding.feather_edge_175x38_per_lm * (1000 / pt.cladding.feather_edge_cover_mm);
        } else {
          costPerM2 = pt.cladding.shiplap_150x25_per_lm * (1000 / pt.cladding.shiplap_cover_mm);
        }
        coveringCost += divArea_m2 * costPerM2;
      }
    }

    totalCost += timberCost + coveringCost;
  }

  return totalCost;
}

// ─── Helper: estimate structural timber linear metres (split by component) ───
function estimateTimberLinearMetresSplit(state, w_mm, d_mm) {
  const perimeter_m = 2 * (w_mm + d_mm) / 1000;

  // Base: 2 rim joists + inner joists at 400mm spacing
  const rimJoists_lm = 2 * Math.max(w_mm, d_mm) / 1000;
  const innerJoistCount = Math.floor(Math.max(w_mm, d_mm) / 400);
  const innerJoists_lm = innerJoistCount * Math.min(w_mm, d_mm) / 1000;
  const baseLm = rimJoists_lm + innerJoists_lm;

  // Walls: sole plates + top plates (perimeter × 2) + studs (~every 600mm × wall height)
  const wallHeight_m = (state.walls?.height_mm || 2200) / 1000;
  const plates_lm = perimeter_m * 2; // sole + top plate
  const studCount = Math.ceil(perimeter_m / 0.6);
  const studs_lm = studCount * wallHeight_m;
  const wallsLm = plates_lm + studs_lm;

  // Roof: rafters (simplified — pair every 600mm along ridge)
  const ridgeLen_m = Math.max(w_mm, d_mm) / 1000;
  const rafterPairs = Math.ceil(ridgeLen_m / 0.6);
  const rafterLen_m = (Math.min(w_mm, d_mm) / 2000) * 1.1; // half span + slope factor
  const rafters_lm = rafterPairs * 2 * rafterLen_m;
  const ridge_lm = ridgeLen_m;
  const roofLm = rafters_lm + ridge_lm;

  return { base: baseLm, walls: wallsLm, roof: roofLm };
}

// Legacy wrapper for backward compatibility
function estimateTimberLinearMetres(state, w_mm, d_mm) {
  const parts = estimateTimberLinearMetresSplit(state, w_mm, d_mm);
  return parts.base + parts.walls + parts.roof;
}

// ─── Helper: estimate wall area (minus ~15% for openings) ───
function estimateWallArea(state, w_mm, d_mm, roofStyle) {
  const wallHeight_m = (state.walls?.height_mm || 2200) / 1000;
  const perimeter_m = 2 * (w_mm + d_mm) / 1000;
  let area = perimeter_m * wallHeight_m;

  // Add gable triangles for apex/hipped
  if (roofStyle === 'apex' || roofStyle === 'hipped') {
    const gableWidth_m = Math.min(w_mm, d_mm) / 1000;
    const ridgeHeight_m = 0.4; // rough estimate
    area += gableWidth_m * ridgeHeight_m; // 2 triangles ≈ 1 rectangle
  }

  // Subtract ~15% for openings
  area *= 0.85;
  return area;
}

// ─── Helper: estimate cladded wall area (respects per-wall visibility) ───
function estimateCladdedWallArea(state, w_mm, d_mm, roofStyle, wallVis) {
  const wallHeight_m = (state.walls?.height_mm || 2200) / 1000;
  const w_m = w_mm / 1000;
  const d_m = d_mm / 1000;

  // Calculate area per wall pair (front/back are width, left/right are depth)
  let area = 0;
  if (wallVis.front) area += w_m * wallHeight_m;
  if (wallVis.back) area += w_m * wallHeight_m;
  if (wallVis.left) area += d_m * wallHeight_m;
  if (wallVis.right) area += d_m * wallHeight_m;

  // Add gable triangles for apex/hipped (front + back gables)
  if (roofStyle === 'apex' || roofStyle === 'hipped') {
    const gableWidth_m = Math.min(w_m, d_m);
    const ridgeHeight_m = 0.4;
    // Gable triangle area split between the two gable walls (front + back for typical apex)
    if (wallVis.front) area += (gableWidth_m * ridgeHeight_m) / 2;
    if (wallVis.back) area += (gableWidth_m * ridgeHeight_m) / 2;
  }

  // Subtract ~15% for openings (proportional)
  area *= 0.85;
  return area;
}

// ─── Helper: estimate roof area (uses actual overhang values from state) ───
function estimateRoofArea(w_mm, d_mm, roofStyle, state) {
  const span_m = Math.min(w_mm, d_mm) / 1000;
  const length_m = Math.max(w_mm, d_mm) / 1000;

  // Read actual overhangs from state (fall back to uniform, then 75mm default)
  const ovh = state?.overhang || {};
  const uni = ovh.uniform_mm ?? 75;
  const isUnset = (v) => v == null || v === '';
  const l_mm = isUnset(ovh.left_mm)  ? uni : Number(ovh.left_mm)  || 0;
  const r_mm = isUnset(ovh.right_mm) ? uni : Number(ovh.right_mm) || 0;
  const f_mm = isUnset(ovh.front_mm) ? uni : Number(ovh.front_mm) || 0;
  const b_mm = isUnset(ovh.back_mm)  ? uni : Number(ovh.back_mm)  || 0;

  // Total overhang added to each dimension
  const ovhSpan_m = (l_mm + r_mm) / 1000;   // added to the span (width)
  const ovhLen_m  = (f_mm + b_mm) / 1000;    // added to the length (depth)

  if (roofStyle === 'pent') {
    // Single slope — slope runs across the span
    const slopeLen = (span_m + ovhSpan_m) * 1.05; // pitch factor
    return slopeLen * (length_m + ovhLen_m);
  }
  // Apex / hipped — two slopes
  const halfSpan = (span_m + ovhSpan_m) / 2;
  const slopeLen = halfSpan * 1.12; // pitch factor
  return 2 * slopeLen * (length_m + ovhLen_m);
}

// ─── UI: render price estimate card ───
export function renderPriceCard(state, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const est = estimatePrice(state);
  if (!est) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  const vatNote = priceTable?.vatMode === 'ex' ? ' (ex-VAT)' : '';

  container.innerHTML = `
    <div class="price-card">
      <div class="price-card-header">
        <span class="price-card-icon">💰</span>
        <span class="price-card-title">Estimated Cost Range</span>
      </div>
      <div class="price-card-range">
        <span class="price-low">£${est.low.toLocaleString()}</span>
        <span class="price-dash"> — </span>
        <span class="price-high">£${est.high.toLocaleString()}</span>
      </div>
      <div class="price-card-basis">
        Based on ${est.footprint_m2}m² footprint${est.isInsulated ? ', fully insulated' : ''}, 
        ${est.doors} door${est.doors !== 1 ? 's' : ''}, 
        ${est.windows} window${est.windows !== 1 ? 's' : ''}${est.skylights ? `, ${est.skylights} skylight${est.skylights !== 1 ? 's' : ''}` : ''}${vatNote}
      </div>
      <div class="price-card-detail">
        <div class="price-detail-row">
          <span>Materials</span><span>£${est.totalMaterials.toLocaleString()}</span>
        </div>
        <div class="price-detail-row">
          <span>Labour (${est.labourDays} days)</span><span>£${est.labourCost.toLocaleString()}</span>
        </div>
        <div class="price-detail-row price-total-row">
          <span>Cost</span><span>£${est.totalCost.toLocaleString()}</span>
        </div>
      </div>
      <div class="price-card-note">
        Final price depends on site access, ground preparation, and fit-out level.
      </div>
      <button class="price-cta-btn" onclick="window.open('https://bespokeshedcompany.co.uk/#contact','_blank')">
        Get a Fixed Quote →
      </button>
    </div>
  `;
}

/**
 * Render the persistent price range badge (top-right corner).
 * Small, unobtrusive — just the range.
 */
export function renderPriceBadge(state) {
  let badge = document.getElementById('priceBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'priceBadge';
    badge.style.cssText = 'position:fixed;top:12px;right:12px;background:linear-gradient(135deg, #e8f5e9, #f1f8e9);border:1px solid #a5d6a7;border-radius:10px;padding:8px 16px;font-family:inherit;z-index:900;box-shadow:0 2px 10px rgba(76,175,80,0.15);pointer-events:none;transition:opacity 0.3s;';
    document.body.appendChild(badge);
  }

  const est = estimatePrice(state);
  if (!est) {
    badge.style.display = 'none';
    return;
  }

  badge.style.display = '';
  badge.innerHTML = `
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:2px;">Estimated Range</div>
    <div style="font-size:18px;font-weight:700;color:#4a3728;">£${est.low.toLocaleString()} <span style="color:#aaa;font-weight:400;">—</span> £${est.high.toLocaleString()}</div>
  `;
}

/** Hide the price badge */
export function hidePriceBadge() {
  const badge = document.getElementById('priceBadge');
  if (badge) badge.style.display = 'none';
}

/**
 * Render full pricing breakdown for the BOM section.
 * Shows detailed cost table with all categories.
 */
export function renderPricingBreakdown(state, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const est = estimatePrice(state);
  if (!est) {
    container.innerHTML = '<p style="color:#888;padding:20px;">Price data not available. Ensure the price table is loaded.</p>';
    return;
  }

  const b = est.breakdown;
  const vatNote = priceTable?.vatMode === 'ex' ? 'All prices ex-VAT' : '';
  const marginPct = Math.round((1 - est.totalCost / est.target) * 100);

  container.innerHTML = `
    <div class="pricing-breakdown">
      <div class="pb-header">
        <h3 style="margin:0 0 4px;color:#4a3728;">💰 Full Pricing Breakdown</h3>
        <p style="margin:0;color:#888;font-size:0.85em;">${est.footprint_m2}m² footprint · ${est.isInsulated ? 'Insulated' : 'Basic'} · ${est.doors} door${est.doors !== 1 ? 's' : ''} · ${est.windows} window${est.windows !== 1 ? 's' : ''}${est.skylights ? ` · ${est.skylights} skylight${est.skylights !== 1 ? 's' : ''}` : ''}</p>
      </div>

      <div class="pb-section">
        <h4 style="margin:12px 0 8px;color:#6b4c2a;font-size:0.9em;text-transform:uppercase;letter-spacing:0.5px;">📦 Materials</h4>
        <table class="pb-table">
          <tr><td>Structural timber${est.gaugeLabel ? ` (${est.gaugeLabel})` : ''}</td><td class="pb-val">£${b.timber.toLocaleString()}</td></tr>
          <tr><td>Cladding</td><td class="pb-val">£${b.cladding.toLocaleString()}</td></tr>
          <tr><td>OSB sheathing</td><td class="pb-val">£${b.osb.toLocaleString()}</td></tr>
          ${b.insulation ? `<tr><td>Insulation (PIR)</td><td class="pb-val">£${b.insulation.toLocaleString()}</td></tr>` : ''}
          ${b.plyLining ? `<tr><td>${b.liningLabel || 'Ply lining'}</td><td class="pb-val">£${b.plyLining.toLocaleString()}</td></tr>` : ''}
          <tr><td>Roof covering</td><td class="pb-val">£${b.roofCovering.toLocaleString()}</td></tr>
          ${b.roofInsulation ? `<tr><td>Roof insulation (PIR)</td><td class="pb-val">£${b.roofInsulation.toLocaleString()}</td></tr>` : ''}
          ${b.roofPly ? `<tr><td>Roof interior plywood</td><td class="pb-val">£${b.roofPly.toLocaleString()}</td></tr>` : ''}
          ${b.roofComplexity ? `<tr><td>Roof complexity (${est.roofStyle})</td><td class="pb-val">£${b.roofComplexity.toLocaleString()}</td></tr>` : ''}
          <tr><td>Doors</td><td class="pb-val">£${b.doors.toLocaleString()}</td></tr>
          <tr><td>Windows</td><td class="pb-val">£${b.windows.toLocaleString()}</td></tr>
          ${b.skylights ? `<tr><td>Skylights</td><td class="pb-val">£${b.skylights.toLocaleString()}</td></tr>` : ''}
          ${b.shelving ? `<tr><td>Shelving (${est.shelvingArea_m2}m²)</td><td class="pb-val">£${b.shelving.toLocaleString()}</td></tr>` : ''}
          ${b.dividers ? `<tr><td>Internal dividers (${est.dividerCount})</td><td class="pb-val">£${b.dividers.toLocaleString()}</td></tr>` : ''}
          <tr><td>DPC membrane</td><td class="pb-val">£${b.dpc.toLocaleString()}</td></tr>
          <tr><td>Fixings (6%)</td><td class="pb-val">£${b.fixings.toLocaleString()}</td></tr>
          <tr><td>Delivery</td><td class="pb-val">£${b.delivery.toLocaleString()}</td></tr>
          <tr class="pb-subtotal"><td><strong>Materials Total</strong></td><td class="pb-val"><strong>£${est.totalMaterials.toLocaleString()}</strong></td></tr>
        </table>
      </div>

      <div class="pb-section">
        <h4 style="margin:12px 0 8px;color:#6b4c2a;font-size:0.9em;text-transform:uppercase;letter-spacing:0.5px;">👷 Labour</h4>
        <table class="pb-table">
          <tr><td>${est.labourDays} days × £${priceTable.labour.day_rate}/day</td><td class="pb-val">£${est.labourCost.toLocaleString()}</td></tr>
          <tr><td style="color:#888;font-size:0.85em;">${est.isInsulated ? '1.2' : '0.75'} days/m² · min ${priceTable.labour.min_days} days</td><td></td></tr>
        </table>
      </div>

      <div class="pb-section" style="background:#f5f0e8;border-radius:8px;padding:12px;margin-top:12px;">
        <table class="pb-table">
          <tr class="pb-total"><td><strong>Total Cost</strong></td><td class="pb-val"><strong>£${est.totalCost.toLocaleString()}</strong></td></tr>
        </table>
      </div>

      <div class="pb-section">
        <h4 style="margin:16px 0 8px;color:#6b4c2a;font-size:0.9em;text-transform:uppercase;letter-spacing:0.5px;">💷 Sell Price Range</h4>
        <table class="pb-table">
          <tr><td>Low (15% margin)</td><td class="pb-val">£${est.low.toLocaleString()}</td></tr>
          <tr><td>Target (25% margin)</td><td class="pb-val" style="color:#2D5016;font-weight:600;">£${est.target.toLocaleString()}</td></tr>
          <tr><td>High (35% margin)</td><td class="pb-val">£${est.high.toLocaleString()}</td></tr>
        </table>
      </div>

      <p style="color:#999;font-size:0.8em;margin-top:12px;">${vatNote}. Final price depends on site access, ground preparation, and fit-out level.</p>
    </div>
  `;

  // Inject table styles if not already present
  if (!document.getElementById('pbStyles')) {
    const style = document.createElement('style');
    style.id = 'pbStyles';
    style.textContent = `
      .pb-table { width:100%; border-collapse:collapse; font-size:0.9em; }
      .pb-table td { padding:4px 0; border-bottom:1px solid #f0ebe3; }
      .pb-val { text-align:right; font-variant-numeric:tabular-nums; }
      .pb-subtotal td { border-top:2px solid #d4c9b8; border-bottom:none; padding-top:8px; }
      .pb-total td { font-size:1.1em; border:none; }
    `;
    document.head.appendChild(style);
  }
}
