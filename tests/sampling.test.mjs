import assert from 'node:assert/strict';
import test from 'node:test';
import { sample, sampleAudition, sampleRgb, scanColumns, scanRow, scanBounds } from '../src/sampling.ts';

const night = { id: 'night', classify: red => red === 1 ? 1 : red === 2 ? -1 : 0 };
const center = { x: .5, y: .5 };
function bitmap(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[(y * width + x) * 4] = pixel(x, y);
  }
  return { width, height, data };
}

test('dense scan finds an isolated feature between all six former Ambient positions', () => {
  const image = bitmap(180, 60, x => x === 46 ? 1 : 0);
  for (let index = 0; index < 6; index++) {
    assert.equal(sample(image, night, { x: index / 6, y: .5 }, true), null);
  }
  const columns = scanColumns(image, night);
  assert.equal(columns[46].signal.polarity, 1);
  assert.equal(columns[0], null);
  columns.forEach((signal, x) => {
    assert.deepEqual(signal?.signal ?? null, sample(image, night, { x: (x + .5) / columns.length, y: .5 }, true));
  });
});

test('balanced Night Lights colors play together, sparse points widen, empty points stay silent', () => {
  const mixed = bitmap(60, 60, x => x < 30 ? 1 : 2);
  assert.equal(sample(mixed, night, center).polarity, 0);
  const sparse = bitmap(60, 60, x => x === 11 ? 1 : 0);
  assert.equal(sample(sparse, night, center).nearby, true);
  assert.equal(sample(bitmap(60, 60, () => 0), night, center), null);
});

test('visible event density separates dense, sparse and empty patches and columns', () => {
  const lightning = { ...night, id: 'lightning', density: { point: .05, column: .009 } };
  const dense = bitmap(60, 60, (x, y) => (x + y) % 4 === 0 ? 1 : 0);
  const sparse = bitmap(60, 60, (x, y) => x % 6 === 0 && y % 7 === 0 ? 1 : 0);
  assert.equal(sample(dense, lightning, center).polarity, 1);
  assert.equal(sample(sparse, lightning, center).polarity, -1);
  assert.equal(scanColumns(sparse, lightning)[30].signal.polarity, 1);
  assert.equal(sample(bitmap(60, 60, () => 0), lightning, center), null);
});


test('direct audition recognizes a weak classified patch while presets remain silent', () => {
  const weak = bitmap(60, 60, (x, y) => x === 30 && y === 30 ? 1 : 0);
  assert.equal(sample(weak, night, center), null);
  assert.deepEqual(sampleAudition(weak, night, center), { polarity: 1, coverage: 1 / 625, weak: true });
  assert.equal(sampleAudition(weak, night, { x: 0, y: 0 }), null);
});

test('scan position uses the contributing rows and ignores the opposing minority', () => {
  const image = bitmap(60, 60, (x, y) => y < 6 ? 1 : y === 59 ? 2 : 0);
  const column = scanColumns(image, night)[30];
  assert.equal(column.signal.polarity, 1);
  assert.deepEqual(column.point, { x: 30.5 / 60, y: .05 });
});

test('RGB averages include unclassified source pixels in a clipped point or full column', () => {
  const image = bitmap(2, 9, (x, y) => x === 0 && y < 8 ? 255 : 0);
  image.data[1] = 102;
  image.data[2] = 51;
  assert.deepEqual(sampleRgb(image, { x: 0, y: 0 }, true), { red: 2 / 3, green: 102 / 765, blue: 51 / 765 });
  assert.deepEqual(sampleRgb(image, { x: 0, y: 0 }, false), { red: 4 / 5, green: 102 / 1275, blue: 51 / 1275 });
});


test('row scans match direct audition on the selected row, including weak input and clipped edges', () => {
  const image = bitmap(72, 90, (x, y) => y === 9 && x === 0 ? 1 : y >= 60 && x > 45 ? 2 : 0);
  const y = .1;
  const samples = scanRow(image, night, y);
  assert.equal(samples[0].signal.weak, true);
  assert.equal(samples.at(-1), null);
  assert.equal(scanRow(image, night, .8).at(-1).signal.polarity, -1);
  samples.forEach((value, x) => {
    assert.deepEqual(value?.signal ?? null, sampleAudition(image, night, { x: (x + .5) / image.width, y }));
    if (value) assert.equal(value.point.y, y);
  });
});


test('GEDI bounds skip exterior padding while retaining a dark region inside the silhouette', () => {
  const image = bitmap(20, 12, (x, y) => y >= 2 && y <= 9 && y !== 5 && x >= 4 && x < 16 ? 60 : 0);
  const gedi = { ...night, id: 'gedi' };
  assert.deepEqual(scanBounds(image, gedi), { start: .2, end: .8 });
  assert.deepEqual(scanBounds(image, gedi, 5 / 12), { start: .2, end: .8 });
  assert.equal(scanBounds(image, gedi, 0), undefined);
  assert.deepEqual(scanBounds(image, night, 0), { start: 0, end: 1 });
});

test('ISS weak marks require clustered yellow pixels and keep the sparse polarity', () => {
  const image = bitmap(60, 60, () => 0);
  const lightning = { ...night, id: 'lightning', density: { point: .05, column: .009 },
    classify: (r, g, b) => r >= 72 && g >= 60 && Math.min(r, g) - b >= 30 ? 1 : 0 };
  const paint = (x, y, rgb) => image.data.set(rgb, (y * image.width + x) * 4);
  paint(30, 30, [130, 128, 25]);
  paint(29, 30, [120, 120, 120]);
  assert.equal(sampleAudition(image, lightning, center), null);
  assert.equal(scanColumns(image, lightning)[30], null);
  paint(31, 30, [108, 102, 28]);
  assert.deepEqual(sampleAudition(image, lightning, center), { polarity: -1, coverage: 2 / 625, weak: true });
  assert.equal(scanColumns(image, lightning)[30].signal.weak, true);
  assert.equal(scanRow(image, lightning, .5)[30].signal.polarity, -1);
  assert.equal(scanColumns(image, lightning)[0], null);
});
