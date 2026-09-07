import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { waitUntil } from './wait.mjs';

/** A clock that never really sleeps, and counts how often it was asked to. */
function fakeSleep() {
  const sleep = async () => {
    sleep.calls += 1;
  };
  sleep.calls = 0;
  return sleep;
}

describe('waitUntil', () => {
  it('stops as soon as the thing is up', async () => {
    const sleep = fakeSleep();
    let answers = 0;

    const result = await waitUntil({
      probe: () => ++answers >= 3,
      attempts: 10,
      sleep,
    });

    assert.deepEqual(result, { ok: true, cancelled: false, attempts: 3 });
    assert.equal(sleep.calls, 2);
  });

  it('gives up after the last attempt instead of waiting again', async () => {
    const sleep = fakeSleep();

    const result = await waitUntil({ probe: () => false, attempts: 3, sleep });

    assert.deepEqual(result, { ok: false, cancelled: false, attempts: 3 });
    assert.equal(sleep.calls, 2);
  });

  /**
   * The reason this helper exists: a Ctrl-C during the wait has to end the wait.
   * Setting the flag alone did nothing while the loop never looked at it.
   */
  it('ends the wait when the startup is interrupted', async () => {
    const sleep = fakeSleep();
    let interrupted = false;
    let probes = 0;

    const result = await waitUntil({
      probe: () => {
        probes += 1;
        interrupted = true;
        return false;
      },
      attempts: 30,
      cancelled: () => interrupted,
      sleep,
    });

    assert.equal(result.ok, false);
    assert.equal(result.cancelled, true);
    assert.equal(probes, 1);
    assert.equal(sleep.calls, 0);
  });

  it('does not even probe when the interruption came first', async () => {
    let probes = 0;

    const result = await waitUntil({
      probe: () => {
        probes += 1;
        return true;
      },
      cancelled: () => true,
      sleep: fakeSleep(),
    });

    assert.equal(result.cancelled, true);
    assert.equal(probes, 0);
  });
});
