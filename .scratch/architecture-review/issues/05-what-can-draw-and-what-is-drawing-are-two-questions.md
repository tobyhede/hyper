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

- [x] `canvasRenderers(space)` takes no id and has no throwing path.
- [x] `currentRenderer(renderers, id)` returns a row that is reference-identical to one in the list it was passed, and throws on a missing Layout with the message it throws today.
- [x] Every call site takes both operations; none rebuilds a list to look a row up in.
- [x] The test file covers the two separately, including that the list is answerable for a Space whose id argument would have thrown.
- [x] No identifier is renamed in this ticket.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with real output quoted. `pnpm e2e` green and **unchanged** — nothing here is meant to reach behaviour.

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

## Follow-up: what splitting the operation cost, and how it was paid

A later review of the same branch found nothing wrong with the split and two
things the split left behind. Both are fixed here, each behind a test that
failed first.

**The View arm wrote a refusal the type had ruled out.** Separating the two
questions turned the row lookup into a search of `[...computed, ...authored]`,
and a search has a not-found case for every kind of id — including the View
kind, whose `BuiltInViewId` `BY_VIEW` answers totally. That branch could not be
reached by any caller or covered by any test without a cast, and the comment on
`BY_VIEW` was still explaining, three lines up, why searching for a View was the
mistake it had just become again. `currentRenderer` now answers each arm from
the one source that can answer it: `BY_VIEW[id.view]` for a View, and a search
of `authored` alone for a Layout. The refusal that remains is the Layout one the
ticket asked to preserve, and it is the only one. Reference identity survives the
change because `computed` is always the module constant `COMPUTED`, whose rows
are the very objects `BY_VIEW` holds.

**The sidebar's pressed test lost the guarantee it rested on.** Issue 02 made
that test `===` and could, because one call returned the list and the selection
together. This ticket separated them on purpose, and `===` then rested on a
comment — "reference-identical to one row in renderers" — that the structural
interface cannot check. `canvasRenderers` mints a fresh authored row per call, so
a caller pairing a list from one derivation with a current row from a second drew
a Layout list with nothing pressed: no throw, and no test that would notice. The
pressed test is now `canvasRendererKey`, which exists for exactly this question
and is already what the row keys and `data-renderer` are written in. Issue 02's
criterion is superseded rather than broken — its guarantee came from the weld
this ticket deliberately removed.

Regression tests: `canvas-renderers.test.ts` now covers every built-in View
resolving to the row `computed` holds, a View answering with the computed group
emptied, and two calls minting equal-but-distinct authored rows;
`WorkspaceSidebar.test.tsx` presses a row a second derivation built. The first
and last failed before the fix — `The selected View flow does not exist.` and
`expected [] to have a length of 1`.

Two stale comments were corrected with them: the `BY_VIEW` block, which argued
against the code beneath it, and `layoutNotFound` in `renderer.ts`, which still
named `canvasRenderers` as the second module asking for it when the asker is now
`currentRenderer`.

## Verification

Re-run at `4deeb02` in a clean worktree after the follow-up fixes, so these are
the numbers for the branch as it stands rather than for its first commit. All
three exited 0. The Playwright blocks quote the header, a slice of the `✓`
lines, and the summary; the vitest block is the tail of `test:coverage`.

`pnpm verify`, exit 0:

```
> pnpm typecheck && pnpm typecheck:packages && pnpm ui:catalog:check && pnpm lint && pnpm format:check && pnpm test:coverage
All matched files use Prettier code style!
 Test Files  128 passed (128)
      Tests  1291 passed | 8 skipped (1299)
   Duration  26.27s (transform 2.77s, setup 7.50s, collect 51.04s, tests 47.21s, environment 14.09s, prepare 8.49s)
```

`pnpm e2e`, exit 0. Ninety-seven tests, the count the branch inherited — this is
the unchanged-behaviour guard the acceptance criteria asked for, and the two
renderer-touching specs among them are quoted here:

```
Running 97 tests using 4 workers
  ✓  41 [chromium] › packages/app/e2e/editing.spec.ts:1581:1 › an opened Card is modal, so no renderer change can strand its editor (2.0s)
  ✓  58 [chromium] › packages/app/e2e/mobile-sidebar.spec.ts:56:1 › choosing a canvas or a Graph closes the mobile sidebar (2.7s)
  ✓  97 [new-space] › packages/app/e2e/new-space.spec.ts:395:1 › a completed edit and workspace identity survive reload (2.1s)

  97 passed (58.8s)
```

`pnpm e2e:ladle`, exit 0. This is the job neither `verify` nor `e2e` runs, and
the Sidebar is what this ticket changed:

```
Running 8 tests using 4 workers
  ✓  4 …issue-14-workspace-sidebar.spec.ts:16:1 › Workspace Sidebar story renders one exclusive canvas choice (1.2s)
  ✓  1 …issue-14-workspace-sidebar.spec.ts:43:1 › Workspace Sidebar story defines the canvas renderer keyboard contract (1.6s)
  ✓  8 …issue-14-workspace-sidebar.spec.ts:155:1 › Workspace Sidebar stories are isolated from the Ladle catalogue (822ms)

  8 passed (8.4s)
```
