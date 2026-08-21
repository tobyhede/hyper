# The drop target is decided once

Status: ready-for-agent

Surfaced by: the 2026-08-21 architecture review's fifth candidate, then grilled.
The review's proposed signature was widened during grilling — see §1, which is
the half the review did not propose and the half that makes the extraction pay
for itself.

Blocked by: None. Touches `packages/app/src/edge-authoring.ts`,
`edge-authoring-react.tsx` and `components/NewCardPreview.tsx` only, and shares
no file with the branches or worktrees currently open.

## The defect

`newCardDrop` (`edge-authoring.ts:109-124`) is pure, unit-tested, and owns the
**safe** half of the empty-drop decision: the modifier is held, the target is
empty canvas, and the Card is centred on the point over `CARD_SIZE`. It receives
`over: DropTarget` **already decided**.

The half it does not own is the composition `docs/agents/rendering.md:29` spends
a paragraph warning about — *a connection target in range outranks the element
underneath*. Neither React Flow's `toNode` nor the DOM alone answers "is this
empty canvas": `getClosestHandle` resolves `toNode` by distance to a *handle*
within `connectionRadius` (20 at the pinned 12.11.2), so it is non-null over
blank canvas near a handle and **null over the middle of a Card**, whose centre
is some 73px from the nearest handle at 260x146. Drop the DOM half and an
Alt-release onto a Card's body authors a Card on top of it; drop React Flow's
half and a release just outside a Card authors one where the author was aiming
at a handle.

That rule is written at three sites, verified at `b64284f`:

| Site | What it decides |
|---|---|
| `components/NewCardPreview.tsx:45` | `over: overNode ? 'connection-target' : pointerOver` — where the ghost draws |
| `edge-authoring-react.tsx:337-345` | `connection.toNode !== null ? 'connection-target' : dropTargetOf(document.elementFromPoint(…))` — authoring a Card at the end of a drawn Edge |
| `edge-authoring-react.tsx:457-460` | the same composition again — and it decides **Edge deletion**, not Card creation. It does not call `newCardDrop` at all. |

The third is what makes this worth doing: the same rule, in a handler nobody
greps when changing how drops are classified.

**The type is complicit.** `DropTarget` has four members, but `dropTargetOf`
(`edge-authoring-react.tsx:165`) can only ever return three of them —
`'connection-target'` is React Flow's answer and the DOM never produces it. So
`useState<DropTarget>('off-canvas')` at `:217` and `NewCardPreviewProps.pointerOver`
both accept a value they can never legitimately hold, and the precedence written
at the three sites is a ternary over a domain with a meaningless quadrant.

