# Expanded Cards — review findings

Status: resolved

## Resolution

Re-verified on the completed branch after `1bb2438` and the issue-closing tranche:

- R0, A1, A2 and A7 were fixed by carrying projected geometry into live nodes and introducing one drawn-to-authored placement inverse that preserves Expanded rects.
- A3–A6 and A8 were fixed by the complete authoring gate, structured stale-resize refusal, and result-aware Open/Save operations that retain unresolved drafts and carets.
- B9–B14 now have discriminating import, stripped-placement, completion, projection, containment, motion, displacement, conversion and resize evidence.
- C15–C20 were resolved by deleting keyboard Connect, both obsolete review mini-apps, the app-side lazy wrapper, the unused read-only editor capability and the redundant scroll property.
- D21–D25 were corrected against ADR 0064. Alias Open is retained deliberately as metadata authoring; the ADR and glossary now state that it does not create Expanded state.
- D26 was already fixed. E27 is recorded below as a design-system deviation; E28 disappeared with the prototype. E31 and E32 were removed. E29 and E30 are non-defect refactoring suggestions and were not required for closure. E33 remains an incorrect finding.

The sections below remain the original audit evidence against `437ee89`; their line numbers and present-tense wording describe that historical tree, not the resolved implementation.

Three independent reviewers ran against this branch, their findings were merged
and each was checked against the code before being trusted. The list was then
re-verified against `437ee89` after issue 05 landed.

- Base: `main` (`0cd5589`), which is also the merge-base.
- Verified at: `437ee89` "fix: preserve card preview contract", tree clean.
- Reviewers: `mattpocock-skills:code-review` (Standards + Spec axes), the
  built-in `code-review` at medium effort, and the CodeRabbit CLI (v0.7.5,
  92 files, 6 findings).

**31 of 33 were live at `437ee89`.** Issue 05 (`d66f6a0`, `437ee89`) moved
content ownership and fixed the preview contract; it did not touch the defect
surface. One finding was fixed (D26), one was wrong (E33).

Line numbers are against `437ee89`.

---

## The one that matters most — not found by the reviewers, found while verifying

**R0. `reconcile` discards projected node geometry, so ADR 0064's expansion and
neighbour displacement never reach the canvas.**
`packages/app/src/render-adapter.ts:285`

`reconcile` returns `{ ...live, data: node.data }` plus `handles` and
`className` for every Card React Flow already holds. The projection's
`position`, `width`, `height` and `zIndex` (`packages/react-flow-adapter/src/projection.ts:355`,
`:390-392`, `:402`) are dropped for any node already on screen; only a
brand-new node (`if (!live) return node`) takes them.

The rule the comment states — "Everything else is React Flow's runtime and
belongs to the live node" — was correct before ADR 0064, when React Flow owned
runtime position. It is wrong now: the projection owns the Expanded rect and
the displaced positions.

Verified in a browser against the fixture Space. Opening Card A left every node
position byte-identical (`A {12,12}`, `B {432,12}`, …), and A's node style
stayed `width: 260px; height: 146px` rather than the authored 560x420 — while
`Close Card A` was visible and the body rendered, because `data` is the one
thing that does come through.

The domain layer is correct. `authoredPlacement()` after `opened-card` holds
`{x:10, y:20, expanded:{560,420}}`, the stored Layout holds the same, and
`Placement.drawn` displaces the neighbour to `{600,314}`. The derivation is
thrown away one layer above it.

**Why the green suite did not catch it:** `packages/app/e2e/editing.spec.ts:441`
captures `before = allPositions(page)` *ahead of* `openCard`, then asserts
`toEqual(before)` after. If displacement worked, that test would fail. The
suite currently encodes the defect as expected behaviour.

---

## A. Runtime defects

**A1. `Placement.next` drops `expanded` on a move — dragging an open Card
silently closes it and destroys the authored size, permanently.**
`packages/graph/src/placement.ts:186-193`

`next` writes `point({ ...at, x, y })` where `at` is the *rendered* entry.
Production `rendered` comes from `packages/app/src/render-adapter.ts:221-226`
`placementFromNodes`, built from `node.position` — x/y only. `point`
(`placement.ts:74-80`) copies `expanded` only when present, so it is dropped.
`render-adapter.ts:482` `settled-card-movement` then installs it via
`space-authoring.ts:1298-1303` and `Placement.toPositions` persists it.

