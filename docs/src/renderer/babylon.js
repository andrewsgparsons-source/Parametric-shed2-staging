// FILE: docs/src/renderer/babylon.js

export function mkMat(scene, name, color3, alpha = 1) {
  const mat = new BABYLON.StandardMaterial(name, scene);
  mat.diffuseColor = color3;
  mat.alpha = alpha;
  mat.specularColor = new BABYLON.Color3(0, 0, 0);
  return mat;
}

export function disposeAll(scene) {
  // Dispose meshes created in previous renders for dynamic geometry.
  // Keep materials (false) so shared textures persist across rebuilds.
  const toDispose = scene.meshes.filter(m => m.metadata && m.metadata.dynamic === true);
  toDispose.forEach(m => { if (!m.isDisposed()) m.dispose(false, false); });
}

export function boot(canvas) {
  const engine = new BABYLON.Engine(canvas, true);
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.96, 0.97, 0.98, 1);

  // DEV-ONLY: Babylon Inspector toggle via URL flag (?inspector=1)
  // Remove this block in one step after debugging.
  try {
    const qs = new URLSearchParams(String(window.location && window.location.search || ""));
    if (qs.get("inspector") === "1") {
      if (scene.debugLayer && scene.debugLayer.show) {
        scene.debugLayer.show({ embedMode: true });
      } else {
        console.warn("Inspector requested (?inspector=1) but scene.debugLayer is unavailable (inspector bundle not loaded).");
      }
    }
  } catch (e) {}

  const camera = new BABYLON.ArcRotateCamera(
    'cam',
    -Math.PI / 4,
    Math.PI / 3,
    8,
    new BABYLON.Vector3(1.5, 0, 2),
    scene
  );
  camera.attachControl(canvas, true);

  // Slower, smoother zoom (reference values), plus rails
  if (camera.wheelDeltaPercentage !== undefined) {
    camera.wheelDeltaPercentage = 0.008;  // Desktop scroll - feels good
    camera.pinchDeltaPercentage = 0.0008; // Mobile pinch - much slower (was 0.002)
  } else {
    camera.wheelPrecision = Math.max(200, camera.wheelPrecision || 100);
    camera.pinchPrecision = Math.max(600, camera.pinchPrecision || 100); // Higher = slower/finer pinch
  }
  camera.inertia = 0.85;
  camera.lowerRadiusLimit = 2;    // Don't let user zoom inside the model
  camera.upperRadiusLimit = 50;   // Don't let user zoom too far out
  
  // Better touch controls - higher values = slower/less sensitive
  camera.panningSensibility = 600;      // Slower panning for mobile (was 400)
  camera.angularSensibilityX = 3000;    // Slower rotation for mobile (was 2000)
  camera.angularSensibilityY = 3000;

  new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);

const materials = {
    timber: mkMat(scene, 'timber', new BABYLON.Color3(0.72, 0.50, 0.28)),
    plate:  mkMat(scene, 'plate',  new BABYLON.Color3(0.65, 0.45, 0.25)),
    base:   mkMat(scene, 'base',   new BABYLON.Color3(0.2, 0.2, 0.2)),
    guide:  mkMat(scene, 'guide',  new BABYLON.Color3(0.7, 0.7, 0.7), 0.5),
  };

// Shared exterior wood materials (cladding, doors, fascia, corners)
  var exteriorWoodColor = new BABYLON.Color3(0.85, 0.64, 0.42);
  
