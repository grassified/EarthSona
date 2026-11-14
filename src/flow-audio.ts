import { FlowSequence, type FlowEvent } from './arrangement';
import type { Mode } from './audio';
import type { Signal } from './datasets';

type Voice = { oscillator: OscillatorNode; gain: AudioParam };

export class FlowAudio {
  private readonly voices: Voice[];
  private sequence?: FlowSequence;
  private timer = 0;
  private sustain = false;
  private pitches = [0, 0, 0];

  constructor(private readonly context: AudioContext, output: AudioNode) {
    this.voices = (['sine', 'sine', 'triangle'] as const).map(type => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      envelope.gain.value = 0;
      oscillator.type = type;
      oscillator.connect(envelope).connect(output);
      oscillator.start();
      return { oscillator, gain: envelope.gain };
    });
  }

  start(mode: Mode, register: number, repeat: boolean, preview: boolean, signal?: Signal, onEnd?: () => void) {
    this.stop();
    const now = this.context.currentTime;
    const sequence = new FlowSequence(now + .04, mode, register, repeat, preview);
    this.sequence = sequence;
    this.sustain = mode === 'ambient' && repeat;
    if (signal) sequence.update(signal, now);
    const tick = () => {
      if (this.sequence !== sequence || this.context.state !== 'running') return;
      if (sequence.advance(this.context.currentTime, (event, at) => this.schedule(event, at))) {
        this.stop();
        onEnd?.();
      }
    };
    this.timer = window.setInterval(tick, 25);
    tick();
  }

  update(signal: Signal) {
    this.sequence?.update(signal, this.context.currentTime);
  }

  stop() {
    window.clearInterval(this.timer);
    this.sequence?.clear();
    this.sequence = undefined;
    this.pitches.fill(0);
    const now = this.context.currentTime;
    for (const { oscillator, gain } of this.voices) {
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
      else {
        const current = gain.value;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(current, now);
      }
      gain.linearRampToValueAtTime(0, now + .027);
      oscillator.frequency.cancelScheduledValues(now);
    }
  }

  private schedule(event: FlowEvent, at: number) {
    const { oscillator, gain } = this.voices[event.lane];
    const { frequency } = oscillator;
    if (this.sustain && event.lane !== 0) {
      const pitch = event.pitches[0];
      const previous = this.pitches[event.lane];
      if (pitch !== previous) {
        frequency.setTargetAtTime(pitch, at, .22);
        this.pitches[event.lane] = pitch;
      }
      if (!previous) gain.setTargetAtTime(event.level * .72, at, .19);
      return;
    }
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
