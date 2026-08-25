# Expanded Cards — component architecture

Status: ready-for-human
Decides: how ADR 0064 is built. The decision itself is the ADR; this is the seam design.
Relates: ADR 0064, ADR 0025, ADR 0037, ADR 0051, ADR 0063, `.scratch/space-cards/expanding-cards-prototype.md`

The prototype (`packages/app/stories/review/expanding-cards.*`) proved the interaction. It proved nothing about where any of it lives: it holds one `Record<string, CardPlacement>` in a story and reads it straight into React Flow nodes. Production has seven packages, a branded `Placement`, a completed-Edit seam and a curated `graph` index between those two ends. This is the design for crossing them.

Read ADR 0064 first. Nothing here reopens it.

## The shape of the change, in one line per package

| Package | What changes |
| --- | --- |
| `core` | A Layout's per-Card value becomes a rect. One new schema, split from the shared point. |
| `graph` | `Placement` becomes card-to-rect and gains the displacement, in both directions. |
| `react-flow-adapter` | `CardNode` draws an expanded front. Node size and handle geometry already come per Card. |
| `ui` | `CanvasCard` gains a content slot; the Markdown kind gains a body surface that owns its caret. |
| `app` | `openedCardId` and the pane are deleted; three completions are added; the projection carries rects. |
| `persistence`, `http` | Nothing. The Space is one `Json` document (`src/prisma/contract.prisma`), so an additive field needs no migration. |

## 1. `core` — split the point from the rect

`layoutPositionSchema` is `{x, y}` and is **shared with edge routing**: `LayoutStrategyEdgeSection.startPoint`/`endPoint` in `packages/graph/src/layout.ts` are `core`'s `LayoutPosition`, and that module's doc comment already warns that anything added here for the sake of authored placement lands on geometry no author wrote. Adding `expanded` to it would put an expansion field on every bend point.

So split, which is the option that comment names:

```ts
// unchanged, still the shared point
export const layoutPositionSchema = z.object({ x: z.number(), y: z.number() });

// new: what a Layout stores per Card
export const cardPlacementSchema = z.object({
  x: z.number(),
  y: z.number(),
  /** Present exactly when the Card is Expanded, and the size it is Expanded to. */
  expanded: z.object({ width: z.number(), height: z.number() }).optional(),
});
```

`positionedLayoutSchema.positions` becomes `z.record(idSchema, cardPlacementSchema)`.

**Presence is the state.** One field, so `expanded: true` cannot disagree with a missing size and a collapsed Card cannot carry a stale one — ADR 0064 says a collapsed Card is the ratio constant and carries no size. The cost is that closing a Card forgets the size it was opened at; re-opening uses the default. That is deliberate, and if remembering is wanted later it is a second optional field with a name that says so, not a boolean beside this one.

**Purely additive**, so every existing space file and every stored document parses unchanged, and `.strict()` on the Layout object is unaffected because the growth is in the value. Fixtures and the tracked space file roll forward in the same change (ADR 0054).

The key stays `positions` although the value is now a rect. Renaming it to `cards` is a better name and a **separate commit** — the workflow forbids a rename riding along with a structural change, and this one touches fixtures, the E2E tracked space and every test that writes a Layout.

## 2. `graph` — `Placement` owns the rect and both directions of the displacement

`packages/graph/src/placement.ts` is already the closed, branded module that owns the card→position map and the rule that *a rendered position is a report, not an authorship claim*. The rect and the displacement belong to it for the same reason.

**The value type grows.** `Placement` becomes `ReadonlyMap<CardId, Readonly<CardPlacement>>`, still branded, still constructed only through its own members. Every existing member keeps its meaning; `equals` compares the rect, `place` and `next` copy it.

**Two new members, and they are inverses:**

```ts
/** Where the Cards are drawn: every Card's authored rect plus what the Expanded Cards displace it by. */
function drawn(placement: Placement): Placement

/** Already exists — and is where the inverse belongs. */
function next(authored: Placement, rendered: Placement, placed: readonly CardId[]): Placement
```

`next` already takes `authored`, so it can compute the displacement and subtract it from the rendered report before authoring anything. No signature changes and no caller learns the rule. This is the single most important seam in the design: **a drawn coordinate must never reach a Layout un-inverted**, and there is exactly one door it can come through.

Hold them with a property test: for any placement, `next(p, drawn(p), [...every card]) === p`. `packages/graph/test` already runs fast-check.

**`fromLayoutStrategyGraph` needs no inverse**, because the only thing that calls it is the ADR 0025 conversion from an Algorithmic View, where nothing is Expanded. Pin that rather than trusting it: a test that the conversion path rejects — or is never handed — a strategy graph carrying an Expanded Card.

**`positionedStrategy` applies `drawn` itself**, rather than taking an already-drawn map from its caller. One call site, no caller can forget, and its own doc's claim that `fromLayoutStrategyGraph` is it run backwards survives with the qualification above. Its unplaced band already reads `card.height`, so a Card below an Expanded one lands below the real box.

