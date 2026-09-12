# 14 — Audit canvas decoration invalidation and Active Graph consistency

Status: done
Tags: release/v1
Blocked by: nothing.

**Written before ADR 0085.** Where this ticket says Card read Thing, and where
it says Layout read Diagram. The code it points at uses the current names.

**Two of the three findings carried in from `07`'s review have since been fixed
elsewhere and are struck below.** The struck items are history — the defects
they name are fixed and nothing is owed on them. One of the three is left, the
Active Graph fallback, alongside the decoration memo in the acceptance list
above it.

**What to build:** A documented, executable account of which inputs refresh
canvas Card operations and how the Dock and canvas agree on the Active Graph.
Fix any reproduced stale publication without sacrificing embedded Layout
correctness or hiding it behind incidental rerenders.

Ticket 11's handoff reports that Card rail actions are rebuilt each render and
that memoizing them breaks six embedded-Layout tests. That is evidence of a
correctness dependency on recomputation, not proof of a particular missing
memo dependency or proof that a per-node cache is the necessary solution.
The current callback is deliberately left unchanged by the regression repair.

**The code now states this case itself**, which it did not when the ticket was
written: `packages/app/src/App.tsx`'s doc comment over `entityActions` records
that `useMemo` was tried and reverted, that six embedded-Diagram tests then stop
drawing their target at all, that the memo's dependency list is therefore
*incomplete*, and that the churn has been standing in for a dependency nobody
has named. It also names the candidate fix — a per-node cache inside
`canvas-thing-authoring.ts`'s memo, which does not depend on this identity. So
the first two boxes below start from a stated diagnosis rather than from
nothing; what they still owe is the reproduction and the named dependency.

The Dock resolves its Active Graph from the published projection while canvas
operations also consume Navigation's Active Graph id. Determine whether a
Layout/Graph transition can make these disagree observably, including a delayed
projection. Separate transitional render state from a persistent wrong command.

- [x] Reproduce and isolate the reported memoization failures with the existing
      embedded-Layout tests; record the actual invalidation dependency.
- [x] Measure unnecessary decoration/re-render work before optimizing. Preserve
      correct operations after target load, target edits and session replacement.
- [x] Exercise Layout/Graph transitions and verify that the Graph named by the
      Dock is the Graph its commands and canvas authoring act on.
- [x] For every confirmed defect, show a failing regression at the collaborator
      or application seam before the fix, then green afterward.
- [x] If no observable Active Graph defect exists, document the evidence rather
      than introduce a speculative state owner or cache.
- [x] Run the relevant embedded-Layout, projection, authoring and application
      suites; record the measured result and any remaining tradeoff.

## What the audit found

### The memoization failure does not exist

**The six failing embedded-Diagram tests were never observed.** The claim is
hearsay carried forward twice — a bullet in `11`'s handoff ("*the handoff
reports*"), copied into this ticket, then written into `App.tsx`'s doc comment
as settled fact. Stabilising the three builders two ways — exhaustive
dependencies, and then `[]` with the state read live so the identities are
constant for the component's whole life — leaves the app suite green both times,
the sixteen tests in `space-thing-embedded-diagram.test.tsx` among them. The
original six were almost certainly timeouts: on a machine running several suites
at once the *unmodified* tree fails twelve, in different files on each run.
Every measurement here is `--no-file-parallelism`.

**No dependency was missing.** Every identifier the decoration memo reads is in
its list. The one input whose contents can change behind a stable identity —
`spaceThingTargets`, which reads another Space live — is refreshed at its source,
`open-spaces.ts` minting a fresh `entries` array on every session change of every
open Space. And an embedded Diagram never receives the builder at all:
`EmbeddedDiagramAuthoring` calls `useCanvasThingAuthoring` without
`thingEntityActions`, and drives its canvases from the raw projection nodes.

**Measured, over the Dock's `Default` story from `render()` to a settled
canvas:** 40 `spaceEntityActions` builds became 20, 20 decoration-memo runs
became 10, 72 decorated node objects became 36 — half the mount-time decoration
work was the churn alone, and fifteen of the twenty runs re-ran over a `nodes`
array whose identity had not changed. Selection and drag are unchanged, because
`nodes` moves there anyway. Two things the old comment got wrong beyond the
diagnosis: opening the Things list causes **zero** App renders in this fixture,
and the per-node cache it named is not the fix — keyed on the builder it never
hits while the builder churns, and keyed without it, it hands back a node
carrying a builder closed over a stale Space.

A per-node cache remains a legitimate *separate* idea for the drag-frame case
`SpaceCanvas`'s own note measures, where `nodes` identity moves every frame. It
needs structural rather than identity comparison and should not be conflated
with this.

### The Active Graph defect is real, and it is not the fallback

The transitions this ticket suspected are all clean, and the evidence is worth
keeping. `navigationState` and `sessionState` are two fields of **one** atomic
snapshot (`SpaceAuthoring.snapshotState`), and `installTogether` gates both
collaborators for the duration of an Edit and publishes once — so there is no
tearing window and no projection a render behind. Every Navigation writer is
guarded at the write: `selectDiagram`, `openFresh` and `openedState` take
`openingGraphId(resolved)`, and `activateGraph`, `openGraph`, `openPresentation`
and `continueInDiagram` each throw on a Graph the resolved Diagram does not own.
Every Edit that changes a Diagram's Graph set recomputes the pair before
installing it. URLs cannot deliver a mismatched pair —
`destinationInSnapshot` answers `unresolved` when the Graph's owner is not the
named Diagram. And `graphs: min(1)` makes an empty `visibleGraphs` unreachable.

