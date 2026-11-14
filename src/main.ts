import { accents, applyAppearance, defaultAccent, validAccent, validTheme } from './appearance';
import { mountAudioRing } from './audio-ring';
import { numberWithin, type Note } from './composition';
import { restoreComposition, studioMarkup } from './studio';
import { mountGlobe } from './globe';
import { radians, type GlobeView } from './projection';
import type { Style } from './arrangement';
import './style.css';
import './redesign.css';
import { datasets, type Dataset, type Language, type Point, type Signal } from './datasets';
import { motif, Player, type Mode } from './audio';
import { sample, scanColumns } from './sampling';
import { copy } from './i18n';

const icons = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  gear: '<path d="M9 3h6l1 3 3 1 2 3-2 2 1 3-2 3-3-1-2 3h-3l-1-3-3 1-2-3 1-3-2-2 2-3 3-1z"/><circle cx="12" cy="11.5" r="3"/>',
  lab: '<path d="M3 12h2m3-4v8m4-12v16m4-12v8m3-4h2"/>',
  ocean: '<path d="M3 8c3-5 6 5 9 0s6 5 9 0M3 15c3-5 6 5 9 0s6 5 9 0"/>',
  forest: '<path d="M20 4C8 4 4 9 6 16c7 2 13-2 14-12ZM4 21 15 10"/>',
  lightning: '<path d="m13 2-8 12h6l-1 8 9-12h-6z"/>',
  night: '<path d="M20 15A9 9 0 1 1 9 4a8 8 0 0 0 11 11Z"/>',
  next: '<path d="m6 5 10 7-10 7zM19 5v14"/>',
  previous: '<path d="m18 5-10 7 10 7zM5 5v14"/>',

  compose: '<path d="M4 4h16v16H4zM4 10h16M10 4v16M15 4v16"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4z"/>',
  studio: '<path d="M3 12h3m2-4v8m4-12v16m4-12v8m2-4h3"/>',
  library: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.1"/>',
  play: '<path fill="currentColor" stroke="none" d="m9 5 12 7-12 7z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4 10v4h4l5 4V6l-5 4zm12-1a5 5 0 0 1 0 6m2-8a8 8 0 0 1 0 10"/>',
  scan: '<path d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4m0-4h16"/>',
  arrow: '<path d="M6 18 18 6M8 6h10v10"/>',
};
const icon = (name: keyof typeof icons) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;

type View = 'explore' | 'studio' | 'library' | 'about' | 'compose' | 'lab';
type Selection = { point: Point; label: 'point' | 'scanPoint' } | { point: Point; region: number };
type Status = 'ready' | 'starting' | 'listening' | 'stopped' | 'audioError';
const player = new Player(() => {
  stopInteraction();
  refresh();
});
const frameCache = new Map<string, Promise<ImageData>>();
const app = document.querySelector<HTMLDivElement>('#app')!;
let language: Language = 'en';
try { if (localStorage.getItem('earthsona-language') === 'tr') language = 'tr'; } catch { /* optional storage */ }
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
function preference(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* optional storage */ }
}
let theme = validTheme(preference('earthsona-theme', 'dark'));
let accent = validAccent(preference('earthsona-accent', defaultAccent));
applyAppearance(document.documentElement, theme, accent);

function updateAppearance() {
  applyAppearance(document.documentElement, theme, accent);
  savePreference('earthsona-theme', theme);
  savePreference('earthsona-accent', accent);
  const picker = app.querySelector<HTMLInputElement>('#settings-accent');
  if (picker) picker.value = accent;
  app.querySelectorAll<HTMLButtonElement>('[data-accent]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.accent === accent));
  });
}

let rotation = preference('earthsona-rotation', 'on') === 'on';
let motion = preference('earthsona-motion', 'system');
const reduced = () => motion === 'reduce' || (motion !== 'full' && motionQuery.matches);
let flat = false;
const globeView: GlobeView = { longitude: 25 * radians, latitude: 15 * radians };
let disposeGlobe = () => {};
let globeBackdrop: ImageData | undefined;
let backdropRequested = false;
function applyMotion() { document.documentElement.classList.toggle('reduce-motion', reduced()); }
motionQuery.addEventListener('change', applyMotion);
applyMotion();

let view: View = 'studio';
let disposeRing = () => {};
let libraryFilter: 'all' | 'favorites' | 'recent' = 'all';
let exploreFilter = '';
const isPlayerView = () => view === 'studio' || view === 'lab';
let piece = restoreComposition();
let step = 0;
let composing = false;
let exporting = '';
let studioStatus = '';
let format: 'wav' | 'webm' = 'wav';

function savePiece() {
  savePreference('earthsona-composition', JSON.stringify(piece));
}

function updateStudio(focus: string) {
  if (view !== 'compose') return;
  render();
  app.querySelector<HTMLElement>(focus)?.focus();
}

function addSample() {
  if (!signal || !selection) return;
  const source: NonNullable<Note['source']> = {
    dataset: dataset.id, ...selection.point,
    ...('region' in selection ? { region: selection.region } : { column: selection.label === 'scanPoint' }),
  };
  const frequencies = motif(signal, 'data').frequencies;
  const slots = Array.from({length: 16}, (_, i) => i).filter(i => !piece.notes.some(note => note.step === i));
  if (slots.length < frequencies.length) {
    studioStatus = copy[language].fullSequence;
    refresh();
    return;
  }
  for (const [i, frequency] of frequencies.entries()) {
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    piece.notes.push({ step: slots[i], midi, source });
  }
  step = slots[0];
  savePiece();
  route('compose');
}

