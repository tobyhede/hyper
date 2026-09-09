# Each offered Card operation carries its own capability

Status: ready-for-agent
Tags: Improvement
Blocked by: `.scratch/layout-only-v1/issues/04-make-space-cards-select-initialized-layouts.md`

Surfaced by: the 9 September 2026 architecture review, candidate 4 (the top
recommendation of the reviewed report), then settled by a grilling loop. Sibling
of issue 20, which is candidate 1 of the same review: that one collapsed the
*question* "may this be authored now" into one module, and this one fixes how
one of its answers is carried across the props seam. The rejected alternatives
are recorded under "Decided" so none is re-opened.

## The defect

`CardNodeData` (`packages/react-flow-adapter/src/projection.ts`) carries two
operations as a **boolean beside a callback**, where the boolean and the
callback are the same fact:

| Flag | Operation | Both written at |
| --- | --- | --- |
| `titleEditingEnabled` (`:79`) | `onBeginTitleEditing` (`:88`) | `canvas-card-authoring.ts:285` and `:293` |
| `cardEditingEnabled` (`:86`) | `onEditCard` (`:87`) | `canvas-card-authoring.ts:289` and `:290` |

The conditions are identical, term for term:

```ts
// canvas-card-authoring.ts:285
titleEditingEnabled: cardBelongsToWorkingSpace && availability.authorOnCanvas && !bodyEditing,
// canvas-card-authoring.ts:292-293
if (cardBelongsToWorkingSpace && availability.authorOnCanvas && !bodyEditing) {
  data.onBeginTitleEditing = () => beginTitleEditing(node.id);
}
```

Both members are declared independently optional, so the type permits a flag
with no operation. `CardNode` therefore trusts neither alone and re-checks the
pair at four sites — three of them the same line, once per Card front:

- `CardNode.tsx:98` — `cardEditingEnabled === true && onEditCard !== undefined` (markdown)
- `CardNode.tsx:127` — the same (alias)
- `CardNode.tsx:141` — the same (space)
- `CardNode.tsx:217-219` — `bodyEditor === undefined && titleEditingEnabled === true && onBeginTitleEditing !== undefined`

Those four conjunctions are the repair. The comment above them
(`CardNode.tsx:205-214`) states the defect exactly and then works around it:
*"The flag and the operation answer different questions … and `SpaceCanvas`
supplies them together, but the type lets them diverge."*

### The same object already gets it right, three times

`titleEditor` (`:102`), `bodyEditor` (`:134`) and `resize` (`:156`) are single
optional objects whose **presence is the capability** and which carry the
operations that capability needs. Nothing beside them is a flag and `CardNode`
reconciles nothing.

`projection.ts:104-111` records what the split shape cost when `titleEditor` had
it: *"Split into a boolean and two independent optional callbacks, the adapter
had to manufacture total functions out of partial data, and an absent completion
answered `null` — which `CanvasCard` reads as accepted, closing the editor on a
rename that never happened."* This ticket applies that already-taken decision to
the two members that were left behind.

### It has already produced a defect in shipped story evidence

`stories/support/ReactFlowCanvas.tsx:397` is the one place in the tree where the
two genuinely diverge, and it diverges wrongly:

```ts
cardEditingEnabled: cardEditingEnabled ?? source.data.kind === 'markdown',
onEditCard: onOpenChange ?? (() => 'completed'),
```

The operation is always supplied; the flag defaults off for every kind but
`markdown`. That default is a rule the application abandoned with ADR 0070 —
`projection.ts:80-88` says so in as many words: *"**Not 'owns content to edit'**
… an Alias Opens and Closes through that same operation (ADR 0070), so an Alias
sets it exactly as a Markdown Card does."* So every Alias and Space specimen in
the catalogue draws without an Open control that the application draws, and
`card.stories.tsx:303` exists only to force the flag back on for the one story
that needed it. A story drawing a Card the application does not have is the one
thing ADR 0052 evidence must not do, and it is the same failure mode issue 20
found at `SpaceSidebarFixture.tsx:225`.

