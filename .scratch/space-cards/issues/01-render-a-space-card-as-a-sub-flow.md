# 01 — Draw an open Space Card as a compound-canvas sub flow

**What to build:** An open Space Card draws the Space View it selects, in place on the containing canvas, as React Flow sub-flow nodes in the containing instance.

**Blocked by:** 03 — Build the Space Card kind in core.

**Status:** ready-for-agent

Rewritten by issue 08 against ADR 0068, which is now accepted. Most of what this ticket originally listed as undecided is decided; what is left is adapter work and one open UX question.

- [ ] Opening a Space Card embeds the **Space View the Card selects** — not the target Space's own active selection. Both renderer subjects are in scope: a selected Layout uses its authored placement, and a Computed View resolves its strategy and uses the computed placement. Opening is not an Edit, so it never converts a Computed View (ADR 0025).
- [ ] The embedded Space draws as sub-flow nodes in the containing React Flow instance — the **compound canvas** ADR 0068's UX review favours — with `parentId` set. One store, one viewport. This is the embedded open-Card case only: Enter is exempt and gets its own instance and camera (ADR 0068, issue 11).
- [ ] `elkStrategy` gains ELK's compound-node support. It builds a flat graph today, and the seam that feels it is `LayoutStrategyGraph`, which has no notion of a nested Card set.
- [ ] A drag from a Card inside the frame to a Card outside it is **not** refused any more. ADR 0068 makes it a cross-Space Edge owned by the containing Graph, with `GraphEdgeEndpoint = CardId | { spaceCard, graph, card }`. Exactly one qualified endpoint is legal; two is not, because one Edge crosses exactly one Space Card. Intake resolves both endpoint forms before traversal or rendering reads them.
- [ ] Removing a Space Card from a Layout removes its incident local **and** cross-Space Edges from that Layout's Graphs, since the Space Card is semantically incident to every Edge crossing its boundary even when it is not an endpoint.
- [ ] Presenting pauses on a Space Card only when an authored Edge actually reaches that Card. A direct Edge into the target Space manufactures no hidden stop, and a Space Card serving only as an overview needs no Edge at all.

## Still a hypothesis, and this ticket has to settle it

ADR 0068 leaves two things open by name: **how a cross-Space Edge is drawn across the open Space Card**, and how several leaving one Card are offered as a fork. They are not limited to one — several are the same kind of fork as several local Edges. The camera question is smaller than it was: the compound canvas shares the containing camera by construction, so `fitView` at a Space Card frames the Card, and framing something inside it is a nested-presenting question this ticket does not open.

## No longer blocking

The original ticket listed the missing kind, the ownership model, and cycle rejection as blockers. Issue 03 builds the kind, and ADR 0068 settled the model: the reference is not ownership, references may converge but not cycle, and the Card carries its own Space View and Graph selections.

## Not in scope here

Entering a Space Card and the Open Spaces surface (issue 11). Nested presenting. Editing the embedded Space through the frame.
