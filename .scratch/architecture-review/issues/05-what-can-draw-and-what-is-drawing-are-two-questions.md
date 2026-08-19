# What can draw and what is drawing are two questions

Status: resolved

Surfaced by: grilling issue 06's candidate. The module answers two questions and
returns them as one value, which is why its name kept coming out wrong.

Blocked by: issue 04. It settles the vocabulary this is written in and renames
the module. Start on a fresh branch after 04 lands.

## The defect

`canvasRenderers(space, selected)` returns `{ computed, authored, selected }`.
Two questions are welded into one operation:

```
what can draw this Space   f(space)              total       — cannot fail
what is drawing            f(space, rendererId)  partial     — throws on a Layout that is gone
```

They are welded because reference identity was chosen as the mechanism for
"which row is pressed". The module's own comment says so: `selected` is
"reference-identical to one row in `computed` or in `authored` … so the pressed
test is `===` rather than a field-by-field comparison made at each site". That
identity requires both answers to come out of one call.

It is a mechanism choice, not a domain fact, and it costs two things.

**The list loses its totality.** The module throws when the id names a Layout the
Space no longer holds — a property of the second question. Welded, it takes the
first down with it: a caller cannot ask what can draw this Space without also
asserting that some particular id still resolves.

**The id is not an input to the first answer at all.** `COMPUTED` is a frozen
module constant and `authored` is `space.layouts.map(…)`. Neither reads it. The
interface is wider than the behaviour needs for half of what it returns.

**And the weld is not what prevents the drift it was protecting against.**
`SelectedCanvasRenderer` takes the **row**, never a title and a kind, and its own
comment argues exactly that — taking the row means the only way to draw the
header is to have built the list. A second operation returning a row *from the
list it was handed* keeps that guarantee without one value carrying both answers.

## What to build

Two operations in the one module:

- `canvasRenderers(space)` — the computed and authored groups. Total. Takes no
  id and cannot throw.
- `currentRenderer(renderers, id)` — which row is current, by reference, from the
  list it was given. Partial: it throws on a Layout the Space no longer holds,
  exactly as it does today and in the same words.

`currentRenderer` rather than `selectedRenderer`: the latter is Navigation's
field, and giving a differently-shaped value the same name invites the confusion
issue 04 exists to unwind.

This is a pure structural change. **No renaming lands with it** — issue 04 did
all of it — which is what makes the diff readable.

Call sites to convert: `App.tsx`, `WorkspaceSidebar.tsx`,
`stories/support/WorkspaceSidebarFixture.tsx`, and `test/canvas-renderers.test.ts`.

## Why not the other two shapes

- **Keep one operation.** Rejected: it is the defect above.
- **Two modules — the list is a fact about the Space, the current one is
  Navigation's.** Rejected for now, not on principle. Navigation already holds
  the id and already resolves it, so the split reads clean; but it puts the
  row-lookup where `SelectedCanvasRenderer` cannot reach it without going through
  Navigation, and the drift issue 02 fixed was precisely the header deriving its
  own answer. Two operations in one module leaves that door open: if Navigation
  later wants the current row, it calls the same operation.

## Acceptance criteria

- [ ] `canvasRenderers(space)` takes no id and has no throwing path.
- [ ] `currentRenderer(renderers, id)` returns a row that is reference-identical to one in the list it was passed, and throws on a missing Layout with the message it throws today.
- [ ] Every call site takes both operations; none rebuilds a list to look a row up in.
- [ ] The test file covers the two separately, including that the list is answerable for a Space whose id argument would have thrown.
- [ ] No identifier is renamed in this ticket.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with real output quoted. `pnpm e2e` green and **unchanged** — nothing here is meant to reach behaviour.

## Answer

Implemented in `a8edfde`. `canvasRenderers(space)` is now total and returns only
the computed and authored groups; `currentRenderer(renderers, id)` returns the
reference-identical current row from that supplied list and preserves the
existing missing-Layout refusal. App, Sidebar, story support, and tests build the
list once and pass it into the lookup.

TDD evidence: the total-list tracer failed when the old operation dereferenced
an absent id, and the current-row tracer then failed because `currentRenderer`
did not exist. Both went green before call-site conversion. Final verification:
`pnpm verify` passed, `pnpm e2e` passed all 97 unchanged tests, and
`pnpm e2e:ladle` passed 8 tests. Standards and Spec reviews each reported zero
findings.
