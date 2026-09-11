# 09 — Rename a Space as a real Edit

Status: resolved
Tags: release/v1
Blocked by: nothing. `07` made the gap visible on a surface.

**What was decided:** An author can rename a Space from inside it. The rename is one Edit on that Space's own session. It writes `document.title` and nothing else. No other Space, and no Thing in any other Space, changes because of it.

**This ticket was written before ADR 0085 and before ADR 0083's consequences reached the Thing front.** Two of its three questions now have answers in the code. They are recorded below, and the third question turned out to be a different question. The old words are corrected too: the completion union holds `renamed-diagram` and `renamed-graph`, and a Space is referenced from outside by a **Space Thing**.

## The two questions the code answers already

### A Space rename does not touch the Space Thing that points to it

The Title of a Space Thing is its own value. It is not a projection of the target Space's title. Two facts give that answer.

ADR 0083 says a Thing front names nothing outside itself. A Space Thing does not draw the name of its target Space, so no canvas in another Space shows the title this Edit writes.

The second fact is the stronger one: the two titles can already disagree, and no Space rename is needed to make that happen. `packages/persistence/src/session-registry.ts:658-673` writes one `input.title` into two places — the `document.title` of the new Space, and the `title` of the new Space Thing. They agree at creation by construction. After that they are two stored values that change independent of each other, and an author can rename the Thing in place on the canvas today.

So `renamed-space` does not create a divergent state. It makes an existing state reachable from the other side. **That is why this needs no ADR.** It needs one sentence in the Space entry of `CONTEXT.md`, and that sentence is now written there.

### The new name already reaches the other open Spaces

Three surfaces draw the name of a Space other than the drawing one: the rows of the Open Spaces menu, the parent step, and the failure sentence of `switchTo` (`App.tsx:1153`, `1166`, `1302`). Each reads `working.document.title` from that Space's own session.

`open-spaces.ts:321-324` subscribes to every composed session and republishes `entries` as a new array when any of them changes. The memo becomes invalid and every row redraws. A rename in Space B therefore reaches Space A's menu with no new wiring.

## What to build

### The Edit

Put `renamed-space` **above** the `placement-pending` gate at `space-authoring.ts:1143`, beside `created-diagram` and `deleted-diagram`.

That region is already the region for Edits on the Space document rather than inside a Diagram. Both members write keys of `document`, both read `session.getState().working` direct, and both derive their own placement — `emptyPlacement` at line 1085, `Placement.fromDiagram(nextDiagram)` at line 1137. A Space rename is the third member of that class. It reuses `Placement.fromDiagram` over the Diagram that does not change.

Two alternatives were considered and rejected:

- **Below the gate, parallel to `renamed-diagram`.** Smallest change. It gives the Edit a `placement-pending` refusal, and forces an answer on whether it belongs in `DiagramRequiredOperation`. Both sentences are wrong for an Edit that holds no Diagram.
- **Make `placement` and `nextDiagramId` optional in `CompletedEdit` (`space-authoring.ts:357-365`).** This names the class correctly, but it weakens a type whose promise is that nothing is left to decide, and it weakens it for one member. That is the generalization this repo's scope discipline forbids.

The round trip needs no migration. The title sits inside the `document` JSON column (`src/prisma/contract.prisma:9`), so the ordinary commit path carries it.

### Refusals

- `space-title-required`, after a trim through `trimmedNonBlankTitle` — the same function the Diagram and Graph renames use (`space-authoring.ts:1410`, `1471`). The Space title is a plain `z.string().min(1)` (`packages/core/src/schema.ts:327`), so a blank title passes the schema and the Edit has to refuse it.
- `unchanged` for a rename to the stored title.
- `diagram-not-found` only because the chosen path raises it already. Do not add a Diagram condition of your own.

**No other refusal.** The Meta Space needs no exception: only deletion protects it (`session-registry.ts:733`), nothing writes its title again at start-up, and a rename of it persists like any other. A Space with rejected work needs no exception either — put the command behind `availability.chromeTitleEdit` (`authoring-availability.ts:195`), which withholds all three names in the bar together.

### The surface

`DockSpace.onRename` stops being `null` at its one call site in `App.tsx` (line 1296), and `IdentityName` draws the Space name as a button.

**Exactly one `onRename` changes.** The other `null` in that file, at line 811, belongs to `spaceEntityActions` and is the **entity menu's** rename row. It stays `null`. Its reason is unrelated to this ticket and survives it: the Dock renames by a click on the name it already draws, so a menu row opening the same editor would be a second path to one command. The comment on it is correct as written.

`entity-actions.tsx` (around line 202) carries a different comment that this ticket *does* falsify — "the application has no Space rename affordance, and a menu is not the place to invent one". The first clause becomes false. Rewrite it to the reason that still holds: the Dock's name is the one path, as it is for a Diagram and a Graph.

**The ticket's old claim that no other surface change is owed was wrong.** `IdentityName` draws a label when `onRename` is `null` (`CommandDock.tsx:713`), and the whole argument in the comment there is the Space: the product has no such Edit, so a grey name would advertise a command no person can run. After this ticket the only remaining `null` case is a Diagram or a Graph while `chromeTitleEdit` is false — which means "not available now", the case that same comment says must be a disabled control rather than a label.

So convert the `null` arm to a disabled `ToolbarButton` and delete the reason that no longer holds. Keep the `testId` on both arms, as it is kept now.

### What the evidence costs

Four pieces of evidence reverse rather than extend:

