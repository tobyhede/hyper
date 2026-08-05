# `NavigationState` permits states that mean nothing

Status: ready-for-agent

Filed as "`Navigation` is shallow". Verification did not support that reading,
and the direction below replaces it. The file keeps its old name so existing
references still resolve.

## Context

`packages/app/src/navigation.ts` presents fifteen interface members in a
231-line module. Three of them are literally single-statement field writes, and
ten have exactly one calling module, `App.tsx`, where nine are unwrapped one per
line at `App.tsx:113-123`.

The other five are not App's. `getState`, `subscribe`, `openFresh` and
`continueInRenderer` are called *only* from `space-authoring.ts` and never from
`App.tsx` at all; `activateRoute` has both callers. Any refactor here therefore
has a second consumer to satisfy, which the original filing missed.

## Verdict on the original claim

The module is **not** shallow, and the deletion test it cited passes rather than
fails. Roughly 56 of its lines are explanatory comments recording knowledge that
exists nowhere else: eight in `selectRenderer` on why an opened Card closes with
its renderer (an ADR 0037 interaction where an Edit completed before a strategy
resolves is refused, and the author could not tell a refusal from a save);
fifteen in `advance` on why `branchIndex` must not be clamped, including why
clamping is the wrong repair rather than a safe one; twelve in `present` on its
two refusals; six in `activateRoute` on ADR 0028. Delete the module and that has
to be reinvented, not moved.

What is true is that the *interface* is wide while the implementation is deep.
That is a different problem with a different fix.

## The real finding

`NavigationState` allows states that mean nothing — `mode: 'overview'` with a
non-empty `walk`, or a `branchIndex` of 3 while nothing is being walked. Nothing
in the type enforces the correspondence, so **every operation maintains it by
hand**. That is why `walk: []` with `branchIndex: 0` appears as a reset in four
places (lines 79, 113, 148, 173), and why `activeCardId` must ask
`state.mode === 'presenting'` before it dares read the walk.

The repetition the original filing read as "shallow members doing trivial
writes" is really illegal states being manually excluded on every path. Folding
the setters would have left it entirely untouched.

## Direction — decided

Put the correlation in the type:

```ts
interface NavigationBase {
  readonly selectedRenderer: RendererSelection;
  readonly selectedView: BuiltInViewId;
  readonly activeRouteId: RouteId | null;
  readonly openedCardId: CardId | null;
}

export type NavigationState =
  | (NavigationBase & { readonly mode: 'overview' })
  | (NavigationBase & {
      readonly mode: 'presenting';
      readonly walk: readonly [CardId, ...CardId[]];
      readonly branchIndex: number;
    });
```

- [ ] `exitPresenting` becomes `{ ...base, mode: 'overview' }` — there is no walk
      to forget to clear, and the four reset sites collapse.
- [ ] The presenting walk is typed non-empty, so `activeCardId` returns a
      `CardId` inside that branch and the `?? null` goes.
- [ ] `advance`, `retreat` and `selectBranch` narrow on mode rather than
      guarding at runtime. `advance`'s no-outgoing-Edge guard stays — that one is
      about Edges, not about mode, and the fifteen-line comment above it still
      applies in full.
- [ ] `App.tsx:117` (`navigationState.walk.length > 1`) reads the walk without
      checking mode today and must narrow first. Expect the same at any other
      consumer read — that narrowing is the point, not incidental churn.
- [ ] `space-authoring.ts` compiles unchanged or its required changes are
      explained; it is the second consumer and is easy to forget.
- [ ] No behaviour changes. `pnpm verify` and `pnpm e2e` both pass, and e2e
      passes **unchanged** — that is the guard proving this was behaviour-
      preserving (`docs/agents/workflow.md`).

## Rejected: fold the pure setters

The original direction was to collapse `openCard`, `closeCard` and
`exitPresenting` into one `update(change: Partial<NavigationState>)`. Rejected
for three reasons, recorded so it is not re-proposed:

1. **It moves knowledge out rather than concentrating it.** "Exiting presenting"
   means exactly `{ mode: 'overview', walk: [], branchIndex: 0 }`, and only
   `navigation.ts` knows that. Folding makes every caller know it.
2. **It multiplies.** These are not single-call members: `closeCard` is called at
   `App.tsx` 420, 598 and 604; `exitPresenting` at 440, 471 and 585; `openCard`
   at 376. Three definitions would become seven copies of a state literal, six of
   them able to drift apart.
3. **It trades a name for an implementation.** `exitPresenting()` says what the
   caller wants; `update({ mode: 'overview', walk: [], branchIndex: 0 })` says
   how it happens to be stored.

The milder reading — merging only `openCard`/`closeCard` into
`openCard(cardId: CardId | null)` — keeps the knowledge inside and is defensible,
but buys one member and reads worse at the call site. Not taken.

## Deferred, with reasons

Parked here rather than ticketed, because each wants deciding after the type
change lands and would otherwise be speculative:

- **Derived reads out of the interface.** `moves()` and `activeCardId()` are
  projections over `(state, space)`, not navigation operations — `moves()` reads
  `currentSpace()` and joins Card titles, which is a view concern behind a
  navigation method. As free functions the interface loses two members and both
  become testable from a state literal instead of a constructed Navigation.
- **A reducer.** One `dispatch(action)` over a discriminated union would dissolve
  the mock brittleness below completely, and fits the repo's functional-core /
  imperative-shell rule, a pure `(state, action) => state` then publish. Held
  back: it is the largest change, trades named operations for a less
  discoverable entry point, and there are only two consumers. Do the type change
  first; if mocking still hurts, that is the evidence justifying this.
- **`selectBranch` takes a delta**, so a caller holding an absolute index does
  the subtraction itself — `App.tsx:583` computes
  `index - moves.findIndex((m) => m.selected)` in JSX. But the keyboard callers
  genuinely want a delta, so the honest shape is two members, `selectBranch(index)`
  and `stepBranch(delta)` — one *more* member, which is why it is not part of a
  change framed around narrowing.

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

## Caution

Touching `NavigationState`'s shape reaches both consumers. `docs/agents/workflow.md`
says a rename must not ride along with a structural change — if any member is
renamed while doing this, that is its own commit.
