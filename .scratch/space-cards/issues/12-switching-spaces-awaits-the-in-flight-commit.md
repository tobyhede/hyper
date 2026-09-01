# 12 — Preserve persistence safety while switching Spaces

**What to build:** Complete the session registry's persistence behavior when an
author switches or closes one of several live Space contexts.

**Blocked by:** `entity-url-addressability/08` — Open, enter and independently
address a Space Card.

**Status:** superseded by `architecture-review/14`
Tags: release/v1

The Open Spaces module now contains this ticket's complete persistence-safety
acceptance. The criteria below are historical only; do not build or verify a
second switching/closing coordinator here.

- [ ] Switching Spaces awaits an in-flight commit on the Space being left.
- [ ] An inactive Space whose session has failed or conflicted remains
      discoverable, while conflict resolution waits until that Space is the
      context being worked in. Exact placement and treatment remain UX work.
- [ ] Closing a Space waits on its in-flight commit and refuses on `failed` or
      `conflicted`; closing cannot discard state the session may still recover.
- [ ] Closing warns and allows on `rejected`, because a permanent rejection has
      no recovery that justifies trapping the context indefinitely.
- [ ] Entering or independently opening an already-live Space reuses the same
      Space-ID-owned session rather than creating a second local writer.

## Not in scope

Suspending background sessions, prescribing the UI treatment, or introducing a
different save model.
