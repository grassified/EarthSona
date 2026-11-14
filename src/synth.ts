export function voice(context: BaseAudioContext, output: AudioNode, options: {
  frequency: number; at: number; duration: number; attack: number;
  release: number; level: number; type: OscillatorType;
}) {
  const { frequency, at, duration, attack, release, level, type } = options;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const end = at + duration;
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(level, at + attack);
  envelope.gain.setValueAtTime(level * .8, end - release);
  envelope.gain.linearRampToValueAtTime(0, end);
  oscillator.connect(envelope).connect(output);
  oscillator.start(at);
  oscillator.stop(end);
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect();
    envelope.disconnect();
  }, { once: true });
  return { oscillator, end };
}
