export type Note = {
  step: number;
  midi: number;
  source?: { dataset: string; region?: number; x: number; y: number; column?: boolean };
};
export type Composition = { tempo: number; notes: Note[] };

export const steps = 16;
export const tail = .28;
export function numberWithin(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

export function arrangement(piece: Composition) {
  const stepTime = 15 / piece.tempo;
  return {
    length: steps * stepTime,
    events: piece.notes.map(note => ({
      at: note.step * stepTime,
      frequency: 440 * 2 ** ((note.midi - 69) / 12),
      duration: stepTime + tail * .66,
      attack: .018, release: Math.min(tail, stepTime + tail * .66 - .025), level: .12, type: 'triangle' as const,
    })),
  };
}
