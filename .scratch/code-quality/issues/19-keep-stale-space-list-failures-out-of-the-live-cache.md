# 19: Keep stale Space-list failures out of the live cache

**Priority:** P3 — confirmed redundant-read defect

**Status:** resolved

**Blocked by:** None; the hook exists after 09

**Problem:** An older referenceable-Spaces request can fail after a newer request succeeded. The failure handler guards `setSpaces` by the latest-request token, but resets `readEpoch.current` unconditionally. Hiding and showing the Space then fetches an epoch that already has a successful answer. The list itself initially remains correct; the confirmed consequence is unnecessary fetching, not proven data loss.

**Evidence:** `packages/app/src/referenceable-spaces.ts`, the catch branch in `useReferenceableSpaces`. A controlled hook probe starts request A at epoch 0, starts B at epoch 1, resolves B, rejects A, then toggles active off/on. It observes three calls rather than two. The same unconditional `readSpacesEpoch.current = null` exists in `bde05042:packages/app/src/App.tsx`; 278 moved the defect rather than introducing it.

**What to build:** Make both cache invalidation and result publication respect request ownership. Preserve the behavior that the latest failed read is retried when the Space is next shown. Decide explicitly whether an obsolete failure is still reported diagnostically; diagnostic reporting must not mutate the newer cache.

- [x] A deferred-promise regression demonstrates older failure after newer success without using sleeps
- [x] The newer list and its epoch remain valid; hide/show at that epoch causes no extra read
- [x] Older success after newer success cannot overwrite the newer list
- [x] Failure of the latest request still clears its own cache marker and retries on the next showing
- [x] The hidden Space remains unsubscribed, and one epoch change does not create a fetch loop
- [x] Hook tests use stable collaborators and settle controlled promises before teardown
- [x] App hook and Space-set freshness tests pass

**Resolution:** The catch branch in `useReferenceableSpaces` now returns before touching `readEpoch` or `spaces` when a later read has started, so only the latest read's failure clears the epoch marker and empties the list. An overtaken failure is still passed to `reportBreak`, because the read did fail, but it no longer mutates the cache. `app-hooks.test.tsx` drives two reads with `Promise.withResolvers` and settles them in both orders: an older failure or success after a newer success leaves the newer list and costs no read on the next showing; a latest failure empties the list, reads nothing while hidden across an epoch change, and reads once on the next showing.
