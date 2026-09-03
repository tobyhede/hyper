# Navigation answers its own address

Status: resolved
Tags: Improvement
Blocked by: none
Decided by: ADR 0081

Surfaced by: the 3 September 2026 architecture review, candidate 1, then settled
by a grilling loop. The rejected alternatives are in ADR 0081 so neither is
re-opened.

## The defect

`Navigation`'s six writing operations all return `void`, so a caller cannot learn
the addressable position a call produced. `App.tsx` reconstructs it four times,
each comparing the one field that call site happened to supply:

| Site | What it compares | What it is a proxy for |
| --- | --- | --- |
| `App.tsx:509` | `selectedRenderer !== selection` | the address |
| `App.tsx:594` | `activeGraphId !== graphId` | the address |
| `App.tsx:547–558` | `traversalHistory.length > before` | the presenting Card |
| `App.tsx:562–573` | `traversalHistory.length < before` | the presenting Card |

A fifth sits in an effect at `App.tsx:165–176`, behind a `previousRenderer` ref
and `adoptedRendererDestination`, because Edit completion adopts a renderer
through `space-authoring.ts:1368` and App never made a call it could read an
answer from.

`advance` and `retreat` are the same fourteen lines differing by one comparison
operator. Nothing observes the rule the five implement except
`vi.spyOn(window.history, 'pushState')` at `card-authoring.test.tsx:312`.

## What to build

**1. `NavigationAddress` and `navigationAddress(state)` in `packages/app/src/navigation.ts`.**

```ts
export interface NavigationAddress {
  readonly selectedRenderer: CanvasRendererId;
  readonly activeGraphId: GraphId | null;
  readonly presentingCardId: CardId | null;
}
```

A pure function over `NavigationState`, not a field on it — a stored field would
have to be maintained at all six publish sites and could disagree with the state
it describes. `presentingCardId` is the last Card of the Traversal history while
presenting and `null` in overview, so the mode is derivable and is not repeated.

`navigation.ts` gains no import. It must not learn `ProductDestination`,
`window.location`, or anything else about URLs (ADR 0081).

**2. One pure decision function in `app`**, answering what the browser should do:

```
'none'    the pathname already resolves to this exact address
'replace' the address is unchanged, the pathname is narrower or stale
'push'    the address changed
```

It compares the address against `destinationOpening(...)` of the resolved
pathname, and answers the `ProductDestination` to sync alongside the verb. It
belongs beside `destination-coordination.ts` and is tested in the node
environment the way `canvas-projection.ts` is — no DOM, no mounted app.

**3. One effect in `App.tsx`** holding the last-synced address, calling that
function and doing what it says.

**4. Delete** `adoptedRendererDestination`, the `previousRenderer` ref, and the
four inline comparisons. `installDestinationOpening`'s `changesRenderer`
(`App.tsx:479`) is **not** one of them and stays: it gates whether the render
adapter resets its placement, a different question with the same shape.

## Behaviour that changes, deliberately

- `advance` across a self-Edge grows the Traversal history without moving the
  address; it now replaces rather than pushing a duplicate entry. `retreat` out
  of a two-entry history of one Card does the same in reverse.
- A third outcome exists. Today every path pushes or replaces.
- `popstate` no longer needs suppressing by call placement: after Back the
  pathname already resolves to the restored address, so the decision is `none`.
  This is what makes the effect idempotent under StrictMode's double invocation.

## Acceptance

- [x] `navigationAddress` is a pure function over `NavigationState`, not a stored
      field, and `navigation.ts` imports nothing new.
- [x] `navigation.test.ts` asserts the address after each of the six operations,
      with no browser API involved.
- [x] The push/replace/none decision is a pure function with its own node-environment
      test covering all three outcomes, including the popstate case.
- [x] The four inline comparisons, `adoptedRendererDestination` and the
      `previousRenderer` ref are gone; `changesRenderer` at `:479` remains.
- [x] The two self-Edge behaviour changes have tests naming them as intended.
- [x] `card-authoring.test.tsx:312`'s `pushState` spy proves the wiring, not the
      rule.
- [x] `pnpm verify` and `pnpm e2e` green, with real output reported.

## Answer

Implemented across `2c3bf084` (the decision) and `1ee4e847` (the change), with
the review fixes on top.

`navigationAddress(state)` is a pure derivation in `navigation.ts`, which gained
no import; `presentedCard` is the one definition behind both it and
`activeCardId`, so the address and the render-time dependency App stands it in
for cannot drift. `destinationSync` in `destination-coordination.ts` is the pure
push/replace/none decision, taking one `AddressedPosition` rather than an address
and a loose Card that could disagree with it, and tested over all three outcomes
in the node environment (`destination-coordination.test.ts`). One effect in
`App.tsx` is the only place a position becomes a history entry:
`adoptedRendererDestination`, the `previousRenderer` ref and the four inline
comparisons are gone, and `changesRenderer` survives where it gates the render
adapter's placement reset.

The unresolved-location guard is scoped to the arrival and nothing after it. It
first suppressed *every* later history write, so a reader who pressed Back onto a
dead address and then presented traversed the whole presentation behind a path
that 404s on reload and is what Copy link copies, with the report still on
screen. It now holds only while the position has not moved; the first move away
is written, and writing it is what clears the report.

TDD evidence: `card-authoring.test.tsx`'s "corrects the unresolved location when
presenting moves the address" failed on the dead path
(`/spaces/…/views/<missing>` where the presentation point was expected) before
the guard was scoped, and passed after. The self-Edge rule has both an
integration test asserting one browser entry for a presentation the self-Edge
never moves and an E2E test asserting no browser entry for the move itself; the
`pushState` spy asserts only that App spends `destinationSync`'s answer on the
History API, never the rule.

Final verification: `pnpm verify` green — 173 test files, 2147 passed, 2 skipped.
`pnpm e2e` green — 156 passed, no flakes. `pnpm e2e:ladle` green — 73 passed.

Review: three independent reviewers (Standards+Spec, the built-in review, and
CodeRabbit). CodeRabbit reported zero findings. Seven findings survived
verification and all seven are addressed here or in the same change: the
unresolved-location guard, the stale `app` bullet in `CLAUDE.md`, two ADR 0081
statements that named `replace` where the code answers `none` and `push`, this
record, the split `destinationSync` input, the `syncDestination` clear that the
guard had made unreachable, and the duplicated presented-Card derivation.

## Not in scope

Collapsing Navigation's six writing operations into fewer. That is a separate and
larger change: the reconstructions come from the `void` return shape, not from
the operation count, and three operations returning `void` would leave App doing
exactly the same thing. What the count explains is why the four diffs are all
different and all partial — `openingGraphId` is read inside `openedState` and
`selectRenderer`, so those two derive the Active Graph internally while the other
four take it from the caller, and App can only ever compare what it passed. Worth
its own ticket; not this one.
