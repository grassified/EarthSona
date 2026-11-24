# EarthSona deployment

EarthSona builds to a static site. Use Node.js 22.12 or later in the Node 22 line and run these commands from the repository root.

```sh
npm ci
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Vite writes the site to `dist/`. Keep generated filenames and folder structure intact when serving it. The HTML and lazy Studio exporter use Vite’s generated paths, including their original letter case.

## Review the build

The targeted browser check uses the Playwright CLI and Chromium as external tools. The repository’s lockfile covers the app build and Node tests. With Chromium available to the CLI, serve the build on a case-sensitive filesystem from a separate terminal.

```sh
python3 -m http.server 4183 --bind 127.0.0.1 --directory dist
```

```sh
playwright-cli -s=earthsona-parity open http://127.0.0.1:4183/ --browser=chromium
playwright-cli -s=earthsona-parity run-code --filename=tests/deployment-parity.browser.js
playwright-cli -s=earthsona-parity close
```

The check exercises the mobile breakpoints and drawer, switches to 2D, starts and stops a scan, selects GEDI, edits a Studio note, and downloads WAV through the lazy exporter. It verifies the exporter’s HTTP response and checks for failed requests.

## Netlify

The repository’s [Netlify configuration](../netlify.toml) specifies Node 22, `npm run build`, and `dist` as the publish directory. The previously observed production site used an extra mobile stylesheet and lowercase bundle references. The recovered mobile rules are now in `src/redesign.css`, and the regular build supplies the complete stylesheet.

Before publishing, the Netlify project owner should confirm the linked repository, base directory, production branch, active deploy ID, and auto-publish settings. Save the current deploy ZIP and build log where available. Review a non-production candidate or serve the candidate `dist/` locally using the steps above. Check project settings for any existing post-processing or stylesheet injection before switching to the repository build. The historical deploy’s upload method, exact commit, and origin of the extra stylesheet could not be verified from public responses.
