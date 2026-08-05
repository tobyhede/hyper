# `Navigation` is shallow

Status: needs-triage

## Context

`packages/app/src/navigation.ts` presents fifteen interface members in a
217-line module. Three of them are literally single-statement field writes, and
ten have exactly one calling module, `App.tsx`, where nine are unwrapped one per
line at `App.tsx:114-124`.

The other five are not App's. `getState`, `subscribe`, `openFresh` and
`continueInRenderer` are called *only* from `space-authoring.ts` and never from
`App.tsx` at all; `activateRoute` has both callers. Any fold-the-setters
refactor therefore has a second consumer to satisfy, which the original filing
of this issue missed.

Examples:

```ts
openCard: (cardId) => setState({ openedCardId: cardId }),
closeCard: () => setState({ openedCardId: null }),
exitPresenting: () => setState({ mode: 'overview', walk: [], branchIndex: 0 }),
```

What genuinely decides something is smaller, but not as small as this issue
first claimed. `activateRoute`'s existence check, `advance`'s no-outgoing-edge
guard, `retreat`'s edge reselection and the shared `openedState` definition come
to 36 lines — but seven more units decide something too: `selectRenderer`
(resolves the view, can throw, resets seven fields), `present` (route lookup and
early return with no start card), `selectBranch` (the `count < 2` guard and the
double-modulo wrap), `moves`, `continueInRenderer`, `activeCardId` and the
shared `outgoingEdgesFrom`. The real figure is nearer 90 of 157 code lines, and
every one of those seven predates the filing.

Applying the deletion test: the three pure setters would merely move, not
concentrate. That is a narrower claim than "most of it".

## Consequence in the tests

`space-authoring.test.ts:1340-1349` mocks `Navigation` by casting a four-method
object (`getState`, `subscribe`, `continueInRenderer`, `activateRoute`) through
`as unknown as Navigation`. It is a plain literal with no fallback, so any
unlisted member throws `TypeError: navigation.X is not a function` rather than
producing a diagnosis.

The mock over-supplies, though, so the warning is narrower than it reads. That
test's Edit is refused at `space-authoring.ts:403`, so `installCompletedEdit` —
the only caller of `activateRoute` and `continueInRenderer` — never runs, and
`subscribe` belongs to `createSpaceAuthoring` construction rather than to
`performCompletion`. Only `getState` is genuinely exercised. A fifth call added
inside `installCompletedEdit` would not trip this test at all; only one on the
pre-refusal read path would.

## Direction, to be grilled

Keep the members that decide something; fold the pure setters into one state
update. Also worth deciding: `selectBranch` takes a delta, so every caller with an
absolute index does the subtraction itself (`App.tsx` computes
`index - moves.findIndex((m) => m.selected)` in JSX).

## Caution

This is a rename-adjacent change touching many call sites. `docs/agents/workflow.md`
says a rename must not ride along with a structural change — keep it its own commit.
