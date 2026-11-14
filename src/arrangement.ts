import type { Signal } from './datasets';
import type { Mode } from './audio';

export type Style = 'motif' | 'flow';
export type FlowEvent = {
  offset: number;
  duration: number;
  lane: 0 | 1 | 2;
  pitches: number[];
  level: number;
  attack: number;
  release: number;
};

export function arrange(signal: Signal, mode: Mode, register: number, variation: number, preview = false) {
  const ambient = mode === 'ambient';
  const interval = 2 + Math.min(5, Math.round(signal.coverage * 30));
  const lift = ambient && signal.coverage >= .12 ? 2 : 0;
  const root = (ambient ? 196 : 330) * 2 ** ((register + lift) / 12);
  const hz = (steps: number) => root * 2 ** (steps / 12);
  const contour = signal.polarity === 0 ? [0, interval, 0, -interval] : [0, interval, 2 * interval];
  if (signal.polarity === -1) contour.reverse();
  const phrase = (offset: number, duration: number, steps: number[], level: number): FlowEvent => ({
    offset, duration, lane: 0, pitches: steps.map(hz), level,
    attack: ambient ? .09 : .018, release: ambient ? .22 : .075,
  });
  if (preview) {
    const duration = ambient ? .39 : .18;
    return { length: duration + .02, events: [phrase(0, duration, contour, .095)] };
  }
  if (!ambient) {
    const first = variation % 2 === 0 ? .48 : .33;
    return { length: 1.55, events: [
      phrase(0, first, contour.slice(0, 2), .13),
      phrase(first + .12, .59, contour.slice(1), .1),
    ] };
  }

  // Two slowly swelling voices leave room for an occasional upper phrase.
  const events: FlowEvent[] = [
    { offset: 0, duration: 2.85, lane: 1, pitches: [hz(-12)], level: .055, attack: .64, release: .83 },
    { offset: .12, duration: 2.52, lane: 2, pitches: [hz(signal.polarity === -1 ? 3 : 7)], level: .046, attack: .8, release: .78 },
  ];
  if (variation % 2 === 0) events.push(phrase(.56, 1.73, contour, .075));
  return { length: 2.9, events };
}

/** A scan supplies a fresh target window. Only the latest window is retained. */
export class FlowSequence {
  private pending: FlowEvent[] = [];
  private phraseAt: number;
  private target?: { signal: Signal; time: number };
  private variation = 0;
  private previousPolarity?: Signal['polarity'];

  private readonly mode: Mode;
  private readonly register: number;
  private readonly repeat: boolean;
  private readonly preview: boolean;

  constructor(start: number, mode: Mode, register: number, repeat: boolean, preview: boolean) {
    this.phraseAt = start;
    this.mode = mode;
    this.register = register;
    this.repeat = repeat;
    this.preview = preview;
  }

  update(signal: Signal, now: number) {
    this.target = { signal, time: now };
  }

  clear() {
    this.target = undefined;
    this.pending = [];
  }

  advance(now: number, schedule: (event: FlowEvent, at: number) => void) {
    const horizon = now + .12;
    if (this.phraseAt <= horizon && this.target) {
      const { signal, time } = this.target;
      this.target = undefined;
      if (now - time < 1.2) {
        if (this.repeat && signal.polarity !== this.previousPolarity) this.variation = 0;
        const phrase = arrange(signal, this.mode, this.register, this.variation++, this.preview);
        this.previousPolarity = signal.polarity;
        this.phraseAt = Math.max(now + .015, this.phraseAt);
        const start = this.phraseAt;
        this.pending = phrase.events.map(event => ({ ...event, offset: start + event.offset }));
        this.phraseAt += phrase.length;
      }
    }
    while (this.pending.length && this.pending[0].offset <= horizon) {
      const event = this.pending.shift()!;
      // Timer stalls skip late events instead of dumping a burst on resume.
      if (event.offset >= now - .03) schedule(event, Math.max(now, event.offset));
    }
    return !this.repeat && !this.pending.length && this.phraseAt <= now;
  }
}
