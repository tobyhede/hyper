# 12 — Switching Spaces awaits the in-flight commit

**What to build:** With more than one Space open at once, a Space can be left while it is still saving, and a Space can be sitting in a state it cannot save out of while you are looking at something else. Make both safe, in the two ways issue 08 records against ADR 0057.

**Blocked by:** 11 — Enter a Space Card, and Open Spaces carries the session.

**Status:** ready-for-agent

- [ ] Switching Spaces awaits any in-flight commit on the Space being left. This is sufficient for the arrival case: `failed`, `rejected` and `conflicted` are published only from the commit-result handler, so a Space cannot go bad while idle — only as the outcome of a write it started. At the moment you leave, the Space has either settled or has just landed in a bad state while you are still looking at it.
- [ ] A Space that is already in a bad state when you leave it carries the mark on its **entry** in Open Spaces, and its conflict dialog does not open until you switch to it. A dialog for a Space that is not on screen asks for a decision about something the surface is not conducting.
- [ ] **Exit waits on an in-flight commit, and refuses on `failed` or `conflicted`.** Closing an entry is not a way to discard state the session could not save. The refusal carries a stable code (ADR 0057) and names the recovery that exists: Retry for `failed`, Accept remote or Resolve for `conflicted`. Both sit in the same Sidebar as Exit, so the refusal and its remedy are together.
- [ ] **Exit warns and allows on `rejected`.** This is deliberate and it reads backwards. A permanent failure has no recovery to point at, so refusing there would trap the entry with nothing the author could do about it — and note `rejected` is *not* in `submit`'s early return, so it differs from the other two in the code as well as in the rule.

## The state worth being careful about

`submit` (`packages/persistence/src/session.ts:150`) returns early when the previous state is `conflicted` or `failed`. A Space parked in either is therefore not merely un-saved but **un-saving**, and `conflicted` cannot self-heal — it needs an explicit accept-remote or resolve. So a mark on the entry is not decoration; it is the only signal that a Space you are not looking at has stopped saving. `rejected` is the asymmetry worth knowing: it is not in that guard, so a later submit does start a commit, which then fails permanently again.

All three rules are now written in ADR 0068's "Persistence across open Spaces" section, which refines ADR 0057. This ticket builds them.

## Not in scope

Any change to the session lifecycle, suspension of a backgrounded Space's session, or a new save model. The rules above hold without one, which is why they are worth taking first.