## What to build

Delete `titleEditingEnabled` and `cardEditingEnabled` from `CardNodeData`. The
presence of `onBeginTitleEditing` and `onEditCard` becomes the capability, as it
already is for the three objects beside them. Nothing is renamed and no new type
is introduced.

- `projection.ts` — remove `:79` and `:86` and their doc comments. The paragraph
  at `:80-88` moves onto `onEditCard`, which is what it is actually about.
- `canvas-card-authoring.ts:285` — the always-written `titleEditingEnabled` key
  goes; the conditional block at `:292-293` is unchanged and is now the whole
  answer. `:289`'s `data.cardEditingEnabled = true` goes; `:290` is unchanged.
- `CardNode.tsx:98`, `:127`, `:141` — each becomes `if (data.onEditCard !== undefined)`.
- `CardNode.tsx:217-219` — becomes `if (data.onBeginTitleEditing !== undefined)`.
- `stories/support/ReactFlowCanvas.tsx` — `cardEditingEnabled` the specimen prop
  is renamed for the operation it withholds, and its kind-derived default is
  **deleted rather than moved**: with the flag gone there is nothing to derive it
  onto, and the default was wrong under ADR 0070 anyway. `card.stories.tsx:303`
  drops the override it only needed because of that default.

### The two residual second opinions go with them

`CardNode` holds two `data.bodyEditor === undefined` terms of its own, and both
are the same defect one layer down:

- `:217` — subsumed. The composition's own term is `!bodyEditing`, which is
  Space-wide, so a live body edit withholds `onBeginTitleEditing` from **every**
  Card. The adapter's per-Card restatement can only ever agree.
- `:228` — unreachable. `Caret` (`canvas-card-authoring.ts:21-24`) is a single
  nullable union, so one Card cannot hold a title caret and a body caret at once
  and `titleEditor` and `bodyEditor` cannot both be set.

If either turns out to be load-bearing, that is a fact about the composition
being wrong and is reported rather than guarded around.

## Decided

Settled by the grilling loop of 9 September 2026. Recorded so none is re-opened.

1. **Scope is the two flag/operation pairs, and nothing else.**
   `connectionAuthoringEnabled` (`projection.ts`, written only at
   `embedded-layout.ts:96`) and `readOnly` (`:61`, written `true` only at
   `SpaceCanvas.tsx:542`) are **not** pairs: neither has an operation in
   `CardNodeData` to be paired with — connection authoring's operation is React
   Flow's own `isConnectable` — so "pair the operation with its capability" has
   nothing to bite on. Both are surface-wide suppressions and both stay. Folding
   them in is the all-or-nothing authoring aggregate the report warns against.

2. **Presence is the capability; no wrapper object.** `titleEditor`, `bodyEditor`
   and `resize` earn their object shape because each carries two or more things
   that must travel together. Open/Close and begin-title-edit carry exactly one
   function each, so an object around them would add a name and pair nothing.

3. **`readOnly` is the sole answer for the dormant embedded Card, and gets a
   test.** `SpaceCanvas.tsx:539-550` sets `readOnly: true` while *supplying* both
   operations, redefined to mean "resume the embedded session" — so this is the
   one live case where an operation is present precisely so it will not be drawn,
   and where presence is deliberately not the capability. Three layers currently
   say no: the flag, `readOnly` in `CardNode.tsx:228`/`:368`/`:426`, and `readOnly`
   again in `CanvasCard.tsx:244`/`:266`. Two remain, which is already one opinion
   too many. What the flag was covering has to become an assertion instead — see
   Tests.

