import { FlowSequence, motif, ScanSequence, type FlowEvent, type Mode, type ScanInput, type Style } from './arrangement';
import { rgbChord } from './rgb-chords';
import type { Signal } from './datasets';

export class ScheduledAudio {
  private readonly voices: { oscillator: OscillatorNode; gain: AudioParam }[];
  private readonly output: GainNode;
  private sequence?: ScanSequence;
  private timer = 0;
  private tickScan?: () => void;

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
    this.voices = Array.from({ length: 3 }, () => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      envelope.gain.value = 0;
      oscillator.connect(envelope).connect(this.output);
      oscillator.start();
      return { oscillator, gain: envelope.gain };
    });
  }

  preview(output: AudioNode, mode: Mode, register: number, short: boolean, signal: Signal, onEnd: () => void) {
    this.connect(output, ['sine', 'sine', 'triangle']);
    const sequence = new FlowSequence(this.context.currentTime + (short ? .015 : .04), signal, mode, register, short);
    const tick = () => {
      if (this.context.state !== 'running') return;
      if (sequence.advance(this.context.currentTime, (event, at) => this.phrase(event, at))) {
        this.stop();
        onEnd();
      }
    };
    this.timer = window.setInterval(tick, 25);
    tick();
  }

  scan(output: AudioNode, style: Style, mode: Mode, register: number) {
    this.connect(output, style === 'rgb' ? ['sine', 'triangle', 'sine'] :
      [style === 'motif' && mode === 'data' ? 'triangle' : 'sine', 'sine', 'triangle']);
    const sequence = new ScanSequence();
    this.sequence = sequence;
    this.tickScan = () => {
      if (this.context.state !== 'running') return;
      sequence.advance(this.context.currentTime, (input, at, step) => this.note(input, at, step, style, mode, register));
    };
    this.timer = window.setInterval(this.tickScan, 25);
  }

  update(input: ScanInput, now: number) {
    if (this.sequence?.update(input, now)) {
      this.releaseVoices();
      this.tickScan?.();
    }
  }

  private connect(output: AudioNode, types: OscillatorType[]) {
    this.stop();
    this.output.disconnect();
    this.output.connect(output);
    this.voices.forEach(({ oscillator }, i) => { oscillator.type = types[i]; });
  }

  stop() {
    window.clearInterval(this.timer);
    this.sequence = undefined;
    this.tickScan = undefined;
    this.releaseVoices();
  }

  private releaseVoices() {
    const now = this.context.currentTime;
    for (const { oscillator, gain } of this.voices) {
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
      else {
        const current = gain.value;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(current, now);
      }
      gain.linearRampToValueAtTime(0, now + .022);
      oscillator.frequency.cancelScheduledValues(now);
    }
  }

  private note({ signal, rgb }: ScanInput, at: number, step: number, style: Style, mode: Mode, register: number) {
    const ambient = mode === 'ambient';
    const density = Math.min(1, Math.sqrt(signal.coverage));
    const weak = signal.weak ? .42 : 1;
    if (style === 'rgb' && rgb) {
      const spacing = (ambient ? .32 : .21) - density * .055 + (step % 2 ? .025 : 0);
      rgbChord(rgb, !!signal.weak).forEach(({ frequency, level }, lane) => {
        const accent = lane === step % 3 ? 1 : .78;
        this.tone(lane, frequency, level * accent, at, spacing, ambient ? .045 : .025);
      });
      return spacing;
    }

    if (style === 'motif') {
      const { frequencies, level } = motif(signal, mode, true);
      const beat = step % frequencies.length;
      const spacing = (ambient ? .155 : .112) - density * .038 + (beat === frequencies.length - 1 ? .036 : 0);
      this.tone(0, frequencies[beat], level * (beat === 0 ? .72 : .57), at, spacing, ambient ? .028 : .012);
      return spacing;
    }

    const contour = signal.polarity === 0 ? [0, 1, 0, -1] : signal.polarity > 0 ? [0, 1, 2] : [2, 1, 0];
    const beat = step % contour.length;
    const interval = 2 + Math.min(5, signal.coverage * 30);
    const root = (ambient ? 196 : 330) * 2 ** ((register + density * 4) / 12);
    const spacing = (ambient ? .285 : .165) - density * .052 + (beat === contour.length - 1 ? .052 : 0);
    const hz = (steps: number) => root * 2 ** (steps / 12);
    this.tone(0, hz(contour[beat] * interval), (ambient ? .073 : .123) * weak, at, spacing, ambient ? .038 : .017);
    if (ambient) {
      this.tone(1, hz(-12), .026 * weak, at, spacing, .12, 1);
      const accent = beat === contour.length - 1 && Math.floor(step / contour.length) % 2 === 0;
      this.tone(2, hz(signal.polarity < 0 ? 3 : 7), (accent ? .021 : .008) * weak, at, spacing, .08);
    }
    return spacing;
  }

  private tone(lane: number, pitch: number, level: number, at: number, spacing: number, glide: number, sustain = .48) {
    const { oscillator, gain } = this.voices[lane];
    oscillator.frequency.setTargetAtTime(pitch, at, glide);
    gain.setTargetAtTime(level, at, Math.min(.045, spacing * .22));
    if (sustain < 1) gain.setTargetAtTime(level * sustain, at + spacing * .58, spacing * .18);
  }

  private phrase(event: FlowEvent, at: number) {
    const { oscillator, gain } = this.voices[event.lane];
    const { frequency } = oscillator;
    const end = at + event.duration;
    gain.setValueAtTime(0, at);
    gain.linearRampToValueAtTime(event.level, at + event.attack);
    gain.setValueAtTime(event.level, end - event.release);
    gain.linearRampToValueAtTime(0, end);
    frequency.setValueAtTime(event.pitches[0], at);
    const spacing = (event.duration - event.release) / event.pitches.length;
    event.pitches.slice(1).forEach((pitch, index) => {
      const change = at + spacing * (index + 1);
      frequency.setValueAtTime(event.pitches[index], change);
      frequency.exponentialRampToValueAtTime(pitch, change + Math.min(.065, spacing / 2));
    });
  }
}
