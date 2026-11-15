import type { Signal } from './datasets';
import type { Rgb } from './sampling';

export type Mode = 'data' | 'ambient';

export function motif(signal: Signal, mode: Mode, preview = false) {
  const ambient = mode === 'ambient';
  const step = 3 + Math.min(4, Math.floor(signal.coverage * 30));
  const expanded = ambient && !preview;
  const pitches = signal.polarity === 0
    ? (expanded ? [0, step, 0, -step, 0] : [0, step, 0, -step])
    : (expanded ? [0, step / 2, step, step * 1.5, step * 2] : [0, step, step * 2]);
  if (signal.polarity < 0) pitches.reverse();
  return {
    frequencies: pitches.map(pitch => (ambient ? 262 : 392) * 2 ** (pitch / 12)),
    spacing: preview ? (ambient ? .14 : .073) : (ambient ? .43 : .19),
    sustain: preview ? (ambient ? .21 : .062) : (ambient ? 1.08 : .155),
    attack: preview ? (ambient ? .035 : .01) : (ambient ? .24 : .016),
    release: preview ? (ambient ? .12 : .038) : (ambient ? .65 : .11),
    level: (ambient ? .1 : .19) * (signal.weak ? .42 : 1),
  };
}

export type Style = 'motif' | 'flow' | 'rgb';
export const scanExpiry = .55;

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
    offset, duration, lane: 0, pitches: steps.map(hz), level: level * (signal.weak ? .42 : 1),
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

export class FlowSequence {
  private pending: FlowEvent[];
  private end: number;

  constructor(start: number, signal: Signal, mode: Mode, register: number, preview: boolean) {
    const phrase = arrange(signal, mode, register, 0, preview);
    this.pending = phrase.events.map(event => ({ ...event, offset: start + event.offset }));
    this.end = start + phrase.length;
  }

  advance(now: number, schedule: (event: FlowEvent, at: number) => void) {
    while (this.pending.length && this.pending[0].offset <= now + .12) {
      const event = this.pending.shift()!;
      if (event.offset >= now - .03) schedule(event, Math.max(now, event.offset));
    }
    return !this.pending.length && this.end <= now;
  }
}

export type ScanInput = { signal: Signal; rgb?: Rgb };

export class ScanSequence {
  private latest?: ScanInput & { time: number };
  private next = 0;
  private step = 0;
  private polarity?: Signal['polarity'];

  update(input: ScanInput, now: number) {
    const restart = !this.latest || now - this.latest.time >= scanExpiry;
    if (restart) {
      this.next = now + .025;
      this.step = 0;
      this.polarity = undefined;
    }
    this.latest = { ...input, time: now };
    return restart;
  }

  advance(now: number, schedule: (input: ScanInput, at: number, step: number) => number) {
    if (!this.latest || this.next > now + .045) return;
    const at = Math.max(this.next, now + .009);
    if (at - this.latest.time >= scanExpiry) return;
    if (this.polarity !== this.latest.signal.polarity) this.step = 0;
    this.polarity = this.latest.signal.polarity;
    this.next = at + schedule(this.latest, at, this.step++);
  }
}
