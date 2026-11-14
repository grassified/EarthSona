# Contributing to EarthSona

Start from the latest `main` and make a focused feature branch. Push that branch and open a pull request against `main`. Include what changed, how you checked it, and any remaining verification. Follow the review and checks shown on the PR.

```sh
git switch main
git pull --ff-only origin main
git switch -c feat/your-change
npm ci
npm run dev -- --host 127.0.0.1
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Use the Node.js version in [README.md](README.md). Commit source, tests, required assets, and lockfile updates. Keep generated builds, dependency directories, internal team files, raw prototypes, and credentials outside the PR.

## Worked example using Night Lights

1. Put the verified raster in `public/maps/`. Night Lights uses `night-lights.png`, a 1496 × 864 crop resized from the single global panel in NASA SVS 5313. Record the source page, credit, frame or timestamp, crop, dimensions, and usage terms in [docs/DATASETS.md](docs/DATASETS.md).
2. Add a `Dataset` in `src/datasets.ts`. For Night Lights, use verified global equirectangular bounds and classify purple pixels as `1`, orange as `-1`, and other pixels as `0`. Omit `geography` for a still without verified geographic alignment.
3. Pick opposing presets on the bundled image. Night Lights uses Western India at `{ x: .690, y: .378 }` and Western Europe at `{ x: .466, y: .270 }`. Run them through the shared sampler and verify rising and falling phrases. Test a sparse or neutral area and compare a globe-picked position with its location in 2D.
4. Supply English and Turkish names, descriptions, source processing, mappings, sign labels, and preset names. Explain the visible classes and what the generated sound represents. Add a focused test if a mapping or projection changes behavior outside the cases already covered.

## Playback and responsive checks

In production preview, check narrow and wide layouts in English and Turkish. Exercise keyboard focus and reduced motion. For playback changes, test the combined Play/Stop control, Escape during playback and queued interactions, and 0.25× and 5× scan speeds when moving between Player and Lab. Compare the Night Lights reference motifs, verify Ocean Currents Ambient Flow across a wrap, and try Studio preview and WAV export. Try WebM / Opus when available.

Record the browser and viewport or device you actually used. Report audio instrumentation separately from by-ear and physical speaker testing, and distinguish keyboard testing from screen-reader testing.
