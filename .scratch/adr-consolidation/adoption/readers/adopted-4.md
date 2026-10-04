# Adopted-route reader 4 (fresh session)

Route: a separate `claude -p` session (Sonnet, tools Read/Grep/Glob only) started in a detached checkout of `c00cae99`, so its project instructions were the adopted `AGENTS.md`. Questions, grading, earlier readings, reports, specimen, research, spec and tickets removed; `pilot/inventory.md` kept because the contract links it. Wall time: 51s (shell-measured). The report is recorded verbatim below.

## Reading log

1. `AGENTS.md` / `CLAUDE.md`: read whole, as supplied in context. About 9,500 words. Only the "Decided" entries, "Agent skills" and the pointer to `docs/agents/maps-and-graphs.md` were relevant.
2. `docs/agents/maps-and-graphs.md`: read whole, lines 1–210. About 4,200 words. It answered every question.
3. `CONTEXT.md`: grep hits for Resources View, Placement, Open Size and Closed Size, plus lines 160–163 (the Resources View entry) and line 142 (Placement). About 150 words read. Two long lines were omitted by the tool, so I did not read them.

Total: about 13,900 words, of which only about 4,350 were not the pre-supplied AGENTS.md. I did not open any ADR bodies. Every claim rests on the contract's own statements and its ADR citations.

## Answers

**Q1.** Auto-arrange is **not built**. The contract states how it must be built.
- **Where it runs:** in `graph`, attached to an Edit, never at render (R6, R2, R7; ADR 0086). Only the positioned strategy runs while the canvas draws. The `elkjs` render-time lint ban would be re-sited, not obeyed (R6, `AGENTS.md`).
- **What it changes:** it is a destructive, explicitly invoked Edit over an existing Map. It rewrites that Map's positions in one atomic Edit, and the result is authored like any other position (R6).
- **What it must never become:**
  - a canvas, a selectable context, or a renderer decision
  - incremental placement
  - a way to honour a drop point (R7; the three spikes that tried it reshuffled existing Resources)
  - a creator of a Map (R6)
  - the privileged strategy (R3)
- **Undo:** none exists. The Edit is reversed only by another Edit (§6).
- **Open questions:** the delivery ticket `.scratch/auto-arrange/issues/01-auto-arrange-a-map.md` holds two. Does the Edit record which strategy produced the positions? Does it ask for confirmation before rewriting a whole Map?
- **Source:** `maps-and-graphs.md` R2, R3, R6, R7 and "Accepted, not built".

**Q2.** No.
- R5 says there is no intermediate arranged-result type. A strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry filled in.
- Rejected alternative A1 gives the reasons. Every consumer wants positions, so a new type adds a translation step at a seam meant to stay thin. React Flow has no layout entity either. The noun "arrangement" names nothing on screen (ADR 0005, 0014, 0086).
- `CONTEXT.md` also reserves "arrangement" for ordinary prose.
- R4 adds that the contract carries positions only, so there is nothing extra for a new type to hold.

**Q3.**
- **Listing must not give them one.** R18 says listing, import completion, export and reference validation read stored state and never initialize. A Map-less stored Space is valid (R15; ADR 0079).
- **First open initializes it.** The first complete working-state read persists one atomic Edit: an empty `Map 1`, its empty Active `Graph 1`, and `defaultMap` (R16). This runs at one server-side boundary, shared by direct opening, Entering, rendering an Open Space Resource and making a link target working (R18). It commits before the Space becomes working (R19).
- **Existing Resources are not placed.** No strategy seeds them, because nothing authored says where they go (R16, A9). They stay outside the Map, in the Resources View.
- **Why:** a Map is what makes a Space usable, and a read-only draft was rejected (A6). The cost accepted is that first open writes state.
- **Related:** a Space with Maps but no default just records its first Map and creates nothing (R17).

