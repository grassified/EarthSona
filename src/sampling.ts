import type { Dataset, Point, Signal } from './datasets';

export function sample(frame: ImageData, dataset: Dataset, point: Point, column = false): Signal | null {
  const exact = samplePatch(frame, dataset, point, column ? 7 : 12, column);
  if (column || exact) return exact;
  const nearby = samplePatch(frame, dataset, point, 25, false);
  return nearby && { ...nearby, nearby: true };
}

export function sampleAudition(frame: ImageData, dataset: Dataset, point: Point) {
  return samplePatch(frame, dataset, point, 12, false, true);
}

function samplePatch(frame: ImageData, dataset: Dataset, point: Point, radius: number, column: boolean, allowWeak = false) {
  const { width, height, data } = frame;
  const x = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const left = Math.max(0, x - radius);
  const right = Math.min(width, x + radius + 1);
  const top = column ? 0 : Math.max(0, y - radius);
  const bottom = column ? height : Math.min(height, y + radius + 1);
  let positive = 0;
  let negative = 0;
  let marks = 0;

  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      const i = (row * width + col) * 4;
      const sign = dataset.classify(data[i], data[i + 1], data[i + 2]);
      if (sign === 1) {
        positive++;
        if (dataset.id === 'lightning' && lightningMark(frame, col, row)) marks++;
      }
      if (sign === -1) negative++;
    }
  }

  const area = (right - left) * (bottom - top);
  return classifyPatch(dataset, positive, negative, area, column, allowWeak, marks);
}

function classifyPatch(dataset: Dataset, positive: number, negative: number, area: number, column: boolean, allowWeak: boolean, marks: number) {
  const signal = classifyCounts(dataset, positive, negative, area, column);
  if (dataset.id === 'lightning') {
    return signal ?? (marks >= 2 ? { polarity: -1, coverage: marks / area, weak: true } : null);
  }
  if (signal || !allowWeak || !(positive + negative)) return signal;
  return {
    polarity: (dataset.density ? -1 : positive > negative ? 1 : positive < negative ? -1 : 0),
    coverage: Math.max(positive, negative) / area,
    weak: true,
  } satisfies Signal;
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

// Require a neighboring saturated yellow pixel and a bright core for weak ISS marks.
function lightningMark({ width, height, data }: ImageData, x: number, y: number) {
  const i = (y * width + x) * 4;
  const level = Math.min(data[i], data[i + 1]);
  if (level - data[i + 2] < 40) return false;
  for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++) {
    for (let col = Math.max(0, x - 1); col <= Math.min(width - 1, x + 1); col++) {
      if (row === y && col === x) continue;
      const j = (row * width + col) * 4;
      const neighbor = Math.min(data[j], data[j + 1]);
      if (neighbor >= 66 && neighbor - data[j + 2] >= 40 && Math.max(level, neighbor) >= 90) return true;
    }
  }
  return false;
}

// Every scan position is a centered 15-pixel window, clipped at image edges.
// Prefix sums classify each source pixel only once, independent of listening mode.
export function scanColumns(frame: ImageData, dataset: Dataset) {
  const { width, height, data } = frame;
  const positive = new Uint32Array(width + 1);
  const negative = new Uint32Array(width + 1);
  const marks = new Uint32Array(width + 1);
  const markRows = new Float64Array(width + 1);
  const positiveRows = new Float64Array(width + 1);
  const negativeRows = new Float64Array(width + 1);
  for (let x = 0; x < width; x++) {
    positive[x + 1] = positive[x];
    negative[x + 1] = negative[x];
    marks[x + 1] = marks[x];
    markRows[x + 1] = markRows[x];
    positiveRows[x + 1] = positiveRows[x];
    negativeRows[x + 1] = negativeRows[x];
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const sign = dataset.classify(data[i], data[i + 1], data[i + 2]);
      if (sign === 1) {
        positive[x + 1]++;
        positiveRows[x + 1] += y + .5;
        if (dataset.id === 'lightning' && lightningMark(frame, x, y)) {
          marks[x + 1]++;
          markRows[x + 1] += y + .5;
        }
      } else if (sign === -1) {
        negative[x + 1]++;
        negativeRows[x + 1] += y + .5;
      }
    }
  }
  return Array.from({ length: width }, (_, x) => {
    const left = Math.max(0, x - 7);
    const right = Math.min(width, x + 8);
    const pos = positive[right] - positive[left], neg = negative[right] - negative[left];
    const markCount = marks[right] - marks[left];
    const signal = classifyPatch(dataset, pos, neg, (right - left) * height, true, false, markCount);
    if (!signal) return null;
    // Density polarity encodes coverage, so all classified marks contribute.
    const usePositive = dataset.density || signal.polarity >= 0;
    const useNegative = dataset.density || signal.polarity <= 0;
    if (signal.weak) return { signal, point: { x: (x + .5) / width, y: (markRows[right] - markRows[left]) / markCount / height } };
    const rows = (usePositive ? positiveRows[right] - positiveRows[left] : 0) +
      (useNegative ? negativeRows[right] - negativeRows[left] : 0);
    const count = (usePositive ? pos : 0) + (useNegative ? neg : 0);
    return { signal, point: { x: (x + .5) / width, y: rows / count / height } };
  });
}

