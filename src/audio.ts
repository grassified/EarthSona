import { voice as voiceNode } from './synth';
import { arrangement, type Composition } from './composition';
import { ScheduledAudio } from './scheduled-audio';
import { rgbChord } from './rgb-chords';
import type { Rgb } from './sampling';
import { motif, scanExpiry, type Mode, type Style } from './arrangement';
import type { Signal } from './datasets';

type Note = Parameters<typeof voiceNode>[2];
const scanHold = .22;

export class Player {
  private context?: AudioContext;
  private master?: GainNode;
  private panner?: StereoPannerNode;
  private distance?: GainNode;
  private distanceShelf?: BiquadFilterNode;
  private lastPosition = 0;
  private lastDepth = 0;
  private analyser?: AnalyserNode;
  private current?: { gate: GainNode; end: number; notes: { oscillator: OscillatorNode; end: number }[] };
  private silentAt = 0;
  private volume = .65;
  private scheduled?: ScheduledAudio;
  private scan?: {
    gate: GainNode;
    gateAt?: number;
  };
  private loop?: { timer: number; gate: GainNode; voices: Set<ReturnType<typeof voiceNode>> };

  constructor(private readonly onInterrupt?: () => void) {}

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
      this.distanceShelf = this.context.createBiquadFilter();
      this.distanceShelf.type = 'highshelf';
      this.distanceShelf.frequency.value = 720;
      this.distance = this.context.createGain();
      this.distanceShelf.connect(this.distance).connect(this.master);
      if (typeof this.context.createStereoPanner === 'function') {
        this.panner = this.context.createStereoPanner();
        this.panner.connect(this.distanceShelf);
      }
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
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = .68;
      this.master.connect(this.analyser);
    }
    return this.analyser;
  }

  setVolume(value: number) {
    this.volume = value;
    this.master?.gain.setTargetAtTime(value, this.context!.currentTime, .03);
  }

  setPosition(position: number, signedDepth = 0) {
    if (!this.context || !this.distance || !this.distanceShelf) return;
    const behind = Math.max(0, Math.min(1, -signedDepth / .65));
    const depth = behind * behind * (3 - 2 * behind);
    const pan = Math.max(-1, Math.min(1, position)) * .78 * (1 - depth);
    const now = this.context.currentTime;
    if (Math.abs(pan - this.lastPosition) >= .005 || (pan === 0 && this.lastPosition !== 0)) {
      this.panner?.pan.setTargetAtTime(pan, now, .025);
      this.lastPosition = pan;
    }
    if (Math.abs(depth - this.lastDepth) >= .005 || (depth === 0 && this.lastDepth !== 0)) {
      this.distance.gain.setTargetAtTime(1 - depth * .22, now, .055);
      this.distanceShelf.gain.setTargetAtTime(-5 * depth, now, .055);
      this.lastDepth = depth;
    }
  }

  private get spatialOutput() {
    return this.panner ?? this.distanceShelf!;
  }

  startFlow(mode: Mode, register: number, preview: boolean, signal: Signal, onEnd: () => void) {
    this.scheduled ??= new ScheduledAudio(this.context!);
    this.scheduled.preview(this.spatialOutput, mode, register, preview, signal, onEnd);
  }

  startScan(style: Style, mode: Mode, register: number) {
    this.stop();
    const ctx = this.context!;
    const gate = ctx.createGain();
    gate.gain.value = 0;
    gate.connect(this.spatialOutput);
    this.scan = { gate };
    this.scheduled ??= new ScheduledAudio(ctx);
    this.scheduled.scan(gate, style, mode, register);
  }

  updateScan(signal: Signal, rgb?: Rgb) {
    const scan = this.scan;
    if (!scan) return;
    const now = this.context!.currentTime;
    this.scheduled?.update({ signal, rgb }, now);
    const previous = scan.gateAt;
    if (previous !== undefined && now - previous < .055) return;
    const gain = scan.gate.gain;
    if (previous === undefined || now > previous + scanHold) {
      const level = previous === undefined ? 0 : Math.max(0, (previous + scanExpiry - now) / (scanExpiry - scanHold));
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(level, now);
      gain.linearRampToValueAtTime(1, now + .035);
    } else {
      gain.cancelScheduledValues(previous + scanHold);
    }
    scan.gateAt = now;
    gain.setValueAtTime(1, now + scanHold);
    gain.linearRampToValueAtTime(0, now + scanExpiry);
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
    const scan = this.scan;
    if (scan) {
      this.scan = undefined;
      const now = this.context!.currentTime;
      const end = now + .027;
      const gain = scan.gate.gain;
      const previous = scan.gateAt;
      const level = previous === undefined ? 0 : Math.max(0, Math.min(1, (previous + scanExpiry - now) / (scanExpiry - scanHold)));
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
      else {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(level, now);
      }
      gain.linearRampToValueAtTime(0, end);
      window.setTimeout(() => scan.gate.disconnect(), 45);
    }
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
    this.scheduled?.stop();
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

  private chordNotes(signal: Signal, rgb: Rgb, at: number, duration: number, attack: number, release: number): Note[] {
    return rgbChord(rgb, !!signal.weak).map(note => ({ ...note, at, duration, attack, release }));
  }

  play(signal: Signal, mode: Mode, onEnd?: () => void, preview = false, rgb?: Rgb) {
    const ctx = this.context!;
    this.stop();
    const at = Math.max(ctx.currentTime, this.silentAt) + .006;
    const phrase = motif(signal, mode, preview);
    const notes: Note[] = rgb
      ? this.chordNotes(signal, rgb, at, preview ? .28 : .46, .045, preview ? .15 : .22)
      : phrase.frequencies.map((frequency, index) => ({
        frequency, at: at + index * phrase.spacing, duration: phrase.sustain,
        type: mode === 'ambient' ? 'sine' : 'triangle',
        attack: phrase.attack, release: phrase.release, level: phrase.level,
      }));
    const gate = ctx.createGain();
    gate.connect(this.spatialOutput);
    const voice = { gate, end: Math.max(...notes.map(note => note.at + note.duration)), notes: [] as ReturnType<typeof voiceNode>[] };
    let remaining = notes.length;
    this.current = voice;

    for (const options of notes) {
      const note = voiceNode(ctx, gate, options);
      voice.notes.push(note);
      note.oscillator.onended = () => {
        if (--remaining !== 0) return;
        gate.disconnect();
        if (this.current !== voice) return;
        this.current = undefined;
        onEnd?.();
      };
    }
  }
}
