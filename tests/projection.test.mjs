import assert from 'node:assert/strict';
import test from 'node:test';
import { globalBounds, globePosition, mapPoint, radians, screenPoint, surface } from '../src/projection.ts';

test('rotating a known geographic point to center preserves the source sample', () => {
  for (const [x, y] of [[.690, .378], [.466, .270], [.145, .502], [.54, .64]]) {
    const view = { longitude: (x * 360 - 180) * radians, latitude: (90 - y * 180) * radians };
    const point = mapPoint(surface(0, 0, view), globalBounds);
    assert.ok(Math.abs(point.x - x) < 1e-10);
    assert.ok(Math.abs(point.y - y) < 1e-10);
  }
  assert.equal(surface(1, 1, {longitude: 0, latitude: 0}), null);
});

test('screen positioning follows visible globe picks across the longitude seam and near the poles', () => {
  for (const view of [
    { longitude: 179 * radians, latitude: 15 * radians },
    { longitude: -179 * radians, latitude: 83 * radians },
    { longitude: -179 * radians, latitude: -83 * radians },
  ]) {
    for (const [x, y] of [[0, 0], [-.65, .3], [.68, -.4]]) {
      const point = mapPoint(surface(x, y, view), globalBounds);
      const screen = screenPoint(point, globalBounds, view);
      assert.ok(Math.abs(screen.x - x) < 1e-10);
      assert.ok(Math.abs(screen.y - y) < 1e-10);
    }
  }
  assert.equal(screenPoint({ x: .99, y: .5 }, globalBounds, { longitude: 0, latitude: 0 }), undefined);
});

test('the same longitude can be in front of or behind a tilted globe', () => {
  const view = { longitude: 0, latitude: 60 * radians };
  const north = globePosition({ x: .75, y: .25 }, globalBounds, view);
  const south = globePosition({ x: .75, y: .75 }, globalBounds, view);
  assert.ok(north.z > .6);
  assert.ok(south.z < -.6);
  assert.ok(Math.abs(north.x - south.x) < 1e-10);
});
