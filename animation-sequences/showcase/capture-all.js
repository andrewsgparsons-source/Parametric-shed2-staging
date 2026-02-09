// Capture script - run in browser console
// Captures 360 frames across 20 configurations

const configs = [
  // Config 1-20 base64 states (from progressive-configs.json)
];

async function captureSequence() {
  const fps = 12;
  const framesPerConfig = 18;
  const totalConfigs = 20;
  const totalFrames = framesPerConfig * totalConfigs;
  
  const startAlpha = 4.2;
  const alphaPerFrame = 0.0175; // ~0.314 rad per config (18° rotation)
  const beta = 1.25;
  const radius = 22;
  
  const frames = [];
  let frameNum = 1;
  let currentAlpha = startAlpha;
  
  for (let configIdx = 0; configIdx < totalConfigs; configIdx++) {
    // For each frame in this config
    for (let f = 0; f < framesPerConfig; f++) {
      frames.push({
        frame: frameNum,
        config: configIdx + 1,
        alpha: currentAlpha,
        beta: beta,
        radius: radius
      });
      currentAlpha += alphaPerFrame;
      frameNum++;
    }
  }
  
  console.log(`Generated ${frames.length} frame definitions`);
  return frames;
}

// Run and return frames
captureSequence();