4. **The operations keep both consumers.** `SpaceCanvas.tsx:608` and `:660` call
   `embedded.data.onEditCard?.(true)` and `embedded.data.onBeginTitleEditing?.()`
   directly, as keyboard commands that never reach `CardNode`. Splitting the
   keyboard operation off node data to make drawn-control presence unambiguous
   was considered and rejected: it would put a second transport beside the one
   React Flow already gives us, to disambiguate a case `readOnly` answers.

5. **No `CONTEXT.md` change, and "capability" is not canonicalised.**
   **Availability** already names the domain question — whether an operation may
   be started now — and this ticket changes only how one of its answers is
   *carried* between two modules. That is a type shape, not a domain concept, and
   `CONTEXT.md` is a glossary rather than a design record. The loose "Resizing is
   a Card capability" at `CONTEXT.md:143` is ordinary English and stays.

6. **No ADR.** It reverses cheaply, surprises no future reader, and there is no
   genuine trade-off — it fails all three tests.

7. **The seven flag assertions are rewritten, not deleted.**
   `canvas-card-authoring.test.tsx:218`, `:315`, `:431`, `:432`, `:444`, `:449`
   and `:450` each pin a real availability rule. Only the *divergence* becomes
   unrepresentable; the rules do not. Deleting them would lose four availability
   rules to a refactor meant to remove a repair.

8. **The story knob is renamed rather than left alone.** Under ADR 0052 the story
   is evidence for the component's real interface, so a knob named after a deleted
   property is a second vocabulary for the same thing — the drift the flags caused
   in the first place. This is what pulls `pnpm e2e:ladle` into the bar.

9. **Sequenced after `layout-only-v1/04`, not merged with it.** Ticket 04 has to
   touch `canvas-card-authoring.ts`'s Space Card path. Being in the same file does
   not make two changes one obligation.

10. **Not folded into candidate 2.** The reviewed report's candidate 2
    (Layout-scoped derivation) touches `canvas-projection.ts`, which writes
    `readOnly: false` at `:112` and nothing else here. The two share no decision.

## Tests

The pairing stops being a runtime fact and becomes a type fact, so what needs a
test is not the pairing but the one case Decided #3 leaves resting on `readOnly`
alone.

- **New, in `packages/react-flow-adapter/test/CardNode.test.tsx`**: a node with
  `readOnly: true` **and** `onEditCard` supplied draws no Open/Close control, and
  the same with `onBeginTitleEditing` draws no title-edit affordance. Today that
  is implied by the flag rather than asserted, and the flag is what is being
  deleted. Verify it fails with `readOnly` removed from `CardNode.tsx:396`/`:408`
  before committing it — a test that passes either way pins nothing.
- `CardNode.test.tsx`'s props builder (`:153-154`, `:175-176`, `:193-194`) drops
  both flag fields; the fifteen call sites that set them
  (`:277`, `:320`, `:347`, `:348`, `:362`, `:378`, `:384`, `:414`, `:424`,
  `:440`, `:460`, `:491`, `:756`, `:777`) supply or withhold the operation
  instead. A case that set the flag *without* the operation, if any exists, was
  testing the repair branch and goes.
- The seven `canvas-card-authoring.test.tsx` assertions re-point at
  `onBeginTitleEditing === undefined` / `onEditCard === undefined` (Decided #7).
- No new test for the deleted `bodyEditor === undefined` terms: both are
  unreachable or subsumed, and a test for an unreachable branch is a test of the
  guard rather than of the behaviour.

## Verification bar

- `pnpm verify`
- `pnpm e2e` — a UI change, and it must stay green **and unchanged**; this is a
  collapse with no product behaviour in it
- `pnpm e2e:ladle` — `ReactFlowCanvas` and `card.stories.tsx` are touched, and it
  is its own CI job that neither `verify` nor `e2e` runs

`e2e:ladle` is the one that can actually fail here. Deleting the harness default
at `ReactFlowCanvas.tsx:397` changes what several Alias and Space specimens draw
— they gain the Open control the application has and the catalogue did not. That
is the fix, not a regression, but the story snapshots move with it.