**`buildLayoutStrategyGraph` takes a size per Card**, not one uniform `size`. `LayoutStrategyCard` already carries `width`/`height` per Card, so ELK, the grid and the positioned strategy all reason about varying rects with no change. The signature's fourth argument becomes a lookup that answers `CARD_SIZE` for a Card with no expansion.

**The index is curated** (`test/unit/graph-package-surface.test.ts`): `drawn` and `cardPlacementSchema`'s derived type are deliberate additions to the list, not incidental ones.

## 3. `app` — what an Edit is, and what stops existing

**Three completions**, added to `AuthoringCompletion` beside `settled-card-movement`:

```ts
| { readonly kind: 'opened-card'; readonly cardId: CardId }
| { readonly kind: 'closed-card'; readonly cardId: CardId }
| { readonly kind: 'resized-card'; readonly cardId: CardId; readonly size: { width: number; height: number } }
```

Three rather than one `placed-card` carrying a rect, because they are three gestures with three refusal profiles and three `unchanged` cases — closing a closed Card is `unchanged`, resizing to the same box is `unchanged`, and a resize of a Card that is not Expanded is a broken invariant rather than a refusal. A single completion would make all three the same call and lose that.

None of them carries `rendered`. The doc on `AuthoringCompletion` says three kinds carry it because a pointer gesture is the only thing that knows where React Flow drew the Cards — opening and closing know only a Card id, and the rect they change is in the placement already installed. **A resize is the exception to watch**: `NodeResizer` reports a drawn box. Its *size* is displacement-free (displacement moves Cards, it does not scale them), so `resized-card` carries a size and no position, and stays out of the `rendered` family. If a resize is ever allowed to move the Card's origin — dragging the top-left handle — it joins that family and goes through `next`.

They are all **Layout-required** operations, so they join `LayoutRequiredOperation` and refuse with `layout-required` where there is no Layout, and are subject to `placement-pending` exactly as a move is. Opening a Card on an Algorithmic View converts first (ADR 0025, ADR 0064) — the conversion path is the one that already exists and needs no new branch, only the new completion listed among the ones that trigger it.

**Deleted:** `openedCardId`, `openCard`, `closeCard` in `navigation.ts`; the `openedCardId` reads in `App.tsx` and `components/SpaceCanvas.tsx`; `components/OpenCard.tsx`'s Markdown branch and the covering pane it is drawn in; the `.card-pane` block in `packages/app/src/styles.css`. `App.tsx`'s `titleEditingEnabled={openedCardId === null && !creatingAlias}` becomes `!creatingAlias`, and `openCardForEditing`'s "a pane is already up, decline" guard goes with the pane.

**Not deleted:** the Alias creation surface. Creating a Card that does not exist yet is not opening one, and `creatingAlias` still gates the canvas the way it does now. The **Alias** editing branch of `OpenCard` has no replacement until the Alias kind's expanded front is decided (ADR 0064 leaves it open) — so either it keeps its pane for now, deliberately and with a note, or Alias editing is out of this change entirely. **Pick one before starting; do not discover it mid-implementation.**

**`canvas-projection.ts`** stops passing `CARD_SIZE` to `buildLayoutStrategyGraph` and passes the placement's per-Card lookup. It is a pure module tested in the node environment; the rect is one more thing it derives and one more property test (a Card's declared box equals the box the strategy reasoned about).

## 4. `react-flow-adapter` — most of this is already built

`projection.ts` already reads `cardLayout.width`/`cardLayout.height` per Card, sets `node.width`/`node.height` from them, and computes `declaredHandles` from that rect — the four authoring handles and the graph ports are already functions of `card.width`/`card.height`. **Nothing there changes.** What changes is that the strategy now produces varying rects for it to read, which is the point: the render layer was built for this and has been fed a constant.

`CardNode` gains one branch. It has two today — `showContent` (presenting) and the `CanvasCard` front. Expanded is a third, and it is *not* `showContent`: presenting draws rendered Markdown at the frame's scale (ADR 0011, ADR 0027), expanding draws source. Do not collapse them; they differ in exactly the way ADR 0011 ruled on.

The node's `zIndex` must be raised while Expanded. React Flow paints in node order, so without it a Card grows *underneath* whatever was declared after it. Two Cards Expanded at the same z-index still resolve by document order, which is nobody's rule — decide it (most recently opened on top is the obvious answer, and it needs a per-Card ordinal the Layout does not have, so the honest first answer is document order, stated).

## 5. `ui` — one Card, one slot, and the kind's own body

**`CanvasCard` gains a content slot, not an expanded variant.**

```ts
/** What this Card draws below its Title, present exactly when the Card is Expanded. */
readonly content?: ReactNode;
```

The claim of ADR 0064 is that an Expanded Card *is* the Card, bigger. One component with a slot makes that structural: same rail, same title, same paper, same `data-state` matrix, plus a region. A second `ExpandedCanvasCard` component would assert the claim in prose while denying it in the module graph, and would double the interaction-state matrix that `CanvasCardProps`'s discriminated union already encodes.