async function downloadPiece() {
  if (exporting || !piece.notes.length) return;
  const choice = app.querySelector<HTMLSelectElement>('#studio-format')!.value as typeof format;
  format = choice;
  const snapshot = { tempo: piece.tempo, notes: [...piece.notes] };
  const update = (message: string) => {
    exporting = message;
    const label = document.getElementById('export-status');
    if (label) label.textContent = message;
    const control = app.querySelector<HTMLButtonElement>('[data-export]');
    if (control) control.disabled = true;
  };
  stopInteraction();
  refresh();
  if (view === 'compose') render();
  update(copy[language].rendering);
  try {
    const { exportPiece, exportFormats } = await import('./studio-export');
    if (!exportFormats().includes(choice)) throw new Error('Unsupported format');
    const file = await exportPiece(snapshot, choice, stage => update(copy[language][stage]));
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EarthSona.${choice}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    update(copy[language].exportDone);
  } catch (error) {
    console.error(error);
    update(copy[language].exportError);
  } finally {
    exporting = '';
    const control = app.querySelector<HTMLButtonElement>('[data-export]');
    if (control) control.disabled = !piece.notes.length;
  }
}

function readIds(key: string): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(saved)) return datasets.filter(item => saved.includes(item.id))
      .map(item => item.id).sort((a, b) => saved.indexOf(a) - saved.indexOf(b));
  } catch { /* optional storage */ }
  return [];
}

const favoriteKey = 'earthsona-favorites';
const recentKey = 'earthsona-recents';
let favorites = readIds(favoriteKey);
let recents = readIds(recentKey);
let labOpen = matchMedia('(min-width: 681px)').matches;

function saveIds(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* optional storage */ }
}

function recordPlayback() {
  if (recents[0] === dataset.id) return;
  recents = [dataset.id, ...recents.filter(id => id !== dataset.id)];
  saveIds(recentKey, recents);
}

let dataset = datasets[0];
let mode: Mode = 'data';
let style: Style = 'motif';
let volume = 65;
let frame: ImageData | undefined;
let frameError = false;
let status: Status = 'ready';
let selection: Selection | undefined;
let signal: Signal | null = null;
let scanning = false;
let scanPosition = 0;
function validSpeed(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(5, Math.round(value * 20))) / 20 : 1;
}
let scanSpeed = validSpeed(Number(preference('earthsona-scan-speed', '1')));

function speedLabel() {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(scanSpeed) + '×';
}

function updateSpeed(value: number) {
  scanSpeed = validSpeed(value);
  savePreference('earthsona-scan-speed', String(scanSpeed));
  const slider = app.querySelector<HTMLInputElement>('#scan-speed')!;
  slider.value = String(scanSpeed);
  refresh();
}

function transportActive() {
  return scanning || status === 'listening' || status === 'starting' || !!scrubTimer || !!resumeTimer || !!scrub?.resume;
}
let columns: ReturnType<typeof scanColumns> = [];
let preview = false;
let scrub: { pointer: number; resume: boolean } | undefined;
let scrubTimer = 0;
let canceledScrub: number | undefined;
let lastScrub = -Infinity;
let resumeTimer = 0;
let scanFrame = 0;
let playbackRequest = 0;
let gesture: { map: HTMLElement; pointer: number; x: number; y: number; sampledAt: number } | undefined;
const dragInterval = { data: 235, ambient: 510 };
const percent = {
  en: new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }),
  tr: new Intl.NumberFormat('tr', { style: 'percent', maximumFractionDigits: 1 }),
};

async function readImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Canvas unavailable');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function loadFrame(item: Dataset) {
  const cached = frameCache.get(item.id);
  if (cached) return cached;
  const loading = readImage(item.image).catch(error => {
    frameCache.delete(item.id);
    throw error;
  });
  frameCache.set(item.id, loading);
  return loading;
}

async function prepare(item: Dataset) {
  try {
    const decoded = await loadFrame(item);
    if (dataset !== item) return;
    columns = scanColumns(decoded, item);
    frame = decoded;
  } catch {
    if (dataset !== item) return;
    frameError = true;
  }
  refresh();
}

function deck(item: Dataset) {
  return `<button class="dataset-button" data-dataset="${item.id}" ${dataset === item ? 'aria-current="true"' : ''}>
    <img src="${item.image}" alt="">
    <span><strong>${item.title[language]}</strong><small>${item.category[language]} · ${item.period}</small></span>
    <span aria-hidden="true" class="dataset-arrow">›</span>
  </button>`;
}

function favoriteButton(item: Dataset) {
  const t = copy[language];
  const saved = favorites.includes(item.id);
  return `<button class="secondary favorite" data-favorite="${item.id}" aria-pressed="${saved}"
    aria-label="${t.favorite}: ${item.title[language]}">${saved ? '★' : '☆'}</button>`;
}

