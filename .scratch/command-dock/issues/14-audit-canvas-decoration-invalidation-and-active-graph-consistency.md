# 14 — Audit canvas decoration invalidation and Active Graph consistency

Status: ready-for-agent
Tags: release/v1
Blocked by: nothing.

**What to build:** A documented, executable account of which inputs refresh
canvas Card operations and how the Dock and canvas agree on the Active Graph.
Fix any reproduced stale publication without sacrificing embedded Layout
correctness or hiding it behind incidental rerenders.

Ticket 11's handoff reports that Card rail actions are rebuilt each render and
that memoizing them breaks six embedded-Layout tests. That is evidence of a
correctness dependency on recomputation, not proof of a particular missing
memo dependency or proof that a per-node cache is the necessary solution.
The current callback is deliberately left unchanged by the regression repair.

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
Recorded here rather than in a commit message nobody greps.

- [ ] **The Active Graph disagreement is about the commands, not only the
      label.** `App.tsx:1261` falls back to `projection.visibleGraphs[0]` when
      `activeGraphId` names no visible Graph, and `onRename`, `onDelete`,
      `onCopyLink`, `onCopyPermanentLink` and `presentDisabled` are all built
      from that fallback while `SpaceCanvas` reads the raw `activeGraphId`. The
      third box above asks whether the Dock *names* the Graph its commands act
      on; the question underneath it is whether a Delete Graph can reach a Graph
      the canvas is not drawing as active. A mistargeted destructive Edit is not
      a labelling defect, so it wants its own answer even if the label agrees.

- [ ] **One boolean stands for three renaming identities.**
      `CommandDock.tsx:594` reports `live` through the App's single
      `setEditingChromeTitle`, so with two editors mounted the first to unmount
      clears the flag while the other draft is still open — which would
      re-enable `entityEdits`, `addCard`, canvas title editing and Present over
      it. Not reproduced: two editors need a chrome rename that Authoring
      refuses while `InlineTitleEditor` holds the draft open, and a blank title
      is caught in `IdentityName` before `onRename` while `layout-not-found`,
      `graph-not-owned` and `graph-title-required` are not reachable from any
      seam. Either show it is unreachable and say so, or make it a counter.

- [ ] **A Space command break has no way out.** `spaceCommandBreak`
      (`App.tsx:260`) is set on a failed switch or exit, is not among the four
      refusals the `refusedUnder` transition clears, and has no dismiss — so it
      clears only when the next Space command is attempted. `clipboardFailure`
      has the same shape. This became visible rather than merely untidy when
      `styles.css:78` lifted `.shell__notice` to `z-index: 22` over the Dock's
      `20` — deliberate, and asserted by `dock-interactions.spec.ts:121-140` —
      because at a `top:end` or `right:start` slot the stuck alert covers the
      Open Spaces control that would clear it. The two answers are a dismiss
      control (production UI, so `$shadcn-first-ui` first) or a clearing rule
      stated as a claim. It is a decision, which is why `07` did not take it.
