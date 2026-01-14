// FILE: docs/instances.js
//
// Built-in, repo-shipped presets (read-only).
// These provide starting points for common shed configurations.
//
// HOW TO ADD A NEW PRESET:
// 1. In the app, configure your shed as desired
// 2. Open Developer Tools > enable Dev Mode checkbox
// 3. Click "Copy State to Clipboard"
// 4. Paste the JSON into the state: {} section below
// 5. Give it a unique id, name, category, and description
//
export function getBuiltInPresets() {
  return [
    {
      id: "preset.default",
      name: "Default - Small Apex 1.8m × 2.4m",
      category: "Default",
      description: "Default starting configuration with door and window.",
      state: {
        "w": 1800,
        "d": 2400,
        "vis": {
          "base": true,
          "frame": true,
          "ins": false,
          "deck": true,
          "wallsEnabled": true,
          "walls": {
            "front": true,
            "back": true,
            "left": true,
            "right": true
          },
          "cladding": true,
          "roof": true
        },
        "dimMode": "frame",
        "dimGap_mm": 50,
        "dim": {
          "frameW_mm": 1800,
          "frameD_mm": 2400
        },
        "overhang": {
          "uniform_mm": 75,
          "front_mm": null,
          "back_mm": null,
          "left_mm": null,
          "right_mm": null
        },
        "dimInputs": {
          "baseW_mm": 1750,
          "baseD_mm": 2350,
          "frameW_mm": 1800,
          "frameD_mm": 2400,
          "roofW_mm": 1950,
          "roofD_mm": 2550
        },
        "roof": {
          "style": "apex",
          "apex": {
            "trussCount": 3,
            "heightToEaves_mm": 1850,
            "heightToCrest_mm": 2200
          },
          "pent": {
            "minHeight_mm": 2400,
            "maxHeight_mm": 2400
          }
        },
        "walls": {
          "variant": "basic",
          "height_mm": 2400,
          "insulated": {
            "section": {
              "w": 50,
              "h": 75
            },
            "spacing": 400
          },
          "basic": {
            "section": {
              "w": 50,
              "h": 75
            },
            "spacing": null
          },
          "openings": [
            {
              "id": "door1",
              "wall": "front",
              "type": "door",
              "enabled": true,
              "x_mm": 500,
              "width_mm": 800,
              "height_mm": 1900
            },
            {
              "id": "win1",
              "wall": "left",
              "type": "window",
              "enabled": true,
              "x_mm": 800,
              "y_mm": 1050,
              "width_mm": 600,
              "height_mm": 400
            }
          ],
          "invalidDoorIds": [],
          "invalidWindowIds": []
        },
        "frame": {
          "thickness_mm": 50,
          "depth_mm": 75
        }
      }
    },
    {
      id: "preset.small_shed",
      name: "Small Shed 2.4m × 1.8m",
      category: "Garden Shed",
      description: "Compact garden storage shed with single door.",
      state: {
        dimMode: "frame",
        dim: { frameW_mm: 2400, frameD_mm: 1800 },
        roof: { style: "apex" },
        walls: {
          height_mm: 2400,
          variant: "basic",
          openings: [
            {
              id: "door1",
              wall: "front",
              type: "door",
              enabled: true,
              x_mm: 750,
              width_mm: 900,
              height_mm: 2000
            }
          ]
        }
      }
    },
    {
      id: "preset.medium_shed",
      name: "Medium Shed 3m × 2.4m",
      category: "Garden Shed",
      description: "Standard garden shed with door and window.",
      state: {
        dimMode: "frame",
        dim: { frameW_mm: 3000, frameD_mm: 2400 },
        roof: { style: "apex" },
        walls: {
          height_mm: 2400,
          variant: "insulated",
          openings: [
            {
              id: "door1",
              wall: "front",
              type: "door",
              enabled: true,
              x_mm: 200,
              width_mm: 900,
              height_mm: 2000
            },
            {
              id: "win1",
              wall: "front",
              type: "window",
              enabled: true,
              x_mm: 1800,
              y_mm: 900,
              width_mm: 900,
              height_mm: 600
            }
          ]
        }
      }
    },
    {
      id: "preset.large_workshop",
      name: "Large Workshop 4m × 3m",
      category: "Workshop",
      description: "Spacious workshop with double windows for light.",
      state: {
        dimMode: "frame",
        dim: { frameW_mm: 4000, frameD_mm: 3000 },
        roof: { style: "apex" },
        walls: {
          height_mm: 2400,
          variant: "insulated",
          openings: [
            {
              id: "door1",
              wall: "front",
              type: "door",
              enabled: true,
              x_mm: 200,
              width_mm: 900,
              height_mm: 2000
            },
            {
              id: "win1",
              wall: "left",
              type: "window",
              enabled: true,
              x_mm: 400,
              y_mm: 900,
              width_mm: 900,
              height_mm: 600
            },
            {
              id: "win2",
              wall: "left",
              type: "window",
              enabled: true,
              x_mm: 1700,
              y_mm: 900,
              width_mm: 900,
              height_mm: 600
            }
          ]
        }
      }
    },
    {
      id: "preset.pent_lean_to",
      name: "Pent Lean-to 2.4m × 1.8m",
      category: "Lean-to",
      description: "Simple pent roof lean-to storage.",
      state: {
        dimMode: "frame",
        dim: { frameW_mm: 2400, frameD_mm: 1800 },
        roof: {
          style: "pent",
          pent: { minHeight_mm: 2100, maxHeight_mm: 2400 }
        },
        walls: {
          height_mm: 2400,
          variant: "basic",
          openings: [
            {
              id: "door1",
              wall: "front",
              type: "door",
              enabled: true,
              x_mm: 750,
              width_mm: 900,
              height_mm: 1900
            }
          ]
        }
      }
    }
  ];
}
export function getDefaultBuiltInPresetId() {
  return "preset.default";
}
export function findBuiltInPresetById(id) {
  var list = [];
  try { list = getBuiltInPresets() || []; } catch (e) { list = []; }
  var want = String(id || "");
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (p && String(p.id || "") === want) return p;
  }
  return null;
}
