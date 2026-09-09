# 11 — Enter a Space Card, and Open Spaces carries the session

**What to build:** The cut-over. Entering a Space Card from the canvas replaces the canvas with that Space and adds an entry to Open Spaces; the Space's own command surface survives the crossing, so the entered Space takes the canvas area rather than the viewport. Exit is an explicit command.

**Blocked by:** 10 — Extend the dev fixture to a tree of linked Spaces; `layout-only-v1/04` — Make Space Cards select initialized Layouts. (09 is done and 01 is resolved.)

**Status:** ready-for-agent

**Tags:** release/v1

- [ ] A Space Card on the canvas offers Enter. It is a Card command and belongs on the Card's rail as a kind command (ADR 0073). It does **not** belong in a fixed row of canvas-header value triggers — but the reason is no longer "ADR 0053 closes that surface": ADR 0082 supersedes ADR 0053 and makes control placement treatment rather than an ADR question, settled in stories and behaviour tests. What ADR 0082 still binds applies here: one command surface per Space on the canvas, taking no layout space from it, fully keyboard-reachable. The earlier prototype pass was rejected for restoring the fixed header row of value triggers, which ADR 0082's negative section still forbids by name.
- [ ] Entering adds the target Space to Open Spaces and shows it. The entered Space has its own React Flow instance and camera and is edited exactly as a Space opened normally is — **Enter is exempt from the compound canvas**, which scopes to the embedded open-Card case (ADR 0068).
- [ ] Entering seeds the new entry's Layout and Graph from the **Space Card's** selection. Changing either while inside is navigation, not an Edit: it writes neither the Card nor the Space. Leave the Space and come back and the selection is the one you left; reload and it is the Card's again (ADR 0068, ADR 0079).
- [ ] Entering requires an initialized target: a layoutless target crosses `layout-only-v1/02`'s initialization boundary before the entry receives working state, and Enter fails rather than showing an uninitialized Space (ADR 0079).
- [ ] **Entering a Space that is already open focuses its existing entry** rather than adding a second. Two views of one Space at once is what a second browser tab on its address is for (ADR 0069).
- [ ] Entries are persistent. Selecting one switches and closes nothing; more than one Space is open at once; Exit is the only thing that closes one. The root Space is never closable.
- [ ] An entry names a Space and remembers nothing about how it was reached, so closing one Space never closes another. **Back is the browser's history**, not a pop, and **Escape does not exit** — it keeps the meaning ADR 0048 gives it. ADR 0068 withdrew "Back or Escape returns to the containing Space".
- [x] **Exit lives beside the Space's own persistence controls**, so a refusal and its recovery sit together (ADR 0068). Built: `packages/app/src/components/ExitSpaceControl.tsx` presents `OpenSpaces.exit`'s refusals and its rejected-persistence confirmation, and `packages/app/src/App.tsx:920-921` mounts it in `SpaceSidebar`'s `sessionActions` slot. Proven by `packages/app/test/ExitSpaceControl.test.tsx`. The session-registry half of its refusal behaviour is still issue 12.
- [ ] Open Spaces draws only from two open Spaces, and carries the status mark ADR 0068 allows.
- [ ] The stable Ladle story and its parity claims land here, with the application behaviour test ADR 0052 requires beside the Ladle one — this is the ticket where the application can finally reach the surface.
- [ ] Decide what becomes of the review prototypes under `packages/app/stories/review/` for this proposal: `space-card-rail.stories.tsx`, `space-card-canvas-prototype.stories.tsx` and their CSS. They were a decision surface and the decision is ADR 0068, but both are still in the tree and deleting them is no longer free — `space-card-canvas-prototype.stories.tsx` and `.css` are named in `RETIRED_SURFACE_FILES` in `test/unit/current-domain-vocabulary.test.ts:951-955` (added by `cbcecc92`), and that list is asserted to still be earning itself, so deleting the prototype must delete its exemption in the same change.

## Do not mine the prototype for behaviour

A review of the stacked Space Sidebar prototype found three defects in it, all left unfixed because ADR 0068 settled what they were asking about. **That prototype is not in the repository** — it was reviewed and dropped without ever being committed, so there is no file to read and nothing here to delete. What survives is the guidance. Build from the ADR, not from the prototype:

