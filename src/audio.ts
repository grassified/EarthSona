import { voice as voiceNode } from './synth';
import { arrangement, type Composition } from './composition';
import { FlowAudio } from './flow-audio';
import type { Signal } from './datasets';

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
    level: ambient ? .1 : .19,
  };
}

export class Player {
  private context?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private current?: { gate: GainNode; end: number; notes: { oscillator: OscillatorNode; end: number }[] };
  private silentAt = 0;
  private volume = .65;
  private flow?: FlowAudio;
  private loop?: { timer: number; gate: GainNode; voices: Set<ReturnType<typeof voiceNode>> };

  constructor(private readonly onInterrupt?: () => void) {}

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
      let wasRunning = false;
      this.context.addEventListener('statechange', () => {
        const running = this.context?.state === 'running';
        if (wasRunning && !running) this.onInterrupt?.();
        wasRunning = running;
      });
    }
    if (this.context.state !== 'running') await this.context.resume();
  }

  spectrum() {
    if (!this.context || !this.master) return undefined;
    if (!this.analyser) {
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = .68;
      this.master.connect(this.analyser);
    }
    return this.analyser;
  }

  setVolume(value: number) {
    this.volume = value;
    this.master?.gain.setTargetAtTime(value, this.context!.currentTime, .03);
  }

  startFlow(mode: Mode, register: number, repeat: boolean, preview: boolean, signal?: Signal, onEnd?: () => void) {
    this.flow ??= new FlowAudio(this.context!, this.master!);
    this.flow.start(mode, register, repeat, preview, signal, onEnd);
  }

  updateFlow(signal: Signal) {
    this.flow?.update(signal);
  }

  startComposition(piece: Composition) {
    this.stop();
    const ctx = this.context!;
    const { length, events } = arrangement(piece);
    const next = events.map(({ at }) => ctx.currentTime + .045 + at);
    const voices = new Set<ReturnType<typeof voiceNode>>();
    const gate = ctx.createGain();
    gate.connect(this.master!);
    const tick = () => {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      events.forEach((event, i) => {
        if (next[i] < now - .045) next[i] += Math.ceil((now - next[i]) / length) * length;
        if (next[i] > now + .11) return;
        const note = voiceNode(ctx, gate, { ...event, at: Math.max(now, next[i]) });
        voices.add(note);
        note.oscillator.addEventListener('ended', () => voices.delete(note), { once: true });
        next[i] += length;
      });
    };
    this.loop = { timer: window.setInterval(tick, 25), voices, gate };
    tick();
  }

  stop() {
    if (this.loop) {
      const { timer, voices, gate } = this.loop;
      this.loop = undefined;
      window.clearInterval(timer);
      const now = this.context!.currentTime;
      gate.gain.setValueAtTime(1, now);
      gate.gain.linearRampToValueAtTime(0, now + .02);
      if (!voices.size) gate.disconnect();
      for (const note of voices) {
        note.oscillator.addEventListener('ended', () => {
          if (!voices.size) gate.disconnect();
        }, { once: true });
        note.oscillator.stop(Math.min(note.end, now + .02));
      }
    }
    this.flow?.stop();
    const voice = this.current;
    if (!voice) return;
    const now = this.context!.currentTime;
    const fade = Math.min(.027, Math.max(0, voice.end - now));
    this.silentAt = now + fade;
    voice.gate.gain.cancelScheduledValues(now);
    voice.gate.gain.setValueAtTime(1, now);
    voice.gate.gain.linearRampToValueAtTime(0, this.silentAt);
    for (const note of voice.notes) note.oscillator.stop(Math.min(note.end, this.silentAt));
    this.current = undefined;
  }

  play(signal: Signal, mode: Mode, onEnd?: () => void, preview = false) {
    const ctx = this.context!;
    this.stop();
    const notes = motif(signal, mode, preview);
    const start = Math.max(ctx.currentTime, this.silentAt) + .006;
    const gate = ctx.createGain();
    gate.connect(this.master!);
    const duration = notes.spacing * (notes.frequencies.length - 1) + notes.sustain;
    const voice = { gate, end: start + duration, notes: [] as { oscillator: OscillatorNode; end: number }[] };
    let remaining = notes.frequencies.length;
    this.current = voice;

    notes.frequencies.forEach((frequency, index) => {
      const note = voiceNode(ctx, gate, {
        frequency, at: start + index * notes.spacing, duration: notes.sustain,
        type: mode === 'ambient' ? 'sine' : 'triangle',
        attack: notes.attack, release: notes.release, level: notes.level,
      });
      voice.notes.push(note);
      note.oscillator.onended = () => {
        if (--remaining !== 0) return;
        gate.disconnect();
        if (this.current !== voice) return;
        this.current = undefined;
        onEnd?.();
      };
    });
    return duration;
  }
}
