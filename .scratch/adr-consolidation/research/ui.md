# Cluster `ui` — ADR liveness analysis

Scope: 16 live ADRs (0036 0047 0048 0050 0052 0063 0064 0065 0066 0067 0073 0082 0084 0089 0093 0102) + 4 superseded (0006 0011 0037 0053).
Words: 13,363 live + 2,847 superseded = 16,210. Percentages are reading estimates per paragraph, not measurements; code facts cited were checked by grep/read.

Word-weighted over the 16 live ADRs: **LIVE 29% · STALE-VOCAB 15% · OVERTAKEN 11% · HISTORY 44%**. So ~44% of live-ADR words carry a decision that still binds (a third of those in retired words). Including the superseded four: LIVE 24 / STALE 13 / OVERTAKEN 19 / HISTORY 44.
92 distinct live decisions across the 16 (with overlap; ~60 after dedup).

| ADR | words | LIVE% | STALE-VOCAB% | OVERTAKEN% | HISTORY% | #live | verdict | where rule lives now |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0036 | 936 | 20 | 5 | 20 | 55 | 3 | CONSOLIDATE | SpaceCanvas.tsx (zoomOnDoubleClick={false}, F2 handler); CONTEXT.md 'Selected Resource'; SpaceCanvas.test.tsx F2 tests |
| 0047 | 996 | 25 | 5 | 10 | 60 | 4 | CONSOLIDATE | AGENTS.md (Production UI work starts with $shadcn-first-ui), docs/agents/ui.md bullet 3, .agents/skills shadcn-first-ui, pnpm ui:catalog:check + stories/design-system-inventory.ts |
| 0048 | 997 | 12 | 3 | 45 | 40 | 2 | ARCHIVE | docs/agents/ui.md Escape/commit bullet (partly stale itself); InlineTitleEditor; MarkdownSourceEditor PANE_OWNED_KEYS; parity claim open-markdown-resource-owns-its-editing-lifecycle |
| 0050 | 528 | 55 | 0 | 0 | 45 | 4 | KEEP | packages/{app,ui}/components.json (base-nova, neutral, lucide); no @radix-ui import in packages/*/src; docs/agents/ui.md bullet 4 |
| 0052 | 393 | 75 | 0 | 0 | 25 | 4 | KEEP | packages/app/stories/parity-claims.ts, design-system-inventory.ts, ui:catalog:check (test/unit/ui-catalog.test.ts), pnpm e2e:ladle |
| 0063 | 351 | 60 | 10 | 10 | 20 | 6 | KEEP | packages/ui/src/MarkdownSourceEditor.tsx (PANE_OWNED_KEYS, indentWithTab={false}, lineNumbers), packages/ui/package.json ./MarkdownSourceEditor export, test/unit/codemirror-encapsulation.test.ts |
| 0064 | 835 | 15 | 35 | 25 | 25 | 8 | CONSOLIDATE | CONTEXT.md 'Opening'/'Map' sections; AGENTS.md ADR 0064 entry; parity-claims (markdown-resource-opens-and-closes-in-place, open-markdown-resource-owns-its-editing-lifecycle, resource-toolbar-survives-open-and-close); core schema placement open/openSize |
| 0065 | 555 | 20 | 30 | 5 | 45 | 6 | CONSOLIDATE | packages/ui/src/CanvasResource.tsx ('Edit Title {name}' control), InlineTitleEditor.tsx; CONTEXT.md Title/Title Lines |
| 0066 | 717 | 20 | 45 | 15 | 20 | 9 | KEEP | packages/core/src/schema.ts:348-356 (open discriminant, openSize required when open); packages/app/src/resource.ts RESOURCE_CLOSE_SNAP_DISTANCE=24; parity-claims open-resource-offers-one-resize-control, resize-preview-snaps-to-closed-rect; CONTEXT.md Opening |
| 0067 | 237 | 75 | 5 | 0 | 20 | 3 | KEEP | packages/ui/src/markdown-source-editor-lazy.ts; test/unit/codemirror-encapsulation.test.ts; AGENTS.md ui bullet |
| 0073 | 1130 | 15 | 30 | 25 | 30 | 7 | CONSOLIDATE | packages/ui/src/components/toolbar.tsx, CanvasCommandToolbar.tsx (holdFocus, stops), ResourceRail.tsx (ResourceRailKindActions/SharedActions); test/unit/command-surface-sharing.test.ts; parity-claims resource-toolbar-*; docs/agents/ui.md Command Dock bullet |
| 0082 | 1807 | 40 | 5 | 0 | 55 | 11 | CONSOLIDATE | docs/agents/ui.md Command Dock bullet; AGENTS.md; packages/app/src/components/CommandDock.tsx, CommandDockMapGraph.tsx (ChoiceMenu); stories/space/command-dock.stories.tsx + ladle-e2e/command-dock.spec.ts |
| 0084 | 1216 | 20 | 20 | 10 | 50 | 7 | CONSOLIDATE | packages/graph/src/placement.ts (growth, displace, reclaim); CONTEXT.md Map section; AGENTS.md ADR 0084 entry |
| 0089 | 1154 | 25 | 25 | 0 | 50 | 8 | CONSOLIDATE | docs/agents/ui.md 'There is no creation pane' bullet; AGENTS.md ui/app bullets; packages/app/src/resource-rail-actions.tsx, titles.ts nextSpaceTitle, command-outcomes.ts space-resource-create; parity claim command-dock-creates-each-kind-in-one-press |
| 0093 | 726 | 20 | 20 | 0 | 60 | 3 | CONSOLIDATE | packages/graph/src/placement.ts roomAxis/displace; CONTEXT.md Map section (restated verbatim-ish); AGENTS.md |
| 0102 | 785 | 55 | 0 | 0 | 45 | 7 | KEEP | packages/react-flow-adapter/src/ResourceNode.tsx:397-432 (toolbarVisible, NodeToolbar); packages/ui/src/CanvasResource.tsx renderToolbar; parity-claims resource-toolbar-draws-on-selection-with-open-last |
| 0006 | 520 | 10 | 5 | 45 | 40 | 1 | ALREADY-SUPERSEDED | Restated by 0064 + CONTEXT.md 'Opening'; still cited as live rationale in react-flow-adapter/src/projection.ts, app/src/resource.ts, e2e/presenting.spec.ts, root README.md:222, AGENTS.md line 5 |
| 0011 | 517 | 0 | 0 | 65 | 35 | 0 | ALREADY-SUPERSEDED | n/a - reversed by 0064 (Open renders Markdown) |
| 0037 | 486 | 0 | 0 | 60 | 40 | 0 | ALREADY-SUPERSEDED | n/a |
| 0053 | 1324 | 0 | 0 | 55 | 45 | 0 | ALREADY-SUPERSEDED | Durable clause carried verbatim into 0082 |

## Control-arrangement prose (README: "tests and CONTEXT.md hold, not the prose")

Estimated share of each body that describes an arrangement of controls (which command sits where, order, what reveals when), and what now holds it:

| ADR | ~arrangement share | held by |
| --- | --- | --- |
| 0036 | ~60% (click/dblclick allocation on the Resource body) | SpaceCanvas `zoomOnDoubleClick={false}`, F2 tests in `packages/app/test/SpaceCanvas.test.tsx`, `editing.spec.ts` |
| 0064 | ~25% (Edit/Open/Close/Save/Cancel rail set, disabled Close) | parity claims `open-markdown-resource-owns-its-editing-lifecycle`, `resource-toolbar-survives-open-and-close`, `markdown-resource-opens-and-closes-in-place` |
| 0065 | ~45% (Title as control, pencil rejected) | `CanvasResource.tsx` "Edit Title {name}" control; InlineTitleEditor tests |
| 0073 | ~60% (groups, order, Open/Close last, where keydown stop sits) | `test/unit/command-surface-sharing.test.ts`; parity `resource-toolbar-draws-on-selection-with-open-last`; `toolbar.tsx` doc comment |
| 0082 | ~15% own, but its thesis *is* the README rule applied to the Dock | `stories/space/command-dock.stories.tsx`, `ladle-e2e/command-dock.spec.ts`, parity `command-dock-*` |
| 0089 | ~20% (Create Reference row placement, disabled-not-absent) | `resource-rail-actions.tsx`, parity `command-dock-creates-each-kind-in-one-press` |
| 0102 | ~50% (NodeToolbar placement, visibility rules) | `ResourceNode.tsx` `toolbarVisible`; parity `resource-toolbar-draws-on-selection-with-open-last` |
| 0066 | ~10% (one bottom-right resize handle) | parity `open-resource-offers-one-resize-control`, `resize-preview-snaps-to-closed-rect` |

Roughly a quarter to a third of the live-cluster words are arrangement prose that parity claims + unit/e2e now own. Where the ADR and the tests diverge (0073's Tab shape vs 0102; 0065's "Edit Opens"), the tests are right and the ADR is wrong.

## Per-ADR live decisions (current vocabulary)

### 0036 — CONSOLIDATE
- A click on a Resource selects it; no pointer gesture on a Resource's body opens it (opening is a command).
- React Flow double-click zoom is off for the whole canvas, never exempted per node (.nopan) or re-enabled.
- F2 renames the Selected Resource.

_Notes:_ Double-click-on-Title rename OVERTAKEN by 0065. 'What this deletes' (titleEditInvalid, connectionGesture timeout) is pure history. 0102 adds that a click on an unselected Open Resource's body selects before it can begin an edit.

### 0047 — CONSOLIDATE
- Where shadcn ships a component for a needed surface, build on it and its headless primitive; a hand-roll is a deviation.
- A deviation needs an explicit product requirement and a reason tested against the primitive, recorded where the next reader finds it.
- Start from the chosen primitive's keyboard/focus/dismissal/a11y defaults; a written contract that contradicts a default loses unless the deviation clears the bar.
- The primitive layer is one whole-repo decision, never per component (taken by 0050).

_Notes:_ 'Stay on Radix' OVERTAKEN by 0050. CardPane case study is history (component and its successor ResourcePane both deleted).

### 0048 — ARCHIVE
- Escape and commit are decided by the surface, not the field.
- An in-place field (a Resource/Map/Graph Title) commits on Enter or valid blur; Escape reverts it to the stored value.

_Notes:_ The whole 'Card Editor pane' half (Done pends every field, Escape = Cancel, pending Target, NewAlias exception) is dead: 0064 removed the covering pane, 0070 the Reference metadata pane, 0089 the creation panes. No pane exists in the product. Its status block does not say so, and the README binds line reads as fully live.

### 0050 — KEEP
- shadcn's Base UI variants are the component foundation: base-nova style, neutral base colour, CSS-variable theming.
- Do not mix Radix and Base UI wrappers.
- Lucide is the default icon vocabulary; a custom @project/ui icon only when it names a Hyper-specific meaning Lucide cannot, never a preferred silhouette; no second general icon library.
- The registry style is a generation baseline, not a product restyle: Hyper's palette and custom classes are replayed onto Base variants.

_Notes:_ Short and mostly live. 'What forced it' and migration-cost paragraphs are history.

### 0052 — KEEP
- A stable story renders the unchanged exported production component through the smallest production boundary that owns the claimed behaviour.
- Every stable-story claim owes two linked behavioural proofs: one against Ladle, one against the real application.
- No facsimiles, story-only props/modes, substitute lifecycle or fake framework geometry in stories/components|surfaces|space.
- A state production cannot reach belongs in stories/review or nowhere; no application catalogue route.

_Notes:_ The densest ADR in the cluster. Also the ADR every control-arrangement decision now defers to.

### 0063 — KEEP
- Markdown source is edited with CodeMirror 6 via @uiw/react-codemirror behind MarkdownSourceEditor in @project/ui.
- The wrapper exposes a controlled-value and focus contract only; callers never see EditorView, extensions or theme.
- Escape (and Mod-Enter) belong to the mounting surface; Tab stays focus navigation.
- No toolbar, preview, format-on-save or panel chrome; rich text/preview/autocomplete are separate future decisions.
- The body stays a literal string and saved source is not normalised.
- The editor stays out of the initial bundle behind a lazy boundary (ownership refined by 0067).

_Notes:_ 'OpenCard owns the draft, CardPane owns the modal' OVERTAKEN by 0064.

### 0064 — CONSOLIDATE
- Opening grows the Resource in place on the canvas; there is no covering surface; any number may be Open.
- Open/Closed is authored Map state: Open and Close are Edits that survive reload and export.
- Open and Edit are separate: Open never begins an edit; Edit on a Closed Resource composes Open + begin-edit.
- Commands: Closed offers Edit+Open; Open offers Edit+Close; while editing Save+Cancel replace Edit and Close stays drawn but unavailable. (control arrangement - held by parity claims)
- An Open Markdown Resource renders through the shared sanitised renderer; editing swaps in MarkdownSourceEditor.
- Content edit has four exits only (Mod-Enter/Save commit, Escape/Cancel abandon); blur ends nothing; every exit leaves the Resource Open.
- Only one content edit owns the keyboard canvas-wide.
- No nowheel, no 16:9 constraint, no camera follow for an Open Resource.

_Notes:_ Derived displacement OVERTAKEN by 0084/0093; Algorithmic View conversion OVERTAKEN by 0079; Alias exception OVERTAKEN by 0070. 'What this replaces' is history. Whole body in Card/Layout/Expanded vocabulary.

### 0065 — CONSOLIDATE
- The displayed Title is an editing control: one activation (click, Enter, Space) replaces it in place with the field, focused, value selected.
- The Title control keeps its heading relationship and has an accessible name naming the action and the Resource.
- Title activation does not select or Open the Resource; clicking elsewhere selects.
- Enter or valid blur completes; Escape restores; a refusal stays beside the focused field.
- Keyboard completion/cancel returns focus to the Resource; pointer blur leaves focus where the author put it.
- No double-click title editing, no separate pencil control; the Title is not in the toolbar (with 0073).

_Notes:_ Says 'the rail's Edit control Opens the Card', which disagrees with 0064 (Edit opens AND begins editing; Open is its own command).

### 0066 — KEEP
- Each placement entry carries explicit Open/Closed; Open Size is absent only until first Open, which records the default; Resize changes it; Close changes only the state.
- Closed Size is fixed domain policy, never stored.
- The schema requires openSize when Open, allows it when Closed; intake never invents one.
- Resize is a Resource capability, not a kind's; kinds own only Open content.
- A resize drag is an Interaction draft producing one Edit on release; the render adapter owns the draft, Authoring receives only the final size.
- Reaching the Closed rect on both axes within the app-owned magnetic range (24 units) completes Close without overwriting Open Size; one-axis match is ordinary Resize; no general grid snap.
- Authoring, not React Flow wiring, decides Resize vs Close; the full Closed rect cannot be Open.
- One bottom-right resize control while Open and hovered/selected/focused.
- Resize is pointer/touch only; no hidden keyboard resize mode.

_Notes:_ Neighbour-displacement preview during drag OVERTAKEN by 0084; automatic-strategy conversion paragraph OVERTAKEN by 0079/0086. Dense and rule-shaped; mostly needs a vocabulary pass.

### 0067 — KEEP
- @project/ui owns the lazy split point (markdown-source-editor-lazy) beside its consumers.
- No module imports MarkdownSourceEditor as a runtime value except that lazy module (type imports allowed); a scan enforces it.
- app never names the editor or CodeMirror; the @project/ui/* import zone has no editor exception.

_Notes:_ MarkdownCardBody -> MarkdownResourceBody.

### 0073 — CONSOLIDATE
- A Resource's commands are one role=toolbar with roving tabindex (Base UI Toolbar wrapped in @project/ui).
- CanvasCommandToolbar/CanvasCommand own the keydown stop at the toolbar root, nodrag nopan, click/pointer-down stops and holdFocus; no per-action variant/size.
- Kind commands and shared commands are two named role=groups in the one toolbar; an empty group draws nothing.
- Order: actions menu, kind commands, Open/Close last. (control arrangement - held by parity claim)
- An unavailable toolbar item stays focusable (aria-disabled), is styled via [aria-disabled='true'] never :disabled, and tests assert the attribute not toBeDisabled.
- The Title is not in the toolbar; it keeps its own tab stop.
- A cluster earns a toolbar by repeating across a surface or by command count, not by being a row of buttons.

_Notes:_ 'Tab traverses Cards, arrows traverse commands' OVERTAKEN by 0102 (toolbar portalled; open issue). In-band CardRail geometry and Alias metadata modal OVERTAKEN by 0102/0070. 'Choosing a Space View' OVERTAKEN by 0079. 'SelectedEdgeControls stays a group' overtaken by code: the Edge toolbar is built on CanvasCommandToolbar.

### 0082 — CONSOLIDATE
- The canvas takes one exclusive Map choice: no second control, no empty value.
- Activating a Graph is not the canvas choice and never merges with it.
- Selecting a Map is navigation, not an Edit.
- Persistence status is not a command: never a row in a command list/menu.
- The command surface takes no layout space from the canvas; room comes from disclosure, orientation or a filter, never width.
- One command surface per Space on the canvas.
- Everything it offers is keyboard-operable (including placing a Resource into a Map); accessible names contain visible labels (WCAG 2.5.3).
- It reports persistence state unasked using PersistenceIndicator/openSpaceStatusLabel vocabulary, distinguishes failed (retryable) from rejected (final), and names which open Space is unwell.
- It names the current Space and reaches the Spaces open beside it.
- The surface's position is not persisted.
- Placement, grouping, glyphs, orientation, movement are treatment owned by stories + behaviour tests (0052), never ADRs; do not restore a fixed header row of value triggers.

_Notes:_ Over half the body is an argument with superseded 0053. Its own thesis ('shape is not an ADR question') is the README's control-arrangement rule stated for one surface.

### 0084 — CONSOLIDATE
- Displacement is applied once by the Edit that causes it and written into the Map: Open applies growth, Close the negation, Resize the difference.
- Growth = openSize - COLLAPSED_RESOURCE_SIZE, floored at zero per axis.
- Nothing is derived at render: a canvas coordinate is an authored one; a drop authors the exact point; no drawn/authoredPoint conversion.
- Open and Close are memoryless: each reads the Map as it is now; no record of which Resources an Open pushed.
- No move draft; a live resize previews only the Resource's own rect.
- One Open/Close Edit may move many Resources; undo undoes all of them.
- The negative-growth round-trip asymmetry is stated and tested, not clamped.

_Notes:_ The strict half-plane rule it restates is OVERTAKEN by 0093. Measurement tables and 'why the derived version had to go' are history.

### 0089 — CONSOLIDATE
- Every Resource creation completes its Edit on one activation: placed at a known position, selected, caret in its inline Title editor. No creation pane, picker or Cancel.
- A kind takes what it needs beyond a Title from the gesture's context, never from a form.
- A Reference Resource is created from its Target via Create Reference on that Resource's own command menu, titled with a one-time copy of the Target's Title.
- Create Reference is drawn unavailable (not absent) on a Reference Resource.
- A Space Resource creation mints its own Space; both are titled 'Space N', numbered over the containing Space's Resource titles.
- Space Resource placement is optimistic and is removed if the lifecycle refuses; the refusal names what died, on the command-outcomes channel.
- Referencing an existing Space is a separate gesture: the Resources list's Spaces rows.
- Do not reintroduce a creation pane or a Target picker.

_Notes:_ Vocabulary: Thing/Alias/Diagram/Things Popover/created-diagram.

### 0093 — CONSOLIDATE
- A Resource makes room on at most one axis, judged against the subject's collapsed rect: at/past collapsed right edge takes width only; else at/past collapsed bottom edge takes height; else it does not move.
- At-or-past, not strictly past; x is checked first so a Resource beside the subject never moves vertically.
- Open/Close stay a round trip for nonnegative growth; a Resource dropped inside an Open subject past its collapsed edge is carried back on Close (accepted asymmetry).

_Notes:_ Should merge with 0084 into one displacement rule.

### 0102 — KEEP
- A Resource's commands are drawn by React Flow's NodeToolbar above its top-right corner, outside the zoom transform, at the Dock's size.
- Drawn for the one selected Resource (none on multi-select) or while an edit runs; hidden during drag or resize; no hover reveal.
- The right-click menu offers the same actions without selecting.
- A click on an unselected Resource selects it first, including an Open Markdown body; the next press begins the edit.
- The kind glyph stays on the Resource at its top-right corner; an Open Resource draws none.
- CanvasResource offers a renderToolbar seam that ResourceNode fills, so @project/ui names no React Flow type; without an adapter the toolbar draws in-band.
- Known gap: the toolbar is not keyboard-reachable from its Resource (open issue).

_Notes:_ Current and accurate against code. Records a regression to 0073's keyboard shape.

### 0006 — ALREADY-SUPERSEDED
- A Closed Resource draws its Title, not its content; content is not embedded in every node (carried by 0064).

_Notes:_ Superseded by 0064 but the title-only closed state survives and code comments cite 0006 rather than 0064.

### 0011 — ALREADY-SUPERSEDED
- (none)

_Notes:_ Its core claim (opening shows source, not rendered) is reversed, yet packages/app/README.md:43-47, packages/app/e2e/presenting.spec.ts:87 and packages/ui/test/ResourceContent.test.tsx:16 still cite it as live; AGENTS.md line 5 cites it.

### 0037 — ALREADY-SUPERSEDED
- (none)

_Notes:_ Opening=editing reversed by 0064. Not cited outside docs/adr.

### 0053 — ALREADY-SUPERSEDED
- (none)

_Notes:_ Everything live was copied into 0082. Cited outside docs/adr only as 'superseded by 0082' (AGENTS.md, docs/agents/ui.md) plus one stale 'gone under ADR 0053' in ui.md.

## Consolidated "current design" outline — UI & Resource interaction

Target: what a new agent must know; no history. Est. **~2,400 words** vs 13,363 (live sources) / 16,210 (with superseded) — ~15–18% of source length. docs/agents/ui.md (5,366 words) already carries much of §1 and §5 in more detail, but mixed with history and stale pane prose; the consolidated doc would let ui.md shrink to build-status + gotchas.

1. **Foundation** (0047, 0050) — shadcn component first; hand-roll = recorded deviation tested against the primitive; primitive defaults win over written contracts; Base UI (base-nova, neutral, CSS vars), no Radix; Lucide default, domain icon only for a named meaning; registry is not a restyle. *Held by:* `components.json` ×2, no `@radix-ui` in `packages/*/src`, `ui:catalog:check`, `design-system-inventory.ts`, `$shadcn-first-ui` skill.
2. **Evidence rule** (0052, 0082 "treatment") — stable story renders unchanged production component through its owning boundary; each claim owes Ladle + app proof; no facsimiles/story-only props; unreachable states → `stories/review`. Arrangement of controls is treatment decided by stories+tests, not ADRs. *Held by:* `parity-claims.ts`, `ui-catalog.test.ts`, `pnpm e2e:ladle`.
3. **Space command surface** (0082) — one exclusive Map choice, no second control/no empty value; Graph activation separate; selecting is navigation; status never a command; no layout space taken from the canvas; one surface; full keyboard operability incl. placing a Resource; label-in-name; persistence reported unasked, failed≠rejected, unwell Space named; current Space named and open Spaces reachable; position not persisted. *Held by:* `CommandDock.tsx`, `ChoiceMenu`, command-dock stories/specs.
4. **Pointer and Title gestures** (0036, 0065, 0102) — click selects, never opens; canvas-wide no double-click zoom; Title is a one-activation control (click/Enter/Space), accessible name "Edit Title …", doesn't select/open; F2 renames Selected; Enter/valid blur commit, Escape restore, refusal beside field; focus return rules; unselected Open body: first click selects, next edits.
5. **Commands on a Resource** (0073, 0102, 0089) — one `role=toolbar`, roving tabindex, via `CanvasCommandToolbar`/`CanvasCommand` (root keydown stop, nodrag/nopan, holdFocus); kind + shared named groups; unavailable = focusable `aria-disabled`, styled/tested by attribute; Title not in toolbar; floated in `NodeToolbar` for the single selected Resource or a running edit, hidden in drag/resize, no hover; right-click menu mirrors; kind glyph on Resource; `renderToolbar` seam keeps RF out of `ui`. Known gap: keyboard reach (open issue). *Held by:* `command-surface-sharing.test.ts`, `ResourceNode.tsx`, parity `resource-toolbar-*`.
6. **Open, Close and content editing** (0064, 0048 remnant, 0063, 0067) — open grows in place, many Open, Map-authored Edit; Open ≠ Edit (Edit on Closed = Open+begin); four exits, blur inert, Close drawn-unavailable while editing; one content edit canvas-wide; no nowheel/16:9/camera follow; shared sanitised renderer; CodeMirror 6 behind `MarkdownSourceEditor`, controlled value+focus only, surface owns Escape/Mod-Enter, Tab = focus, no chrome, body not normalised; lazy split owned by `ui`, no `.cm-*` outside, app never names CodeMirror. *Held by:* `codemirror-encapsulation.test.ts`, `PANE_OWNED_KEYS`, parity `open-markdown-resource-owns-its-editing-lifecycle`.
7. **Open Size and Resize** (0066) — explicit Open/Closed per entry; Open Size recorded at first Open, kept through Close; Closed Size fixed and unstored; schema discriminant; Resize is core; draft→one Edit; magnetic 24-unit snap to Close without overwriting Open Size; Authoring decides; one bottom-right handle; pointer only. *Held by:* `core/src/schema.ts:348-356`, `app/src/resource.ts` `RESOURCE_CLOSE_SNAP_DISTANCE`, resize parity claims.
8. **Displacement** (0084 + 0093, merged) — applied once by Open/Close/Resize Edit and stored; growth floored at 0; one-axis at-or-past-collapsed-edge rule, x first; nothing derived at render, drop authors exact point; memoryless; stated negative-growth asymmetry; undo undoes all. *Held by:* `graph/src/placement.ts` (`growth`, `roomAxis`, `displace`) and its tests; CONTEXT.md Map section (already states it nearly verbatim).
9. **Creation** (0089) — completes on one activation (place, select, caret in Title); context supplies what a kind needs; Create Reference on the Target's menu, copies Title once, unavailable on a Reference Resource; Space Resource mints `Space N` Space, optimistic placement removed on refusal with a named refusal; existing Space via Resources list; no panes/pickers. *Held by:* `resource-rail-actions.tsx`, `titles.ts`, `command-outcomes.ts`.
10. **Negatives worth keeping** (one line each): no click-to-open; no double-click rename/zoom; no hand-rolled dialog/menu/combobox; no second canvas selector; no Dock layout space; no creation pane or Target picker; no field-level Escape inside a surface that has its own Cancel; no derived displacement; no keyboard resize mode invented.

## Drift and contradictions found

1. **docs/agents/ui.md still describes panes that no longer exist.** The Escape/commit bullet says "Resource Editor panes pend every field… `ResourceSearchCombobox` may dismiss… `ResourcePane` remains the shared Base UI modal"; the Base UI bullet says "`ResourcePane` declines both of Dialog's focus hooks"; the ADR 0047 bullet says "It is now some fifty lines over a real Dialog"; the ADR 0057 bullet speaks of "Resource Editor input uses `FieldError` on Title or Target". `ResourcePane` is deleted (only surviving mention is `design-system-inventory.ts:60`, which says so) and `Dialog` has no consumer. ui.md contradicts its own later "There is no creation pane" bullet.
2. **ADR 0048 is ~half dead with no status marker.** Its whole pane rule (Done pends all fields, Escape=Cancel, pending Target, NewAlias exception) died with 0064/0070/0089, but its Refined-by list omits 0089 and the README binds line ("The surface decides Escape and commit") reads as fully live.
3. **CONTEXT.md:112 (Availability)** lists "a creation pane over the canvas" as an in-progress fact — retired by 0089.
4. **Superseded 0011 cited as live**: `packages/app/README.md:43-47` ("Open shows source (ADR 0011)"), `packages/app/e2e/presenting.spec.ts:87` ("Opening shows Markdown source (ADR 0011)"), `packages/ui/test/ResourceContent.test.tsx:16`. 0064 reversed it: an Open Markdown Resource renders Markdown. AGENTS.md line 5 cites "(ADR 0006, ADR 0011, ADR 0024)" for "opening a Resource reads it in place".
5. **Superseded 0006 cited as live rationale** in `packages/react-flow-adapter/src/projection.ts` (lines 54, 213-222, 329), `packages/app/src/resource.ts:5`, `presenting.spec.ts:95`, `projection.test.ts:104`, root `README.md:222`. The rule (closed Resource draws title only) is still true, but it lives in 0064 now.
6. **ADR 0065 vs 0064**: 0065 says "the rail's Edit control Opens the Card"; 0064 (and code: separate `Open Resource`/`Edit Resource` labels in `CanvasResource.tsx`) make Open its own command and Edit = Open+begin-edit.
7. **ADR 0073's keyboard shape is broken by 0102** (Tab from a Resource no longer reaches its toolbar) — acknowledged in 0102 with an open issue, but 0073's body and ui.md's summary still present roving-toolbar-per-Resource as the reason for the design.
8. **ADR 0073's "SelectedEdgeControls stays a group"** is overtaken in code: ui.md says the Edge toolbar builds on `CanvasCommandToolbar`/`CanvasCommand`.
9. **ADR 0066's drag preview "neighbours move continuously"** contradicts 0084 (neighbours don't move until the Edit lands); only 0084's text says so.
10. **ADR 0063 names owners that no longer exist** (`OpenCard` owns the draft, `CardPane` owns the modal).
11. **ui.md Base UI bullet**: "the three selectors themselves are gone under ADR 0053" — cites the superseded ADR as the live authority (0082 supersedes it).
12. *(Unverified)* parity claim `resources-popover-withdraws-while-authoring-is-unavailable` lists "Reference Resource creation" as an unavailable state; under 0089 creation is one press, so this state may be momentary or stale — worth checking.
