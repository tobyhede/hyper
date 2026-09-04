# 07 — Author a Space Card reference

**What to build:** An author can create a Space Card for a new or existing Space,
select the Layout and Graph it shows, and see that selection rendered in the
Card. The target remains independently editable while its lifetime is owned by
its references.

**Blocked by:** `layout-only-v1/03`; PR 134 delivered the Space Card aggregate
and atomic lifetime foundation.

ADR 0079 settled the selection this Card stores: a Space Card selects a Layout
and a Graph, and there is no Space View or Computed View alternative.
`layout-only-v1/03` retires the Space View selection this ticket must not author.
`layout-only-v1/04` owns the Space Card's content shape and the initialization a
layoutless target needs, and it waits on `space-cards/01`, which waits on this
ticket — so 04 is downstream of this ticket, not a blocker of it. This ticket
owns creation, title seeding, the cycle rule and the deletion cascade; the Open
and Enter surface that reads those selections belongs to 08.

**Status:** resolved
Tags: release/v1

- [x] Creating a Space Card can create a new ordinary Space or reference an existing one through the same Card shape.
- [x] One supplied creation title seeds the Space Card and new Space, after which
      their titles are independent. A new target Space is created complete through
      the one Space initializer — Markdown Card `Card 1` placed in its authored
      default Layout, one empty Active Graph, and that Layout persisted as
      `defaultLayout` — so creation never produces a blank canvas.
- [x] Many Space Cards may reference the same Space and cycles are refused. Deleting one reference preserves the target while another remains; deleting the last reference to an **ordinary** Space atomically deletes it and every newly-unreferenced descendant. The Meta Space is permanent and no deletion reaches it — the cycle rule already refuses any Space Card that would reference it (ADR 0074).
- [x] Authoring the reference — choosing the Layout and Graph the Card shows, and
      the title and deletion above — is reachable from the Card itself, without
      prescribing a canvas composition or control placement.
- [x] `pnpm verify`, `pnpm e2e` and the relevant Ladle E2E evidence pass.

## Comments

### What was built

The coordinated lifecycle already existed behind `SpaceSessionRegistry.spaceCards`
(PR 134, ADR 0076). What this ticket added is the surface that reaches it and the
two reads that surface needs.

- **`packages/app/src/space-card-lifecycle.ts`** is `SpaceCardAuthoring`: the
  registry's three writes plus `referenceableSpaces` (the containing Space
  withheld; every deeper cycle left to intake) and `target` (one Space's Layouts
  and the Graphs each owns, read through the live session where one is open).
  `createOpenSpaces` composes it once over the one registry and carries it on
  every `OpenSpace` entry, so an app is never composed half able to author a
  Space Card. The reads are proved in `packages/app/test/space-card-lifecycle.test.ts`;
  the three writes stay proved beside the coordination, in
  `packages/persistence/test/space-card-lifecycle.test.ts`.
- **Creation** is a third item on `AddCardControl` opening `NewSpaceCard`. One
  typed title, and a target that is either a new Space or one already stored.
  Unlike Alias creation the choice is not the completion — a Space Card always
  has a valid target available — so Create is a labelled action, disabled until
  the Card is titled. A refusal keeps the pane open with a cycle reported on the
  Space field.
- **`initializeSpace` now titles its first Card `Card 1`** rather than repeating
  the Space's title. The supplied title names the Space and nothing else, which
  is the criterion above and also reconciles the initializer with `newSpace`,
  which is now one call to it rather than a call plus a title override.
- **Selections** are authored on the Open Card: `CanvasCard`'s `space` front
  gained a marker naming the target and two `Select`s over the target's Layouts
  and that Layout's Graphs. Choosing a Layout re-seeds the Graph from it, because
  a Graph outside the selected Layout is an aggregate refusal rather than a state
  to store. There is no control anywhere that changes the target.
- **Deletion** routes a `space` Card to the lifecycle instead of Space
  Authoring, whose `space-card-deletion-unsupported` remains the seam's guard.
  The confirmation says the Space and its newly-unreferenced descendants may go
  with the Card, because V1 has no undo.

### One defect found on the way

Space Authoring cached its `Placement` and only ever wrote it from its own
completed Edits, so a Card added or removed by the coordinated lifecycle was
invisible to it: Opening a freshly created Space Card refused `card-not-in-layout`
for a Card plainly on the canvas, and a cascade-deleted Card would have lingered
as a position naming nothing. `reconcilePlacement` now runs on every session
notification outside an install window and reconciles **membership only**, so a
live drag, Open state or resize is never discarded by it.

### What the review found

A `/code-review high` pass over the branch found six ways a failure could leave a
surface with no way out, and one design question. The six are fixed and each has
a test:

- **`useSpaceCardTargets` never answered for a Space Card present at mount.**
  The unmount cleanup invalidated the read in flight but left the key recorded,
  so `StrictMode`'s setup → cleanup → setup sent the second setup down the early
  return, into a read whose answer the cleanup had just discarded. Nothing after
  the first render changes the set of referenced Spaces, so every Space Card on a
  reloaded canvas would have drawn without its target for the life of the page.
  The E2E suite missed it because every test creates its Space Card *after*
  mount, which changes the set.
- **A rejected target read stood as an answer**, so one transport timeout put
  every Space Card on the canvas permanently without its target. It now releases
  the key and asks again on the next Edit.
- **A rejected or throwing Delete locked its confirmation.** Both exits are
  withheld while a Delete runs — a Space Card's is a coordinated Edit across
  several Spaces — so the running state had to survive nothing. The synchronous
  half reached ordinary Markdown Cards too, `complete` throwing for a Space that
  has stopped loading.
- **A rejected create locked the creation pane**, for the same reason.
- **Escape dismissed the pane mid-Edit**, creating the Card the pane said it
  would not, and left the busy state behind to disable the next pane.
- **A failed Space listing silently offered only "A new Space"**, which reads as
  "there are no others" and invites a duplicate of the Space the author meant to
  reference.

**Not changed, and worth a second opinion:** `referenceableSpaces` offers the
Meta Space, and a Space Card that referenced it is always refused as a cycle —
every ordinary Space is reachable from Meta, so pointing at Meta always closes
one. The criterion above leans on exactly that ("the cycle rule already refuses
any Space Card that would reference it"), and
`packages/app/test/space-card-lifecycle.test.ts` pins the current behaviour, so
withholding the row is a design change rather than a fix.

### What is deliberately not here

- **The Card stores no selection at creation.** `create` writes the target
  reference and nothing else, so a just-created Space Card opens on `No Layout`
  over a target that has one to offer. Storing the target's default Layout and
  Active Graph at creation — and waiting for a layoutless target to initialize
  first — is `layout-only-v1/04`, which is downstream of this ticket.
- **The cycle refusal has no application E2E**, because a cycle needs a Space
  Card authored from *inside* an entered Space and Entering is
  `entity-url-addressability/08`. Its parity claim takes the documented
  `applicationEvidence` exemption and the refusal is proved through the
  application path in `packages/app/test/space-card-authoring.test.tsx`.
- **A target Space's Layouts are read once per set of referenced Spaces**, not
  kept in step. Watching every target for edits would subscribe this Space to
  sessions it does not own.
