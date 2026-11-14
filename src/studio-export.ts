import { arrangement, tail, type Composition } from './composition';
import { voice } from './synth';

export type Format = 'wav' | 'webm';
const opusMime = 'audio/webm;codecs=opus';
export function exportFormats(): Format[] {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(opusMime)
    ? ['wav', 'webm'] : ['wav'];
}

export async function exportPiece(piece: Composition, format: Format, progress: (stage: 'rendering' | 'encoding') => void) {
  const { length, events } = arrangement(piece);
  const rate = 48000;
  const context = new OfflineAudioContext(1, Math.ceil((length + tail) * rate), rate);
  for (const event of events) voice(context, context.destination, event);
  // Initialize the encoder context during the click so browser autoplay policies can unlock it.
  const encoder = format === 'webm' ? new AudioContext() : undefined;
  const unlock = encoder?.resume();
  try {
    progress('rendering');
    const buffer = await context.startRendering();
    if (!encoder) return wav(buffer);
    await unlock;
    progress('encoding');
    return await opus(encoder, buffer);
  } finally {
    if (encoder) await encoder.close();
  }
}

function wav(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  const bytes = new ArrayBuffer(44 + data.length * 2);
  const header = new DataView(bytes);
  const tag = (offset: number, value: string) => [...value].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); header.setUint32(4, bytes.byteLength - 8, true);
  tag(8, 'WAVE'); tag(12, 'fmt '); header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, buffer.sampleRate, true); header.setUint32(28, buffer.sampleRate * 2, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  tag(36, 'data'); header.setUint32(40, data.length * 2, true);
  data.forEach((sample, i) => header.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true));
  return new Blob([bytes], { type: 'audio/wav' });
}

function opus(context: AudioContext, buffer: AudioBuffer) {
  const destination = context.createMediaStreamDestination();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  const recorder = new MediaRecorder(destination.stream, { mimeType: opusMime, audioBitsPerSecond: 96000 });
  return new Promise<Blob>((resolve, reject) => {
    const parts: Blob[] = [];
    const timeout = window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
      reject(new Error('Opus encoding timed out'));
    }, (buffer.duration + 4) * 1000);
    recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
    recorder.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Opus encoding failed'));
    };
    recorder.onstop = () => {
      window.clearTimeout(timeout);
      if (parts.length) resolve(new Blob(parts, { type: opusMime }));
      else reject(new Error('Opus encoder returned no audio'));
    };
    source.onended = () => {
      if (recorder.state !== 'inactive') recorder.stop();
      source.disconnect();
    };
    recorder.onstart = () => source.start(context.currentTime + .025);
    recorder.start();
  });
}