function render() {
  disposeRing();
  disposeGlobe();
  disposeGlobe = () => {};
  const t = copy[language];
  document.documentElement.lang = language;
  const nav = (name: View) => `<button data-view="${name}" ${view === name ? 'aria-current="page"' : ''}>${icon(name)}<span>${name === 'studio' ? t.player : t[name]}</span></button>`;
  const regions = dataset.regions.map((region, index) => `<button class="region-button" data-region="${index}">
      <span class="region-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span>
      <span><strong>${region.name[language]}</strong><small></small></span>
      ${icon('play')}
    </button>`).join('');
  const markers = dataset.regions.map(({point}, index) => `<span class="marker" style="--x:${point.x * 100}%;--y:${point.y * 100}%" data-marker="${index}">${String.fromCharCode(65 + index)}</span>`).join('');
  const catalog = () => datasets.map(deck).join('');
  const isGlobe = !!dataset.geography && !flat && !frameError;
  const labPage = view === 'lab';
  const scanProgress = `<label class="progress-label"><span>${t.scanProgress}</span><output id="scan-progress-value">0%</output>
    <input id="scan-position" aria-label="${t.scanPosition}" type="range" min="0" max="1000" value="0"></label>`;
  const scanSpeedControl = `<div class="range-control"><label for="scan-speed">${t.scanSpeed}</label><input id="scan-speed" type="range" min="0.25" max="5" step="0.05" value="${scanSpeed}"><output id="scan-speed-value" for="scan-speed">${speedLabel()}</output><button class="secondary normal-speed" data-normal-speed aria-label="${t.normalSpeed}" title="${t.normalSpeed}">1×</button></div>`;
  const studio = `
    ${labPage ? `<h1 class="page-title">${t.lab}</h1>` : ''}
    <div class="workspace ${labPage ? 'lab-layout' : 'player-layout'}" data-active-dataset="${dataset.id}">
      <section class="map-card" aria-label="${t.mapView}" ${labPage ? 'hidden' : ''}>
        <div class="map-view" role="group" aria-label="${t.mapView}">
          ${dataset.geography ? `<button class="secondary" data-display="globe" aria-pressed="${isGlobe}">${t.globe}</button>` : ''}
          <button class="secondary" data-display="flat" aria-pressed="${!isGlobe}">${t.flatMap}</button>
        </div>
        <figure>
          ${isGlobe && !labPage ? `<div class="globe-stage"><canvas id="globe" tabindex="0" role="group" aria-label="${t.globeHelp}" aria-describedby="globe-help"></canvas></div>` : ''}
          <div class="map" id="map" ${isGlobe ? 'hidden' : ''} style="--ratio:${dataset.width} / ${dataset.height}">
            <img src="${dataset.image}" alt="${t.mapLabel}" width="${dataset.width}" height="${dataset.height}" draggable="false">
            <div class="map-overlay" aria-hidden="true">${markers}<span id="scanline" hidden></span><span id="scan-note" hidden></span><span id="crosshair" hidden></span></div>
          </div>
          <figcaption class="map-caption">
            <span class="palette" aria-label="${t.palette}">
              <span><i class="up" aria-hidden="true">↑</i>${dataset.signs[1][language]}</span>
              <span><i class="down" aria-hidden="true">↓</i>${dataset.signs[-1][language]}</span>
            </span>
            <span id="globe-help">${isGlobe ? t.globeHelp : t.mapHint}</span>
          </figcaption>
        </figure>
      </section>
      ${labPage ? `<figure class="lab-art">
        <svg viewBox="0 0 200 200" aria-hidden="true" class="wire-globe">
          <circle cx="100" cy="100" r="95"/><ellipse cx="100" cy="100" rx="72" ry="95"/><ellipse cx="100" cy="100" rx="39" ry="95"/>
          <ellipse cx="100" cy="100" rx="95" ry="65"/><ellipse cx="100" cy="100" rx="95" ry="34"/>
          <path d="M5 100h190M100 5v190M30 40h140M30 160h140"/>
        </svg><canvas id="audio-ring" aria-hidden="true"></canvas><figcaption>${t.outputSpectrum}</figcaption>
      </figure>` : ''}
      <section class="player" aria-labelledby="dataset-title">
        <div class="track-card card">
          <div class="now-playing">
            <img src="${dataset.image}" alt="">
            <div class="selection">
              <h1 id="dataset-title" tabindex="-1">${dataset.title[language]}</h1>
              <strong id="selection"></strong><span id="result"></span>
            </div>
            <span class="status" id="player-status" role="status"></span>
          </div>
          ${scanProgress}
        </div>
        <p class="held-status" id="held-status" hidden></p>
        <div class="transport">
          <button class="icon-button" data-region-step="-1" aria-label="${t.previousRegion}">${icon('previous')}</button>
          <button class="play" data-transport aria-label="${t.playScan}" title="${t.playScan}">${icon('play')}</button>
          <button class="icon-button" data-region-step="1" aria-label="${t.nextRegion}">${icon('next')}</button>
        </div>
        <div class="player-options">
          ${favoriteButton(dataset)}
          <button class="secondary" data-view="${labPage ? 'studio' : 'lab'}">${labPage ? t.player : t.lab}</button>
          <button class="secondary" data-view="explore">${t.explore}</button>
        </div>
        ${scanSpeedControl}
        ${labPage ? `<section class="card lab-readout">
          <h2>${t.explanation}</h2><p id="live-sample"></p><p>${dataset.mapping[language]}</p>
          <p>${t.synthetic}</p>
          <a href="${dataset.source.url}" target="_blank" rel="noopener noreferrer">${t.viewSource} ${icon('arrow')}</a>
        </section>` : ''}
        <button class="secondary add-studio" data-add-studio disabled>${t.addStudio}</button>
        <p id="studio-status" role="status"></p>
        <label class="volume">${icon('volume')}<span>${t.volume}</span><input type="range" id="volume" min="0" max="100" value="${volume}"><output id="volume-value">${volume}%</output></label>
        <div class="mode"><h3>${t.mode}</h3><div class="mode-options" role="group" aria-label="${t.mode}">
          <button data-mode="data" aria-pressed="${mode === 'data'}">${t.data}</button>
          <button data-mode="ambient" aria-pressed="${mode === 'ambient'}">${t.ambient}</button>
        </div><p id="mode-hint"></p></div>
        <div class="style-controls mode-options" role="group" aria-label="${t.style}">
          <span aria-hidden="true">${t.style}</span>
          <button data-style="motif" aria-pressed="${style === 'motif'}">${t.motif}</button>
          <button data-style="flow" aria-pressed="${style === 'flow'}">${t.flow}</button>
        </div>
        ${!labPage ? `<section class="player-catalog">
          <h2>${t.explore}</h2><div>${catalog()}</div>
        </section>` : ''}
      </section>
      <section class="card compare" aria-labelledby="regions-title">
        <h2 id="regions-title">${t.compare}</h2>
        <div class="regions">${regions}</div>
      </section>
      <details class="card explain" id="lab" ${labPage ? 'hidden' : ''} ${(labPage || labOpen) ? 'open' : ''}>
        <summary>${t.lab}</summary>
        <p id="lab-sample"></p>
        <p id="lab-settings"></p>
        <h2>${t.explanation}</h2><p>${dataset.mapping[language]}</p><p>${t.synthetic}</p><p id="style-explanation"></p>
        <figure class="playback-art" id="pitch-chart" hidden>
          <figcaption>${t.wave}</figcaption>
          <div id="pitch-pattern" aria-hidden="true"></div>
        </figure>
        <details><summary>${t.source}</summary><p>${dataset.source.credit}</p><p>${dataset.source.processing[language]}</p>
          <a href="${dataset.source.url}" target="_blank" rel="noopener noreferrer">${t.viewSource} ${icon('arrow')}</a>
        </details>
      </details>
    </div>`;
  const entries = (items: readonly Dataset[]) => `<div class="catalog-list">${items.map(item =>
    `<article class="card catalog-entry">${deck(item)}${favoriteButton(item)}</article>`).join('')}</div>`;
  const tiles = `<div class="category-grid">${datasets.map(item =>
    `<button class="card category-tile" data-category="${item.id}" aria-pressed="${exploreFilter === item.id}">
      ${icon(item.id === 'gedi' ? 'forest' : item.id as 'night' | 'ocean' | 'lightning')}<span>${item.category[language]}</span>
    </button>`).join('')}</div>`;
  const filtered = exploreFilter ? datasets.filter(item => item.id === exploreFilter) : datasets;
  const explore = `<section class="intro"><h1>${t.explore}</h1></section>
    <div class="browse"><h2>${t.categories}</h2>${tiles}<h2>${t.datasets}</h2>${entries(filtered)}</div>`;
  const ids = libraryFilter === 'favorites' ? favorites : recents;
  const libraryItems = libraryFilter === 'all' ? datasets : ids.map(id => datasets.find(item => item.id === id)!);
  const library = `<section class="intro"><h1>${t.library}</h1></section>
    <div class="filter-chips" role="group" aria-label="${t.library}">${(['all','favorites','recent'] as const).map(filter =>
      `<button data-filter="${filter}" aria-pressed="${filter === libraryFilter}">${t[filter]}</button>`).join('')}</div>
    ${libraryItems.length ? entries(libraryItems) : `<p class="empty-list">${libraryFilter === 'favorites' ? t.noFavorites : t.noRecent}</p>`}`;
  const about = `<section class="intro"><h1>${t.settings}</h1></section>
    <section class="card about settings-panel">
      <label>${t.language}<select id="settings-language"><option value="en" ${language === 'en' ? 'selected' : ''}>English</option><option value="tr" ${language === 'tr' ? 'selected' : ''}>Türkçe</option></select></label>
      <label><input type="checkbox" id="settings-rotation" ${rotation ? 'checked' : ''}>${t.autoRotation}</label>
      <label>${t.motion}<select id="settings-motion">
        <option value="system" ${motion === 'system' ? 'selected' : ''}>${t.system}</option>
        <option value="reduce" ${motion === 'reduce' ? 'selected' : ''}>${t.lessMotion}</option>
        <option value="full" ${motion === 'full' ? 'selected' : ''}>${t.fullMotion}</option>
      </select></label>
    </section>
    <section class="card about settings-panel appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title">${t.appearance}</h2>
      <label>${t.theme}<select id="settings-theme">${(['light', 'dark', 'black'] as const).map(value =>
        `<option value="${value}" ${theme === value ? 'selected' : ''}>${t[value]}</option>`).join('')}</select></label>
      <div class="accent-options" role="group" aria-label="${t.accent}">
        ${Object.entries(accents).map(([name, color]) => `<button class="secondary swatch" data-accent="${color}"
          aria-pressed="${accent === color}"><span style="--swatch:${color}" aria-hidden="true"></span>${t[name as keyof typeof accents]}</button>`).join('')}
      </div>
      <label>${t.customAccent}<input id="settings-accent" type="color" value="${accent}"></label>
      <button class="secondary reset-accent" data-reset-accent>${t.resetAccent}</button>
    </section>
    <section class="card about">
      <img class="team-logo" src="${import.meta.env.BASE_URL}asteronix.webp" width="72" height="72" alt="">
      <h2>${t.about} · ${t.team}</h2>
      <p>${t.aboutCopy}</p>
      <p><a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/">NASA Earth Observatory · Blue Marble Next Generation</a> · ${t.globeBackdrop}</p>
      <p>${t.credits
        .replace('@AmiralG961', '<a href="https://github.com/AmiralG961">@AmiralG961</a>')
        .replace('@Yasinoguz01', '<a href="https://github.com/Yasinoguz01">@Yasinoguz01</a>')}</p>
      <a href="https://github.com/grassified/EarthSona" target="_blank" rel="noopener noreferrer">${t.repository} ${icon('arrow')}</a>
      <a href="https://www.spaceappschallenge.org/2026/find-a-team/asteronix-uhret/" target="_blank" rel="noopener noreferrer">${t.teamLink} ${icon('arrow')}</a>
    </section>`;

  app.innerHTML = `
    <a class="skip" href="#main">${t.skip}</a>
    <header class="header">
      <button class="icon-button" id="open-menu" aria-controls="drawer" aria-haspopup="dialog" aria-expanded="false" aria-label="${t.menu}">${icon('menu')}</button>
      <button class="brand" data-view="studio">EarthSona</button>
      <button class="icon-button" data-view="about" aria-label="${t.settings}">${icon('gear')}</button>
    </header>
    <dialog id="drawer" aria-label="${t.menu}">
      <div class="drawer-header"><strong>EarthSona</strong><button class="icon-button" data-close-menu aria-label="${t.close}">${icon('close')}</button></div>
      <nav aria-label="${t.nav}">${nav('studio')}${nav('explore')}${nav('lab')}${nav('compose')}${nav('library')}</nav>
    </dialog>
    <div class="shell">
      <main id="main" tabindex="-1" data-page="${view}">${isPlayerView() ? studio : view === 'library' ? library : view === 'explore' ? explore : view === 'compose' ? studioMarkup(piece, step, language, composing, exporting) : about}</main>
      <aside class="mini-player card" id="mini-player" hidden aria-label="${t.nowPlaying}">
        <button class="dataset-button" data-view="studio"><img src="${dataset.image}" alt="">
        <span><strong>${dataset.title[language]}</strong><small id="mini-status"></small></span></button>
        <button class="secondary" data-stop aria-label="${t.stop}">${icon('stop')}</button>
      </aside>
    </div>`;
  const drawer = app.querySelector<HTMLDialogElement>('#drawer')!;
  drawer.addEventListener('close', () => {
    const trigger = app.querySelector<HTMLButtonElement>('#open-menu');
    trigger?.setAttribute('aria-expanded', 'false');
    if (drawer.isConnected) trigger?.focus();
  });
  const ring = app.querySelector<HTMLCanvasElement>('#audio-ring');
  disposeRing = ring ? mountAudioRing(ring, () => scanning || status === 'listening' ? player.spectrum() : undefined, reduced) : () => {};
  const picker = app.querySelector<HTMLSelectElement>('#studio-format');
  if (picker && [...picker.options].some(option => option.value === format)) picker.value = format;
  const canvas = app.querySelector<HTMLCanvasElement>('#globe');
  if (canvas && dataset.geography) {
    if (!globeBackdrop && !backdropRequested) {
      backdropRequested = true;
      void readImage(import.meta.env.BASE_URL + 'blue-marble.webp').then(value => { globeBackdrop = value; }).catch(() => {});
    }
    disposeGlobe = mountGlobe(canvas, {
      view: globeView, bounds: dataset.geography.bounds, frame: () => frame,
      backdrop: () => globeBackdrop,
      auto: () => rotation && !reduced(),
      progress: () => scanning ? {
        position: scanPosition,
        sampled: selection?.point.x,
      } : selection && 'label' in selection && selection.label === 'scanPoint'
        ? { position: scanPosition } : selection ? { point: selection.point, position: -1 } : undefined,
      choose: point => { void audition({ label: 'point', point }); },
      fail: () => {
        queueMicrotask(() => {
          if (!canvas.isConnected) return;
          flat = true;
          render();
          app.querySelector<HTMLButtonElement>('[data-display="flat"]')?.focus();
        });
      },
    });
  }
  refresh();
}

