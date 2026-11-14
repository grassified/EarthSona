import assert from 'node:assert/strict';
import test from 'node:test';
import { arrangement, tail } from '../src/composition.ts';

test('preview and export share the beat grid, pitches and a bounded release', () => {
  for (const tempo of [45, 120, 220]) {
    const { length, events } = arrangement({ tempo, notes: [{step: 0, midi: 69}, {step: 15, midi: 81}] });
    assert.equal(length, 240 / tempo);
    assert.equal(events[0].frequency, 440);
    assert.equal(events[1].frequency, 880);
    assert.ok(events[1].at + events[1].duration <= length + tail);
    assert.ok(events.every(event => event.duration - event.release >= event.attack));
  }
});
