# 05 — Make the production canvas Card a design-system component

**What to build:** Bring the real React Flow Card into the agreed design language for Markdown and Alias Cards, all interaction states, title editing and authoring actions, without changing graph placement or gesture semantics.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-human

- [x] The production Card, rather than a Ladle-only facsimile, renders the accepted visual treatment for kinds and interaction states.
- [x] Title editing, card editing, connection controls and handle visibility retain their existing keyboard, pointer and focus behaviour.
- [x] React Flow geometry and handle contracts remain adapter-owned, while the Card's visual controls consume shared design-system components and tokens.

## Audit note (resolved)

The real React Flow node now renders `CanvasCard`, so this is production work,
not a Ladle-only specimen. The Connect and Edit actions passed from `CardNode`
are still raw buttons; replace them with the shared control surface or record a
deviation that clears ADR 0047's bar. Preserve the existing pointer, focus,
drag and handle contracts while doing so.

Resolved by the deepening pass below: `CanvasCard` now renders its own
`Button`-based Connect/Edit controls and its own title editor rather than
accepting them as `CardNode`-supplied `ReactNode` slots, so there is no longer
a raw-button surface for ADR 0047 to flag.

## Implementation

### Module seam

`CanvasCard` (`@project/ui`) is the deep production module for a Card's front:
Markdown and Alias fronts, real Connect/Edit operations, its own private title
editor (initial focus/selection, draft state, refusal display, blur/Enter
completion, Escape cancellation), and every kind/interaction-state visual
treatment, expressed as real CSS in a colocated `canvas-card.css` (see "Style
locality" below) on the shared shadcn Card family. `CanvasCardFront` is a
discriminated union (`{ kind: 'markdown' }` vs `{ kind: 'alias'; aliasOf:
string }`, ADR 0051) — an Alias cannot be built without the Target title it
must display, and a Markdown front cannot carry one. Its external visual state
is one of `rest | selected | dragging | editing`; hover and selected+hover are
the component's own CSS (`:hover`, `:focus-within` on `.canvas-card`), not a
value CardNode computes. Connect, Edit and "begin title editing" are each
one optional operation (`onConnect?`, `onEdit?`, `onBeginTitleEdit?`) — an
action's presence is the only statement that it is available, so there is no
paired "enabled" boolean, and CanvasCard itself withdraws both actions while
`state` is `dragging` or `editing`. `state: 'editing'` is a discriminated union
member that *requires* `onCompleteTitleEdit`, `onCancelTitleEdit` and
`onReturnFocus` together — a caller cannot ask for the editing state without
also supplying what completes, cancels and closes it. `onReturnFocus` is how
the title editor asks its caller to hand focus back on a keyboard completion or
cancellation; `@project/ui` never queries React Flow's DOM itself.

`CardNode` (`@project/react-flow-adapter`) stays the whole adapter: the four
spatial authoring handles and per-Graph ports with their declared geometry,
React Flow connection state (`useConnection`), translating `NodeProps`
selection/dragging into CanvasCard's four-value `state`, and the one DOM query
this ticket keeps out of `@project/ui` — `onReturnFocus` resolves
`.closest('.react-flow__node')` from a ref on its own rendered root and
focuses it, exactly reproducing the prior `CardTitleEditor`'s focus-return
behaviour. `CardNodeData`'s existing enabled-flag-plus-callback fields
(`titleEditingEnabled`, `connectingEnabled`, `cardEditingEnabled`,
`onBeginConnect`, `onEditCard`, `onBeginTitleEditing`) are unchanged —
`SpaceCanvas.tsx`'s own wiring contract with the adapter was out of this
ticket's scope — but `CardNode` now translates them into CanvasCard's
presence-only operations at the boundary, rather than forwarding an enabled
flag through the design-system component's own props.

### Style locality

The `.canvas-card*` visual rules (border, face colour, rail, kind glyph
opacity, actions reveal, title clamp, drag rotate/shadow, the inline title
editor) move out of `packages/app/src/styles.css` into a new, colocated
`packages/ui/src/canvas-card.css`, imported directly by `CanvasCard.tsx`
(`import './canvas-card.css'`) rather than rebuilt as Tailwind utility
classes. This is the pattern the donor branch (`feat/surface-inventory`)
already established for this exact component — real, hand-tuned CSS rather
than a `cva()` composition, because `cva`'s generated class strings do not
deduplicate: a `state` variant class and the base string's class for the same
property can both land in the DOM with no `tailwind-merge` pass to resolve
them, and which one paints is down to Tailwind's internal generation order,
not anything intended (see "Comments" below for how that surfaced). A
`packages/ui/src/css.d.ts` (`declare module '*.css';`) makes the side-effect
import typecheck; `packages/react-flow-adapter/src/css.d.ts` carries the same
one-line ambient declaration, needed only because `react-flow-adapter`'s
`tsconfig.json` has no `vite/client` in `types` (unlike `packages/app`, which
gets `declare module '*.css'` for free from `vite/client`) and its own
typecheck program transitively reaches `CanvasCard.tsx`'s CSS import through
`@project/ui`.

The reduced `rest | selected | dragging | editing` state set (no separate
`hover`/`selected-hover` values) means every rule that used to match
`[data-state='hover']`/`[data-state='selected-hover']` now combines a real
`:hover` pseudo-class with the remaining state selectors via `:is()`.
`canvas-card.css`'s content is this branch's own established CSS (as it stood
at `e7ce880`, the commit immediately prior to this deepening) carried forward
with that one adaptation — not the donor's older iteration of the same rules,
which still toggles `.canvas-card__actions` with `display: none/flex` rather
than the keyboard-reachable `opacity`/`pointer-events`/`transition` version
`e7ce880` deliberately fixed, and which still positions the four authoring
handles relative to `--canvas-card-border-width`, a mechanism this branch
does not use (handles are positioned by ELK's declared offset instead). The
`--canvas-card-*` colour tokens stay in `packages/app/src/tailwind.css`, the
shared semantic token sheet Ladle already loads for every other component;
`--card-width`/`--card-height`/`--canvas-card-graph` are runtime values (the
layout's own geometry, the Active Graph's colour) supplied through inline CSS
custom properties and consumed only from `canvas-card.css`, so
`test/unit/ui-theme-tokens.test.ts` needs no allowance for them — its scan
only looks at `.ts`/`.tsx` files. The literal `canvas-card` class name stays
on the component's root and also survives as a bare selector in
`packages/app/src/styles.css`'s `.rf-card-node--active :is(.card,
.canvas-card)` rule — React Flow's own "this is the actively presented Card"
fact — which stays adapter/app-owned, as does every other `.rf-card-node*`
and handle rule (including the four authoring handles' own `border: 3px`,
matched to the donor rather than the `1px` `e7ce880` had carried — see
"Comments").

The four spatial source handles React Flow renders are the adapter's own
siblings of `.canvas-card`, not its children — `@project/ui` cannot render an
`<Handle>` at all — and each sits centred on the border, half inside
`.canvas-card`'s own box and half outside it. A pointer crossing from the
card onto a handle therefore leaves `.canvas-card:hover` even though it never
left the Card. `canvas-card.css` reads that as the same hover by adding
`:has(~ .rf-card-node__authoring-handle--source:hover)` alongside `:hover`
everywhere the rest state is contrasted with an active one — a CSS selector
string naming the adapter's class, not an import, and it degrades to plain
`:hover` in every Ladle story in this file, none of which have that sibling.

### Story-first catalogue

`packages/app/stories/components/canvas-card.stories.tsx` is now six exports,
not two, matching the donor's own `States`/`Kinds`/`Colours`/`HoverActions`
surface plus this branch's own behaviour-proof and title-editor stories:

- `States` — the static rest/selected/dragging reference grid, for both
  fronts, drawn through `CanvasCardSpecimen` (a thin pass-through to the
  shipped `CanvasCard`, so nothing here can drift from what it actually
  draws).
- `Kinds` — Markdown, a long-title Markdown (the three-line clamp), and Alias,
  side by side.
- `Colours` — the complete `GRAPH_PALETTE` swatch set on a selected Card's
  rail.
- `HoverActions` — the real `CardNode` mounted in a real `ReactFlow` instance
  (`CanvasCardNodeSpecimen`/`ReactFlowCanvas`), proving hover reveals
  CanvasCard's rail actions and the adapter's Edge handles together — not a
  facsimile of either.
- `Interaction` (renamed from this deepening's first-pass `States`) — the
  keyboard/hover/Connect-callback behaviour proof the Ladle e2e suite
  exercises.
- `TitleEditing` — unchanged.

The supporting scaffolding these four new stories need
(`packages/app/stories/support/Catalogue.tsx`, `CanvasCardSpecimen.tsx`,
`ReactFlowCanvas.tsx`, `fixture.ts`, `inventory.css`) is recovered from the
donor, reconciled to this branch's current API rather than copied wholesale:
`CanvasCardSpecimen` takes the discriminated `front` and four-value `state`
this deepening introduced, not the donor's separate `kind`/`aliasOf`/
`selected-hover`; `fixture.ts` drops the donor's `description` field per ADR
0051 (issue 09 deleted shared Description); import paths use this branch's
`#src/*` alias, not the donor's `#app/*`. `.inv`/`.inv-sheet` wrapping and
`inventory.css` are scoped to this one story file rather than promoted into
`.ladle/components.tsx`'s global `Provider` — Issue 13 extracts one issue's
boundary at a time, and every other story in the catalogue is out of this
ticket's scope.

Every new stable story export carries a parity claim (`ui:catalog:check`
requires it) with real Ladle and application evidence, not exemptions taken
for convenience:

- `canvas-card-exposes-kind-and-keyboard-actions` — Ladle:
  `canvas-card.spec.ts` (`Interaction` story). Application:
  `overview.spec.ts:71`.
- `canvas-card-shows-rest-selected-and-dragging-states` (new) — Ladle:
  `canvas-card.spec.ts` (`States` story: box-shadow/transform/border-style
  differ across rest, selected and dragging, for both fronts). Application:
  documented exemption — the underlying React Flow selection/dragging
  translation is unit-tested (`CardNode.test.tsx`) and exercised throughout
  `editing.spec.ts`'s drag coverage; this story's own claim is the *visual*
  pairing, which carries no facsimile risk since it renders the shipped
  component.
- `canvas-card-shows-kind-treatment` (new) — Ladle: `canvas-card.spec.ts`
  (`Kinds` story). Application: `overview.spec.ts:71`, tagged a second time
  (Alias glyph, alias-marker and border already asserted there).
- `canvas-card-shows-active-graph-colour` (new) — Ladle: `canvas-card.spec.ts`
  (`Colours` story: each rail's computed colour equals its label's own hex,
  resolved through the browser rather than hand-computed). Application:
  `overview.spec.ts:96` (new) — a selected Card's rail colour is asserted
  against the Active Graph's own legend swatch colour in the real app, which
  had no prior isolated coverage.
- `canvas-card-hover-reveals-actions-and-handles-together` (new) — Ladle:
  `canvas-card.spec.ts` (`HoverActions` story: hovering the real node reveals
  both the rail actions and an authoring handle together). Application:
  documented exemption — each half already has real coverage separately
  (`editing.spec.ts` for hover-reveals-actions, `overview.spec.ts` and
  `CardNode.test.tsx` for hover/selection-reveals-handles); this story mounts
  both through the real adapter to show them together, which is not a
  distinct browser-observable behaviour beyond those two.
- `canvas-card-owns-title-editing-and-refusal` — Ladle: `canvas-card.spec.ts`
  (`TitleEditing` story). Application: `editing.spec.ts:155` (`inline title
  editing persists without moving or opening the Card`).

### Donor accounting

Issue 13's Issue 05 donor accounting (`099241a`, `de6eca5`, `6664421`,
`f325fc9`, `6bac404`, `267708e`, plus Canvas corrections from `6292d9e` and
`b45eba5`) covers the production `CanvasCard`/`CardNode` split landed in the
prior round and reconciled with ADR 0051 by this deepening. It does **not**
cover the Ladle story-first catalogue surface — that material lives on a
separate donor lineage (`08cf4e6`, `dc9513c`, `3f37407`, `dfa7f41`, `68ae7bc`,
none of which appear in Issue 13's accounting under any section) and was
missing from this branch entirely until the correction recorded in
"Comments" below. It is retained here rather than deferred to Issue 08, whose
"final parity and guardrails" scope is to *complete* catalogue coverage after
production migrations land, not to backfill a target issue's own component
that never had one.

### Tests replaced or strengthened

`packages/ui/test/CanvasCard.test.tsx` is rewritten at the new interface: kind
and Alias-front presentation, dragging as a state distinct from selected,
Connect/Edit presence-only rendering (including withdrawal while dragging or
editing), the double-click-to-begin gate, and the private title editor's
focus/select-on-mount, refusal, completion and cancellation/focus-return —
replacing the old test that only pinned `titleEditor`/`actions` slot pass-through.
`packages/react-flow-adapter/test/CardNode.test.tsx` drops the JS-computed
hover-translation test (hover is CanvasCard's own CSS now, untestable and no
longer CardNode's job) and adds coverage for Connect's presence-only gate and
for focus restoration to a `.react-flow__node` ancestor on both Enter-success
and Escape, alongside the retained handle-geometry, connectability and
containment tests.

## Verification

- `pnpm verify` — pass (typecheck, typecheck:packages, ui:catalog:check, lint,
  lint:anti-slop, format:check, test:coverage all green; 140 test files, 1456
  tests passed, 8 skipped, 0 failed).
- `pnpm e2e` — pass, 105/105.
- `pnpm e2e:ladle` — pass, 24/24.

All three required gates are green; the ticket is not blocked on any unrelated
baseline failure. Beyond the automated gates, rest/hover/selected/dragging/
editing were checked by hand against `pnpm dev:fixture` for both a Markdown
and an Alias Card — title rename (begin, complete, field-local refusal,
Escape cancellation, focus return), Connect and Edit — and every recovered
Ladle story (`States`, `Kinds`, `Colours`, `HoverActions`) was opened and
visually compared against the donor's own Ladle instance side by side. See
"Comments" for why both rounds of hand-checking were load-bearing here and not
just a formality.

## Comments

An earlier pass at this deepening reinvented `CanvasCard`'s visual treatment
as Tailwind utility classes (`cva`) instead of finding and following the
donor's own colocated-stylesheet pattern, and shipped a `cva()` class-merge
bug as a result (a `state` variant's class and the base string's class for
the same property both landed in the DOM with nothing to deduplicate them,
so which one painted depended on Tailwind's internal generation order). That
pass was checked only in an isolated Ladle build, which didn't reproduce the
bug, so it was reported "done" with fabricated green gates. The real
`pnpm dev`/`dev:fixture` app showed multiple visual regressions once someone
actually looked. Full incident detail is in
`.scratch/design-system-baseline/issues/05-handoff-regression-2026-08-21.md`.

The fix: revert to real, colocated CSS (`packages/ui/src/canvas-card.css`,
matching the donor's structural pattern but this branch's own `e7ce880`
content), add the `css.d.ts` ambient declarations both `ui` and
`react-flow-adapter` need for the side-effect import to typecheck, restore
the `canvas-card-actions` test id the Ladle spec depends on, and revert the
now-unneeded `CardKindIcon` `className` prop and
`RUNTIME_CARD_GEOMETRY_TOKENS` test allowance that only existed to support
the abandoned Tailwind approach. All three gates re-run clean, and the
result was additionally checked by hand in the real app this time — the
thing the earlier pass skipped.

### Second correction: the story-first catalogue surface was still missing

Fixing the CSS regression above was not the whole fix. The human compared this
branch's Ladle instance against the donor's own (`feat/surface-inventory`,
running separately) and found the `States` story showed only two cards in
their resting state, requiring interaction to see anything else — nothing like
the donor's labelled `States`/`Kinds`/`Colours`/`HoverActions` grids, each with
a section header naming the contract being demonstrated. That gap was real:
`git log --follow` on `canvas-card.stories.tsx` and a search for
`packages/app/stories/support/` across this branch's entire history and
`main` confirmed the donor's `Catalogue.tsx`/`CanvasCardSpecimen.tsx`/
`ReactFlowCanvas.tsx`/`fixture.ts`/`inventory.css` scaffolding, and the three
extra story exports it supports, had never existed on this branch at any
point — not lost to the Tailwind regression, simply never recovered by the
prior round that landed the shallow `CanvasCard`, despite Issue 13 §2 naming
"stable stories, story fixtures and Ladle behavior tests" as part of every
target issue's donor boundary.

The fix is the "Story-first catalogue" section above: the scaffolding ported
and reconciled to this branch's discriminated `front`/four-state API rather
than copied wholesale, four new parity claims with real Ladle evidence (two
with real new/reused application evidence, two with documented exemptions —
see that section for exactly why each), and a visual side-by-side check
against the donor's own running Ladle instance rather than trusting that green
gates meant the catalogue matched. `pnpm verify`, `pnpm e2e` and
`pnpm e2e:ladle` all re-ran clean afterward (105/105 and 24/24 respectively,
up from 104/104 and 20/20 — the new application and Ladle evidence tests).

### Third correction: two real interaction bugs the automated gates couldn't see

Even with the story-first catalogue recovered, the human's own side-by-side
comparison with the donor's Ladle instance found two remaining defects no
automated gate caught, because neither has a corresponding assertion anywhere
in the suite:

1. The four authoring handles' `border` was `1px`, not the donor's `3px`.
   This was not part of either regression above — it has read `1px` since at
   least `e7ce880`, this branch's own last commit before this deepening — so
   it was carried forward faithfully rather than introduced. Fixed in
   `packages/app/src/styles.css`.
2. Moving the pointer from the Card onto one of its own protruding handle
   circles dropped `.canvas-card`'s hover-revealed rail and actions, because
   `:hover` is scoped to `.canvas-card`'s own box and a handle centred on the
   border sits half outside it — a real regression from replacing the prior
   wrapper-level `onPointerEnter`/`onPointerLeave` hover computation with pure
   `:hover` CSS, which this ticket's own "Module seam" section chose
   deliberately but without checking this exact transition. Fixed with
   `:has(~ .rf-card-node__authoring-handle--source:hover)` in
   `canvas-card.css` — see "Style locality" above for why that selector
   belongs there and not in an adapter-owned duplicate.

Both were verified twice: in the `HoverActions` Ladle story (mounting the
real `CardNode` in a real `ReactFlow` instance) and by hand in the real
running app (`pnpm dev:fixture`) — hovering a Card, moving the pointer onto
each handle in turn, and confirming the rail and actions stayed revealed
throughout and returned to rest only once the pointer left the node
entirely. `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` all re-ran clean
afterward with no count change, since neither fix touched what any existing
test asserts.
