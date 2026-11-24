# EarthSona roadmap

EarthSona is building an Earth music player for everyday listening, a way to explore Earth through sound, and a studio for making music from Earth data. The milestones below are provisional. Their scope and order can change with testing and contributor feedback.

## Development principles

- **Performance first.** Keep startup fast, controls responsive, rendering efficient, and audio scheduling bounded. Measure resource use before optimizing.
- **Modularity and simplicity.** Keep state, dataset handling, sampling, projection, synthesis, scheduling, visualization, and composition in clear modules. Prefer maintainable solutions and justify new dependencies or infrastructure.
- **User experience and musical quality.** Build for enjoyable listening, intuitive navigation, responsive layouts, and feedback that helps people understand what they are hearing and doing.
- **Accessibility and compatibility.** Support keyboard and screen-reader use, reduced motion, accessible touch interactions, and meaningful alternatives to visual cues. Preserve working behavior across supported browsers and devices, and publish claims only for configurations actually tested.
- **Scientific integrity and reproducibility.** Identify what comes from an image and what comes from quantitative data. Document provenance, processing, geographic alignment, mapping choices, and validation so someone else can reproduce the result.
- **Privacy.** Prefer local processing and storage. Avoid unnecessary tracking, accounts, and required external services.
- **Open source.** Develop in public through issues and reviewable pull requests, maintain contributor guidance, and keep the existing GPL-3.0 terms.

## Status

- **Shipped in the v0.1.0 codebase.** Player, Explore, Sonification Lab, Library, Studio, and Settings in English and Turkish. Four image-based datasets, globe and 2D views for aligned imagery, and 2D-only GEDI. Motif, Flow, RGB Chords, column and row scans, local Studio preview and WAV export, and conditional WebM / Opus export.
- **In progress.** Documenting the post-hackathon direction and recording the current baseline for future verification.
- **Planned.** The milestones below describe intended outcomes. Use linked issues and pull requests as work starts to track implementation and verification.
- **Exploratory.** Items marked for evaluation need evidence before they become commitments. Candidate datasets are proposals.

## v0.1.1 — Stability and Foundation

- Audit the app's state, sampling, rendering, audio, and build/deployment paths. Fix confirmed defects in small changes and split tightly coupled code where it improves maintenance.
- Profile startup, rendering, and interactions. Validate sustained playback, scan wraparound, Stop and Escape, and scheduling after timer stalls or backgrounding.
- Add browser end-to-end coverage for representative Player, Lab, and Studio flows. Check desktop and mobile browser behavior, including touch, orientation changes, and playback on a physical phone.
- Verify keyboard navigation, focus order, playback controls, and status announcements with screen readers. Exercise reduced motion and both languages at narrow and wide widths.
- Listen on a mono speaker for the Night Lights contours, Ocean Currents Ambient Flow continuity, and Studio export playback.
- Record the tested configurations and open findings, then prepare the first formal stable patch release.

## v0.2.0 — Earth Data Expansion

- Build a reproducible preparation pipeline. Record versioned sources, licenses, transforms, alignment, mapping rules, and validation results. Keep large upstream files outside the normal application bundle.
- Preserve existing imagery and behavior, strengthen real-asset sampling regression tests, and add new datasets one at a time with contrasting presets and source credits.
- Evaluate sea surface temperature, vegetation indices, precipitation, and sea ice. Check resolution, geographic alignment, scientific relevance, and download cost before selecting a source.
- Add coordinate selection and region search where verified geographic alignment makes them useful.

## v0.3.0 — Scientific Sonification

- Evaluate scientific raster formats and preprocessing workflows, then add quantitative sampling alongside image-based and artistic modes.
- Represent physical units and missing data explicitly. Document and validate reproducible normalization and configurable data-to-sound mappings.
- Show quantitative sample values and mapping information in Sonification Lab. Add time navigation and comparisons across regions and dates where the source supports comparable observations.

## v0.4.0 — Studio and Musical Experience

- Improve extended listening and refine Ambient, Flow, Motif, and RGB Chords. Evaluate synthesis methods, instruments, scales, and harmonic arrangements through listening.
- Support multiple saved compositions and portable composition import and export. Keep common creative tasks easy to find.
- Evaluate longer or configurable sequences, additional tracks and instruments, MIDI, and additional audio formats including MP3.

## v0.5.0 — Connected and Accessible Earth

- Evaluate installable PWA support and practical offline use with optional dataset downloads.
- Add shareable playback configurations and sonification sessions. Expand Library with saved sessions and compositions.
- Develop guided educational experiences and more accessible geographic exploration. Test both with users on real devices and assistive technology.

## v1.0.0 — Public Stable Release

- Publish a reliable scientific sonification methodology that contributors can reproduce and validate.
- Document performance, accessibility, and cross-browser validation against the supported configurations. Address release-blocking findings.
- Provide user and developer documentation and establish sustainable release and contribution practices.
- Release a stable Earth music player with an enjoyable listening experience and dependable scientific exploration and composition workflows.