Reproduced: `next({A:{x:0,y:0,expanded:{560,420}}}, {A:{x:120,y:60}}, [A])`
returns `{"x":120,"y":60}` — `expanded` undefined.

Failure: open Card A (560x420), resize to 900x700, drag 10px. A snaps shut,
the resize is gone, and reload does not recover it.

Fix direction: seed the merged entry from the authored value —
`point({ ...authored.get(cardId), ...at, x, y })`.

**A2. Same function: no displacement correction for a newly-admitted Card.**
`packages/graph/src/placement.ts:181-195`

For a Card absent from `authored`, both `shifted` and `original` are undefined,
so the correction is 0 and the drawn coordinate is authored verbatim; `drawn`
then displaces it again.

Reproduced: A authored `{x:10,y:20,expanded:{560,420}}`, B unplaced dropped at
drawn (500,400) -> authored B (500,400) -> redrawn B (800,674). 300px right and
274px down of where the pointer was released. Not ADR 0064's accepted step
boundary — B crossed nothing.

**A3. `onBeginBodyEditing` and `resize` bypass `canAuthorOnCanvas`.**
`packages/app/src/components/SpaceCanvas.tsx:361-376`

Siblings at `:356`, `:357` and `:379` all apply the gate; these three do not.
`packages/react-flow-adapter/src/CardNode.tsx:117-119` forwards
`onBeginBodyEditing` unconditionally — contrast `:114`, which does gate
`onOpenChange` on `cardEditingEnabled`. `packages/ui/src/CanvasCard.tsx:133`
is why the gate never applies to an already-open Card: `contentEditAction`
returns `onBeginContentEdit` without consulting `onOpenChange`.

Failure: while presenting or behind a modal `CardPane`, an already-open Card
keeps a live "Edit Card X" control and its resize handles. The caret reset at
`:227-231` fires once on the transition; a fresh press re-sets it. The
Open/Close control correctly disappears in the same state — the asymmetry is
visible on one rail.

**A4. A refused or discarded body save silently destroys the draft.**
`packages/app/src/App.tsx:465-474`

`completeCardBody` discards the `AuthoringResult`, and a non-markdown or
missing Card returns silently at `:467`. `packages/ui/src/MarkdownCardBody.tsx:208-225`
`leave(true)` calls `onComplete(draft)` then `onEnd()` unconditionally;
`onComplete` is typed `(body: string) => void` (`:28`), so a refusal cannot
even be expressed. `onEnd` withdraws `bodyEditor`, the editor unmounts, the
draft is gone.

Reachable: `edited-card` refusals at `space-authoring.ts:915`, `:922`, `:927`,
`:929`, and `{kind:'queued'}` (`:1311-1312`) with epoch-discard at `:1345-1353`.
The `completeOpenedCard` this replaced returned the refusal so the pane could
show it and stay open.

**A5. `resized-card` throws where every sibling refuses.**
`packages/app/src/space-authoring.ts:954-958`

`throw new Error('Cannot resize a Card that is not Expanded')`. `opened-card`
(`:938-945`), `closed-card` (`:946-953`) and `added-card-to-layout`
(`:989-995`) all use `refuse(...)`/`UNCHANGED`. The file's own comment at
`:902-903` says "an author's mistake may not throw". `performCompletion`
(`:1277-1288`) has no `catch`; `complete`'s `try` (`:1314`) has only a
`finally`. The throw escapes to `App.tsx:459-462`, invoked from React Flow's
`onResizeEnd` — a handler no error boundary catches.

**A6. One `caret` `useState` gives a fifth edit exit that discards the draft.**
`packages/app/src/components/SpaceCanvas.tsx:180`

Three writers overwrite it without asking whether a body edit is live: `:242`
(`nameOnCreation`), `:336` (F2 on the selected node), `:359` (another Card's
`onBeginTitleEditing`). `CardNode.tsx:214-220` withholds the title control only
on the *same* Card, so another Card's title control, F2 and Add Card are all
reachable mid-draft. When `caret` moves, `bodyEditor` is withdrawn and
`MarkdownCardBody` falls back to `RenderedMarkdown` (`:300-307`).

ADR 0064: "Four exits and no more… A click elsewhere leaves the draft and the
editor up."