**The hole was one session write that bypassed Navigation entirely.**
`restoreCoordinatedCommit` replaces a session's working snapshot with no epoch
bump and no Navigation involvement, and the coordinated Space Thing recovery
calls it for **every participant** while `acceptStoredSpace` re-opens only its
own Space's Navigation. So a second open Space rolled back past a Graph it held
locally went on naming that Graph as active — persistently, since nothing
advanced the replacement epoch or re-resolved the pair.

The harm was three live, wrong commands, not a label: `CommandDock` passes
`graph.active.id` to Delete, Rename and Recolor (the row list only activates),
so **Delete Graph reached a Graph the canvas was not drawing as active**;
Present was enabled on the fallback's Edges and did nothing on the real one; the
Dock's Copy link and the presenting chrome's answered different URLs; and the
next Edit rode the stale id into the Diagram's `activeGraph` for intake to
reject.

**Fixed where it was caused**, not behind a new state owner or cache:
`reconcileNavigation` in `space-authoring.ts` is the sibling of the
`reconcilePlacement` that already ran on the same session publication, and
re-resolves the pair with `selectDiagram` when the restored Diagram no longer
shows the Active Graph. Both now run inside one `installTogether`, so the
part-way state is not published. `App.tsx`'s `?? projection.visibleGraphs[0]`
fallback is **removed** rather than kept as defence: it is what converted the
broken state into a live command set, and without it the Dock reads exactly what
`SpaceCanvas` reads.

Regression: `packages/app/test/active-graph-after-coordinated-recovery.test.ts`,
three cases, all red before the fix and green after, driving production
operations only (`registry.spaceThings(...).delete(...)` then
`SpaceAuthoring.acceptStoredSpace()`, which is what `PersistenceControl`'s "use
the stored Space" spends).

### Remaining tradeoff

`thingRailActions` still rebuilds once per completed Edit, through its
`renderedSpace` dependency. That is correct and not removable without refs; what
went is the per-render churn, not the per-Edit one.

The recovery still does not advance the replacement epoch for a restored
participant, so a draft on that Space's canvas outlives a snapshot it was begun
against. That is the same pre-existing condition for every participant the
recovery touches, it is about ADR 0042's draft invalidation rather than about
the Active Graph, and it is left unclaimed here rather than widened into.

## Carried in from `07`'s review

Three findings survived verification on `feat/07-promote-the-dock` without a
fix, because each needed a decision or a reproduction this ticket already owns.
Recorded here rather than in a commit message nobody greps. **Two of the three
were taken elsewhere while this ticket sat, and are struck rather than deleted —
a reader who greps for the defect should find where it went.** Line numbers have
drifted since `07` throughout; the surviving finding carries current ones, and
the two struck items quote their originals unchanged because the code they
pointed at has moved or gone.

- [ ] **The Active Graph disagreement is about the commands, not only the
      label.** `App.tsx:1409-1410` (was `:1261`) falls back to
      `projection.visibleGraphs[0]` when `activeGraphId` names no visible
      Graph, and `onRename`, `onDelete`, `onCopyLink`, `onCopyPermanentLink`
      and `presentDisabled` are all built from that fallback (`:1501-1542`)
      while `SpaceCanvas` reads the raw `activeGraphId` (`:1762`). The third
      box above asks whether the Dock *names* the Graph its commands act on;
      the question underneath it is whether a Delete Graph can reach a Graph
      the canvas is not drawing as active. A mistargeted destructive Edit is
      not a labelling defect, so it wants its own answer even if the label
      agrees. ~~**Still live, and unchanged in shape since it was written.**~~
      **Answered, and the answer was yes.** A Delete Graph could reach a Graph
      the canvas was not drawing as active — `CommandDock` hands it
      `graph.active.id`, which was the fallback. The cause was not this
      expression, though: see "The Active Graph defect is real, and it is not the
      fallback" above. The fallback is gone and the cause is fixed at
      `space-authoring.ts`'s `reconcileNavigation`.

- [x] ~~**One boolean stands for three renaming identities.**~~ **Fixed, not by
      this ticket.** It read: `CommandDock.tsx:594` reports `live` through the
      App's single `setEditingChromeTitle`, so with two editors mounted the
      first to unmount clears the flag while the other draft is still open,
      re-enabling `entityEdits`, `addThing`, canvas title editing and Present
      over it. The Dock now holds **one rename slot** rather than an `editing`
      boolean per identity — `DockRenamingContext` and `useDockRenaming` in
      `CommandDock.tsx`, whose doc comments carry the reasoning. The counter
      the finding asked for is unnecessary: a second concurrent editor can no
      longer be represented, so the state the finding describes is unreachable
      rather than merely unlikely.

- [x] ~~**A Space command break has no way out.**~~ **Fixed, not by this
      ticket.** It read: `spaceCommandBreak` (`App.tsx:260`) is set on a failed
      switch or exit, clears only when the next Space command is attempted, and
      at a `top:end` or `right:start` slot the stuck alert covers the Open
      Spaces control that would clear it — `clipboardFailure` having the same
      shape. The first of the two answers was taken: both render a `ShellNotice`
      with an `onDismiss` (`App.tsx:1596` and `:1626`). `destinationNotFound` is
      the one report in that stack still undismissable, and the comment beside
      it says why that is deliberate.
