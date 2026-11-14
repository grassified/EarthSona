import assert from 'node:assert/strict';
import test from 'node:test';
import { globalBounds, mapPoint, radians, surface } from '../src/projection.ts';

test('rotating a known geographic point to center preserves the source sample', () => {
  for (const [x, y] of [[.690, .378], [.466, .270], [.145, .502], [.54, .64]]) {
    const view = { longitude: (x * 360 - 180) * radians, latitude: (90 - y * 180) * radians };
    const point = mapPoint(surface(0, 0, view), globalBounds);
    assert.ok(Math.abs(point.x - x) < 1e-10);
    assert.ok(Math.abs(point.y - y) < 1e-10);
  }
  assert.equal(surface(1, 1, {longitude: 0, latitude: 0}), null);
});
