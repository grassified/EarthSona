import assert from 'node:assert/strict';
import test from 'node:test';
import { arrange, FlowSequence } from '../src/arrangement.ts';

const up = { polarity: 1, coverage: .12 };
const down = { ...up, polarity: -1 };

test('Flow keeps opposite contours and arranges them into phrases with rests', () => {
  for (const signal of [up, down]) {
    const { events } = arrange(signal, 'data', 0, 0);
    assert.ok(events[1].offset > events[0].duration);
    assert.notEqual(events[0].duration, events[1].duration);
    for (const { pitches } of events) {
      assert.ok(pitches.slice(1).every((pitch, i) => (pitch - pitches[i]) * signal.polarity > 0));
    }
  }
  assert.equal(arrange(up, 'ambient', 0, 0).events.length, 3);
  assert.equal(arrange(up, 'ambient', -5, 1).events.length, 2);
});

test('scheduling uses a bounded horizon and dropping the sequence clears pending audio', () => {
  const sequence = new FlowSequence(.04, 'ambient', 0, true, false);
  const times = [];
  const record = (_, at) => times.push(at);
  sequence.update(up, 0);
  sequence.advance(0, record);
  assert.equal(times.length, 1);
  assert.ok(times[0] <= .12);
  sequence.clear();
  sequence.advance(.1, record);
  sequence.advance(.55, record);
  assert.equal(times.length, 1);
});

test('a timer stall and stale input cannot produce a burst on resume', () => {
  const sequence = new FlowSequence(.04, 'ambient', 0, true, false);
  sequence.update(up, 0);
  sequence.advance(0, () => {});
  sequence.update(down, .1);
  sequence.advance(8, () => assert.fail('stale event'));
  sequence.update(down, 8);
  sequence.advance(8, (_, at) => assert.ok(at >= 8 && at <= 8.12));
});
