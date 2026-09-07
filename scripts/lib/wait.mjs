// Waiting for something to come up, without swallowing a Ctrl-C.
//
// Both waits in `pnpm dev` (PostgreSQL, then the backend) poll: they run for up
// to a minute, and for that whole minute they are the only thing standing
// between the developer and the prompt. A wait that does not ask whether the
// startup was interrupted turns Ctrl-C into "nothing happens", so asking is
// part of the loop rather than something each caller remembers.
//
// The clock is injectable so the behaviour can be tested in milliseconds.

/**
 * Polls `probe` until it answers truthy.
 *
 * Returns `{ ok: true }` as soon as it does, `{ cancelled: true }` when
 * `cancelled()` turns true — checked before every attempt and again before
 * every pause — and `{ ok: false }` when the attempts run out.
 */
export async function waitUntil({
  probe,
  attempts = 30,
  intervalMs = 1000,
  cancelled = () => false,
  sleep = delay,
}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (cancelled()) return { ok: false, cancelled: true, attempts: attempt - 1 };
    if (await probe()) return { ok: true, cancelled: false, attempts: attempt };
    if (attempt === attempts) break;
    if (cancelled()) return { ok: false, cancelled: true, attempts: attempt };
    await sleep(intervalMs);
  }
  return { ok: false, cancelled: cancelled(), attempts };
}

export function delay(ms) {
  return new Promise((done) => setTimeout(done, ms));
}
