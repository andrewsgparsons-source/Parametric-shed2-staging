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
          "ins": true,
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
              "height_mm": 1850
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
      id: "preset.small_pent_shed",
      name: "Small Pent Shed 6ft × 8ft",
      category: "Small Sheds",
      description: "Compact pent roof shed with side door and shiplap cladding.",
      state: {
        "w": 1800,
        "d": 2400,
        "dimMode": "frame",
        "roof": {
          "style": "pent",
          "covering": "felt",
          "apex": {
            "heightToEaves_mm": 1850,
            "heightToCrest_mm": 2200,
            "trussCount": 3,
            "tieBeam": "eaves"
          },
          "pent": {
            "minHeight_mm": 2100,
            "maxHeight_mm": 2400
          },
          "hipped": {
            "heightToEaves_mm": 2500,
            "heightToCrest_mm": 3600
          }
        },
        "overhang": {
          "uniform_mm": 75
        },
        "walls": {
          "variant": "basic",
          "height_mm": 2400,
          "openings": [
            {
              "id": "door1",
              "wall": "right",
              "type": "door",
              "enabled": true,
              "x_mm": 250,
              "width_mm": 900,
              "height_mm": 1900,
              "handleSide": "right",
              "isOpen": true
            }
          ]
        },
        "cladding": {
          "style": "shiplap"
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
        "w": 4000,
        "d": 3000,
        "dimMode": "frame",
        "roof": {
          "style": "apex",
          "covering": "felt",
          "apex": {
            "heightToEaves_mm": 1900,
            "heightToCrest_mm": 2330,
            "trussCount": 3,
            "tieBeam": "raised"
          },
          "pent": {
            "minHeight_mm": 2300,
            "maxHeight_mm": 2500
          },
          "hipped": {
            "heightToEaves_mm": 2500,
            "heightToCrest_mm": 3600
          }
        },
        "overhang": {
          "uniform_mm": 75
        },
        "walls": {
          "variant": "insulated",
          "height_mm": 2400,
          "openings": [
            {
              "id": "door1",
              "wall": "front",
              "type": "door",
              "enabled": true,
              "x_mm": 1250,
              "width_mm": 1500,
              "height_mm": 1800,
              "style": "double-standard",
              "handleSide": "left",
              "isOpen": false
            },
            {
              "id": "win1",
              "wall": "left",
              "type": "window",
              "enabled": true,
              "x_mm": 400,
              "width_mm": 900,
              "height_mm": 600,
              "y_mm": 900
            },
            {
              "id": "win2",
              "wall": "left",
              "type": "window",
              "enabled": true,
              "x_mm": 1700,
              "width_mm": 900,
              "height_mm": 600,
              "y_mm": 900
            }
          ]
        },
        "cladding": {
          "style": "overlap"
        },
        "frame": {
          "thickness_mm": 50,
          "depth_mm": 75
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
    },
    {
      id: "preset.potting_shed",
      name: "Potting Shed 2m × 3.6m",
      category: "Garden",
      description: "Light-filled potting shed with three large windows and gentle pent roof.",
      state: {
        "w": 1800,
        "d": 2400,
        "vis": {
          "base": true,
          "frame": true,
          "ins": true,
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
          "frameW_mm": 2000,
          "frameD_mm": 3600
        },
        "overhang": {
          "uniform_mm": 75,
          "front_mm": null,
          "back_mm": null,
          "left_mm": null,
          "right_mm": 200
        },
        "dimInputs": {
          "baseW_mm": 1950,
          "baseD_mm": 3550,
          "frameW_mm": 2000,
          "frameD_mm": 3600,
          "roofW_mm": 2275,
          "roofD_mm": 3750
        },
        "roof": {
          "style": "pent",
          "apex": {
            "trussCount": 3,
            "heightToEaves_mm": 1850,
            "heightToCrest_mm": 2200
          },
          "pent": {
            "minHeight_mm": 2200,
            "maxHeight_mm": 2350
          }
        },
        "walls": {
          "variant": "basic",
          "height_mm": 2100,
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
              "x_mm": 800,
              "width_mm": 800,
              "height_mm": 1800
            },
            {
              "id": "win1",
              "wall": "right",
              "type": "window",
              "enabled": true,
              "x_mm": 200,
              "y_mm": 400,
              "width_mm": 1000,
              "height_mm": 1400
            },
            {
              "id": "win2",
              "wall": "right",
              "type": "window",
              "enabled": true,
              "x_mm": 1300,
              "y_mm": 400,
              "width_mm": 1000,
              "height_mm": 1400
            },
            {
              "id": "win3",
              "wall": "right",
              "type": "window",
              "enabled": true,
              "x_mm": 2400,
              "y_mm": 400,
              "width_mm": 1000,
              "height_mm": 1400
            }
          ],
          "invalidDoorIds": [],
          "invalidWindowIds": []
        },
        "frame": {
          "thickness_mm": 50,
          "depth_mm": 75
        },
        "cladding": {
          "style": "shiplap"
        },
        "sections": {
          "enabled": false,
          "main": {
            "id": "main",
            "type": "rectangular",
            "dimensions": null,
            "roof": null,
            "walls": null
          },
          "attachments": []
        },
        "dividers": {
          "items": []
        }
      }
    },
    {
      id: "preset.apex_garden_room",
      name: "Apex Insulated Garden Room 2.3m × 2.9m",
      category: "Garden Room",
      description: "Insulated apex garden room with felt roof, mortise & tenon door, front windows and side picture window.",
      state: {
        "w": 2340,
        "d": 2900,
        "vis": {
          "base": true,
          "frame": true,
          "ins": true,
          "deck": true,
          "wallsEnabled": true,
          "walls": {
            "front": true,
            "back": true,
            "left": true,
            "right": true
          },
          "wallIns": true,
          "wallPly": true,
          "cladding": true,
          "roof": true,
          "roofParts": {
            "ply": false,
            "insulation": false,
            "membraneBattens": false,
            "structure": true,
            "osb": true,
            "covering": true
          }
        },
        "dimMode": "frame",
        "dimGap_mm": 50,
        "dim": {
          "frameW_mm": 2340,
          "frameD_mm": 2891
        },
        "overhang": {
          "uniform_mm": 75,
          "front_mm": null,
          "back_mm": null,
          "left_mm": null,
          "right_mm": null
        },
        "dimInputs": {
          "baseW_mm": 2290,
          "baseD_mm": 2841,
          "frameW_mm": 2340,
          "frameD_mm": 2891,
          "roofW_mm": 2490,
          "roofD_mm": 3041
        },
        "roof": {
          "style": "apex",
          "covering": "felt",
          "apex": {
            "trussCount": 4,
            "heightToEaves_mm": 2080,
            "heightToCrest_mm": 2400,
            "tieBeam": "raised"
          },
          "pent": {
            "minHeight_mm": 2400,
            "maxHeight_mm": 2400
          },
          "hipped": {
            "heightToEaves_mm": 2500,
            "heightToCrest_mm": 3600
          }
        },
        "walls": {
          "variant": "insulated",
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
              "x_mm": 730,
              "width_mm": 880,
              "height_mm": 1900,
              "style": "mortise-tenon",
              "isOpen": false
            },
            {
              "id": "win1",
              "wall": "front",
              "type": "window",
              "enabled": true,
              "x_mm": 250,
              "y_mm": 750,
              "width_mm": 350,
              "height_mm": 1080
            },
            {
              "id": "win2",
              "wall": "front",
              "type": "window",
              "enabled": true,
              "x_mm": 1740,
              "y_mm": 750,
              "width_mm": 350,
              "height_mm": 1080
            },
            {
              "id": "win3",
              "wall": "left",
              "type": "window",
              "enabled": true,
              "x_mm": 890,
              "y_mm": 860,
              "width_mm": 1120,
              "height_mm": 1000
            }
          ],
          "invalidDoorIds": [],
          "invalidWindowIds": []
        },
        "frame": {
          "thickness_mm": 50,
          "depth_mm": 75
        },
        "cladding": {
          "style": "shiplap"
        },
        "sections": {
          "enabled": false,
          "main": {
            "id": "main",
            "type": "rectangular",
            "dimensions": null,
            "roof": null,
            "walls": null
          },
          "attachments": []
        },
        "dividers": {
          "items": []
        },
        "unitMode": "imperial",
        "wallSection": {
          "thickness_mm": 50,
          "depth_mm": 50
        }
      }
    },
    {
      id: "preset.hipped_garage",
      name: "Hipped Garage 3.4m × 5m",
      category: "Garage",
      description: "Large hipped roof garage with 2.4m double mortise & tenon doors.",
      state: {
        "w": 4000,
        "d": 5000,
        "vis": {
          "base": true,
          "frame": true,
          "ins": true,
          "deck": true,
          "wallsEnabled": true,
          "walls": {
            "front": true,
            "back": true,
            "left": true,
            "right": true
          },
          "wallIns": false,
          "wallPly": false,
          "cladding": true,
          "roof": true,
          "roofParts": {
            "ply": false,
            "insulation": false,
            "membraneBattens": false
          }
        },
        "dimMode": "frame",
        "dimGap_mm": 50,
        "dim": { "frameW_mm": 3400, "frameD_mm": 5000 },
        "overhang": {
          "uniform_mm": 300,
          "front_mm": null,
          "back_mm": null,
          "left_mm": null,
          "right_mm": null
        },
        "dimInputs": {
          "baseW_mm": 3350,
          "baseD_mm": 4950,
          "frameW_mm": 3400,
          "frameD_mm": 5000,
          "roofW_mm": 4000,
          "roofD_mm": 5600
        },
        "roof": {
          "style": "hipped",
          "covering": "slate",
          "apex": {
            "trussCount": 3,
            "heightToEaves_mm": 1850,
            "heightToCrest_mm": 2200,
            "tieBeam": "eaves"
          },
          "pent": {
            "minHeight_mm": 2400,
            "maxHeight_mm": 2500
          },
          "hipped": {
            "heightToEaves_mm": 2262,
            "heightToCrest_mm": 3430
          }
        },
        "walls": {
          "variant": "insulated",
          "height_mm": 2400,
          "insulated": {
            "section": { "w": 50, "h": 100 },
            "spacing": 400
          },
          "basic": {
            "section": { "w": 50, "h": 100 },
            "spacing": null
          },
          "openings": [
            {
              "id": "door1",
              "wall": "front",
              "type": "door",
              "enabled": true,
              "x_mm": 550,
              "width_mm": 2300,
              "height_mm": 1850,
              "style": "double-mortise-tenon",
              "isOpen": true
            }
          ],
          "invalidDoorIds": [],
          "invalidWindowIds": []
        },
        "frame": {
          "thickness_mm": 50,
          "depth_mm": 100
        },
        "cladding": {
          "style": "overlap"
        },
        "sections": {
          "enabled": false,
          "main": {
            "id": "main",
            "type": "rectangular",
            "dimensions": null,
            "roof": null,
            "walls": null
          },
          "attachments": []
        },
        "dividers": {
          "items": []
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
