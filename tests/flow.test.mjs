import assert from 'node:assert/strict';
import test from 'node:test';
import { arrange, FlowSequence, ScanSequence } from '../src/arrangement.ts';

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

test('one-shot Flow uses a bounded horizon and skips late gestures after a stall', () => {
  const sequence = new FlowSequence(.04, up, 'ambient', 0, false);
  const times = [];
  assert.equal(sequence.advance(0, (_, at) => times.push(at)), false);
  assert.deepEqual(times, [.04]);
  assert.equal(sequence.advance(8, () => assert.fail('stale event')), true);
});

test('the next scan note uses the newest sample, with no catch-up burst after a stall', () => {
  const sequence = new ScanSequence();
  const heard = [];
  const record = ({ signal }, at, step) => {
    heard.push([signal, at, step]);
    return .25;
  };
  sequence.update({ signal: up }, 0);
  sequence.advance(0, record);
  sequence.update({ signal: { ...up, coverage: .14 } }, .1);
  sequence.update({ signal: { ...up, coverage: .31 } }, .24);
  sequence.advance(.24, record);
  assert.deepEqual(heard, [[up, .025, 0], [{ ...up, coverage: .31 }, .275, 1]]);
  sequence.advance(5, () => assert.fail('stale event'));
  sequence.update({ signal: down }, 5);
  sequence.advance(5, record);
  assert.deepEqual(heard[2], [down, 5.025, 0]);
});
