# Contributing to EarthSona

Use a small branch for each feature or fix so teammates can work in parallel. Start with a clean working tree and use Node.js 22.12 or later in the Node 22 line.

```sh
git switch main
git pull --ff-only origin main
git switch -c feat/your-change
npm ci
npm test
npm run build
```

Use `fix/your-change` for a bug fix. If the fast-forward fails, inspect the diverged history before continuing. Preserve teammates' work when incorporating updates. Run `npm run dev -- --host 127.0.0.1` while editing and `npm run preview -- --host 127.0.0.1` after a build to check the production output.

Stage the files you reviewed and commit them. Review the staged diff before committing. Keep credentials, private references, raw prototypes, dependencies, and generated builds out of commits.

```sh
git push -u origin HEAD
```

Start with the [bug report form](.github/ISSUE_TEMPLATE/bug_report.yml) or the [feature request form](.github/ISSUE_TEMPLATE/feature_request.yml) when opening an issue. On GitHub, open a pull request against `main` and use the [PR template](.github/pull_request_template.md). Give the PR one purpose, explain why the change matters, and record what you tested. Include before and after screenshots for UI changes. Keep unrelated formatting and refactoring in separate PRs.

CI runs `npm ci`, `npm test`, and `npm run build`. The build runs the TypeScript check before Vite. If CI fails, open the failed step, reproduce its command on Node 22 with a clean install, and push the fix to the same branch. Use `npm run check` to isolate type errors. Check the new run after pushing.

## Module boundaries and performance

Reuse the shared playback session and existing modules. Load large dataset images on demand and keep the Studio export code lazy-loaded. Keep pixel sampling, audio scheduling, UI interactions, language strings, and dataset configuration in their respective modules. See the [source map and invariants](AGENTS.md) and the [dataset contribution example](docs/DATASETS.md#adding-a-dataset).

For changes to animation, audio, or runtime assets, compare the baseline and proposed build using the same browser, viewport, dataset, and playback settings. Check for duplicate render loops, a growing queue of scheduled voices, or unnecessary asset requests. Report evidence proportionate to the change, such as a request count, a short playback trace, or a performance recording.

## Playback and responsive checks

In production preview, check narrow and wide layouts in English and Turkish. Exercise keyboard focus and reduced motion. For playback changes, test the combined Play/Stop control, Escape during playback and queued interactions, and 0.25× and 5× scan speeds when moving between Player and Lab. Compare the Night Lights reference motifs, verify Ocean Currents Ambient Flow across a wrap, and try Studio preview and WAV export. Try WebM / Opus when available.

Record the browser and viewport or device you used. A passing build and browser instrumentation cover only the behavior they exercise. Mark unperformed physical-device, screen-reader, and by-ear checks as **Pending** in the PR and name the scenario still to verify.
