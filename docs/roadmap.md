# Roadmap

Planned changes to the site, in order. Each step is independent and can ship on its own.

## 1. Switch to static output

`astro.config.mjs` uses `output: "server"` with the Node adapter, but nothing in `src/` needs a server (no `Astro.request`, cookies, or API routes). Resume PDFs are generated in CI, not at request time.

- Remove the Node adapter and use the default static output.
- Redeploy on Render as a Static Site instead of a Web Service: free, no cold starts, served from a CDN.
- Do this first, because it decides how deploys and per-route headers (needed for Godot, see step 5) are configured.

## 2. Replace the three.js home canvas with a card grid

Rendering project card text inside three.js is expensive. Plain HTML cards fix that.

- Remove `src/components/GalleryCanvas.svelte` and `src/components/HalftoneShader.js`.
- Build a responsive card grid from the project data in `src/content/arrays.ts`.
- Drop `three` from the home page bundle (it stays a dependency for step 3).

## 3. three.js demos as pages

- One Astro page per demo, e.g. `src/pages/demos/toon-shading.astro`.
- Each demo is a `client:only` island, so its bundle loads only on its own page.
- Link each demo from its project card.

## 4. conf-tee page (Pyodide)

conf-tee is Python, so it runs in the browser with Pyodide instead of on a backend.

- Its dependencies (PyYAML, pandas, colored) all work in Pyodide.
- Install `conftee` from PyPI with `micropip`. This needs a pure-Python wheel on PyPI, so check that first.
- First load downloads roughly 10 to 20 MB (mostly pandas). Load Pyodide only on this page, and only when the user starts using the tool.
- No server involved: users' config files never leave their browser.

Alternatives considered and rejected:

- A separate Python service on Render: the free tier sleeps (about a minute to wake), and it means running a server that accepts untrusted uploads.
- Python inside the Node service: messy, and moot once the site is static.

## 5. Later: Godot games and WebGPU

**Godot**

- Export single-threaded (Godot 4.3+) to avoid needing COOP/COEP headers. Threaded exports need those headers, which can break other cross-origin embeds; if needed, scope them to the game routes only.
- Exports are large (often 30 MB+ of wasm). Prefer hosting on itch.io or a separate static host and embedding with an iframe, rather than putting them in `public/`.

**WebGPU**

- A per-demo change, not a site change. three's `WebGPURenderer` falls back to WebGL2, so demos can migrate one at a time.
