import type { Dataset } from './datasets';

const treatments: Record<string, { context: number; signal: number }> = {
  night: { context: 0, signal: 1.42 },
  ocean: { context: .15, signal: 1.12 },
  lightning: { context: .27, signal: 1.32 },
};
const cache = new WeakMap<ImageData, { base?: ImageData; light: boolean; pixels: Uint32Array }>();

// The display raster has the source grid but is never used for classification.
export function globeDisplay(dataset: Dataset, source: ImageData, base: ImageData | undefined, light: boolean) {
  // Night Lights already includes the basemap aligned to its colored marks.
  if (dataset.id === 'night') base = undefined;
  const previous = cache.get(source);
  if (previous && previous.base === base && previous.light === light) return previous.pixels;
  const { width, height, data } = source;
  const { context, signal } = treatments[dataset.id] ?? { context: .2, signal: 1 };
  const brightness = dataset.id === 'night' ? 1.06 : 1;
  const output = new Uint8ClampedArray(data.length);
  for (let row = 0; row < height; row++) {
    const baseRow = base ? Math.floor((row + .5) / height * base.height) * base.width : 0;
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const detected = dataset.classify(r, g, b);
      if (detected) {
        // Scale all channels together so a stronger signal keeps its hue.
        const gain = Math.min(signal * brightness * (light ? 1.08 : 1), 255 / Math.max(1, r, g, b));
        output[i] = r * gain;
        output[i + 1] = g * gain;
        output[i + 2] = b * gain;
      } else {
        const neutral = base ? (baseRow + Math.floor((col + .5) / width * base.width)) * 4 : 0;
        const gain = brightness * (light ? 1.12 : 1);
        output[i] = (r * .75 + (base?.data[neutral] ?? 0) * context) * gain;
        output[i + 1] = (g * .75 + (base?.data[neutral + 1] ?? 0) * context) * gain;
        output[i + 2] = (b * .75 + (base?.data[neutral + 2] ?? 0) * context) * gain;
      }
      output[i + 3] = 255;
    }
  }
  const pixels = new Uint32Array(output.buffer);
  cache.set(source, { base, light, pixels });
  return pixels;
}
