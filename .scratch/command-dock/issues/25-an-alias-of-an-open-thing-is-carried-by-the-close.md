# 25 — An Alias of an Open Thing is carried off by that Thing's Close

Status: needs-triage
Blocked by: nothing. Surfaced reviewing `19`–`21`; the code is ADR 0089's
`createAliasFrom`, the rule is ADR 0084's.

**What to build:** creating an Alias from an Open Thing and then Closing that
Thing leaves the Alias where the author can still see it.

## Why

`createAliasFrom` anchors the new Alias at `ALIAS_OFFSET_RATIO` (0.75) of the
Target's *open* size, so it sits clear of the Target's edges by `0.25 ×
openSize`. ADR 0084's Close applies the negated growth — `openSize −
COLLAPSED_THING_SIZE` — to every Thing strictly beyond the subject, which is a
much larger step than the gap the Alias was given.

Concretely: open Thing B, resize it to roughly four times the collapsed size,
Create Alias on it, then Close B. The Alias lands exactly on B's position;
beyond 4× it is carried *across* B. `packages/graph/src/placement.ts:322-334`
already records that reopening does not push such a Thing back — "closing
carries that Thing back across the subject and the reopen leaves it there" — so
this is not a round trip that repairs itself.

**The Alias was never displaced by the Open**, having been created after it, so
the Close is reclaiming space it never took. That is the asymmetry, and it is
the offset rather than ADR 0084 that is wrong about it.

## The shape of the fix

Anchor the offset on `COLLAPSED_THING_SIZE` past the grown rect rather than on a
ratio of it — place the Alias clear of the *open* extent by a collapsed step.
That keeps the "not inside the Target's body" property the current comment
argues for, and survives the Close.

- [ ] The decision is recorded here
- [ ] A test fails without the fix: Alias of a 4×-resized Open Thing, then Close
- [ ] `pnpm verify` and `pnpm e2e` green
