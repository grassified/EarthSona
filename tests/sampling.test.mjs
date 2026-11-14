import assert from 'node:assert/strict';
import test from 'node:test';
import { sample, scanColumns } from '../src/sampling.ts';

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
  assert.equal(columns[46].polarity, 1);
  assert.equal(columns[0], null);
  columns.forEach((signal, x) => {
    assert.deepEqual(signal, sample(image, night, { x: (x + .5) / columns.length, y: .5 }, true));
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
  assert.equal(scanColumns(sparse, lightning)[30].polarity, 1);
  assert.equal(sample(bitmap(60, 60, () => 0), lightning, center), null);
});
