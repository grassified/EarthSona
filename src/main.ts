import { accents, applyAppearance, defaultAccent, validAccent, validTheme } from './appearance';
import { mountAudioRing } from './audio-ring';
import { numberWithin, type Note } from './composition';
import { restoreComposition, studioMarkup } from './studio';
import { mountGlobe } from './globe';
import { radians, type GlobeView } from './projection';
import { motif, type Mode, type Style } from './arrangement';
import './style.css';
import './redesign.css';
import { datasets, type Dataset, type Language, type Point, type Signal } from './datasets';
import { Player } from './audio';
import { sample, sampleAudition, sampleRgb, scanColumns, scanRow, scanBounds, type Rgb } from './sampling';
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
type Selection = { point: Point; label: 'point' | 'scanPoint' | 'rowPoint' | 'direct' } | { point: Point; region: number };
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
  syncRing();
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
let laser = preference('earthsona-scan-appearance', 'laser') !== 'classic';
let stereoPositioning = preference('earthsona-stereo-positioning', 'on') !== 'off';
let quickPlayback = preference('earthsona-quick-playback', 'off') === 'on';
const reduced = () => motion === 'reduce' || (motion !== 'full' && motionQuery.matches);
let flat = false;
let globeAction: 'audition' | 'rotate' = 'audition';
const globeView: GlobeView = { longitude: 25 * radians, latitude: 15 * radians };
let globe: ReturnType<typeof mountGlobe> | undefined;
let globeBackdrop: ImageData | undefined;
let backdropRequested = false;
function applyMotion() {
  document.documentElement.classList.toggle('reduce-motion', reduced());
  globe?.wake();
}
motionQuery.addEventListener('change', applyMotion);
applyMotion();

