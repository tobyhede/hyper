# 14 — Audit canvas decoration invalidation and Active Graph consistency

Status: ready-for-agent
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

- [ ] Reproduce and isolate the reported memoization failures with the existing
      embedded-Layout tests; record the actual invalidation dependency.
- [ ] Measure unnecessary decoration/re-render work before optimizing. Preserve
      correct operations after target load, target edits and session replacement.
- [ ] Exercise Layout/Graph transitions and verify that the Graph named by the
      Dock is the Graph its commands and canvas authoring act on.
- [ ] For every confirmed defect, show a failing regression at the collaborator
      or application seam before the fix, then green afterward.
- [ ] If no observable Active Graph defect exists, document the evidence rather
      than introduce a speculative state owner or cache.
- [ ] Run the relevant embedded-Layout, projection, authoring and application
      suites; record the measured result and any remaining tradeoff.

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
      agrees. **Still live, and unchanged in shape since it was written.**

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
