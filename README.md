# RAUT SEMRAWUT

Collage generator: photos snapped to a modular grid, connected by sagging cables. Vite + React, no backend.

## Develop

```bash
npm install
npm run dev
```

## Deploy to Vercel

Option A — CLI:

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

Option B — Git: push this folder to GitHub/GitLab, then "Add New Project" on vercel.com and import it.
Framework preset is Vite (build `npm run build`, output `dist`), already set in `vercel.json`.

## Structure

- `src/engine.js` — scene, auto-compose layout, cables, canvas rendering, pointer interaction, export/import
- `src/main.jsx` + `src/router.js` — routes: `/` landing page, `/studio` the tool (lazy-loaded)
- `src/Landing.jsx` + `src/landing.css` — landing page with live cable-collage hero
- `src/App.jsx` — studio layout, settings state, wiring settings changes to the engine
- `src/components/Controls.jsx` — slider, segmented, toggle, color, number, drop-zone and menu controls
- `src/print.js` — print output: export resolution/dpi and writing dpi into PNG/JPEG files
- `src/textures.js` — cable textures (solid, tube, braided, twisted, coiled, stitched, beaded, sketch)
- `src/components/TexturePicker.jsx` — texture grid with live previews and the mix selector
- `src/components/Inspector.jsx` — panel for the selected text block or image (content, weight, size, position, rotation)
- `public/fonts/` — Arial Narrow, the only typeface used for text on the canvas
- `src/app.css` — light theme tokens, layout and component styles