function createExteriorWoodMat(name) {
    var m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = exteriorWoodColor;
    m.emissiveColor = exteriorWoodColor.scale(0.15); // Adds subtle self-illumination
    m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    m.specularPower = 8;
    return m;
  }
  
  scene._claddingMat = createExteriorWoodMat("claddingMat");
  scene._claddingMatLight = createExteriorWoodMat("claddingMatLight");

  // ---- Budget range: steel cladding materials (metallic) ----
  function createSteelCladdingMat(name, baseColor) {
    var m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = baseColor;
    m.emissiveColor = baseColor.scale(0.08);
    m.specularColor = new BABYLON.Color3(0.35, 0.35, 0.35);
    m.specularPower = 32;
    return m;
  }
  // Colour keyed materials — populated on first use via getCladdingMaterial()
  scene._steelCladdingMats = {};
  scene._compositeCladdingMats = {};

  // Budget cladding colour palette
  var BUDGET_COLOURS = {
    "pale-blue":       new BABYLON.Color3(0.482, 0.655, 0.737),   // #7BA7BC
    "sage-green":      new BABYLON.Color3(0.357, 0.482, 0.369),   // #5B7B5E
    "anthracite":      new BABYLON.Color3(0.220, 0.243, 0.259),   // #383E42
    "goosewing-grey":  new BABYLON.Color3(0.616, 0.643, 0.659),   // #9DA4A8
    "vandyke-brown":   new BABYLON.Color3(0.353, 0.239, 0.169),   // #5A3D2B
    "charcoal":        new BABYLON.Color3(0.200, 0.200, 0.200),
    "stone-grey":      new BABYLON.Color3(0.600, 0.580, 0.540),
    "natural-wood":    null  // Uses existing exteriorWoodColor
  };
  scene._budgetColours = BUDGET_COLOURS;

  /** Get or create a material for cladding style + colour */
  scene.getCladdingMaterial = function(style, colourKey) {
    // Default / timber styles use the existing wood material
    if (!colourKey || colourKey === "natural-wood" || style === "shiplap" || style === "overlap" || style === "loglap") {
      return scene._claddingMat;
    }
    var isSteel = (style === "box-profile" || style === "corrugated");
    var cache = isSteel ? scene._steelCladdingMats : scene._compositeCladdingMats;
    var key = style + "_" + colourKey;
    if (cache[key]) return cache[key];

    var baseColor = BUDGET_COLOURS[colourKey];
    if (!baseColor) return scene._claddingMat;

    var mat;
    if (isSteel) {
      mat = createSteelCladdingMat(key, baseColor);
    } else {
      // Composite: matte finish
      mat = new BABYLON.StandardMaterial(key, scene);
      mat.diffuseColor = baseColor;
      mat.emissiveColor = baseColor.scale(0.10);
      mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
      mat.specularPower = 4;
    }
    cache[key] = mat;
    return mat;
  };

  scene._doorMat = createExteriorWoodMat("doorMat");
  scene._fasciaMat = createExteriorWoodMat("fasciaMat");
  scene._cornerMat = createExteriorWoodMat("cornerMat");

  // Galvanised grey material for budget trim (fascia, barge boards, corner flashings)
  var galvMat = new BABYLON.StandardMaterial("galvanisedGreyMat", scene);
  galvMat.diffuseColor = new BABYLON.Color3(0.65, 0.67, 0.68);   // light industrial grey
  galvMat.emissiveColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  galvMat.specularColor = new BABYLON.Color3(0.35, 0.35, 0.35);  // moderate metallic sheen
  galvMat.specularPower = 24;
  scene._galvanisedGreyMat = galvMat;

  // Cladding diagnostic v0.1: one-time post-first-render scan (no geometry changes)
  let __cladScanOnce = false;

  engine.runRenderLoop(() => {
    scene.render();

    if (!__cladScanOnce) {
      __cladScanOnce = true;

      try {
        window.__dbg = window.__dbg || {};
        window.__dbg.__cladScanDone = true;
        window.__dbg.cladMeshNames = scene.meshes
          .filter(m => m && !m.isDisposed() && typeof m.name === "string" &&
            (m.name.startsWith("clad-") || m.name.includes("clad") || m.name.includes("-c"))
          )
          .map(m => ({
            name: m.name,
            parent: m.parent ? m.parent.name : null,
            minY_mm: m.getBoundingInfo ? (m.getBoundingInfo().boundingBox.minimumWorld.y * 1000) : null,
            maxY_mm: m.getBoundingInfo ? (m.getBoundingInfo().boundingBox.maximumWorld.y * 1000) : null,
            meta: m.metadata || null
          }));

        console.log("CLAD_SCAN", window.__dbg.cladMeshNames.length);
      } catch (e) {}
    }
  });

  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, camera, materials };
}