function formatSignal(value: Signal | null) {
  const t = copy[language];
  if (!value) return t.silent;
  if (value.polarity === 0) return t.mixed;
  const direction = value.polarity === 1 ? t.rising : t.falling;
  return `${dataset.signs[value.polarity][language]} · ${direction}`;
}

function refresh() {
  const t = copy[language];
  const mini = document.getElementById('mini-player')!;
  mini.hidden = isPlayerView() || view === 'compose' || !(scanning || status === 'listening' || status === 'starting');
  document.getElementById('mini-status')!.textContent = scanning ? t.scanning : t[status];
  if (view === 'compose') {
    const play = app.querySelector<HTMLButtonElement>('[data-studio-play]')!;
    const stopButton = app.querySelector<HTMLButtonElement>('.sequencer [data-stop]')!;
    play.disabled = composing || status === 'starting' || !piece.notes.length;
    stopButton.disabled = !composing && status !== 'starting';
  }
  if (!isPlayerView()) return;
  const set = (id: string, value: string) => {
    const el = document.getElementById(id)!;
    if (el.textContent !== value) el.textContent = value;
  };
  app.querySelector<HTMLButtonElement>('[data-add-studio]')!.disabled = !signal || !selection;
  set('studio-status', studioStatus);
  set('mode-hint', style === 'flow'
    ? t[mode === 'data' ? 'flowDataHint' : 'flowAmbientHint']
    : t[mode === 'data' ? 'dataHint' : 'ambientHint']);
  const selectedRegion = selection && 'region' in selection ? selection.region : -1;
  const statusText = frameError ? t.assetError : !frame ? t.loading : scanning ? t.scanning : t[status];
  set('player-status', status === 'audioError' && frame && !scanning ? t.stopped : frameError ? t.stopped : statusText);
  set('selection', frameError ? t.assetError : !frame ? t.loading : status === 'audioError' ? t.audioError :
    selectedRegion >= 0 ? dataset.regions[selectedRegion].name[language] : selection && 'label' in selection ? (scanning && style === 'flow' ? t.flowSource : t[selection.label]) : dataset.regions[0].name[language]);
  set('result', status === 'audioError' || !frame ? '' : !selection ? t.choose : (signal?.nearby ? t.nearby + ' · ' : '') + formatSignal(signal) +
    (signal ? ` · ${percent[language].format(signal.coverage)} ${t.coverage}` : ''));

  const holding = scanning && style === 'flow' && mode === 'ambient' && signal;
  const sampleLabel = signal ? (holding ? t.heldSample + ' · ' : '') + formatSignal(signal) : t.noSample;
  set('lab-sample', sampleLabel);
  if (view === 'lab') set('live-sample', sampleLabel);
  set('lab-settings', `${t[mode]} · ${t[style]} · ${t.scanSpeed} ${speedLabel()}`);
  set('scan-speed-value', speedLabel());
  document.getElementById('scan-speed')!.setAttribute('aria-valuetext', speedLabel());
  set('held-status', holding ? t.heldSample : '');
  document.getElementById('held-status')!.hidden = !holding;
  const pitch = document.getElementById('pitch-pattern')!;
  document.getElementById('pitch-chart')!.hidden = !signal || style === 'flow';
  set('style-explanation', style === 'flow' ? t.flowExplanation : '');
  document.getElementById('style-explanation')!.hidden = style !== 'flow';
  pitch.className = signal?.polarity === -1 ? 'falling' : 'rising';
  if (signal && style === 'motif') {
    const { frequencies } = motif(signal, mode, preview);
    pitch.replaceChildren(...frequencies.map(hz => {
      const bar = document.createElement('i');
      const step = Math.log2(hz / (mode === 'ambient' ? 262 : 392)) * 12;
      bar.style.height = `${21 + step * 2.6}px`;
      return bar;
    }));
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-region]')) {
    const index = Number(button.dataset.region);
    const current = selectedRegion === index;
    button.disabled = !frame;
    button.setAttribute('aria-pressed', String(current));
    if (frame && !button.querySelector('small')!.textContent) {
      const value = sample(frame, dataset, dataset.regions[index].point);
      button.querySelector('small')!.textContent = formatSignal(value);
    }
    app.querySelector(`[data-marker="${index}"]`)?.classList.toggle('selected', current);
  }

  const transport = app.querySelector<HTMLButtonElement>('[data-transport]')!;
  const action = transportActive() ? 'stop' : 'play';
  const label = action === 'stop' ? t.stop : t.playScan;
  transport.disabled = !frame;
  if (transport.dataset.action !== action) {
    transport.dataset.action = action;
    transport.innerHTML = icon(action);
  }
  transport.setAttribute('aria-label', label);
  transport.title = label;
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-region-step]')) button.disabled = !frame;
  updatePlayhead();
  const scanNote = document.getElementById('scan-note')!;
  const columnSelected = selection && 'label' in selection && selection.label === 'scanPoint';
  scanNote.hidden = !scanning || !columnSelected || !signal;
  if (columnSelected && selection) scanNote.style.setProperty('--x', `${selection.point.x * 100}%`);
  app.querySelector<HTMLInputElement>('#scan-position')!.disabled = !frame;
  const crosshair = document.getElementById('crosshair')!;
  crosshair.hidden = !selection || selectedRegion >= 0 || scanning || ('label' in selection && selection.label === 'scanPoint');
  crosshair.classList.toggle('nearby', !!signal?.nearby);
  if (selection) {
    crosshair.style.setProperty('--x', `${selection.point.x * 100}%`);
    crosshair.style.setProperty('--y', `${selection.point.y * 100}%`);
  }
}