**The test gap is concrete.** `packages/app/test/edge-authoring.test.ts:668` is a
property test that *generates `over` as an input*, so it exercises the offsets
and the four guards and never the precedence — precedence is upstream of `over`.
Today only `packages/app/e2e/editing.spec.ts:1605` ("an Alt-drop released over a
Card body creates no Card") proves the dangerous part, and the deletion site's
precedence is proved by nothing at all.

## What to build

### 1. Split the type

In `edge-authoring.ts`, beside the existing `DropTarget`:

```ts
export type ElementDropTarget = 'card' | 'empty-canvas' | 'off-canvas';
export type DropTarget = 'connection-target' | ElementDropTarget;
```

This is the half the review did not propose, and without it the extraction in §3
is a named ternary. With it the rule is total over a 2x3 domain rather than a
ternary over a 2x4 one, and the compiler carries what the doc comment currently
carries alone.

It narrows three declarations, each of which today admits a value it cannot mean:

- `dropTargetOf`'s return (`edge-authoring-react.tsx:165`)
- `useState<DropTarget>('off-canvas')` (`:217`)
- `NewCardPreviewProps.pointerOver` (`NewCardPreview.tsx:12`)

`DropTarget`'s doc comment (`edge-authoring.ts:36-53`) gains a sentence naming
which half each supplier answers. **Its final paragraph stays** — `card` and
`off-canvas` remain two values because this is a fact a supplier reports rather
than a verdict it reaches.

### 2. Rename the DOM helper

`dropTargetOf` → **`elementDropTargetOf`**, private to
`edge-authoring-react.tsx`, three call sites (`:345`, `:376`, `:460`). Its name
overclaims once it returns `ElementDropTarget`, and leaving it beside a
correctly-named `dropTarget()` is how a fourth site picks the wrong one — the
exact drift this ticket exists to stop. Its doc comment at `:153-164` keeps the
`connectionState.isValid` paragraph and loses the "This is the DOM half of the
question only" apology, which §3 makes structural.

`packages/app/test/edge-authoring-react.test.tsx:239-243` names `dropTargetOf`
in a comment; update it.

**Its own commit, ahead of §3.** `docs/agents/workflow.md:66` — never let a
rename ride along with a structural change. Honour it by ordering, not by
skipping the rename.

### 3. Extract the precedence

In `edge-authoring.ts`:

```ts
export function dropTarget(over: {
  readonly connectionTarget: boolean;
  readonly element: ElementDropTarget;
}): DropTarget;
```

Object argument, not positional: `dropTarget(true, 'card')` gives no reader a way
to tell which half is which, and the whole point is that the third site is one
nobody greps. Lowercase function returning the PascalCase type follows the house
pairing — `canvasRenderers`/`CanvasRenderers`, `canvasProjection`/`PendingCanvasProjection`.

Its doc comment carries `rendering.md:29`'s argument: what each supplier answers,
why neither suffices, and that the two DOM answers are **deliberately different**
per site — preview keeps the last container `onMouseMove` classification, release
performs the authoritative `elementFromPoint`. The difference lives in the
argument, not in the function.

All three sites call it. `newCardDrop` is **unchanged** — it still takes
`over: DropTarget`, and precedence sits upstream of it.

### 4. Leave each site's verdict where it is

`edge-authoring-react.tsx:460` asks `over === 'empty-canvas'` and deletes an
Edge; the connect path asks the same value and authors a Card. That comparison
stays inline at both. What is duplicated is the composition of React Flow's
answer with the DOM's; what each site concludes from the result is its own, and
naming it would be a second abstraction this ticket does not need.

### 5. Tests

**New — the precedence, exhaustively, in `edge-authoring.test.ts`.** `dropTarget`
is total over 2x3, so a six-row table is *complete*, not a sample. No property
test: fast-check would resample the same six cases and prove less.

**New — the deletion site, in `edge-authoring-react.test.tsx`.** The `beforeAll`
at `:242` stubs `document.elementFromPoint` to `null` globally; a test can
override it to return a **real mounted element**, because jsdom has no
hit-testing but `closest('.react-flow__renderer')` walks the real tree. Three
cases on `handleReconnectEnd`:

```
elementFromPoint → the renderer div,    state.toNode null       → deletes
elementFromPoint → a .react-flow__node, state.toNode null       → does not delete
elementFromPoint → the renderer div,    state.toNode non-null   → does not delete
```

The third is the pin. It is the composition, at the site that feeds Edge
deletion, covered where nothing covers it today.

**Unchanged — the property test at `edge-authoring.test.ts:668`.** It generates
`over` as an input to `newCardDrop`, downstream of precedence, and leaving it
untouched is part of the behaviour-preserving guard.

**None in e2e.** A browser test releasing a reconnect endpoint over blank canvas
but within `connectionRadius` of a handle would prove the real thing, but that
radius is 20 flow units — about 11 screen px at the 0.55 overview zoom — so the
release point is a few pixels wide. Under CI's `failOnFlakyTests` a retry that
passes still fails the run, which is the wrong trade for this.

### 6. Commit shape

1. §1 and §2 — the type split and the rename. Mechanical, `pnpm verify` green on
   its own.
2. §5's failing tests, then §3 and §4. The red is the table failing to import
   `dropTarget` before it exists.

## Acceptance criteria

- [ ] `ElementDropTarget` exists in `edge-authoring.ts` and `DropTarget` is declared over it; `dropTargetOf`'s return, `useState` at `edge-authoring-react.tsx:217` and `NewCardPreviewProps.pointerOver` are all narrowed to it.
- [ ] No `dropTargetOf` remains; `elementDropTargetOf` is called at `:345`, `:376` and `:460`, and the comment at `edge-authoring-react.test.tsx:239-243` names it.
- [ ] `dropTarget({ connectionTarget, element })` is exported from `edge-authoring.ts` and called at all three sites. No ternary composing `toNode` with a DOM answer survives anywhere in `packages/app/src`.
- [ ] `newCardDrop`'s signature and body are unchanged.
- [ ] `over === 'empty-canvas'` is still asked inline at `edge-authoring-react.tsx:460`; no named verdict function was added.
- [ ] A six-row exhaustive table covers `dropTarget`; the property test at `edge-authoring.test.ts:668` is byte-identical.
- [ ] Three `handleReconnectEnd` cases exist in `edge-authoring-react.test.tsx`, including a `toNode` non-null case that does not delete.
- [ ] The rename and the extraction are separate commits, in that order, each `pnpm verify` green.
- [ ] `pnpm verify` and `pnpm e2e` pass with real output quoted. **`pnpm e2e` must be green and unchanged** — this is behaviour-preserving and that is the guard that proves it. `pnpm e2e:ladle` is not required: no component with a story changes.

## Decided — do not re-open

- **The rule does not go back into `SpaceCanvas`.** `rendering.md:29` forbids it by name.
- **The preview's hit-test does not become live.** Same bullet: it would add a document-level pointer listener and a per-frame DOM hit-test, defeating the narrowed non-positional state write that avoids per-frame flow rerenders. `.scratch/card-route-editing/edge-authoring-design.md:197-206` is the accepted argument. Package 7 declined it without a measured reason and so does this.
- **The two DOM answers are not collapsed.** Preview and release supply deliberately different DOM facts; only the *composition* is duplicated. A proposal that unifies them has misread the bullet.
- **`off-canvas` participates in the precedence as the losing side, and the type says so.** It is an `ElementDropTarget`; a connection target in range beats it, which is correct at both sites — no Card authored, no Edge deleted.
- **`card` and `off-canvas` stay two values.** They refuse for the same reason today, but they are facts a supplier reports, not a verdict it reaches. Collapsing them would name an input after the answer it produces (`edge-authoring.ts:50-52`).
- **The deletion site takes the same function, not merely the same rule.** It is the reason this ticket exists.
- **No e2e test is added.** See §5.
