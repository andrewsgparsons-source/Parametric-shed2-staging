// FILE: docs/src/bom/attachments.js
// BOM (Bill of Materials) for attached buildings
// Appends material summaries to existing BOM pages (base, walls, roof)

/**
 * Update BOM tables with attachment materials.
 * Called after main building BOM updates.
 * @param {object} state - Full application state
 */
export function updateAttachmentBOM(state) {
  const attachments = state?.sections?.attachments || [];
  const enabledAtts = attachments.filter(a => a && a.enabled !== false);

  // Clear previous attachment BOM sections
  clearAttachmentBOM();

  if (enabledAtts.length === 0) return;

  const mainWallHeight_mm = state?.walls?.height_mm || 2200;
  const mainVariant = state?.walls?.variant || 'basic';
  const SHEET_W = 1220;
  const SHEET_L = 2440;
  const JOIST_SPACING = 400;
  const STUD_SPACING = 400;
  const RAFTER_SPACING = 600;

  for (let i = 0; i < enabledAtts.length; i++) {
    const att = enabledAtts[i];
    const label = `Attachment ${i + 1} (${att.attachTo?.wall || 'left'})`;
    const w_mm = att.dimensions?.width_mm || 1800;
    const d_mm = att.dimensions?.depth_mm || 1200;
    const wallH_mm = att.walls?.height_mm || mainWallHeight_mm;
    const variant = att.walls?.variant || mainVariant;
    const isInsulated = variant === 'insulated';
    const studDepth = isInsulated ? 100 : 75;

    // ─── BASE BOM ───
    const baseItems = [];

    // Rim joists (3 sides — shared wall uses main building's rim)
    // 2 × depth joists (sides) + 1 × width joist (outer)
    baseItems.push(['Rim Joist (side)', 2, `${d_mm}mm`, `50×100 section`]);
    baseItems.push(['Rim Joist (outer)', 1, `${w_mm}mm`, `50×100 section`]);

    // Inner joists
    const innerJoistCount = Math.max(0, Math.ceil(w_mm / JOIST_SPACING) - 1);
    if (innerJoistCount > 0) {
      baseItems.push(['Inner Joist', innerJoistCount, `${d_mm}mm`, `50×100 section`]);
    }

    // OSB decking sheets
    const footprint_m2 = (w_mm * d_mm) / 1_000_000;
    const sheetArea = (SHEET_W * SHEET_L) / 1_000_000;
    const osbSheets = Math.ceil(footprint_m2 / sheetArea);
    baseItems.push(['OSB 18mm Sheet', osbSheets, `${SHEET_L}×${SHEET_W}mm`, 'Floor decking']);

    // Plastic grids
    const gridCount = Math.ceil(footprint_m2 * 4); // 4 per m² (0.5×0.5m)
    baseItems.push(['Plastic Grid Tile', gridCount, '500×500mm', 'Ground support']);

    appendBOMSection('bomPage', label + ' — Base', baseItems,
      ['Item', 'Qty', 'Size', 'Notes']);

    // ─── WALLS BOM ───
    const wallItems = [];

    // 3 walls: outer (width), left side (depth), right side (depth)
    // Bottom + top plates for each wall
    wallItems.push(['Bottom Plate (outer)', 1, `${w_mm}mm`, `50×${studDepth} section`]);
    wallItems.push(['Top Plate (outer)', 1, `${w_mm}mm`, `50×${studDepth} section`]);
    wallItems.push(['Bottom Plate (side)', 2, `${d_mm}mm`, `50×${studDepth} section`]);
    wallItems.push(['Top Plate (side)', 2, `${d_mm}mm`, `50×${studDepth} section`]);

    // Studs per wall
    const outerStuds = Math.ceil(w_mm / STUD_SPACING) + 1;
    const sideStuds = Math.ceil(d_mm / STUD_SPACING) + 1;
    const studLen_mm = wallH_mm - (2 * 50); // minus top & bottom plate height
    wallItems.push(['Stud (outer wall)', outerStuds, `${studLen_mm}mm`, `50×${studDepth} section`]);
    wallItems.push(['Stud (side wall)', sideStuds * 2, `${studLen_mm}mm`, `50×${studDepth} section, ×2 walls`]);

    // Cladding area estimate
    const outerWallArea = (w_mm / 1000) * (wallH_mm / 1000);
    const sideWallArea = (d_mm / 1000) * (wallH_mm / 1000);
    const totalCladArea = (outerWallArea + 2 * sideWallArea).toFixed(2);
    wallItems.push(['Cladding area', '', `${totalCladArea} m²`, '3 walls (shared wall excluded)']);

    if (isInsulated) {
      // PIR insulation sheets (walls)
      const wallArea_m2 = outerWallArea + 2 * sideWallArea;
      const pirSheets = Math.ceil(wallArea_m2 / sheetArea);
      wallItems.push(['PIR 50mm Sheet (walls)', pirSheets, `${SHEET_L}×${SHEET_W}mm`, 'Wall cavity insulation']);
      // Plywood lining
      const plySheets = Math.ceil(wallArea_m2 / sheetArea);
      wallItems.push(['Plywood 12mm Sheet (walls)', plySheets, `${SHEET_L}×${SHEET_W}mm`, 'Internal wall lining']);
    }

    appendBOMSection('wallsBomPage', label + ' — Walls', wallItems,
      ['Item', 'Qty', 'Size', 'Notes']);

    // ─── ROOF BOM ───
    const roofItems = [];
    const roofType = att.roof?.type || 'pent';

    if (roofType === 'pent') {
      // Pent roof: rafters run from main building outward (depth direction)
      const rafterCount = Math.ceil(w_mm / RAFTER_SPACING) + 1;
      const slopeFactor = 1.05; // slight pitch
      const rafterLen_mm = Math.round(d_mm * slopeFactor);
      roofItems.push(['Rafter', rafterCount, `${rafterLen_mm}mm`, `100×50 section, ${RAFTER_SPACING}mm centres`]);
    } else if (roofType === 'apex') {
      // Apex: ridge + paired rafters
      roofItems.push(['Ridge Board', 1, `${w_mm}mm`, '100×50 section']);
      const rafterCount = Math.ceil(w_mm / RAFTER_SPACING) + 1;
      const halfSpan = d_mm / 2;
      const rafterLen_mm = Math.round(halfSpan * 1.12);
      roofItems.push(['Rafter (pair)', rafterCount * 2, `${rafterLen_mm}mm`, `100×50 section`]);
    }

    // Roof OSB
    const roofArea_m2 = footprint_m2 * (roofType === 'apex' ? 1.12 : 1.05);
    const roofOsbSheets = Math.ceil(roofArea_m2 / sheetArea) + 1; // +1 waste
    roofItems.push(['OSB 18mm Sheet (roof)', roofOsbSheets, `${SHEET_L}×${SHEET_W}mm`, 'Roof sheathing (+1 waste)']);

    // Roof covering
    const covering = state?.roof?.covering || 'felt';
    roofItems.push(['Roof Covering', '', `${roofArea_m2.toFixed(2)} m²`, covering === 'epdm' ? 'EPDM membrane' : 'Felt']);

    // Fascia
    roofItems.push(['Fascia Board', 1, `${w_mm}mm`, '135×20mm, outer edge']);
    if (roofType === 'pent') {
      roofItems.push(['Barge Board (side)', 2, `${Math.round(d_mm * 1.05)}mm`, '135×20mm']);
    }

    appendBOMSection('roofBomPage', label + ' — Roof', roofItems,
      ['Item', 'Qty', 'Size', 'Notes']);

    // ─── OPENINGS BOM ───
    const attOpenings = att.walls?.openings || [];
    const enabledOpenings = attOpenings.filter(o => o && o.enabled !== false);
    if (enabledOpenings.length > 0) {
      const openingItems = [];
      for (const op of enabledOpenings) {
        const type = op.type || 'door';
        const w = op.width_mm || (type === 'door' ? 762 : 600);
        const h = type === 'door' ? (wallH_mm - 100) : 600; // rough
        openingItems.push([
          type === 'door' ? 'Door Frame' : 'Window Frame',
          1, `${w}×${h}mm`, `DGU + hardware + timber frame`
        ]);
      }
      appendBOMSection('openingsBomPage', label + ' — Openings', openingItems,
        ['Item', 'Qty', 'Size', 'Notes']);
    }
  }
}

/**
 * Clear all previously appended attachment BOM sections
 */
function clearAttachmentBOM() {
  document.querySelectorAll('.att-bom-section').forEach(el => el.remove());
}

/**
 * Append a BOM section to an existing BOM page
 */
function appendBOMSection(pageId, title, rows, headers) {
  const page = document.getElementById(pageId);
  if (!page) return;

  const section = document.createElement('div');
  section.className = 'schedule-section att-bom-section';
  section.style.marginTop = '24px';
  section.style.borderTop = '2px solid #4CAF50';
  section.style.paddingTop = '12px';

  const h4 = document.createElement('h4');
  h4.textContent = title;
  h4.style.color = '#2E7D32';
  section.appendChild(h4);

  const table = document.createElement('table');
  table.className = 'sticky-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell !== undefined && cell !== null ? String(cell) : '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);
  page.appendChild(section);
}
