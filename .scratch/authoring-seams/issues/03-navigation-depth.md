# `NavigationState` permits states that mean nothing

Status: resolved

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

- [x] `exitPresenting` becomes `{ ...base, mode: 'overview' }` — there is no walk
      to forget to clear, and the four reset sites collapse.
- [x] The presenting walk is typed non-empty, so `activeCardId` returns a
      `CardId` inside that branch and the `?? null` goes.
- [x] `advance`, `retreat` and `selectBranch` narrow on mode rather than
      guarding at runtime. `advance`'s no-outgoing-Edge guard stays — that one is
      about Edges, not about mode, and the fifteen-line comment above it still
      applies in full.
- [x] `App.tsx:117` (`navigationState.walk.length > 1`) reads the walk without
      checking mode today and must narrow first. Expect the same at any other
      consumer read — that narrowing is the point, not incidental churn.
- [x] `space-authoring.ts` compiles unchanged or its required changes are
      explained; it is the second consumer and is easy to forget.
- [x] No behaviour changes. `pnpm verify` and `pnpm e2e` both pass, and e2e
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

## Answer

`NavigationState` is a discriminated union on `mode`, exactly as directed. The
walk and `branchIndex` sit on the presenting member alone, the walk typed
`readonly [CardId, ...CardId[]]` behind a module-private `Walk` alias.

What the four reset sites became: `openedState` and `exitPresenting` name no
walk at all, and `selectRenderer` and `activateRoute` publish
`{ ...baseOf(current), mode: 'overview', … }`. `baseOf` projects the four shared
fields by name rather than by spread — spreading a presenting state into an
overview one would carry the walk across at runtime, past a type that says there
is none. `setState` was narrowed to `Partial<NavigationBase>`, so a partial
update can no longer name `mode` and therefore cannot start or end a walk.

`advance`, `retreat`, `selectBranch` and `moves` narrow on `mode` first;
`advance`'s Edge guard and its comment stay, with the one clause that enumerated
"overview" among the guard's cases corrected — overview is answered by the type
a line above now, and saying otherwise would have been stale rather than
preserved. `activeCardId` reads a `CardId` through `currentCard`, which indexes
the walk's last element and answers `?? walk[0]`. That `??` is **dead**, and
deliberately so: the walk is non-empty by type, so `walk[walk.length - 1]` is
always defined and the right-hand side is unreachable. It is written because
`noUncheckedIndexedAccess` widens a *computed* index to `| undefined` however
the tuple is declared, while element 0 is a fixed tuple element that keeps its
type — so the walk's own guaranteed Card answers a case it cannot present, and
the non-emptiness is still spent in one named place.

The rejected alternative is the *live* branch, and it was live for a real
reason: destructuring `[first, ...rest]` and reading
`rest[rest.length - 1] ?? first` makes a one-Card walk genuinely *be* its first,
so neither side is unreachable. It costs a copy of the whole accumulated walk on
every call. `currentCard` runs on every App render, through both `activeCardId`
and `moves`, and neither is memoized — O(walk) and fresh garbage per render, to
answer a read that is O(1). A dead branch that is checked beats a live branch
that is paid for. The third option, a non-null assertion, buys the same O(1) by
switching the check off rather than answering it, and was not taken. `retreat`
still destructures, which is not an oversight but the same trade coming out the
other way: `slice` makes it O(walk) regardless, it runs once per gesture rather
than once per render, and the copy is what carries the non-emptiness to the
type. Its comment now says so. The two readings only diverge once a walk repeats
a Card, which is what "reads the last Card of a walk that returns to one it has
already stood on" pins — cycles are legal authored structure (ADR 0032).

Consumers: `App.tsx` needed one line — `canRetreat` narrows through the existing
`presenting` alias. **`space-authoring.ts` compiled unchanged**: it reads only
`activeRouteId` and `selectedRenderer`, both on the base, and the four-method
mock at `space-authoring.test.ts:1340` still casts cleanly because every union
member carries the two fields it supplies.

One thing the change nearly broke, caught by a red test written first: `openFresh`
went through `setState`, which merged `openedState`'s result over the current
state. That was equivalent only while `openedState` named every field — the
moment it stopped naming a walk it stopped clearing one, and a walk survived into
a freshly opened Space under `mode: 'overview'`. It now publishes whole. The
exact-equality assertion in "opens a replacement Space as new navigation" is what
found it.

Tests: two new ones in `navigation.test.ts` — "leaves no walk behind when
presenting ends" (exact equality, the runtime half) and "stands on a Card for as
long as it is presenting" (an `expectTypeOf` on `state.walk[0]`, enforced by
`pnpm typecheck` rather than `pnpm test`, as with `space-http-app-types.test.ts`).
Four existing assertions naming `walk: []` on an overview state dropped it and
assert `activeCardId()` is null instead, so they still say what they were
written to say.

`NavigationMode` was deleted: it typed only the field the union replaced, had no
reference anywhere else in the repo, and `NavigationState['mode']` still answers
it.

One saving neither commit message records: `moves()` returns `[]` on the mode
check, **before** it calls `currentSpace()`. The flat state read the Space
unconditionally and then answered `[]` anyway, because `activeCardId()` was
null — and that read costs a parse and reindex of the working snapshot, which
is what `moves()`'s own comment warns about on a call made during every App
render. Overview is the common mode, so the guard skips a parse and reindex per
render: a larger saving than the `currentCard` change above, and one nothing
else records. Pinned by "answers no moves outside a walk without reading the
working Space", which counts the thunk's calls rather than the answer — a read
moved back above the guard returns the same `[]`.

Verified: `pnpm verify` green (840 tests), `pnpm e2e` 71 passed — the same 71 as
the pre-change baseline, with no e2e file touched.