// Build the same patch used for direct audition at each longitude of a fixed row.
export function scanRow(frame: ImageData, dataset: Dataset, y: number) {
  const { data, width, height } = frame;
  const row = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  const top = Math.max(0, row - 12);
  const bottom = Math.min(height, row + 13);
  const positive = new Uint32Array(width + 1);
  const negative = new Uint32Array(width + 1);
  const marks = new Uint32Array(width + 1);
  for (let x = 0; x < width; x++) {
    positive[x + 1] = positive[x];
    negative[x + 1] = negative[x];
    marks[x + 1] = marks[x];
    for (let line = top; line < bottom; line++) {
      const i = (line * width + x) * 4;
      const sign = dataset.classify(data[i], data[i + 1], data[i + 2]);
      if (sign === 1) {
        positive[x + 1]++;
        if (dataset.id === 'lightning' && lightningMark(frame, x, line)) marks[x + 1]++;
      }
      if (sign === -1) negative[x + 1]++;
    }
  }
  return Array.from({ length: width }, (_, x) => {
    const left = Math.max(0, x - 12);
    const right = Math.min(width, x + 13);
    const signal = classifyPatch(dataset, positive[right] - positive[left], negative[right] - negative[left],
      (right - left) * (bottom - top), false, true, marks[right] - marks[left]);
    return signal && { signal, point: { x: (x + .5) / width, y } };
  });
}

// Read unfiltered source pixels using the prototype's point and column footprints.
export function sampleRgb(frame: ImageData, point: Point, column: boolean, nearby = false) {
  const { data, width, height } = frame;
  const x = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const radius = nearby ? 25 : 8;
  const left = column ? x : Math.max(0, x - radius);
  const right = column ? x : Math.min(width - 1, x + radius);
  const top = column ? 0 : Math.max(0, y - radius);
  const bottom = column ? height - 1 : Math.min(height - 1, y + radius);
  let red = 0, green = 0, blue = 0, count = 0;
  for (let row = top; row <= bottom; row += column ? 4 : 2) {
    for (let col = left; col <= right; col += 2) {
      const i = (row * width + col) * 4;
      red += data[i];
      green += data[i + 1];
      blue += data[i + 2];
      count++;
    }
  }
  const scale = count * 255;
  return { red: red / scale, green: green / scale, blue: blue / scale };
}

export type Rgb = ReturnType<typeof sampleRgb>;

type ScanBounds = { start: number; end: number };
const footprints = new WeakMap<ImageData, { full: ScanBounds; rows: (ScanBounds | undefined)[] }>();
const fullWidth: ScanBounds = { start: 0, end: 1 };

export function scanBounds(frame: ImageData, dataset: Dataset, y?: number) {
  if (dataset.id !== 'gedi') return fullWidth;
  let footprint = footprints.get(frame);
  if (!footprint) {
    footprint = gediFootprint(frame);
    footprints.set(frame, footprint);
  }
  return y === undefined ? footprint.full : footprint.rows[Math.min(frame.height - 1, Math.floor(y * frame.height))];
}

function gediFootprint({ width, height, data }: ImageData) {
  const left: { x: number; y: number }[] = [];
  const right: typeof left = [];
  for (let y = 0; y < height; y++) {
    let start = width, end = 0, visible = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.max(data[i], data[i + 1], data[i + 2]) < 12) continue;
      start = Math.min(start, x);
      end = x + 1;
      visible++;
    }
    if (visible < 3) continue;
    left.push({ x: start, y });
    right.push({ x: end, y });
  }
  // Bridge dark areas in the rendered globe with the outer silhouette of the still.
  const envelope = (edge: typeof left, side: number) => {
    const hull: typeof left = [];
    for (const c of edge) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2], b = hull[hull.length - 1];
        if (side * ((b.x - a.x) * (c.y - b.y) - (c.x - b.x) * (b.y - a.y)) < 0) break;
        hull.pop();
      }
      hull.push(c);
    }
    return hull;
  };
  const rows: (ScanBounds | undefined)[] = Array(height);
  const starts = envelope(left, 1), ends = envelope(right, -1);
  let l = 0, r = 0;
  const xAt = (a: (typeof left)[number], b: (typeof left)[number] | undefined, y: number) =>
    b ? a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y) : a.x;
  for (let y = starts[0]?.y ?? height; y <= (starts.at(-1)?.y ?? -1); y++) {
    if (y > starts[l + 1]?.y) l++;
    if (y > ends[r + 1]?.y) r++;
    rows[y] = { start: Math.floor(xAt(starts[l], starts[l + 1], y)) / width,
      end: Math.ceil(xAt(ends[r], ends[r + 1], y)) / width };
  }
  const full = { start: Math.min(width, ...left.map(p => p.x)) / width, end: Math.max(0, ...right.map(p => p.x)) / width };
  return { full: full.start < full.end ? full : fullWidth, rows };
}