function stop(nextStatus: Status = 'stopped') {
  playbackRequest++;
  composing = false;
  player.stop();
  cancelAnimationFrame(scanFrame);
  scanning = false;
  window.clearTimeout(scrubTimer);
  scrubTimer = 0;
  window.clearTimeout(resumeTimer);
  resumeTimer = 0;
  status = nextStatus;
}

function releaseMap() {
  const active = gesture;
  if (!active) return;
  gesture = undefined;
  if (active.map.hasPointerCapture(active.pointer)) active.map.releasePointerCapture(active.pointer);
}

function stopInteraction(nextStatus?: Status) {
  releaseMap();
  if (scrub) canceledScrub = scrub.pointer;
  scrub = undefined;
  stop(nextStatus);
}

function route(next: View) {
  if (next === view) return;
  if (gesture || scrub || (view === 'compose' && (composing || status === 'starting'))) stopInteraction('ready');
  view = next;
  render();
  document.getElementById('main')!.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function changeDataset(item: Dataset) {
  if (item === dataset && view === 'studio') return;
  if (item !== dataset) {
    stopInteraction('ready');
    dataset = item;
    globeView.longitude = 25 * radians;
    globeView.latitude = 15 * radians;
    frame = undefined;
    studioStatus = '';
    frameError = false;
    scanPosition = 0;
    selection = undefined;
    signal = null;
    void prepare(item);
  }
  view = 'studio';
  render();
  const title = document.getElementById('dataset-title')!;
  title.focus({ preventScroll: true });
  title.scrollIntoView({ block: 'nearest' });
}

async function audition(next: Selection, short = false) {
  if (!frame) return;
  stop('ready');
  const request = playbackRequest;
  studioStatus = '';
  selection = next;
  preview = short;
  signal = sample(frame, dataset, next.point, 'label' in next && next.label === 'scanPoint');
  if (signal) status = 'starting';
  refresh();
  if (!signal) return;
  try {
    await player.unlock();
    if (request !== playbackRequest) return;
    const onEnd = () => {
      status = 'ready';
      refresh();
    };
    if (style === 'flow') player.startFlow(mode, dataset.flowRegister ?? 0, false, preview, signal, onEnd);
    else player.play(signal, mode, onEnd, preview);
    status = 'listening';
    recordPlayback();
  } catch {
    if (request !== playbackRequest) return;
    status = 'audioError';
  }
  refresh();
}

function updatePlayhead() {
  const slider = app.querySelector<HTMLInputElement>('#scan-position')!;
  if (!slider) return;
  slider.value = String(Math.round(scanPosition * 1000));
  const progress = `${Math.round(scanPosition * 100)}%`;
  slider.setAttribute('aria-valuetext', progress);
  document.getElementById('scan-progress-value')!.textContent = progress;
  const line = document.getElementById('scanline')!;
  line.hidden = !scanning && !(selection && 'label' in selection && selection.label === 'scanPoint');
  line.style.setProperty('--x', `${scanPosition * 100}%`);
}

async function startScan() {
  if (!frame) return;
  stop('ready');
  const request = playbackRequest;
  status = 'starting';
  refresh();
  try {
    await player.unlock();
  } catch {
    if (request === playbackRequest) {
      status = 'audioError';
      refresh();
    }
    return;
  }
  if (request !== playbackRequest) return;
  scanning = true;
  status = 'listening';
  selection = undefined;
  signal = null;
  preview = true;
  if (style === 'flow') player.startFlow(mode, dataset.flowRegister ?? 0, true, false);
  let previous = performance.now();
  let nextNote = previous;
  let index = Math.min(columns.length - 1, Math.floor(scanPosition * columns.length));
  let candidate: { index: number; signal: Signal } | undefined;
  const tick = (now: number) => {
    if (request !== playbackRequest) return;
    const position = scanPosition + Math.max(0, Math.min(100, now - previous)) * scanSpeed / 14000;
    previous = now;
    const end = Math.floor(position * columns.length);
    for (; index <= end; index++) {
      const x = index % columns.length;
      if (x === 0) candidate = undefined;
      const detected = columns[x];
      if (detected && (!candidate || detected.coverage > candidate.signal.coverage)) {
        candidate = { index: x, signal: detected };
      }
    }
    if (position >= 1) index -= columns.length;
    scanPosition = position % 1;
    updatePlayhead();
    if (now >= nextNote && candidate) {
      const x = (candidate.index + .5) / columns.length;
      selection = { label: 'scanPoint', point: { x, y: .5 } };
      signal = candidate.signal;
      if (recents[0] !== dataset.id) {
        recordPlayback();
        if (view === 'library') render();
      }
      if (style === 'flow') player.updateFlow(signal);
      else player.play(signal, mode, undefined, true);
      nextNote = now + dragInterval[mode];
      candidate = undefined;
      refresh();
    }
    scanFrame = requestAnimationFrame(tick);
  };
  scanFrame = requestAnimationFrame(tick);
  refresh();
}

function scrubPosition(position: number, immediate = false) {
  scanPosition = position;
  const now = performance.now();
  const delay = dragInterval[mode] - (now - lastScrub);
  if (immediate || delay <= 0) {
    lastScrub = now;
    void audition({ label: 'scanPoint', point: { x: position, y: .5 } }, true);
  } else {
    updatePlayhead();
    window.clearTimeout(scrubTimer);
    scrubTimer = window.setTimeout(() => scrubPosition(position, true), delay);
    refresh();
  }
}

function auditionPointer(event: PointerEvent, map: HTMLElement, preview: boolean) {
  const bounds = map.getBoundingClientRect();
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  void audition({ label: 'point', point: {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  } }, preview);
}

app.addEventListener('pointerdown', event => {
  if ((event.target as Element).id === 'scan-position' && event.isPrimary && event.button === 0 && !gesture) {
    canceledScrub = undefined;
    scrub = { pointer: event.pointerId, resume: scanning };
    stop('ready');
    lastScrub = -Infinity;
    refresh();
    return;
  }
  const map = (event.target as Element).closest<HTMLElement>('#map');
  if (!map || !frame || gesture || event.button !== 0 || !event.isPrimary) return;
  scrub = undefined;
  map.setPointerCapture(event.pointerId);
  gesture = { map, pointer: event.pointerId, x: event.clientX, y: event.clientY, sampledAt: event.timeStamp };
  auditionPointer(event, map, false);
});

app.addEventListener('pointermove', event => {
  if (gesture?.pointer !== event.pointerId) return;
  if (event.timeStamp - gesture.sampledAt < dragInterval[mode]) return;
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 4) return;
  gesture.x = event.clientX;
  gesture.y = event.clientY;
  gesture.sampledAt = event.timeStamp;
  auditionPointer(event, gesture.map, true);
});

