# UI Redesign Spec — Dashboard-Style Configurator

**Architecture:** Option B — Detachable Panels (BroadcastChannel sync)
**Status:** Speccing
**Goal:** g11 in OpenClaw dashboard

---

## Architecture

Single-window by default. "Pop out" button detaches controls to a second window for dual-monitor setups. Sync via BroadcastChannel API.

```
Default (single screen):
┌──────────┬─────────────────────┐
│ Category │                     │
│ sidebar  │    3D Viewport      │
│          │                     │
│          ├─────────────────────┤
│          │  Sub-controls for   │
│          │  selected category  │
└──────────┴─────────────────────┘

Dual-monitor (popped out):
Window 1:                Window 2:
┌──────────────────┐    ┌──────────────────┐
│                  │    │ Category sidebar  │
│  Full 3D         │◄──►│ Sub-controls     │
│  Viewport        │sync│ Config map/tree  │
│                  │    │ Preview thumb    │
└──────────────────┘    └──────────────────┘

Mobile:
┌──────────────────┐
│  [3D] [Controls] │  ← tab switching
│                  │
│  Full-screen     │
│  whichever is    │
│  active          │
└──────────────────┘
```

---

## Left Sidebar Categories (in order)

| # | Category | What's in it |
|---|----------|-------------|
| 1 | **Size and Style** | Width, depth, building style (apex, hipped, pent, lean-to), base dimensions |
| 2 | **Walls and Openings** | Wall sections, doors (single/double/barn), windows, positions, sizes |
| 3 | **Roof and Building Height** | Eaves height, crest height, roof pitch, overhang, roof material |
| 4 | **Appearance** | Cladding type/colour, trim, paint, textures, material finishes |
| 5 | **Attached Buildings** | Attachment grids, log stores, side extensions |
| 6 | **Visibility Options** | Show/hide walls, roof, floor, framing, dimensions, labels |
| 7 | **Save and Load** | Export config, import config, share link, presets |
| 8 | **Developer** | Debug info, camera controls, console, state inspector |

---

## Config Map / Navigation Tree

Hybrid approach: tree/sitemap structure with visual progress indication.

```
◆ Size and Style ────────── ████████░░ 80%
  ├─ Width ✓
  ├─ Depth ✓  
  ├─ Style ✓
  └─ Base ◔ (partially set)

◈ Walls and Openings ────── ██░░░░░░░░ 20%
  ├─ Front wall ✓
  ├─ Back wall ○
  ├─ Left wall ○
  └─ Right wall ○

◈ Roof and Building Height ██████████ 100% ✓
  ...
```

- Shows where you are in the process
- Shows completion per section
- Clickable to jump to any section
- Checkmarks for fully configured sections
- Partial indicators for sections with defaults vs explicit choices

---

## Responsive Layouts

### Dual Monitor (≥2 screens)
- Pop-out button in controls header
- Opens controls in new window at preferred size
- Main window goes full 3D viewport
- BroadcastChannel syncs state bidirectionally
- Handle "other window closed" — controls snap back inline

### Single Screen (desktop)
- 50/50 or 60/40 split (3D viewport : controls)
- Resizable divider between panels
- TBD: left/right or top/bottom (test both)

### Mobile (< 768px)
- Tab switching: [3D View] [Configure] buttons at top
- Full-screen for whichever is active
- Config map acts as quick nav between sections
- Large touch targets, minimum 44px tap areas

---

## Accessibility

- Minimum font size 14px for controls
- High contrast mode option
- All controls keyboard-navigable
- ARIA labels on interactive elements
- Config map readable at arm's length (for poor eyesight)

---

## Technical Notes

### BroadcastChannel Sync Protocol
```javascript
// Both windows join the same channel
const channel = new BroadcastChannel('shed-configurator');

// Send state changes
channel.postMessage({
  type: 'state-update',
  payload: { width: 3000, depth: 4000, ... }
});

// Receive state changes
channel.onmessage = (e) => {
  if (e.data.type === 'state-update') {
    applyState(e.data.payload);
  }
};
```

### Migration Path
1. **Phase 1:** Reskin current controls into sidebar layout (same JS, new CSS)
2. **Phase 2:** Add BroadcastChannel sync + pop-out capability
3. **Phase 3:** Config map / tree navigation
4. **Phase 4:** Mobile-optimised responsive layouts
5. **Phase 5:** Accessibility audit and polish

---

*Spec created: 2026-02-08*
*Based on Andrew's direction + Option B architecture*