let view: View = 'studio';
let disposeRing = () => {};
let syncRing = () => {};
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
const styleKey = 'earthsona-playback-style';
const savedStyle = preference(styleKey, 'motif');
let style: Style = savedStyle === 'flow' || savedStyle === 'rgb' ? savedStyle : 'motif';
let volume = 65;
let frame: ImageData | undefined;
let frameError = false;
let status: Status = 'ready';
let selection: Selection | undefined;
let signal: Signal | null = null;
let scanning = false;
let scanPosition = 0;
let committedPoint: Point | undefined;
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
  return scanning || status === 'listening' || status === 'starting' || !!scrubTimer || !!resumeTimer || !!scrub?.resume || !!gesture;
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
type PointerSample = { point: Point; screenX: number };
let pointerSample: PointerSample | null = null;
let pointerFrame = 0;
let gesture: {
  surface: HTMLElement; pointer: number; resume: boolean;
  lastKey?: string; nextAt: number; timer: number;
  originX: number; originY: number; dragged: boolean;
  origin: Point; lastAudition?: Point;
} | undefined;
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
  if (gesture) stopInteraction('ready');
  else clearPointer();
  disposeRing();
  globe?.dispose();
  globe = undefined;
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
  const pageTitle = view === 'studio' ? 'EarthSona' : view === 'about' ? t.settings : t[view];
  const scanProgress = `<label class="progress-label"><span>${t.scanProgress}</span><output id="scan-progress-value">0%</output>
    <input id="scan-position" aria-label="${t.scanPosition}" type="range" min="0" max="1000" value="0"></label>`;
  const scanSpeedControl = `<div class="range-control"><label for="scan-speed">${t.scanSpeed}</label><input id="scan-speed" type="range" min="0.25" max="5" step="0.05" value="${scanSpeed}"><output id="scan-speed-value" for="scan-speed">${speedLabel()}</output><button class="secondary normal-speed" data-normal-speed aria-label="${t.normalSpeed}" title="${t.normalSpeed}">1×</button></div>`;
  const studio = `
    <div class="workspace ${labPage ? 'lab-layout' : 'player-layout'}" data-active-dataset="${dataset.id}" data-scan-appearance="${laser ? 'laser' : 'classic'}">
      <section class="map-card" aria-label="${t.mapView}" ${labPage ? 'hidden' : ''}>
        <div class="map-view" role="group" aria-label="${t.mapView}">
          ${dataset.geography ? `<button class="secondary" data-display="globe" aria-pressed="${isGlobe}">${t.globe}</button>` : ''}
          <button class="secondary" data-display="flat" aria-pressed="${!isGlobe}">${t.flatMap}</button>
        </div>
        ${isGlobe && !labPage ? `<div class="globe-actions mode-options" role="group" aria-label="${t.globeControl}">
          <button data-globe-action="audition" aria-pressed="${globeAction === 'audition'}">${t.audition}</button>
          <button data-globe-action="rotate" aria-pressed="${globeAction === 'rotate'}">${t.rotate}</button>
        </div>` : ''}
        <figure>
          ${isGlobe && !labPage ? `<div class="globe-stage"><canvas id="globe" tabindex="0" role="group" aria-label="${t.globeHelp}" aria-describedby="globe-help"></canvas></div>` : ''}
          <div class="map" id="map" tabindex="0" aria-label="${t.mapLabel}" aria-describedby="globe-help" ${isGlobe ? 'hidden' : ''} style="--ratio:${dataset.width} / ${dataset.height}">
            <img src="${dataset.image}" alt="${t.mapLabel}" width="${dataset.width}" height="${dataset.height}" draggable="false">
            <div class="map-overlay" aria-hidden="true">${markers}<span id="scanline" hidden></span><span id="scan-note" hidden></span><span id="scan-target" hidden></span><span id="crosshair" hidden></span><span id="pointer-laser" hidden></span><span id="pointer-target" hidden></span></div>
          </div>
          <figcaption class="map-caption">
            <span class="palette" aria-label="${t.palette}">
              <span><i class="up" aria-hidden="true">↑</i>${dataset.signs[1][language]}</span>
              <span><i class="down" aria-hidden="true">↓</i>${dataset.signs[-1][language]}</span>
            </span>
            <span id="globe-help">${isGlobe ? t.globeHelp : t.mapHint} ${t.weakAudition}</span>
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
              <h2 id="dataset-title" tabindex="-1">${dataset.title[language]}</h2>
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
        <div class="scan-route">
          <button class="secondary" data-auto-scan aria-describedby="scan-route-label">${t.automaticScan}</button>
          <span id="scan-route-label"></span>
        </div>
        ${labPage ? `<section class="card lab-readout">
          <h2>${t.explanation}</h2><p id="live-sample"></p><p id="live-mapping"></p>
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
        <div class="mode"><h3>${t.style}</h3><div class="mode-options style-options" role="group" aria-label="${t.style}" aria-describedby="playback-style-hint">
          <button data-style="motif" aria-pressed="${style === 'motif'}">${t.motif}</button>
          <button data-style="flow" aria-pressed="${style === 'flow'}">${t.flow}</button>
          <button data-style="rgb" aria-pressed="${style === 'rgb'}">${t.rgb}</button>
        </div><p id="playback-style-hint"></p></div>
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
        <h2>${t.explanation}</h2><p id="mapping-explanation"></p><p>${t.synthetic}</p><p id="style-explanation"></p>
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
  const explore = `<div class="browse"><h2>${t.categories}</h2>${tiles}<h2>${t.datasets}</h2>${entries(filtered)}</div>`;
  const ids = libraryFilter === 'favorites' ? favorites : recents;
  const libraryItems = libraryFilter === 'all' ? datasets : ids.map(id => datasets.find(item => item.id === id)!);
  const library = `<div class="filter-chips" role="group" aria-label="${t.library}">${(['all','favorites','recent'] as const).map(filter =>
      `<button data-filter="${filter}" aria-pressed="${filter === libraryFilter}">${t[filter]}</button>`).join('')}</div>
    ${libraryItems.length ? entries(libraryItems) : `<p class="empty-list">${libraryFilter === 'favorites' ? t.noFavorites : t.noRecent}</p>`}`;
  const about = `<section class="card about settings-panel">
      <label>${t.language}<select id="settings-language"><option value="en" ${language === 'en' ? 'selected' : ''}>English</option><option value="tr" ${language === 'tr' ? 'selected' : ''}>Türkçe</option></select></label>
      <label><input type="checkbox" id="settings-rotation" ${rotation ? 'checked' : ''}>${t.autoRotation}</label>
      <label>${t.motion}<select id="settings-motion">
        <option value="system" ${motion === 'system' ? 'selected' : ''}>${t.system}</option>
        <option value="reduce" ${motion === 'reduce' ? 'selected' : ''}>${t.lessMotion}</option>
        <option value="full" ${motion === 'full' ? 'selected' : ''}>${t.fullMotion}</option>
      </select></label>
    </section>
    <section class="card about settings-panel" aria-labelledby="playback-settings-title">
      <h2 id="playback-settings-title">${t.player}</h2>
      <label><input type="checkbox" id="settings-laser" ${laser ? 'checked' : ''}>${t.laserScan}</label>
      <label><input type="checkbox" id="settings-stereo" ${stereoPositioning ? 'checked' : ''}>${t.stereoPositioning}</label>
    </section>
    <section class="card about settings-panel" aria-labelledby="accessibility-title">
      <h2 id="accessibility-title">${t.accessibility}</h2>
      <label><input type="checkbox" id="settings-quick-playback" ${quickPlayback ? 'checked' : ''}>${t.quickPlayback}</label>
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
        .replace('@AmiralG975f', '<a href="https://github.com/AmiralG975f">@AmiralG975f</a>')
        .replace('@Yasinoguz01', '<a href="https://github.com/Yasinoguz01">@Yasinoguz01</a>')}</p>
      <a href="https://github.com/grassified/EarthSona" target="_blank" rel="noopener noreferrer">${t.repository} ${icon('arrow')}</a>
      <a href="https://www.spaceappschallenge.org/2026/find-a-team/asteronix-uhret/" target="_blank" rel="noopener noreferrer">${t.teamLink} ${icon('arrow')}</a>
    </section>`;

  app.innerHTML = `
    <a class="skip" href="#main">${t.skip}</a>
    <header class="header">
      <button class="icon-button" id="open-menu" aria-controls="drawer" aria-haspopup="dialog" aria-expanded="false" aria-label="${t.menu}">${icon('menu')}</button>
      <h1 class="page-title ${view === 'studio' ? 'player-title' : ''}">${pageTitle}</h1>
      <button class="icon-button" data-view="about" aria-label="${t.settings}">${icon('gear')}</button>
    </header>
    <dialog id="drawer" aria-label="${t.menu}">
      <div class="drawer-header"><strong>EarthSona</strong><button class="icon-button" data-close-menu aria-label="${t.close}">${icon('close')}</button></div>
      <nav aria-label="${t.nav}">${nav('studio')}${nav('explore')}${nav('lab')}${nav('compose')}${nav('library')}</nav>
    </dialog>
    <div class="shell">
      <div class="quick-playback" ${quickPlayback ? '' : 'hidden'}>
        <button class="secondary" data-quick-playback>${t.goToPlayback}</button>
      </div>
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
  const spectrum = ring && mountAudioRing(ring, () => scanning || status === 'listening' ? player.spectrum() : undefined, reduced, () => accent);
  disposeRing = spectrum ? spectrum.dispose : () => {};
  syncRing = spectrum ? spectrum.sync : () => {};
  const picker = app.querySelector<HTMLSelectElement>('#studio-format');
  if (picker && [...picker.options].some(option => option.value === format)) picker.value = format;
  const canvas = app.querySelector<HTMLCanvasElement>('#globe');
  if (canvas && dataset.geography) {
    if (dataset.id !== 'night' && !globeBackdrop && !backdropRequested) {
      backdropRequested = true;
      void readImage(import.meta.env.BASE_URL + 'blue-marble.webp').then(value => { globeBackdrop = value; globe?.wake(); }).catch(() => {});
    }
    globe = mountGlobe(canvas, {
      view: globeView, bounds: dataset.geography.bounds, dataset, light: theme === 'light',
      laser: () => laser, reduced, frame: () => frame,
      backdrop: () => dataset.id === 'night' ? undefined : globeBackdrop,
      auto: () => rotation && !reduced() && !pointerSample && !gesture,
      rotating: () => globeAction === 'rotate',
      progress: () => {
        const hover = globeAction === 'audition' ? pointerSample?.point : undefined;
        const cursor = scanning || isScanSelection();
        const marker = committedPoint ?? (selection && (!('label' in selection) || selection.label === 'point') ? selection.point : undefined);
        return {
          position: cursor ? scanPosition : hover?.x ?? -1,
          sampled: scanning && signal ? selection?.point : undefined,
          target: cursor ? scanTarget() : undefined,
          hover,
          marker,
        };
      },
      choose: auditionKeyboardPoint,
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
  syncRing();
  globe?.wake();
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
  set('mode-hint', style === 'rgb' ? t.rgbModeHint : style === 'flow'
    ? t[mode === 'data' ? 'flowDataHint' : 'flowAmbientHint']
    : t[mode === 'data' ? 'dataHint' : 'ambientHint']);
  set('playback-style-hint', style === 'flow' ? t.flowStyleHint : style === 'rgb' ? t.rgbStyleHint : t.motifStyleHint);
  const selectedRegion = selection && 'region' in selection ? selection.region : -1;
  const statusText = frameError ? t.assetError : !frame ? t.loading : scanning ? t.scanning : t[status];
  set('player-status', status === 'audioError' && frame && !scanning ? t.stopped : frameError ? t.stopped : statusText);
  set('selection', frameError ? t.assetError : !frame ? t.loading : status === 'audioError' ? t.audioError :
    selectedRegion >= 0 ? dataset.regions[selectedRegion].name[language] : selection && 'label' in selection ? (scanning && style === 'flow' ? t.flowSource : t[selection.label === 'direct' ? 'point' : selection.label === 'rowPoint' ? 'scanRowPoint' : selection.label]) : dataset.regions[0].name[language]);
  set('result', status === 'audioError' || !frame ? '' : !selection ? t.choose : (signal?.nearby ? t.nearby + ' · ' : '') + formatSignal(signal) +
    (signal ? ` · ${percent[language].format(signal.coverage)} ${t.coverage}` : ''));

  const holding = scanning && style === 'flow' && mode === 'ambient' && signal;
  const sampleLabel = signal ? (holding ? t.heldSample + ' · ' : '') + formatSignal(signal) : t.noSample;
  set('lab-sample', sampleLabel);
  const mapping = style === 'rgb' ? t.rgbStyleHint : dataset.mapping[language];
  if (view === 'lab') {
    set('live-sample', sampleLabel);
    set('live-mapping', mapping);
  }
  set('mapping-explanation', mapping);
  set('lab-settings', `${t[mode]} · ${t[style]} · ${t.scanSpeed} ${speedLabel()}`);
  set('scan-speed-value', speedLabel());
  document.getElementById('scan-speed')!.setAttribute('aria-valuetext', speedLabel());
  set('held-status', holding ? t.heldSample : '');
  document.getElementById('held-status')!.hidden = !holding;
  const pitch = document.getElementById('pitch-pattern')!;
  document.getElementById('pitch-chart')!.hidden = !signal || style !== 'motif';
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
  const bounds = currentScanBounds();
  transport.setAttribute('aria-disabled', String(action === 'play' && !bounds));
  app.querySelector('[data-auto-scan]')!.setAttribute('aria-pressed', String(!committedPoint));
  set('scan-route-label', committedPoint ? (frame && !bounds ? t.unsupportedRow : t.selectedScanRow) : '');
  if (transport.dataset.action !== action) {
    transport.dataset.action = action;
    transport.innerHTML = icon(action);
  }
  transport.setAttribute('aria-label', label);
  transport.title = label;
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-region-step]')) button.disabled = !frame;
  updatePlayhead();
  const scanNote = document.getElementById('scan-note')!;
  const columnSelected = isScanSelection() && !committedPoint;
  if (dataset.id !== 'gedi') scanNote.hidden = !scanning || !columnSelected || !signal;
  if (dataset.id !== 'gedi' && columnSelected && selection) {
    const x = `${selection.point.x * 100}%`;
    scanNote.style.setProperty('--sample-y', `${selection.point.y * 100}%`);
    if (scanNote.style.getPropertyValue('--x') !== x) {
      scanNote.style.setProperty('--x', x);
      if (laser && scanning && !reduced() && !scanNote.closest('#map')?.hasAttribute('hidden')) {
        scanNote.getAnimations().forEach(animation => animation.cancel());
        scanNote.animate([{ scale: '.72', opacity: 1 }, { scale: '1.18', opacity: .75 }], { duration: 260 });
      }
    }
  }
  app.querySelector<HTMLInputElement>('#scan-position')!.disabled = !bounds;
  const crosshair = document.getElementById('crosshair')!;
  const marker = committedPoint ?? (selection && 'label' in selection && selection.label === 'point' ? selection.point : undefined);
  crosshair.hidden = !marker;
  crosshair.classList.toggle('nearby', !!signal?.nearby);
  if (marker) {
    crosshair.style.setProperty('--x', `${marker.x * 100}%`);
    crosshair.style.setProperty('--y', `${marker.y * 100}%`);
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
  clearPointer();
  const active = gesture;
  if (!active) return;
  gesture = undefined;
  window.clearTimeout(active.timer);
  if (active.surface.hasPointerCapture(active.pointer)) active.surface.releasePointerCapture(active.pointer);
}

function stopInteraction(nextStatus?: Status) {
  releaseMap();
  if (scrub) canceledScrub = scrub.pointer;
  scrub = undefined;
  stop(nextStatus);
}

function route(next: View, focusTarget?: string) {
  if (next !== view) {
    if (gesture || scrub || (next === 'compose' && transportActive()) ||
        (view === 'compose' && (composing || status === 'starting'))) stopInteraction('ready');
    view = next;
    positionAudio();
    render();
    window.scrollTo(0, 0);
  } else if (!focusTarget) {
    return;
  }
  if (focusTarget) app.querySelector<HTMLElement>(focusTarget)?.focus();
  else document.getElementById('main')!.focus({ preventScroll: true });
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
    committedPoint = undefined;
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

function positionAudio(point?: Point, screenX?: number) {
  if (!point || !stereoPositioning || !isPlayerView()) {
    player.setPosition(0);
    return;
  }
  const spatial = globe?.spatial(point);
  player.setPosition(screenX ?? (globe ? spatial?.x ?? 0 : view === 'studio' ? point.x * 2 - 1 : 0), screenX === undefined ? spatial?.z : 0);
}

async function audition(next: Selection, short = false, screenX?: number, directSignal?: Signal | null, directRgb?: Rgb) {
  if (!frame) return;
  stop('ready');
  const request = playbackRequest;
  studioStatus = '';
  selection = next;
  preview = short;
  signal = directSignal === undefined
    ? sample(frame, dataset, next.point, 'label' in next && next.label === 'scanPoint')
    : directSignal;
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
    positionAudio(next.point, screenX);
    if (style === 'flow') player.startFlow(mode, dataset.flowRegister ?? 0, preview, signal, onEnd);
    else {
      const rgb = style === 'rgb'
        ? directRgb ?? sampleRgb(frame!, next.point, 'label' in next && next.label === 'scanPoint', signal.nearby)
        : undefined;
      player.play(signal, mode, onEnd, preview, rgb);
    }
    status = 'listening';
    recordPlayback();
  } catch {
    if (request !== playbackRequest) return;
    status = 'audioError';
  }
  refresh();
}

function isScanSelection() {
  return selection && 'label' in selection && (selection.label === 'scanPoint' || selection.label === 'rowPoint');
}

function scanTarget() {
  return committedPoint && { x: scanPosition, y: committedPoint.y };
}

function updatePlayhead() {
  const slider = app.querySelector<HTMLInputElement>('#scan-position')!;
  if (!slider) return;
  slider.value = String(Math.round(scanPosition * 1000));
  const progress = `${Math.round(scanPosition * 100)}%`;
  if (slider.getAttribute('aria-valuetext') !== progress) {
    slider.setAttribute('aria-valuetext', progress);
    document.getElementById('scan-progress-value')!.textContent = progress;
  }
  const line = document.getElementById('scanline')!;
  line.hidden = !scanning && !isScanSelection();
  line.style.setProperty('--x', `${scanPosition * 100}%`);
  if (dataset.id === 'gedi') {
    const note = document.getElementById('scan-note')!;
    const sampled = scanning && frame && !committedPoint && selection && signal &&
      Math.abs(selection.point.x - scanPosition) <= 1 / frame.width ? selection.point : undefined;
    note.hidden = !sampled;
    if (sampled) {
      note.style.setProperty('--x', `${scanPosition * 100}%`);
      note.style.setProperty('--sample-y', `${sampled.y * 100}%`);
    }
  }
  const target = document.getElementById('scan-target')!;
  target.hidden = line.hidden || !committedPoint;
  if (!target.hidden && committedPoint) {
    target.style.setProperty('--x', `${scanPosition * 100}%`);
    target.style.setProperty('--y', `${committedPoint.y * 100}%`);
  }
}

function currentScanBounds() {
  return frame && scanBounds(frame, dataset, committedPoint?.y);
}

async function startScan(fromPlay = false) {
  const source = frame;
  const bounds = currentScanBounds();
  if (!source || !bounds) {
    stop('ready');
    refresh();
    return;
  }
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
  positionAudio();
  player.startScan(style, mode, dataset.flowRegister ?? 0);
  const row = committedPoint?.y;
  const samples = row === undefined ? columns : scanRow(source, dataset, row);
  const label = row === undefined ? 'scanPoint' : 'rowPoint';
  if (fromPlay && committedPoint) scanPosition = committedPoint.x;
  const receive = (point: Point, next: Signal) => {
    selection = { label, point };
    signal = next;
    if (recents[0] !== dataset.id) {
      recordPlayback();
      if (view === 'library') render();
    }
    positionAudio(point);
    player.updateScan(next, style === 'rgb' ? sampleRgb(source, point, row === undefined) : undefined);
  };
  const width = source.width;
  const start = Math.round(bounds.start * width);
  const span = Math.round(bounds.end * width) - start;
  scanPosition = Math.max(bounds.start, Math.min((start + span - .5) / width, scanPosition));
  let index = Math.floor(scanPosition * width) - start;
  const first = samples[start + index++];
  if (first) receive(row === undefined ? first.point : { x: scanPosition, y: row }, first.signal);
  let previous = performance.now();
  let nextReadout = previous;
  const tick = (now: number) => {
    if (request !== playbackRequest) return;
    const position = scanPosition + Math.max(0, Math.min(100, now - previous)) * scanSpeed / 14000;
    previous = now;
    const end = Math.floor(position * width) - start;
    let latest: NonNullable<(typeof samples)[number]> | undefined;
    for (index = Math.max(index, end - span + 1); index <= end; index++) {
      latest = samples[start + index % span] ?? latest;
    }
    const wraps = Math.floor(end / span);
    index -= wraps * span;
    scanPosition = position - wraps * span / width;
    if (latest) receive(latest.point, latest.signal);
    if (globe && selection) positionAudio(selection.point);
    globe?.wake();
    updatePlayhead();
    // Update the readout independently of the incoming audio samples.
    if (now >= nextReadout) {
      refresh();
      nextReadout = now + 120;
    }
    scanFrame = requestAnimationFrame(tick);
  };
  scanFrame = requestAnimationFrame(tick);
  refresh();
}

function scrubPosition(position: number, immediate = false) {
  const bounds = currentScanBounds();
  if (!frame || !bounds) return;
  if (dataset.id === 'gedi') position = Math.max(bounds.start, Math.min(bounds.end - .5 / frame.width, position));
  scanPosition = position;
  const now = performance.now();
  const delay = dragInterval[mode] - (now - lastScrub);
  if (immediate || delay <= 0) {
    lastScrub = now;
    const column = columns[Math.min(columns.length - 1, Math.floor(position * columns.length))];
    if (frame && committedPoint) {
      const point = { x: position, y: committedPoint.y };
      void audition({ label: 'rowPoint', point }, true, undefined, sampleAudition(frame, dataset, point));
    } else {
      void audition({ label: 'scanPoint', point: { x: position, y: column?.point.y ?? .5 } }, true);
    }
  } else {
    updatePlayhead();
    window.clearTimeout(scrubTimer);
    scrubTimer = window.setTimeout(() => scrubPosition(position, true), delay);
    refresh();
  }
}

function pickPointer(event: PointerEvent, surface: HTMLElement): PointerSample | null {
  if (surface.id === 'globe') return globe?.pick(event.clientX, event.clientY) ?? null;
  const box = surface.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  const y = (event.clientY - box.top) / box.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { point: { x, y }, screenX: x * 2 - 1 } : null;
}

function paintPointer() {
  pointerFrame = 0;
  const beam = app.querySelector<HTMLElement>('#pointer-laser');
  const target = app.querySelector<HTMLElement>('#pointer-target');
  if (!beam || !target) return;
  beam.hidden = target.hidden = !pointerSample || !!globe;
  if (!pointerSample || globe) return;
  const { x, y } = pointerSample.point;
  beam.style.setProperty('--x', `${x * 100}%`);
  target.style.setProperty('--x', `${x * 100}%`);
  target.style.setProperty('--y', `${y * 100}%`);
}

function clearPointer() {
  pointerSample = null;
  cancelAnimationFrame(pointerFrame);
  paintPointer();
  globe?.wake();
}

function trackPointer(event: PointerEvent, surface: HTMLElement) {
  pointerSample = pickPointer(event, surface);
  if (globe) globe.wake();
  else if (!pointerFrame) pointerFrame = requestAnimationFrame(paintPointer);
}

function updateAudition(active: NonNullable<typeof gesture>) {
  active.timer = 0;
  if (gesture !== active || !frame) return;
  const picked = pointerSample;
  const next = picked && sampleAudition(frame, dataset, picked.point);
  const rgb = style === 'rgb' && picked && next ? sampleRgb(frame, picked.point, false) : undefined;
  const channels = rgb ? [rgb.red, rgb.green, rgb.blue].map(value => Math.floor(value * 60)).join(':') : '';
  const key = next ? `${next.polarity}:${Math.round(next.coverage * 100)}:${!!next.weak}:${channels}` : 'silent';
  active.nextAt = performance.now() + (mode === 'ambient' ? 175 : 120);
  if (key === active.lastKey && status === 'listening') return;
  active.lastKey = key;
  if (picked) {
    if (next) active.lastAudition = picked.point;
    void audition({ label: 'direct', point: picked.point }, true, picked.screenX, next, rgb);
  }
  else {
    stop('ready');
    selection = undefined;
    signal = null;
    refresh();
  }
}

app.addEventListener('pointerdown', event => {
  if ((event.target as Element).id === 'scan-position' && event.isPrimary && event.button === 0 && !gesture) {
    clearPointer();
    canceledScrub = undefined;
    scrub = { pointer: event.pointerId, resume: scanning };
    stop('ready');
    lastScrub = -Infinity;
    refresh();
    return;
  }
  const surface = (event.target as Element).closest<HTMLElement>('#map, #globe');
  if (!surface || !frame || gesture || event.button !== 0 || !event.isPrimary) return;
  if (surface.id === 'globe' && globeAction === 'rotate') {
    clearPointer();
    return;
  }
  trackPointer(event, surface);
  if (!pointerSample) return;
  const resume = scanning || !!resumeTimer || !!scrub?.resume;
  scrub = undefined;
  surface.setPointerCapture(event.pointerId);
  gesture = {
    surface, pointer: event.pointerId, resume, nextAt: 0, timer: 0,
    originX: event.clientX, originY: event.clientY, dragged: false, origin: pointerSample.point,
  };
  updateAudition(gesture);
});

app.addEventListener('pointermove', event => {
  if (!event.isPrimary || (gesture && gesture.pointer !== event.pointerId)) return;
  const surface = gesture?.surface ?? (event.target as Element).closest<HTMLElement>('#map, #globe');
  if (!surface || (!gesture && event.pointerType === 'touch')) return;
  if (surface.id === 'globe' && globeAction === 'rotate') return;
  trackPointer(event, surface);
  const active = gesture;
  if (!active) return;
  active.dragged ||= Math.hypot(event.clientX - active.originX, event.clientY - active.originY) > 5;
  if (active.timer) return;
  const delay = active.nextAt - performance.now();
  if (delay <= 0) updateAudition(active);
  else active.timer = window.setTimeout(() => updateAudition(active), delay);
});

app.addEventListener('pointerout', event => {
  const surface = (event.target as Element).closest('#map, #globe');
  if (!gesture && surface && !(event.relatedTarget instanceof Node && surface.contains(event.relatedTarget))) clearPointer();
});

function auditionKeyboardPoint(point: Point, screenX: number) {
  if (!frame) return;
  stopInteraction('ready');
  committedPoint = point;
  void audition({ label: 'point', point }, true, screenX, sampleAudition(frame, dataset, point));
}

app.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).id !== 'map' || !['Enter', ' '].includes(event.key) || event.repeat) return;
  event.preventDefault();
  auditionKeyboardPoint({ x: .5, y: .5 }, 0);
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
  const { resume, dragged, lastAudition, origin } = gesture;
  const point = dragged ? lastAudition : origin;
  if (point) {
    committedPoint = point;
    scanPosition = point.x;
  }
  if (!dragged) {
    releaseMap();
    // Let a tap finish its preview before restoring the scan.
    if (resume) resumeTimer = window.setTimeout(() => { void startScan(); }, mode === 'ambient' ? 640 : 320);
    refresh();
    return;
  }
  stopInteraction();
  if (resume) resumeTimer = window.setTimeout(() => { void startScan(); }, dragInterval[mode]);
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
  if (!gesture && !scrub && !resumeTimer) {
    clearPointer();
    return;
  }
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
  } else if (button.hasAttribute('data-quick-playback')) {
    route('studio', '[data-transport]');
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
  } else if (button.hasAttribute('data-auto-scan') && committedPoint) {
    const resume = scanning || !!resumeTimer || !!scrub?.resume || !!gesture?.resume;
    stopInteraction('ready');
    committedPoint = undefined;
    selection = undefined;
    signal = null;
    if (resume) void startScan();
    else refresh();
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
  } else if (button.dataset.globeAction) {
    globeAction = button.dataset.globeAction === 'rotate' ? 'rotate' : 'audition';
    if (gesture) stopInteraction('ready');
    else clearPointer();
    for (const control of app.querySelectorAll<HTMLButtonElement>('[data-globe-action]')) {
      control.setAttribute('aria-pressed', String(control.dataset.globeAction === globeAction));
    }
    refresh();
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
    void audition({ region, point }, false, globe ? 0 : undefined);
  } else if (button.hasAttribute('data-transport')) {
    if (button.getAttribute('aria-disabled') === 'true') return;
    if (transportActive()) {
      stopInteraction();
      refresh();
    } else {
      releaseMap();
      scrub = undefined;
      void startScan(true);
    }
  } else if (button.hasAttribute('data-stop')) {
    stopInteraction();
    refresh();
    (app.querySelector<HTMLButtonElement>('[data-transport], [data-studio-play]') ?? document.getElementById('main'))?.focus();
  } else if (button.dataset.style && style !== button.dataset.style) {
    stopInteraction('ready');
    style = button.dataset.style as Style;
    savePreference(styleKey, style);
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
  } else if (input.id === 'settings-laser') {
    laser = input.checked;
    savePreference('earthsona-scan-appearance', laser ? 'laser' : 'classic');
  } else if (input.id === 'settings-stereo') {
    stereoPositioning = input.checked;
    savePreference('earthsona-stereo-positioning', stereoPositioning ? 'on' : 'off');
    positionAudio();
  } else if (input.id === 'settings-rotation') {
    rotation = input.checked;
    savePreference('earthsona-rotation', rotation ? 'on' : 'off');
  } else if (input.id === 'settings-quick-playback') {
    quickPlayback = input.checked;
    savePreference('earthsona-quick-playback', quickPlayback ? 'on' : 'off');
    app.querySelector<HTMLElement>('.quick-playback')!.hidden = !quickPlayback;
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
  if (event.key !== 'Escape' || (!pointerSample && !scanning && !gesture && !scrub && !scrubTimer && !resumeTimer && status !== 'listening' && status !== 'starting')) return;
  stopInteraction();
  refresh();
});

render();
app.hidden = false;
document.getElementById('startup')?.remove();
void prepare(dataset);