**A7. Flow coordinates reach `Placement.place` un-inverted.**
`packages/app/src/App.tsx:235`, `packages/app/src/edge-authoring-react.tsx:330`

`centreAnchor` derives from React Flow's viewport transform
(`components/CanvasCentre.tsx:48-56`) — drawn space — and is handed to
`created-card` (`App.tsx:265`) and `created-alias` (`:304`);
`screenToFlowPosition(...)` feeds the Alt-drop. All three land at
`space-authoring.ts:971`, `:988`, `:1037` then `Placement.place` at
`:1086-1093`, which copies verbatim (`placement.ts:208-212`). Only `next`
inverts. `drawn` then displaces the new Card a second time.

Failure: with Card A open at 560x420 at x=0, pressing `C` at viewport centre
flow-x 900 authors the new Card at x=900 and draws it at x=1200.

**A8. Caret strands on a refused open.** (plausible, not reproduced)
`packages/ui/src/CanvasCard.tsx:135-138`

The closed-Card branch runs `onOpenChange(true)` then `onBeginContentEdit()`
unconditionally. `App.tsx:450` `opened-card` can return `refused`
(`card-not-in-layout`, `layout-not-found`, `placement-pending`) or `queued`,
and nothing feeds that back. Key the caret off the open succeeding.

---

## B. Guards and tests that do not bite

**B9. The lazy-import guard cannot see side-effect imports.**
`test/unit/codemirror-encapsulation.test.ts:56-60`

`staticImport` requires a `from` clause, so `import '@project/ui/MarkdownSourceEditor';`
matches nothing and `isValueImport` is never reached — yet a side-effect import
pulls the whole stack into the bundle. The `ui` entry (`:37-40`) matches only
the literal `'./MarkdownSourceEditor'`, so `'../MarkdownSourceEditor'` from a
subdirectory is invisible too.

**B10. The round-trip test is vacuous.**
`packages/graph/test/placement.test.ts:86-99`

It feeds `Placement.drawn(authored)` as `rendered`; `drawn` preserves
`expanded` (`placement.ts:256`), so `next` gets a report production never
produces and passes by `equals` identity. This is why A1 shipped green. The
spec's required fast-check property `next(p, drawn(p), [...all]) === p` over a
*stripped* report does not exist — the three properties at `:340-402` never
touch `expanded`. No close-between-halves variant either.

**B11. The three new completions have no unit tests.**
`grep` for `'opened-card'`/`'closed-card'`/`'resized-card'` over
`packages/app/test`, `packages/app/e2e`, `packages/app/ladle-e2e` and `test/`
returns zero hits. Nothing covers `opened-card` converting an Algorithmic View
(it is deliberately absent from `LAYOUT_ONLY`, `space-authoring.ts:448-458`),
the two `UNCHANGED` cases, or the A5 throw.

**B12. `card-expand.spec.ts` lacks issue 02's stated invariant.**
Issue 02 `:44` specifies the rest-state assertion that a Card's border box
equals its node wrapper's; `:45` the conditioned `getAnimations()` check.
Neither is in `packages/app/ladle-e2e/card-expand.spec.ts` (245 lines, 8 tests,
all rail/edit-lifecycle/typography). `getAnimations` appears nowhere in the
repository. This is the test that would have caught R0.

**B13. `canvas-projection.test.ts` is untouched by the branch.**
`grep` for `expandedCardIds`/`sizeOf` across all test trees returns nothing.
Nothing exercises the per-Card `sizeOf` lookup (`canvas-projection.ts:108`) or
the `expandedCardIds` set (`:99-103`).

**B14. The application proof is about half written.**
Missing: resize (no e2e touches `NodeResizer`), neighbour displacement, closing
restoring neighbours exactly, and opening on an Algorithmic View converting to
a Layout. Worse, `editing.spec.ts:441-453` asserts positions are *unchanged*
across an open — see R0.
Now covered: opening persisting across reload, implicitly but genuinely, by
`editing.spec.ts:288-290` and `:452-457`.

---

## C. Dead code and scope

**C15. Keyboard Connect was deleted with no replacement.**
`connectingEnabled`, `onBeginConnect`, `ConnectIcon` and `beginConnectFrom` are
gone from all source. `beginKeyboardConnect` survives at
`packages/app/src/edge-authoring.ts:303` and `:635`, and the
`'keyboard-connect'` `EdgeIntent` branch at `:181`, `:347`, `:367`, `:414`,
`:639` plus `edge-authoring-react.tsx:648` — with **test callers only**
(`edge-authoring.test.ts` x9, `edge-authoring-react.test.tsx` x5, a stub in
`SpaceCanvas.test.tsx:74`).

