// FILE: docs/src/state.js

export function createStateStore(initial) {
  let state = deepClone(initial);
  /** @type {Array<(s:any)=>void>} */
  const subs = [];

  function getState() {
    return state;
  }

  function setState(patch) {
    // Debug logging for vis updates
    if (patch && patch.vis) {
      console.log("[setState] BEFORE merge - state.vis:", JSON.parse(JSON.stringify(state.vis)));
      console.log("[setState] Patch.vis:", JSON.parse(JSON.stringify(patch.vis)));
    }
    state = deepMerge(state, patch);
    if (patch && patch.vis) {
      console.log("[setState] AFTER merge - state.vis:", JSON.parse(JSON.stringify(state.vis)));
    }
    subs.forEach((fn) => fn(state));
    return state;
  }

  function onChange(fn) {
    subs.push(fn);
    return () => {
      const i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  return { getState, setState, onChange };
}

// Deep merge tailored to project shapes (objects/arrays of POJOs).
export function deepMerge(target, patch) {
  if (patch === null || typeof patch !== 'object') return patch;
  if (Array.isArray(patch)) return patch.map((v) => deepMerge(undefined, v));
  const out = { ...(target || {}) };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const tv = out[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv)) {
      out[k] = deepMerge(tv && typeof tv === 'object' ? tv : {}, pv);
    } else {
      out[k] = deepMerge(tv, pv);
    }
  }
  return out;
}

function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const o = {};
  for (const k in v) o[k] = deepClone(v[k]);
  return o;
}