The slot is filled by the **kind's** body surface, because the kind owns everything beyond the Title (ADR 0051):

- `MarkdownCardBody` — the source. Draws the bytes at rest; a double click puts a caret in it. It owns the draft, `Escape` (abandon), `Mod-Enter` (commit) and commit-on-blur, which are exactly the keys `MarkdownSourceEditor` withholds from CodeMirror for its surface to spend (ADR 0063, ADR 0048). Its at-rest padding is set to land the text where the editor will put it, so entering adds a caret, a gutter rule and line numbers without moving a word — the prototype's CSS has the working values.
- Alias and Space: not in this change (ADR 0064).

**The lazy split has to move, and this is the part to think hardest about.** `MarkdownSourceEditor` is reached today through `packages/app/src/components/markdown-source-editor-lazy.ts`, the single negated entry in an ESLint zone that otherwise bars `@project/ui/*`, and `test/unit/codemirror-encapsulation.test.ts` holds `packages/app/src` to dynamic-import-only. If `MarkdownCardBody` lives in `ui` and imports the editor statically, the CodeMirror stack returns to the initial bundle and ADR 0063's stated payoff is gone.

The recommendation is to **move the lazy boundary into `ui`**, beside the component that needs it: `ui` owns its own `markdown-source-editor-lazy`, `MarkdownCardBody` imports through it, and `app` stops reaching `@project/ui/MarkdownSourceEditor` at all — which lets the ESLint zone *tighten* to a plain bar rather than a bar with an exception. The encapsulation test's second assertion moves from `packages/app/src` to both source trees, minus the one lazy module. This is a change to the arrangement ADR 0063 describes and to what `CLAUDE.md` says about it, so the test, the zone and both documents move in the same commit or not at all.

The rejected alternative — `MarkdownCardBody` taking the editor as a `ReactNode` prop supplied by `app` — keeps ADR 0063's arrangement untouched at the cost of a component whose central behaviour arrives from outside it, which is not a surface anyone can reason about.

**This slice starts with `$shadcn-first-ui`** (`CLAUDE.md` makes it the entry point for any production component change), and both new surfaces owe a Ladle story and an application proof (ADR 0052). `packages/app/stories/review/expanding-cards.*` is review-only and is **not** that evidence; it is deleted or demoted when the real stories exist.

## 6. Where the caret lives

Nothing records it in the Space, and nothing should record it in a store either. `SpaceCanvas` holds `editingTitleCardId` in a local `useState` today; it becomes one value:

```ts
const [caret, setCaret] = useState<{ cardId: string; field: 'title' | 'body' } | null>(null);
```

One at a time, canvas-wide — which is what makes "several Cards Expanded" not mean "several live editors" (ADR 0064). It is not part of the published projection, no other module reads it, and it is not selection: a Card can be Selected without a caret and hold a caret without being Selected. Do not put it in the Zustand render adapter, which owns the projection and the `none | card | edge` selection and would gain a third unrelated concern.

## 7. The invariants, and what holds each one

| Invariant | Held by |
| --- | --- |
| A drawn coordinate never reaches a Layout un-inverted | `Placement.next` is the only door; property test round-trips `next(p, drawn(p), …) === p` |
| Closing restores the neighbours exactly | The same property test, with an Expanded Card closed between the two halves |
| A collapsed Card carries no size | `cardPlacementSchema` — presence of `expanded` is the state |
| An Expanded Card's declared box is the box the strategy reasoned about | `canvas-projection` property test (extends the existing handle-resolution one) |
| The bundle does not gain CodeMirror | `codemirror-encapsulation.test.ts`, with its scan moved to both trees |
| No stylesheet names a CodeMirror class | Same test, unchanged |
| Opening on an Algorithmic View converts | The existing conversion tests, with the new completion added to the list |

## 8. The work, in order

Each slice is independently verifiable and leaves `main` working.

1. **`core` schema split** — `cardPlacementSchema`, fixtures and the tracked space file rolled forward. No behaviour.
2. **`graph`: `Placement` holds a rect** — value type only, no displacement yet. Every existing test still passes; the index list gains its entry.
3. **`graph`: the displacement** — `drawn`, the inverse inside `next`, the property test, `positionedStrategy` applying it, `buildLayoutStrategyGraph` taking per-Card sizes.
4. **`app`: the completions** — `opened-card`, `closed-card`, `resized-card` through Space Authoring, with refusals and `unchanged`. Still no UI: tested at the seam.
5. **`ui`: the Card front** — `$shadcn-first-ui` first. `CanvasCard`'s slot, `MarkdownCardBody`, the lazy boundary move, stories.
6. **`react-flow-adapter`: the third branch** and the z-index rule.
7. **`app`: delete the pane** — `openedCardId`, `OpenCard`'s Markdown branch, `.card-pane`, and the guards that existed only for a covering surface. This is the slice that cannot be half-done, and it is last for that reason.
8. **The rename**, alone: `positions` → `cards`, if it is wanted.

Decide the Alias question (§3) before slice 4, because it changes what slice 7 is allowed to delete.