A keyboard-only author cannot create an Edge. ADR 0064 never mentions Connect,
so this is outside its scope, and three documents still describe the control:
`docs/agents/rendering.md:12` and `:7`, and `CLAUDE.md:46` = `AGENTS.md:46`.

Decide: restore the control on the new rail, or record the removal in an ADR
and delete the dead state machine with its docs.

**C16. Dead app-side lazy module, kept alive by its own guards.**
`packages/app/src/components/markdown-source-editor-lazy.ts` has one importer —
`packages/app/stories/review/card-editor-layouts.tsx:28`, the review story C18
says to delete. `eslint.config.js:76` still carries the
`'!@project/ui/MarkdownSourceEditor'` exception and
`test/unit/codemirror-encapsulation.test.ts:31-35` still requires that file to
be the sole dynamic importer, so it cannot be deleted without editing the
guard. `presentMarkdownCardRefusal` (`packages/app/src/authoring-refusal.ts:124`)
likewise has only a test caller.

**C17. `packages/app/stories/review/expanding-cards.*` — 558 + 130 + 94 lines.**
Spec says delete or demote once the real stories carry the claims; they now do
(`card.stories.tsx#OpenAndClose`, `card-editing.stories.tsx#Markdown`). It
reimplements expansion, movement, resize and caret state locally, so it can
drift from the product it illustrates.

**C18. `packages/app/stories/review/card-editor-layouts.*` — 525 + 226 + 444 lines.**
Dialog-layout exploration for the covering Markdown pane ADR 0064 deleted. Its
own header says the question is unresolved; `.scratch/card-editor-dialog-layout/findings.md`
is `needs-human`. It is also the sole reason C16 cannot be closed.

**C19. `MarkdownSourceEditor.editable` has no production consumer.**
`packages/ui/src/MarkdownSourceEditor.tsx:40`, default `true` at `:231`. The one
production consumer (`MarkdownCardBody.tsx:272`) passes it bare;
`editable={false}` appears only in the component's own test (`:161`, `:176`).
Its JSDoc (`:30-39`) describes "a Card that has been expanded but not yet
double-clicked" showing source at rest — the state ADR 0064 rejects and
`RenderedMarkdown` contradicts. ADR 0063: a new editor capability must first
become an explicit Hyper-level capability.

**C20. `--markdown-source-scroll` is a contract point with no need.**
Declared with fallback `auto` at `MarkdownSourceEditor.tsx:82`; its only setter
(`packages/ui/src/markdown-card-body.css:233`) sets it to `auto`.

---

## D. Documentation that contradicts the code

**D21. "ADR 0066" does not exist.**
`docs/adr/` ends at `0065-a-card-title-edits-on-one-activation.md`. Commit
`d318339`'s subject says "record ADR 0066" but the file it wrote is
`0064-opening-a-card-expands-it-in-place.md`. Four dangling citations:
`packages/ui/src/CanvasCard.tsx:118`, `packages/ui/src/MarkdownCardBody.tsx:102`,
`packages/ui/src/canvas-card.css:82`, `docs/agents/ui.md:8`.

**D22. `docs/agents/ui.md:16` documents animate.css as an adopted dependency.**
It names `animate.css@4`, an import site in `packages/app/src/tailwind.css`, a
`--animate-duration` theme token and a ~72 kB cost. Verified absent: no
`package.json` entry, no `node_modules/animate.css`, no `animate__` class
anywhere under `packages/`, no import in `tailwind.css`. An agent reading this
before its next UI ticket writes classes that are silent no-ops.

**D23. `CONTEXT.md:150` contradicts ADR 0064 and the component beneath it.**
It still says a Markdown Card "opens on its Title and Markdown source, verbatim
and editable", that a Markdown Card is "only ever drawn *rendered* by
presenting", and that "There is no separate reading state".
`MarkdownCardBody.tsx:300-307` draws `RenderedMarkdown` at rest and swaps to
source only during an edit — the opposite on all three counts. The same entry
was edited in this diff for Layout/Placement/Opening; this half was left.