- Closing an entry *before* the active one recomputes the active index wrongly and snaps to the outermost Space. Closing an unrelated entry must leave the active one where it is.
- Its "Exit Space" control enables whenever more than one Space is open, but its handler returns unchanged at position `0` — so in the tabs model the control can accept a click and do nothing. Exit's real enablement and refusal are ADR 0068's and issue 12's.
- Its levels are **all** mounted for the prototype's whole lifetime, so a level keeps its selections even after being popped. That is a prototype artefact and not the design: switching away keeps an entry's live selection, and Exit destroys it, so a later Enter seeds from the Space Card again.

## Why this is one ticket and not three

The three halves — a command on a Space Card, a set of open Spaces that grows, a canvas that swaps — are not separately demoable. A set that grows with nothing entering it is issue 09, which already landed; a Space Card that enters nothing is not a behaviour. This is the narrow complete path.

## Comments

### 2026-09-09 — The ancestor chain is dropped; the aggregate already holds the cycle

A criterion here required "the loader that follows a Space Card carries the complete chain of containing Space ids into target intake … each Enter appends the Space being left before loading the target". It is deleted. It contradicted `entity-url-addressability/08`'s third criterion — "Enter loads the target from repository state already accepted by complete aggregate intake. Navigation performs no second cycle check and does not carry an ancestor chain as an integrity mechanism" — and the merged code agrees with 08, not with this ticket: `OpenSpaces.enter` (`packages/app/src/open-spaces.ts:409`, declared at `:95`) takes a target Space id and an optional Layout selection, and nothing resembling a chain.

The protection the chain was to supply already exists, in the place where a cycle is a fact about stored state rather than about a walk:

- `space-card-reference-cycle` is declared at `packages/graph/src/space-aggregate.ts:44` and raised by the colouring walk at `:203`, which catches an indirect cycle across any number of Spaces, not only direct self-reference.
- Single-Space intake raises the same code for a Card targeting its own Space at `packages/graph/src/validate.ts:281`.
- Both are held by tests: `packages/graph/test/space-aggregate.test.ts:197` (a cycle back to the Meta Space) and `packages/graph/test/space-intake.test.ts:608` (direct self-reference).

A second guard sits at render time for the case intake legitimately accepts: `packages/app/src/components/SpaceCanvas.tsx:331-332` skips a `spaceId:layout` crossing already on the embedding path, because a mutual pair of Space Cards is valid stored state that would otherwise nest one level deeper per commit.

So Enter loads a target out of state complete aggregate intake has already accepted and performs no second check. Nothing is owed here for cycle safety.

### 2026-09-09 — Staleness corrected against the merged tree

Three claims in this ticket had gone stale and were corrected in place, each verified first:

- **ADR 0053 was cited as live.** It is superseded by ADR 0082 (`docs/adr/0082-the-space-command-surface-is-bound-by-what-it-owes-not-where-it-sits.md`, `Supersedes: 0053`) and now sits in `docs/adr/superseded/`. The Enter-command criterion no longer rests its placement argument on ADR 0053 closing a surface; ADR 0082 makes placement treatment and binds obligations instead, while still forbidding by name the fixed header row of value triggers the prototype pass restored. The "Space Sidebar survives the crossing" wording in *What to build* went with it — ADR 0082 does not bind the surface's shape or its name.
- **Exit was listed as unbuilt.** `packages/app/src/components/ExitSpaceControl.tsx` exists, is mounted at `packages/app/src/App.tsx:920-921` and is tested by `packages/app/test/ExitSpaceControl.test.tsx`. That criterion is ticked, with issue 12 still holding the session-registry half.
- **The last criterion demanded deletions that have not happened.** `packages/app/stories/review/space-card-rail.stories.tsx`, `space-card-canvas-prototype.stories.tsx` and both CSS files are still in the tree, and the canvas prototype is now a named exemption in `test/unit/current-domain-vocabulary.test.ts` (`RETIRED_SURFACE_FILES`, added by `cbcecc92`), whose comment says deleting the prototype must delete its exemption. The criterion now states that coupled decision rather than an unconditional delete.

The *Blocked by* line was also trimmed: 09 is `done` and `space-cards/01` is `resolved`. 10 (`ready-for-agent`) and `layout-only-v1/04` (`ready-for-agent`) remain.

### Brought into V1, 9 September 2026

`entity-url-addressability/08` now names this ticket as the owner of the Enter
surface, so it became a blocker of a release issue. A release issue cannot block
on an untagged one: `planRelease` refuses the whole plan at `scripts/roadmap.ts:464`
with *Open release blockers must carry tag release/v1*. The `release/v1` tag above
is that consequence, not a new scope decision — the same correction `command-dock/07`
took on the same day, for the same reason.