| File | What it asserts now |
| --- | --- |
| `packages/app/ladle-e2e/link-actions.spec.ts:50` | `Rename Space` has a count of 0 |
| `packages/app/ladle-e2e/command-dock.spec.ts:601` | `Rename Space` has a count of 0 |
| ~~`packages/app/stories/review/link-actions-prototype.stories.tsx:117`~~ | ~~passes `onRename: null`~~ |
| ~~`packages/app/stories/support/ReactFlowCanvas.tsx:405`~~ | ~~passes `onRename: null`~~ |

**Corrected while building it: the last two rows name the wrong `onRename` and were left alone.** Both fixtures call `spaceEntityActions`, so the `onRename` they pass is the **entity menu's** rename row — the one at `App.tsx:811` this ticket says explicitly stays `null`. Passing a real callback there would have made the two stories diverge from production in the direction ADR 0052 forbids, and drawn a Rename row the application does not have. Nothing hand-builds a `DockChrome` at all: `CommandDockFixture` mounts the production `Application`, so `DockSpace.onRename` reaches every Dock story from the one call site in `App.tsx` the moment it stops being `null`.

The two reversals that were real are the first two rows, and the surface change falsified four more the ticket did not list: `packages/app/e2e/dock-typography.spec.ts` (the application half of `command-dock-identity-presentation`, whose claim text said "Space remains a non-interactive label"), and three jsdom readings of "the rename is withdrawn" written as `tagName` — `packages/app/test/command-dock.ts`'s `beginRename`, `packages/app/test/SpaceApp.test.tsx` and `packages/app/test/thing-authoring.test.tsx`. The withheld name used to be a `<span>`, so `tagName` *was* the reading; with one `ToolbarButton` in both states it is `aria-disabled`, which is how every other withdrawn Dock control is already read.

### What to verify before you write the Edit

Show that `Placement.fromDiagram` over the Diagram that does not change loses nothing the canvas reported and had not yet authored. ADR 0084 makes the Diagram the authority, so the result should be an identity. Prove it in a test rather than assume it.

## Scope

**From inside the Space only.** Do not build a rename of Space B from the Space Thing in Space A, and do not build one from a row of the Open Spaces menu. Those are `SpaceThingLifecycle` operations (`session-registry.ts:114-116`) that coordinate a second Space's session under ADR 0076, and they are a larger ticket than this one.

The present comment on `DockSpace.onRename` says a Space is named from outside by the Space Thing that references it. That sentence invites the wider reading, so replace it with the decision above when you delete the `null`.

## Acceptance

- [x] The decision is recorded. `CONTEXT.md`'s Space entry now says that the name of a Space and the Title of a Thing that points at it are independent values which agree only at creation. No ADR is owed.
- [x] A `renamed-space` completion in the document-level region, with the refusals above and its round trip through the stored document.
- [x] `DockSpace.onRename` stops being `null` at its one call site in `App.tsx`, and `IdentityName` draws the Space name as a button. The entity-menu `onRename` at line 811 stays `null`.
- [x] The `onRename === null` arm of `IdentityName` becomes a disabled control, and its comment states the remaining reason.
- [x] A test shows that the Edit's placement derivation loses nothing.
- [x] A parity claim, with both a Ladle and an application proof, exactly as the Diagram and Graph renames have. Two claims moved rather than one: `command-dock-edits-identity-names` gained the Space, and `command-dock-identity-presentation` stopped saying the Space is a label.

## Comments

**Raised by `07`'s "Found while building it".** It was written there as "it wants its own ticket" and lived only in that ticket's prose, which is what a status scan misses (`docs/agents/issue-tracker.md`). This is that ticket.

**Triaged from `needs-triage` to `ready-for-agent`.** The three questions the ticket held open are answered above: the Space Thing question by ADR 0083 and by the creation path that already lets the two titles disagree; the propagation question by the session subscription in `open-spaces.ts`; the refusal question by the trim the other two renames already use. What was left undecided was not a domain question at all — it was where an Edit with no Diagram fits in a derivation shaped around Diagrams.

**One stale read is worth checking while you are here, and is not part of this ticket's acceptance.** `spaceTitleById` (`App.tsx:1125`) comes from `useSpaceThingTargets`, which reads once for each set of referenced Spaces, and it supplies the search text for a Space Thing in the Things drawer (`ThingsDrawer.tsx:122`). If that hook does not read again when a target session changes, a renamed Space stays findable only under its old name. This affects search text alone. Nothing drawn is wrong.

**Reviewed at `high`, and two findings were real.**

The first was a defect this ticket introduced. The Edit answered `nextActiveGraphId` by re-resolving the Diagram's stored `activeGraph`, so renaming a Space silently activated a different Graph whenever the reader had picked one — which is routine, because activating a Graph is not an Edit (ADR 0028). It now carries Navigation's own Active Graph forward, as the general path does and for the same reason, and `leaves the Active Graph where Navigation put it` holds it there. That test was confirmed to fail against the shape the review caught.

The second was the visible half of the disabled arm. A `Toolbar` item stays focusable when disabled, so the DOM carries `aria-disabled="true"` and no native `disabled` attribute — every `disabled:` utility missed, `cursor-pointer` stood, and the ghost hover fill still landed, leaving a withdrawn name pixel-identical to an available one and reactive under the pointer. `command-dock.css` now quiets it, on the same reasoning that produced `canvas-thing.css`'s rail-action rule, and the component comment says where the visible half lives.

**One finding was left, deliberately.** `packages/ui/src/Button.tsx`'s `label` variant lost its last consumer with the label arm, and the review argued the repo's own rule about deleting unreachable branches should take it. A CVA variant on a shared primitive is not a branch in control flow, and `CLAUDE.md` says in terms that `@project/ui` tolerates a primitive with no consumer — `Select` and `Textarea` each spent a while with none and both came back. Removing it is a `@project/ui` decision about that primitive's surface, not this ticket's, so it is recorded here rather than taken silently.
