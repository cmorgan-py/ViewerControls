// NavVis Ivion Pan Control — content script
// Injects a draggable D-pad overlay that nudges the x/y (pan) and z (camera
// height) query params. Only x, y, and z are ever modified; every other param
// is preserved as-is.

(() => {
  'use strict';

  if (window.__navvisPanControlLoaded) return;
  window.__navvisPanControlLoaded = true;

  const STORAGE_KEYS = {
    step: 'panControl.stepSize',
    pos: 'panControl.panelPos',
    mode: 'panControl.updateMode',
  };

  const DEFAULTS = {
    step: 1,
    mode: 'reload', // 'reload' = full navigation (guaranteed); 'live' = pushState + popstate (test on your tenant)
  };

  const state = {
    step: DEFAULTS.step,
    mode: DEFAULTS.mode,
    dispatchingOwnPopstate: false,
  };

  // ---------------------------------------------------------------------------
  // URL handling
  // ---------------------------------------------------------------------------

  // Read x/y/z fresh from the current URL every time, so manual pans inside the
  // viewer (which may rewrite the URL) never leave us with stale values.
  function readCoords() {
    const params = new URLSearchParams(location.search);
    const rawX = params.get('x');
    const rawY = params.get('y');
    const rawZ = params.get('z');
    const x = rawX === null ? 0 : parseFloat(rawX);
    const y = rawY === null ? 0 : parseFloat(rawY);
    const z = rawZ === null ? 0 : parseFloat(rawZ);
    const missing = rawX === null || rawY === null;
    if (missing) {
      console.warn('[NavVis Pan Control] x/y not found in URL; defaulting missing values to 0.');
    }
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      z: Number.isFinite(z) ? z : 0,
      rawX,
      rawY,
      rawZ,
      missing,
    };
  }

  // Keep the same number of decimal places the URL already uses (e.g. 225.806
  // stays 3-decimal), so URLs stay tidy after integer steps.
  function formatLike(value, rawOriginal) {
    if (typeof rawOriginal === 'string') {
      const dot = rawOriginal.indexOf('.');
      if (dot !== -1) {
        const decimals = rawOriginal.length - dot - 1;
        if (decimals > 0 && decimals <= 10) return value.toFixed(decimals);
      }
    }
    return String(value);
  }

  // Rebuild the query string, changing only the axes named in `updates` and
  // preserving every other param (site, pc, vlon, vlat, fov, ...) untouched.
  function buildUrl(updates, coords) {
    const params = new URLSearchParams(location.search);
    if ('x' in updates) params.set('x', formatLike(updates.x, coords.rawX));
    if ('y' in updates) params.set('y', formatLike(updates.y, coords.rawY));
    if ('z' in updates) params.set('z', formatLike(updates.z, coords.rawZ));
    return location.pathname + '?' + params.toString() + location.hash;
  }

  function applyUrl(url) {
    if (state.mode === 'live') {
      // Push the new URL and tell the app about it. Whether NavVis Ivion
      // actually re-reads x/y on popstate is unverified — if the camera does
      // not move in this mode, switch back to Reload mode.
      history.pushState(null, '', url);
      state.dispatchingOwnPopstate = true;
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      state.dispatchingOwnPopstate = false;
    } else {
      window.location.href = url;
    }
  }

  function nudge(dx, dy) {
    const coords = readCoords();
    applyUrl(
      buildUrl(
        { x: coords.x + dx * state.step, y: coords.y + dy * state.step },
        coords
      )
    );
    updateReadout();
  }

  function nudgeHeight(dz) {
    const coords = readCoords();
    applyUrl(buildUrl({ z: coords.z + dz * state.step }, coords));
    updateReadout();
  }

  // ---------------------------------------------------------------------------
  // Panel UI (shadow DOM so page CSS can't interfere)
  // ---------------------------------------------------------------------------

  const host = document.createElement('div');
  host.id = 'navvis-pan-control-host';
  host.style.cssText = 'position:fixed;top:80px;left:16px;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .panel {
        font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        background: rgba(28, 30, 34, 0.92);
        color: #e8eaed;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        width: 148px;
        user-select: none;
        overflow: hidden;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.08);
        cursor: grab;
        font-weight: 600;
        font-size: 11px;
        letter-spacing: 0.3px;
      }
      .header:active { cursor: grabbing; }
      .header .dots { opacity: 0.5; font-size: 10px; }
      .body { padding: 8px; }
      .dpad {
        display: grid;
        grid-template-columns: repeat(3, 40px);
        grid-template-rows: repeat(3, 40px);
        gap: 2px;
        justify-content: center;
      }
      .dpad button {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        color: #e8eaed;
        font-size: 16px;
        cursor: pointer;
      }
      .dpad button:hover { background: rgba(255, 255, 255, 0.16); }
      .dpad button:active { background: rgba(255, 255, 255, 0.28); }
      .dpad .up    { grid-area: 1 / 2; }
      .dpad .left  { grid-area: 2 / 1; }
      .dpad .right { grid-area: 2 / 3; }
      .dpad .down  { grid-area: 3 / 2; }
      .dpad .center {
        grid-area: 2 / 2;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        opacity: 0.6;
      }
      .height {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
      }
      .height .label {
        flex: 1;
        font-size: 10px;
        letter-spacing: 0.3px;
        opacity: 0.7;
      }
      .height button {
        appearance: none;
        width: 34px;
        height: 28px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        color: #e8eaed;
        font-size: 15px;
        cursor: pointer;
      }
      .height button:hover { background: rgba(255, 255, 255, 0.16); }
      .height button:active { background: rgba(255, 255, 255, 0.28); }
      .steps {
        display: flex;
        gap: 4px;
        margin-top: 8px;
        justify-content: center;
      }
      .steps label {
        flex: 1;
        text-align: center;
        padding: 4px 0;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 6px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.04);
      }
      .steps input { display: none; }
      .steps input:checked + span { font-weight: 700; }
      .steps label.checked {
        background: #3b82f6;
        border-color: #3b82f6;
        color: #fff;
      }
      .mode {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        margin-top: 8px;
        font-size: 10px;
        opacity: 0.85;
        cursor: pointer;
      }
      .mode input { accent-color: #3b82f6; cursor: pointer; }
      .readout {
        margin-top: 6px;
        text-align: center;
        font-size: 10px;
        opacity: 0.65;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .readout.warn { color: #fbbf24; opacity: 1; }
    </style>
    <div class="panel">
      <div class="header" id="drag-handle"><span>PAN CONTROL</span><span class="dots">⣿</span></div>
      <div class="body">
        <div class="dpad">
          <button class="up"    data-dx="0"  data-dy="1"  title="y + step">▲</button>
          <button class="left"  data-dx="-1" data-dy="0"  title="x − step">◀</button>
          <div class="center">x/y</div>
          <button class="right" data-dx="1"  data-dy="0"  title="x + step">▶</button>
          <button class="down"  data-dx="0"  data-dy="-1" title="y − step">▼</button>
        </div>
        <div class="height" id="height">
          <span class="label">HEIGHT (z)</span>
          <button class="hdown" data-dz="-1" title="z − step (down)">▼</button>
          <button class="hup"   data-dz="1"  title="z + step (up)">▲</button>
        </div>
        <div class="steps" id="steps">
          <label><input type="radio" name="step" value="1"><span>1</span></label>
          <label><input type="radio" name="step" value="10"><span>10</span></label>
          <label><input type="radio" name="step" value="100"><span>100</span></label>
        </div>
        <label class="mode" title="Live: history.pushState, no reload (test it — unverified on Ivion). Off: full page reload per click (always works).">
          <input type="checkbox" id="live-mode"><span>Live update (no reload)</span>
        </label>
        <div class="readout" id="readout"></div>
      </div>
    </div>
  `;

  const readoutEl = shadow.getElementById('readout');

  function updateReadout() {
    const coords = readCoords();
    const zStr = coords.rawZ === null ? '—' : coords.rawZ;
    if (coords.missing) {
      readoutEl.textContent = 'x/y not in URL (using 0)';
      readoutEl.classList.add('warn');
    } else {
      readoutEl.textContent = `x: ${coords.rawX}  y: ${coords.rawY}  z: ${zStr}`;
      readoutEl.classList.remove('warn');
    }
  }

  // Arrow buttons (x/y pan)
  shadow.querySelectorAll('.dpad button').forEach((btn) => {
    btn.addEventListener('click', () => {
      nudge(parseInt(btn.dataset.dx, 10), parseInt(btn.dataset.dy, 10));
    });
  });

  // Height buttons (z)
  shadow.querySelectorAll('.height button').forEach((btn) => {
    btn.addEventListener('click', () => {
      nudgeHeight(parseInt(btn.dataset.dz, 10));
    });
  });

  // Step radios (mutually exclusive by name; styled as toggle chips)
  const stepInputs = shadow.querySelectorAll('#steps input[name="step"]');
  function reflectStep() {
    stepInputs.forEach((input) => {
      input.parentElement.classList.toggle('checked', input.checked);
    });
  }
  stepInputs.forEach((input) => {
    input.addEventListener('change', () => {
      state.step = parseInt(input.value, 10);
      reflectStep();
      chrome.storage.local.set({ [STORAGE_KEYS.step]: state.step });
    });
  });

  // Live/reload mode toggle
  const liveToggle = shadow.getElementById('live-mode');
  liveToggle.addEventListener('change', () => {
    state.mode = liveToggle.checked ? 'live' : 'reload';
    chrome.storage.local.set({ [STORAGE_KEYS.mode]: state.mode });
  });

  // ---------------------------------------------------------------------------
  // Dragging (via header handle only, so the D-pad stays clickable)
  // ---------------------------------------------------------------------------

  const handle = shadow.getElementById('drag-handle');
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    const rect = host.getBoundingClientRect();
    drag = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pos = clampToViewport(e.clientX - drag.offsetX, e.clientY - drag.offsetY);
    host.style.left = pos.left + 'px';
    host.style.top = pos.top + 'px';
  });

  handle.addEventListener('pointerup', (e) => {
    if (!drag) return;
    drag = null;
    handle.releasePointerCapture(e.pointerId);
    chrome.storage.local.set({
      [STORAGE_KEYS.pos]: {
        left: parseInt(host.style.left, 10),
        top: parseInt(host.style.top, 10),
      },
    });
  });

  function clampToViewport(left, top) {
    const rect = host.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  }

  // ---------------------------------------------------------------------------
  // Re-sync when the URL changes underneath us (manual pans, back/forward)
  // ---------------------------------------------------------------------------

  window.addEventListener('popstate', () => {
    if (state.dispatchingOwnPopstate) return;
    updateReadout();
  });

  // The viewer may rewrite the URL via pushState/replaceState without any
  // event; poll cheaply so the readout doesn't drift.
  let lastSearch = location.search;
  setInterval(() => {
    if (location.search !== lastSearch) {
      lastSearch = location.search;
      updateReadout();
    }
  }, 1000);

  // ---------------------------------------------------------------------------
  // Restore persisted state, then attach
  // ---------------------------------------------------------------------------

  chrome.storage.local.get(
    [STORAGE_KEYS.step, STORAGE_KEYS.pos, STORAGE_KEYS.mode],
    (stored) => {
      const savedStep = stored[STORAGE_KEYS.step];
      state.step = [1, 10, 100].includes(savedStep) ? savedStep : DEFAULTS.step;
      stepInputs.forEach((input) => {
        input.checked = parseInt(input.value, 10) === state.step;
      });
      reflectStep();

      state.mode = stored[STORAGE_KEYS.mode] === 'live' ? 'live' : DEFAULTS.mode;
      liveToggle.checked = state.mode === 'live';

      const pos = stored[STORAGE_KEYS.pos];
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        const clamped = clampToViewport(pos.left, pos.top);
        host.style.left = clamped.left + 'px';
        host.style.top = clamped.top + 'px';
      }

      updateReadout();
    }
  );

  document.documentElement.appendChild(host);
})();