window.addEventListener('pointerup', event => {
  if (canceledScrub === event.pointerId) canceledScrub = undefined;
  if (scrub?.pointer === event.pointerId) {
    const { resume } = scrub;
    scrub = undefined;
    if (resume) {
      if (scrubTimer || lastScrub === -Infinity) scrubPosition(scanPosition, true);
      resumeTimer = window.setTimeout(() => { void startScan(); }, dragInterval[mode]);
    }
    refresh();
  }
  if (gesture?.pointer !== event.pointerId) return;
  releaseMap();
  refresh();
});

function cancelPointer(event: PointerEvent) {
  if (gesture?.pointer !== event.pointerId && scrub?.pointer !== event.pointerId) return;
  stopInteraction();
  refresh();
}

window.addEventListener('pointercancel', event => {
  cancelPointer(event);
  if (canceledScrub === event.pointerId) canceledScrub = undefined;
});
app.addEventListener('lostpointercapture', cancelPointer);
window.addEventListener('blur', () => {
  if (!gesture && !scrub && !resumeTimer) return;
  stopInteraction();
  refresh();
});

app.addEventListener('click', event => {
  if (event.target instanceof HTMLDialogElement) {
    const rect = event.target.getBoundingClientRect();
    if (event.clientX > rect.right) event.target.close();
    return;
  }
  const button = (event.target as Element).closest('button');
  if (!button) return;

  const drawer = app.querySelector<HTMLDialogElement>('#drawer')!;
  if (button.id === 'open-menu') {
    drawer.showModal();
    button.setAttribute('aria-expanded', 'true');
    (drawer.querySelector<HTMLElement>('[aria-current]') ?? drawer.querySelector('button'))?.focus();
  } else if (button.hasAttribute('data-close-menu')) {
    drawer.close();
  } else if (button.dataset.category) {
    const category = button.dataset.category;
    exploreFilter = exploreFilter === category ? '' : category;
    render();
    app.querySelector<HTMLElement>(`[data-category="${category}"]`)?.focus();
  } else if (button.dataset.filter) {
    libraryFilter = button.dataset.filter as typeof libraryFilter;
    render();
    app.querySelector<HTMLElement>(`[data-filter="${libraryFilter}"]`)?.focus();
  } else if (button.dataset.accent || button.hasAttribute('data-reset-accent')) {
    accent = validAccent(button.dataset.accent ?? defaultAccent);
    updateAppearance();
  } else if (button.hasAttribute('data-normal-speed')) {
    updateSpeed(1);
  } else if (button.hasAttribute('data-add-studio')) {
    addSample();
  } else if (button.hasAttribute('data-export')) {
    void downloadPiece();
  } else if (button.hasAttribute('data-studio-play')) {
    if (!piece.notes.length) return;
    stopInteraction('starting');
    refresh();
    const request = playbackRequest;
    void player.unlock().then(() => {
      if (request !== playbackRequest) return;
      player.startComposition(piece);
      composing = true;
      status = 'listening';
      refresh();
    }).catch(() => {
      if (request !== playbackRequest) return;
      stop('audioError');
      refresh();
      const message = document.getElementById('export-status');
      if (message) message.textContent = copy[language].audioError;
    });
  } else if (button.dataset.step !== undefined) {
    step = Number(button.dataset.step);
    updateStudio(`[data-step="${step}"]`);
  } else if (button.hasAttribute('data-remove-note')) {
    stopInteraction('ready');
    piece.notes = piece.notes.filter(note => note.step !== step);
    savePiece();
    updateStudio(`[data-step="${step}"]`);
  } else if (button.dataset.lang) {
    if (gesture || scrub || resumeTimer) stopInteraction();
    language = button.dataset.lang as Language;
    try { localStorage.setItem('earthsona-language', language); } catch { /* optional storage */ }
    render();
    app.querySelector<HTMLButtonElement>(`[data-lang="${language}"]`)?.focus();
  } else if (button.dataset.display) {
    flat = button.dataset.display === 'flat';
    render();
    app.querySelector<HTMLButtonElement>(`[data-display="${button.dataset.display}"]`)?.focus();
  } else if (button.dataset.favorite) {
    const id = button.dataset.favorite;
    favorites = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
    saveIds(favoriteKey, favorites);
    if (view === 'library') {
      render();
      (app.querySelector<HTMLButtonElement>(`[data-favorite="${id}"]`) ?? document.getElementById('main'))?.focus();
    } else {
      button.setAttribute('aria-pressed', String(favorites.includes(id)));
      button.textContent = favorites.includes(id) ? '★' : '☆';
    }
  } else if (button.dataset.view) {
    if (drawer.open) drawer.close();
    route(button.dataset.view as View);
  } else if (button.dataset.dataset) {
    changeDataset(datasets.find(item => item.id === button.dataset.dataset)!);
  } else if (button.dataset.region !== undefined || button.dataset.regionStep) {
    releaseMap();
    scrub = undefined;
    const current = selection && 'region' in selection ? selection.region : 0;
    const count = dataset.regions.length;
    const region = button.dataset.region !== undefined ? Number(button.dataset.region) :
      (current + Number(button.dataset.regionStep) + count) % count;
    const point = dataset.regions[region].point;
    if (dataset.geography) {
      const bounds = dataset.geography.bounds;
      globeView.longitude = (bounds.west + point.x * (bounds.east - bounds.west)) * radians;
      globeView.latitude = (bounds.north - point.y * (bounds.north - bounds.south)) * radians;
    }
    void audition({ region, point: dataset.regions[region].point });
  } else if (button.hasAttribute('data-transport')) {
    if (transportActive()) {
      stopInteraction();
      refresh();
    } else {
      releaseMap();
      scrub = undefined;
      void startScan();
    }
  } else if (button.hasAttribute('data-stop')) {
    stopInteraction();
    refresh();
    (app.querySelector<HTMLButtonElement>('[data-transport], [data-studio-play]') ?? document.getElementById('main'))?.focus();
  } else if (button.dataset.style && style !== button.dataset.style) {
    stopInteraction('ready');
    style = button.dataset.style as Style;
    selection = undefined;
    signal = null;
    for (const control of app.querySelectorAll<HTMLButtonElement>('[data-style]')) {
      control.setAttribute('aria-pressed', String(control.dataset.style === style));
    }
    refresh();
  } else if (button.dataset.mode && mode !== button.dataset.mode) {
    stopInteraction('ready');
    mode = button.dataset.mode as Mode;
    selection = undefined;
    signal = null;
    for (const control of app.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      control.setAttribute('aria-pressed', String(control.dataset.mode === mode));
    }
    refresh();
  }
});

