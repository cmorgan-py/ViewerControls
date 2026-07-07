# NavVis Ivion Pan Control

A Chrome/Edge (Manifest V3) browser extension that injects a small floating D-pad
panel onto NavVis Ivion viewer pages (`*.iv.navvis.com`). The arrows nudge the
`x` and `y` query-string coordinates by a chosen step size, and the page view
updates to match.

## Features

- **D-pad overlay** injected directly into the page — draggable via its header
  bar so it never blocks the 3D view. Position persists across reloads.
- **Step size** chips: `1` / `10` / `100`, single-choice, defaults to `1`.
  Last choice is remembered (`chrome.storage.local`).
- **Direction convention** (math, not screen): ▶ `x += step`, ◀ `x -= step`,
  ▲ `y += step`, ▼ `y -= step`.
- **Only `x` and `y` are touched.** `site`, `pc`, `vlon`, `vlat`, `fov`, `z`,
  and any other params are preserved unchanged in the rebuilt URL. Decimal
  precision of `x`/`y` is preserved (e.g. `225.806` steps to `226.806`).
- **Live readout** of the current `x`/`y` at the bottom of the panel.
- **Graceful no-op**: if `x`/`y` are missing from the URL, the panel shows a
  warning and treats them as `0` instead of crashing.

## Install (Chrome or Edge)

1. Download/clone this repo (or unzip `dist/navvis-pan-control.zip`).
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the corner).
4. Click **Load unpacked** and select this folder (the one containing
   `manifest.json`).
5. Open your Ivion viewer URL, e.g.
   `https://<tenant>.iv.navvis.com/?site=...&x=225.806&y=133.840&z=1.798` —
   the panel appears in the top-left.

## Update mechanism — ⚠️ open item, needs a test on your tenant

Whether the Ivion viewer picks up `x`/`y` changes **live** (via
`history.pushState` + a `popstate` event) or only reads them **on page load**
could not be verified — the target site is private and was not contacted
during development. So the panel ships with both mechanisms:

- **Default (Live update unchecked): full page reload** on every arrow click
  (`window.location.href = newUrl`). Guaranteed to work, but you'll see a
  visible reload/flash on each click.
- **"Live update (no reload)" checkbox**: pushes the new URL with
  `history.pushState` and dispatches a `popstate` event, no reload.

**Please test Live mode once**: tick the checkbox, click an arrow, and see if
the camera moves. If it does, leave it on — much smoother. If nothing happens,
untick it and stay in reload mode. The setting is remembered.

If neither is ideal, the next step would be checking the tenant's `window`
object in devtools for a NavVis JS API (e.g. NavVis-namespaced globals) that
can move the camera directly — happy to wire that up if you find one.

## Known limitations

- If you pan manually inside the viewer, the panel's readout re-syncs within
  ~1 s (it watches the URL), and every arrow click reads the URL fresh, so
  coordinates never drift — but the panel does not (and cannot) follow camera
  moves the viewer doesn't write back to the URL.
- The panel appears on every page under `*.iv.navvis.com`, including pages
  without `x`/`y` params (where it shows a warning instead).

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest: content script on `*://*.iv.navvis.com/*`, `storage` permission. |
| `content.js` | The whole extension: overlay UI (shadow DOM), drag, URL math, persistence. |
| `icons/` | Placeholder D-pad icons (16/48/128 px). |
| `dist/navvis-pan-control.zip` | Ready-to-share zip of the extension. |

## Repackaging

After editing, rebuild the zip with:

```sh
zip -r dist/navvis-pan-control.zip manifest.json content.js icons
```
