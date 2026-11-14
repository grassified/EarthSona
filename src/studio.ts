import { numberWithin, steps, type Composition, type Note } from './composition';
import { datasets, type Language } from './datasets';

export function restoreComposition(): Composition {
  try {
    const saved: Composition = JSON.parse(localStorage.getItem('earthsona-composition') ?? 'null');
    if (saved && Array.isArray(saved.notes)) return {
      tempo: numberWithin(saved.tempo, 45, 220, 100),
      notes: [...new Map(saved.notes.filter(note =>
        note && Number.isInteger(note.step) && note.step >= 0 && note.step < steps &&
        Number.isInteger(note.midi) && note.midi >= 36 && note.midi <= 96,
      ).map(note => [note.step, note])).values()],
    };
  } catch { /* optional storage */ }
  return { tempo: 100, notes: [] };
}

const noteName = (midi: number) => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12] + (Math.floor(midi / 12) - 1);

function sourceName(note: Note | undefined, language: Language) {
  if (!note?.source) return '';
  const source = note.source;
  const dataset = datasets.find(item => item.id === source.dataset);
  if (!dataset) return '';
  const region = source.region !== undefined ? dataset.regions[source.region]?.name[language] : '';
  return dataset.title[language] + ' · ' + (region ||
    (source.column ? `${Math.round(source.x * 100)}%` : `${Math.round(source.x * 100)}%, ${Math.round(source.y * 100)}%`));
}

export function studioMarkup(piece: Composition, selected: number, language: Language, playing: boolean, exporting: string) {
  const tr = language === 'tr';
  const note = piece.notes.find(item => item.step === selected);
  const source = sourceName(note, language);
  const format = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
  return `<section class="intro"><h1>${tr ? 'Stüdyo' : 'Studio'}</h1>
    <p>${tr ? 'Bir adım seç ve nota ekle. Düzenleme bu tarayıcıya kaydedilir.' : 'Select a step and add a note. Your composition is saved in this browser.'}</p></section>
    <section class="card sequencer">
      <div class="studio-tools">
        <label>Tempo <input id="studio-tempo" type="number" inputmode="numeric" min="45" max="220" value="${piece.tempo}"> BPM</label>
        <button class="play" data-studio-play ${!piece.notes.length || playing ? 'disabled' : ''}>${tr ? 'Döngüyü dinle' : 'Preview loop'}</button>
        <button class="secondary" data-stop ${playing ? '' : 'disabled'}>${tr ? 'Durdur' : 'Stop'}</button>
      </div>
      <div class="steps" role="group" aria-label="${tr ? 'Beste adımları' : 'Composition steps'}">
        ${Array.from({length: steps}, (_, index) => {
          const item = piece.notes.find(candidate => candidate.step === index);
          return `<button class="secondary" data-step="${index}" aria-pressed="${index === selected}"
            aria-label="${tr ? 'Adım' : 'Step'} ${index + 1}${item ? ', ' + noteName(item.midi) : ''}">
            <small>${index + 1}</small><strong>${item ? noteName(item.midi) : '–'}</strong></button>`;
        }).join('')}
      </div>
      <form id="note-editor" class="studio-tools">
        <label>${tr ? 'Adım' : 'Step'} <input name="step" type="number" min="1" max="16" required value="${selected + 1}"></label>
        <label>${tr ? 'Nota' : 'Note'} <select name="pitch">${Array.from({length: 61}, (_, i) => {
          const pitch = 36 + i;
          return `<option value="${pitch}" ${pitch === (note?.midi ?? 60) ? 'selected' : ''}>${noteName(pitch)}</option>`;
        }).join('')}</select></label>
        <button class="secondary" type="submit">${tr ? 'Notayı kaydet' : 'Save note'}</button>
        <button class="secondary" type="button" data-remove-note ${note ? '' : 'disabled'}>${tr ? 'Kaldır' : 'Remove'}</button>
      </form>
      ${source ? `<p class="studio-source">${source}</p>` : ''}
      <div class="studio-tools studio-export">
        <label>${tr ? 'Dosya biçimi' : 'File format'}
          <select id="studio-format"><option value="wav">WAV</option>${format ? '<option value="webm">WebM / Opus</option>' : ''}</select></label>
        <button class="secondary" data-export ${!piece.notes.length || exporting ? 'disabled' : ''}>${tr ? 'İndir' : 'Download'}</button>
        <small class="studio-formats">${tr ? 'MP3 bu sürümde kullanılamıyor.' : 'MP3 is unavailable in this build.'}</small>
        <span id="export-status" role="status">${exporting}</span>
      </div>
    </section>`;
}
