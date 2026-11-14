import type { Dataset, Point, Signal } from './datasets';

export function sample(frame: ImageData, dataset: Dataset, point: Point, column = false): Signal | null {
  const exact = samplePatch(frame, dataset, point, column ? 7 : 12, column);
  if (column || exact) return exact;
  const nearby = samplePatch(frame, dataset, point, 25, false);
  return nearby && { ...nearby, nearby: true };
}

function samplePatch(frame: ImageData, dataset: Dataset, point: Point, radius: number, column: boolean) {
  const { width, height, data } = frame;
  const x = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const left = Math.max(0, x - radius);
  const right = Math.min(width, x + radius + 1);
  const top = column ? 0 : Math.max(0, y - radius);
  const bottom = column ? height : Math.min(height, y + radius + 1);
  let positive = 0;
  let negative = 0;

  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      const i = (row * width + col) * 4;
      const sign = dataset.classify(data[i], data[i + 1], data[i + 2]);
      if (sign === 1) positive++;
      if (sign === -1) negative++;
    }
  }

  return classifyCounts(dataset, positive, negative, (right - left) * (bottom - top), column);
}

function classifyCounts(dataset: Dataset, positive: number, negative: number, area: number, column: boolean): Signal | null {
  const dominant = Math.max(positive, negative);
  const coverage = dominant / area;
  if (dominant < 5 || coverage < .008) return null;
  if (dataset.density) {
    const threshold = column ? dataset.density.column : dataset.density.point;
    return { polarity: coverage >= threshold ? 1 : -1, coverage };
  }
  const balanced = Math.abs(positive - negative) < (positive + negative) * .25;
  if (!balanced || dataset.id !== 'night') return { polarity: positive > negative ? 1 : -1, coverage };
  const minority = Math.min(positive, negative);
  if (dataset.id === 'night' && minority >= 5 && minority / area >= .008) {
    return { polarity: 0, coverage: (positive + negative) / area };
  }
  return { polarity: positive > negative ? 1 : -1, coverage };
}

// Every scan position is a centered 15-pixel window, clipped at image edges.
// Prefix sums classify each source pixel only once, independent of listening mode.
export function scanColumns(frame: ImageData, dataset: Dataset) {
  const { width, height, data } = frame;
  const positive = new Uint32Array(width + 1);
  const negative = new Uint32Array(width + 1);
  for (let x = 0; x < width; x++) {
    positive[x + 1] = positive[x];
    negative[x + 1] = negative[x];
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const sign = dataset.classify(data[i], data[i + 1], data[i + 2]);
      if (sign === 1) positive[x + 1]++;
      if (sign === -1) negative[x + 1]++;
    }
  }
  return Array.from({ length: width }, (_, x) => {
    const left = Math.max(0, x - 7);
    const right = Math.min(width, x + 8);
    return classifyCounts(dataset, positive[right] - positive[left], negative[right] - negative[left], (right - left) * height, true);
  });
}