**Q4.**
- **What the Edit produces (R11):** Add Map creates and selects an empty Map in one Edit. The Map has no Resources and owns one empty Graph, which is its Active Graph.
- **Which Resources appear:** none. Existing Resources are not copied in. The author adds them, for example from the Resources View.
- **`defaultMap`:** every Edit through the canvas's Map records that Map as `defaultMap`, Add Map included. It also writes the resolved `activeGraph` explicitly (R10).
- **What stops deleting every Map:** the last Map cannot be deleted (R12). A working Space must keep a durable default (R9). Delete Map is not offered while one Map remains, and `planContextDeletion` answers "unchanged" when no survivor exists. There is no refusal code.

**Q5.**
- **Deleting the Active Graph:** the first survivor is activated (R27). Survivors keep their order (R25).
- **Deleting the only Graph:** this cannot happen. Delete Graph is not offered while the Map has one Graph, and `planContextDeletion` answers "unchanged". There is no refusal code (R27).
- **Space Resources:** deleting a Graph or Map atomically relocates every Space Resource that selects it (R13, ADR 0091).
- **Adding a Graph:** it appends an empty Graph and activates it in one Edit (R26). A Map must own a non-empty, ordered collection of Graphs (R22).
- **Reuse by a second Map:** no. Each Graph belongs to exactly one Map and is never shared (R22). Two Maps telling one narrative hold two Graphs. With a shared Graph, removing a Resource from one Map would leave a dangling Edge or change every other Map (A10).
- **Graph ids:** they are unique across the whole Space (R24, ADR 0108).

**Q6.** The removal is one Edit (R34).
- **Because the Resource is Open (R35):** it is Closed in the same Edit first. Close's reclaim moves the neighbours currently clear of it back, by the memoryless rule (R41). Only then are its position and Edges removed. Removal itself never displaces anything.
- **What changes on that Map:**
  - its membership and position are removed (R31)
  - every incident Edge in both of that Map's Graphs is removed (R34)
  - neighbours are moved back by the Close reclaim, if it was Open
- **What is left alone:**
  - the emptied Graphs, which remain (R34)
  - the Resource itself, which stays in the Space
  - the second Map, including its placement, Edges and Open state (R32, R34)
  - the Remembered Open Size is part of the removed placement entry. The contract does not say separately what happens to it.

**Q7.** The rule is R40, with growth from R39 and the one-axis reasoning from ADR 0093.
- **Growth** is Open Size minus the fixed Closed Size, floored at zero per axis (R39).
- **The test** is made against S's *collapsed* (closed) rect, and each Resource moves on at most one axis (R40):
  - If a Resource is at or past the collapsed right edge, it takes the width growth only, moving right.
  - Otherwise, if it is at or past the collapsed bottom edge, it takes the height growth only, moving down.
  - Otherwise it does not move. Touching counts as clear.
- **A:** it is to the right, so it moves right by the width growth only. Its 40-unit lower top is irrelevant, because x is tested first and prevents any vertical move. That is the "beside-but-lower jump" the rule removes (A15).
- **B:** it is directly below and not clear on x, so it moves down by the height growth only.
- **C:** it is below and to the right, so it is clear on x. It takes the width growth only and moves right but not down.
- **D:** it overlaps the collapsed rect. It is neither at or past the right edge nor at or past the bottom edge, so it does not move.
- **When recorded:** the displaced positions are written into the Map in the same Open Edit, once (R38). Between Edits a drawn position is the authored one.
- **Why C does not move on both axes:** one axis is enough to stay clear. Moving on both would also keep the beside-but-lower jump and fail to preserve the grid's shape. The cost accepted is that a grid no longer scales uniformly (R40, A15; ADR 0093).

