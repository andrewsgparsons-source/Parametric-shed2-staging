# Parametric Shed Configurator

A 3D parametric building configurator for timber-framed garden buildings, built with [Babylon.js](https://www.babylonjs.com/) and CSG (Constructive Solid Geometry).

Design sheds, workshops, and outbuildings in the browser — adjust dimensions, add doors and windows, choose roof styles, and generate a full cutting list.

<!-- TODO: Add screenshot or GIF here -->
<!-- ![Configurator Screenshot](docs/assets/screenshot.png) -->

## 🔗 Live Demo

**[Try it here →](https://andrewsgparsons-source.github.io/Parametric-shed2/?profile=admin)**

## ✨ Features

### Building Design
- **Flexible dimensions** — Width and depth from 1m to 8m (with sensible constraints for timber framing)
- **Two roof styles** — Apex (gabled) or pent (lean-to)
- **Doors & windows** — Place openings on any wall, adjust sizes and positions
- **Internal dividers** — Partition the space with optional door openings
- **Building attachments** — Add lean-to sections on any side (pent roofs only)

### Materials & Appearance
- Realistic timber frame construction with proper studs, headers, and cripple studs
- OSB sheathing and external cladding options
- Textured materials with woodgrain finish

### Output
- **Bill of Materials (BOM)** — Full cutting list with quantities and dimensions
- **Shareable URLs** — Save your design in the URL to share or bookmark
- **Multiple profiles** — Admin (full control), Customer (simplified), Viewer (read-only)

### Technical
- Pure vanilla JavaScript — no build step required
- ES modules for clean code organisation
- CSG operations for accurate geometry (window/door cutouts, etc.)

## 🚀 Getting Started

### Quick Start (No Install)

Just open `docs/index.html` in a browser. The app runs entirely client-side.

For local development with live reload:

```bash
# Clone the repo
git clone https://github.com/andrewsgparsons-source/Parametric-shed2.git
cd Parametric-shed2

# Serve locally (any static server works)
npx serve docs
# or
python -m http.server 8000 --directory docs
```

Then open `http://localhost:8000` (or `http://localhost:3000` for serve).

### Profiles

Add `?profile=<name>` to the URL to switch interface modes:

| Profile | Use Case |
|---------|----------|
| `admin` | Full access to all controls (default) |
| `customer` | Simplified view for end users — basic dimensions and openings |
| `viewer` | Read-only — for sharing completed designs |

## 📁 Project Structure

```
docs/
├── index.html          # Main application entry point
├── styles.css          # Global styles
├── profiles.json       # Profile definitions (UI customisation)
├── instances.js        # Preset building configurations
├── assets/             # Textures and images
└── src/
    ├── index.js        # App initialisation and main logic
    ├── state.js        # State management
    ├── params.js       # Defaults, config, and dimension helpers
    ├── views.js        # Camera view presets
    ├── sections.js     # Multi-section (attachments) logic
    ├── profiles.js     # Profile system
    ├── profile-editor.js
    ├── renderer/
    │   └── babylon.js  # Babylon.js setup and utilities
    ├── elements/       # 3D building components
    │   ├── base.js     # Floor/foundation
    │   ├── walls.js    # Wall framing and cladding
    │   ├── roof.js     # Apex and pent roofs
    │   ├── doors.js    # Door openings and frames
    │   ├── windows.js  # Window openings and frames
    │   ├── dividers.js # Internal partition walls
    │   └── attachments.js
    ├── bom/            # Bill of Materials generation
    │   ├── index.js
    │   └── base.js
    └── ui/
        └── panel-resize.js
```

## 🏗️ Architecture

### Coordinate System
- **X** = Width (left–right)
- **Y** = Height (up)
- **Z** = Depth (front–back)

All dimensions are in millimetres internally.

### State Management

The app uses a simple reactive state store. Changes to state trigger a rebuild of the 3D model:

```javascript
store.get()           // Current state
store.set(newState)   // Replace state
store.patch({ ... })  // Partial update
store.subscribe(fn)   // React to changes
```

### CSG Operations

Doors, windows, and other openings use CSG subtraction to cut accurate holes in walls and panels. This ensures the geometry is correct for both visualisation and cutting list calculations.

## 🤝 Contributing

Contributions welcome! Whether it's bug fixes, new features, or documentation improvements.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a PR

### Development Notes

- The `clawdbot-experiments` branch is used for AI-assisted development
- Keep diagnostic `console.log` statements to a minimum in PRs
- Test across different building configurations before submitting

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

Built for designing real garden buildings. If you use this to plan a shed, I'd love to see it! 🏠