app.addEventListener('toggle', event => {
  const panel = event.target as HTMLDetailsElement;
  if (panel.id === 'lab' && panel.isConnected) labOpen = panel.open;
}, true);

app.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'studio-tempo') {
    stopInteraction('ready');
    piece.tempo = numberWithin(input.valueAsNumber, 45, 220, 100);
    input.value = String(piece.tempo);
    savePiece();
    refresh();
  } else if (input.id === 'studio-format') {
    format = input.value as typeof format;
  } else if (input.id === 'settings-theme') {
    theme = validTheme(input.value);
    updateAppearance();
  } else if (input.id === 'settings-language') {
    language = input.value as Language;
    savePreference('earthsona-language', language);
    render();
    document.getElementById(input.id)?.focus();
  } else if (input.id === 'settings-rotation') {
    rotation = input.checked;
    savePreference('earthsona-rotation', rotation ? 'on' : 'off');
  } else if (input.id === 'settings-motion') {
    motion = input.value;
    savePreference('earthsona-motion', motion);
    applyMotion();
  }
});

app.addEventListener('submit', event => {
  const form = event.target as HTMLFormElement;
  if (form.id !== 'note-editor') return;
  event.preventDefault();
  const fields = new FormData(form);
  const next = numberWithin(Number(fields.get('step')) - 1, 0, 15, step);
  const midi = numberWithin(Number(fields.get('pitch')), 36, 96, 60);
  const old = piece.notes.find(note => note.step === step);
  if (next !== step && piece.notes.some(note => note.step === next)) {
    document.getElementById('export-status')!.textContent = copy[language].occupiedStep;
    return;
  }
  stopInteraction('ready');
  piece.notes = [...piece.notes.filter(note => note.step !== step), { ...old, step: next, midi }];
  step = next;
  savePiece();
  updateStudio(`[data-step="${step}"]`);
});

app.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'scan-position') {
    if (canceledScrub !== undefined) {
      updatePlayhead();
      return;
    }
    if (scanning) stop('ready');
    scrubPosition(input.valueAsNumber / 1000);
    return;
  }
  if (input.id === 'settings-accent') {
    accent = validAccent(input.value);
    updateAppearance();
    return;
  }
  if (input.id === 'scan-speed') {
    updateSpeed(input.valueAsNumber);
    return;
  }
  if (input.id !== 'volume') return;
  volume = input.valueAsNumber;
  player.setVolume(volume / 100);
  document.querySelector<HTMLOutputElement>('#volume-value')!.value = `${volume}%`;
});

document.addEventListener('keydown', event => {
  if (app.querySelector<HTMLDialogElement>('#drawer')?.open) return;
  if (event.key !== 'Escape' || (!scanning && !gesture && !scrub && !scrubTimer && !resumeTimer && status !== 'listening' && status !== 'starting')) return;
  stopInteraction();
  refresh();
});

render();
app.hidden = false;
document.getElementById('startup')?.remove();
void prepare(dataset);