**Q8.**
- **What happens to R:** Close is memoryless (R41). It reads the Map as it is now and reclaims from every Resource currently clear of S's collapsed rect. R was dropped into the cleared room and is clear of the collapsed rect, so it moves back by the growth along with the others. The exception is negative growth. If R was dropped past the collapsed edge *inside* the Open S, Close carries it inside S and a reopen skips it. The contract states this asymmetry and does not clamp it (R42).
- **The reviewer's suggestion:** no. R41 and A14 say never to record which Resources an Open pushed. Per-open state goes stale, and identical Maps would behave differently (ADR 0084, 0093).
- **Accepted cost:** Close reclaims from Resources moved into the room (A14).
- **Related:** if S itself was dragged past the neighbours its Open displaced, Close reclaims from none of them (R41).

**Q9.** No. Switching the Active Graph is navigation, not an Edit (R29; ADR 0028, A18).
- **On the canvas:** emphasis changes, not filtering. Every owned Graph is still drawn, and the newly active Graph is emphasised. There is no second "selected Graph" (R29).
- **Where new Edges go:** into the Active Graph. The contract says it is the one "which new Edges join" (Orientation).
- **What is persisted, and when:**
  - Nothing is persisted at switch time. The switch does not submit or dirty the Space.
  - It is durable only when a later Edit in that Map records the resolved `activeGraph` explicitly (R10, R29). This is the intended cost.
  - Without that later Edit, the Map's stored `activeGraph`, or its first Graph, is what opens (R28). That fallback is a read, never a write.
- **Exception:** Add Graph is an Edit and activates the new Graph (R26).
- **Source:** the contract R10, R26, R28, R29 and A18.

**Q10.** Not as asked.
- **Why not:** R8 says a Map is the only canvas context, and the only thing that is selectable and addressable (`/spaces/:spaceId/maps/:mapId`). There are no Computed or Space Views, no flatten across Maps, and no dormant compatibility. Obsolete identities are invalid input and their URLs are not found. A4 records that Computed Views were rejected because keeping them dormant keeps most of the removed complexity. The cost accepted is that V1 loses the cross-Map flatten (ADR 0079). A grid at render time is also barred. Automatic strategies are non-addressable capabilities and never draw the canvas (R3), and a render-time arrangement is one nobody authored and nothing persists (R2, A3).
- **What the architecture offers instead:**
  - **The Resources View.** This is an application-supplied collection of the Space's Resources absent from the selected Map. It is currently a popover on the Command Dock (`CONTEXT.md`, ADR 0082). It is not a whole-Space view, and it has no URL of its own.
  - **Auto-arrange (R6).** It would tidy an authored Map by an explicit Edit. It is not built.
  - **Authoring a Map.** An author can add Resources to a new Map manually (R11).
- **Not documented either way:** the contract does not say whether a read-only whole-Space listing of Resources could exist as a non-canvas surface. R8 only rules it out as a canvas context.

## Notes

- **Decided versus built:** the contract is consistent with `AGENTS.md`. Auto-arrange and manual Graph reordering are accepted but not built (R6, R25 and the "Accepted, not built" section).
- **Dead links:** the contract links to `.scratch/adr-consolidation/pilot/inventory.md`, which it uses as the source for the D- and G- ids, and to `.scratch/adr-consolidation/pilot/REPORT.md`. The git status shows the whole `.scratch/adr-consolidation/` tree deleted in this worktree, so those links are dead and D12, D16, D21 and G1 cannot be traced.
- **Confusing pointers:** the contract's ADR link names (for example `0079-v1-exposes-only-layouts-and-first-open-initializes-one`) use retired vocabulary, as the contract itself warns. The "Orientation" section's translation of old names helps, but the question wording (Graph, Resource, Map) differs from the link slugs.
- **Q6 gap:** the contract does not say explicitly whether the remembered Open Size of a removed Resource is discarded. I inferred that from R31, which says the Map stores nothing but the Resource and its position.
- **From background, not the documents:** nothing beyond the above inference. I did not read any ADR bodies, so the "why" for R40, R41 and the others is the contract's summary of each ADR.
