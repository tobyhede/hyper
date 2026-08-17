# 09 — Reconcile the Card Description contract

**What to decide:** Determine whether a Card Description appears on the Card
front or only inside the opened Card editor, then make the domain docs, accepted
decisions, schema guidance, production UI and tests state one contract.

**Blocked by:** None — resolve before further Card-front or Card-editor work.

**Status:** resolved

**Delivered by:** PR #73 — Retire shared Card Description.

- [x] Compare the branch's title-only Card front with ADR 0006's description-under-title direction and ADR 0048's Markdown editor field contract.
- [x] Decide that title-only is the intended product behavior after grilling the trade-off rather than treating it as accidental scope creep.
- [x] Record a new ADR that supersedes or refines the affected accepted ADRs, updating relationship metadata from both ends.
- [x] `CONTEXT.md`, schema comments, `CanvasCard`, the opened Markdown editor, fixtures and tests all implement the resulting decision without deleting Description data silently.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Description is retired from the shared Card model. A Card owns identity, kind
and Title; its kind owns every additional field, its opened editor, and its
Card-front presentation within uniform Card geometry. Markdown owns body and
Alias owns Target. The lower-information title-only overview is an accepted
cost, not a gap to fill with another shared synopsis mechanism.

There is no migration or compatibility work: Hyper is prerelease experimental
software and has no existing authored Description data. Tracked Description
values are fixtures to remove during implementation.

ADR 0051 records the decision and refines ADRs 0006 and 0048. `CONTEXT.md`, the
schema, fixtures, production UI and tests now state and implement the resulting
domain contract.
