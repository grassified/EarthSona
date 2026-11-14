# EarthSona

EarthSona is an open-source, responsive web app by **Asteronix**, a team within **UHRET (Hackathon, Robotik ve Elektronik Topluluğu)**. It began with *The Earth Information Jukebox* challenge at the 2026 NASA Space Apps Challenge. [EarthSona on GitHub](https://github.com/grassified/EarthSona)

Choose a NASA Earth visualization, then select a region or scan across the image. EarthSona counts pixels that match the dataset's color rules in a patch or scan column. The categories determine whether pitches rise or fall, and the proportion of matching pixels affects the pitch interval. **Motif** plays short phrases. **Flow** arranges successive samples into phrases or sustained accompaniment. Pitch, harmony, and timing are musical choices, and the percentages describe the bundled image pixels.

## Run locally

Clone [grassified/EarthSona](https://github.com/grassified/EarthSona) and open the project directory.

Use Node.js 22.12 or later in the Node 22 line. From the repository root:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the HTTP address printed by Vite, usually `http://127.0.0.1:5173/`. Opening `index.html` directly from disk shows launch instructions because Vite serves and transforms the TypeScript module and the app loads images over HTTP.

```sh
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

The build runs `npm run check` before Vite. The production preview usually runs at `http://127.0.0.1:4173/` and serves the build in `dist/`. After dependency installation, imagery, playback, and export work locally. External source links require internet access.

## Explore and make music

- **Explore** browses the dataset catalog. **Library** brings together the catalog, favorites, and recently played datasets.
- **Player** lets you audition a region, tap or drag on the map, or run a looping scan. Use **Play/Stop** or **Escape** to stop active playback. Drag the scan-position slider or use its arrow keys to audition a column. The same scan speed is used in **Player** and **Lab**, from 0.25× to 5× with a 1× reset.
- **Lab** exposes the mapping, pixel coverage, and current sample. Try **Data Listening** for a clear pitch contour and **Ambient** with **Flow** to hear the scan arranged continuously.
- **Studio** turns a sampled phrase into an editable 16-step loop. Set the pitches and tempo, preview the loop, then export **WAV** (16-bit PCM, mono, 48 kHz) or **WebM / Opus** when the browser offers that format.
- **Settings** offers English and Turkish, Light, Dark, and Black themes, custom accents, and globe rotation and motion controls. Preferences, favorites, recents, and the Studio composition live in browser storage.

| Dataset | What the sound follows | Display |
| --- | --- | --- |
| Night Lights | Purple for rising light and orange for falling light | Aligned globe and 2D |
| Ocean Currents | Warm and cool colors from a sea surface temperature visualization | Aligned globe and 2D |
| GEDI Forest Height | Taller and shorter canopy color classes in a rendered still | 2D image |
| ISS Lightning | Dense and sparse yellow lightning marks | Aligned globe and 2D |

Aligned datasets use the same source pixels for globe and flat-map sampling. Choose **2D** directly, or use the automatic flat fallback if the globe canvas cannot initialize. [Dataset sources, processing, and mapping](docs/DATASETS.md)

### Jury walkthrough

1. Open **Night Lights** in **Data Listening** with **Motif**. Play **Western India**, then **Western Europe**. The first plays three rising notes and the second plays three falling notes.
2. Start the scan, use **Lab** to show the highlighted sample and pixel coverage, then stop with **Escape**. Explain how color categories drive pitch direction.
3. Try **Ocean Currents → Ambient → Flow** for continuous playback, or add a sampled phrase to **Studio**, change a step, and export WAV.

## Credits and contributing

[@AmiralG961](https://github.com/AmiralG961)'s v0.2.0 browser prototype inspired map dragging and scan feedback. [@Yasinoguz01](https://github.com/Yasinoguz01)'s designs inspired the mobile Player. NASA's Scientific Visualization Studio supplied the four dataset images and NASA Earth Observatory supplied the Blue Marble backdrop. [Asset credits](docs/DATASETS.md)

The app code uses the repository's existing [GNU General Public License, version 3](LICENSE). Third-party imagery retains its own attribution and applicable terms. See the [contributor guide](CONTRIBUTING.md), [security reporting status](SECURITY.md), and [roadmap](ROADMAP.md).