**D24. `CONTEXT.md:153` bans "modal, dialog" for Opening while `OpenCard` is one.**
`packages/app/src/components/OpenCard.tsx:105` renders `CardPane`, which is a
Base UI `Dialog` (`components/CardPane.tsx:53-63`). ADR 0064 carves out Alias
*creation*, not Alias opening. The glossary currently makes the only surviving
implementation of "opening an Alias" unnameable.

**D25. `projection.ts:154-166` asserts the opposite of the code beneath it.**
The `body` comment still reads "An Expanded Card does not carry one yet…
nothing tells this projection which Cards the Layout Expanded… Wiring that is
issue 02's". The same file declares `expandedCardIds` at `:205`, reads it at
`:336` and fills `body` at `:341`.

**D26. FIXED.** `d66f6a0` deleted the `docs/agents/ui.md:13` passage claiming
"Three computed-style assertions pin the results" along with the catalogue-bundle
guard it named. Residue: the colocated-stylesheet list at `:14` names
`markdown-source-editor.css` but not the new `packages/ui/src/markdown-card-body.css`.

---

## E. Quality and judgement

**E27. `packages/ui/src/components/kbd.tsx:5-26` — registry component
hand-modified with no recorded deviation.** A `compact` cva variant (`:9-10`),
a `keyName?: 'modifier'` prop (`:20`), and
`/Mac|iPhone|iPad|iPod/.test(navigator.platform)` (`:25`). No entry in
`packages/app/stories/design-system-inventory.ts` (ADR 0047/0050).
`navigator.platform` is deprecated and reports `MacIntel` on iPadOS. The next
registry regeneration silently drops both additions.

**E28.** `EXPANDED_DEFAULT` (`packages/app/stories/review/expanding-cards.tsx:62`)
duplicates `DEFAULT_EXPANDED_CARD_SIZE` (`packages/app/src/card.ts:41`).

**E29.** Five near-identical `card__rail-action` buttons in
`packages/ui/src/CanvasCard.tsx:212, 231, 257, 375, 388`. The inline
stop-propagation literals have grown to 14 occurrences (21 `stopPropagation`
mentions). A single `RailAction` taking `{label, icon, onActivate, disabled?,
keyShortcuts?, ref?}` expresses all five.

**E30.** `packages/react-flow-adapter/src/CardNode.tsx:120-136` — a three-arm
nested ternary building three near-identical `markdownFront` literals differing
only in `open` and `editor`. `markdownOperations` immediately above already
uses the conditional-assignment shape this wants.

**E31.** `packages/app/src/components/OpenCard.tsx:113-115` keeps
`style={{ … } as CSSProperties}` while `packages/ui/src/CardRail.tsx:15` and
`packages/ui/src/CanvasCard.tsx:100` adopted the typed-intersection pattern the
same diff introduced (ADR 0062). This was the edit that would have retired it.

**E32.** `packages/app/test/OpenCard-types.test.tsx:45-47` —
`expectTypeOf<{card: Card; onCancel}>().not.toExtend<OpenCardProps>()` is
trivially true for two independent reasons, and `OpenCardProps`
(`OpenCard.tsx:60-70`) no longer has any `card` arm, so the docblock at `:39-44`
describes a union member that was deleted. `:36` is defensible.

**E33. The earlier review was WRONG.** `eslint-suppressions.json` is not stale.
`pnpm lint` (`--prune-suppressions`) exits clean and leaves the file
byte-identical; `d66f6a0` had already removed five entries.

---

## Suggested order

1. **R0** — until projected geometry reaches the canvas the feature does not
   visibly exist and A1/A2 cannot be seen. The `editing.spec.ts:441` assertion
   has to be rewritten as part of this, not after it.
2. **A1** — silent data loss written to the persisted Layout.
3. **B10** — the property test that would have caught A1, over a stripped report.
4. **A7, A2** — the remaining coordinate defects.
5. **A3, A6, A4, A5** — gate, fifth exit, lost draft, throw.
6. **C15** — decide restore-or-record; it is an accessibility regression either way.
7. **D21-D25** — the documents an agent reads first are currently wrong.
8. The rest as cleanup.

## Counts

| Verdict | Count |
| --- | --- |
| Still live | 31 |
| Fixed | 1 (D26) |
| Earlier review wrong | 1 (E33) |
| Found while verifying | 1 (R0) |
