# Candidate reader 1

Route: specimen `ROUTE.md` → `maps-and-graphs.md`, in a detached checkout of `8b0b42df` with the inventory, questions, prior readings, research audit, spec and tickets removed. Model: Sonnet. Tool uses: 3. Wall time: about 55 s. The reader was told AGENTS.md might be in its context and to cite only documents opened through the candidate route, listing separately anything known only from AGENTS.md. The reader's report is recorded verbatim below.

## Reading log
1. `.scratch/adr-consolidation/pilot/specimen/ROUTE.md` — 551 words (whole file)
2. `.scratch/adr-consolidation/pilot/specimen/maps-and-graphs.md` — 3107 words (whole file)

Total ≈ 3658 words. I did not open any ADR, CONTEXT.md, or inventory.md — the contract stated each rule with its reason, so I did not need them. No source code read.

## Answers
Citations are to rule IDs (R) / rejected alternatives (A) in `maps-and-graphs.md` and its source-ADR links.

**Q1. Tidy-up command**
Where: Auto-arrange is a destructive Edit over an existing Map, invoked explicitly by the author via a named tool (R6, [0086]); it is to live in `graph`, re-siting the render-time `elkjs` lint ban; accepted but not built, no delivery issue (Built vs unbuilt). What it changes: rewrites that Map's positions in one Edit; the result is authored like any other position (R6). It creates no Map. Must never become: a canvas, selectable context, or renderer decision; a render-time computation (R2, A3, [0086]) — only the positioned strategy runs while the canvas draws; incremental placement, and an engine must never honour a drop point (R7, A12, [0013]). An engine returns only attached to an Edit (R7). `gridStrategy` is pure and test-only; it is not privileged, and a change working for only one strategy means the seam leaked (R3). Undo is undecided (D12): until decided, claim no Edit can be undone. Whether the Edit records which strategy produced the positions is undecided.

**Q2. New result type for strategies**
Reject. There is no intermediate arranged-result type (R5, A1, [0005], [0014], [0086]): a strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry filled in (R5). A1 reasons: every consumer wants positions, so a separate type adds a translation step at a seam meant to stay thin; React Flow has no layout entity either; "Arrangement" is prose, not a domain term. The contract carries positions only, optional `x`/`y`, no ports or routed sections (R4) — a Map stores a Resource and its position and nothing else, so extra geometry has nowhere to land.

**Q3. Mapless stored Spaces**
Listing: no. Listing, import completion, export and reference validation read stored state and never initialize (R18). A mapless stored Space is valid state (R15). First working load persists one atomic Edit before returning, creating an empty `Map 1`, its empty Active `Graph 1`, and `defaultMap` (R16). This applies to direct open, Enter, rendering an Open Space Resource, and making a link target working (R18). Existing Resources are not placed and no strategy seeds them, because nothing authored says where they go; they stay in the Resources View (R16, A9). Initialization commits before the Space becomes working; on conflict it reloads and accepts a competing initialization, else normal retry; any other failure stops the Space opening (R19). Newness is never inferred and no marker is stored (R20, A7, A8). A Space with Maps but no default records its first Map and creates nothing (R17). First open writes state — the accepted cost of A6.

**Q4. Adding another Map**
One Edit creates and selects an empty Map with no Resources, owning one empty Graph that is its Active Graph (R11, [0079], [0040], [0041]). Existing Resources are not copied in; authors add them, e.g. from the Resources View (R11). The last Map cannot be deleted (`space-must-keep-map`), because a working Space must keep a durable default (R12). Not covered: whether `defaultMap` changes on Add Map (R10 says a later Map-writing Edit may record it).

**Q5. Managing a Map's Graphs**
Add Graph appends an empty Graph and activates it in one Edit (R26). Creating appends; deleting keeps survivors' order; manual reordering is a separate operation, accepted but not built (R25). Deleting the Active Graph activates the first survivor (R27). Deleting the only Graph is refused with `map-must-keep-graph` (R27). Deleting a Map or Graph atomically relocates every Space Resource that selects it (R13, [0091]). Reuse in a second Map: no. A Map owns an ordered, non-empty collection of Graphs; each Graph belongs to exactly one Map; never shared or filtered from a Space-level collection (R22, A10, [0040]). Reason: with a shared Graph, removing a Resource from one Map would leave a dangling Edge or change every other Map. Two Maps telling one narrative hold two Graphs; cost accepted: they diverge independently. Graph ids are unique across the Space (R24, A11, [0108]).

**Q6. Removing an Open Resource from one Map**
Changes (R34, [0040]): one Edit removes the membership, the position, and every incident Edge in that Map's Graphs — both Graphs where it had Edges. Because it was Open, the removal gives its room back by Close's negation: neighbours currently clear of it are moved back (R35, R41). The Open state change follows from removing the position. Leaves alone: the Resource itself, which stays in the Space; its presence, position, size and Open state in the second Map, since placement belongs to each Map (R32); the Graphs themselves — emptied Graphs remain (R34); the Space-level Resource. Open point G1: the room-giving rule appears in CONTEXT.md ("Placement") and is built, but no ADR states it — keep the behaviour, cite no ADR. Contrast: deleting from the Space runs this cascade in every Map (R36).

**Q7. Which neighbours an Open moves**
Rule (R40, [0093]): a Resource makes room on at most one axis, decided against S's collapsed rect: (1) at or past the collapsed right edge → width growth only; (2) otherwise at or past the collapsed bottom edge → height growth only; (3) otherwise no move. Amount: growth = Open Size − the fixed Closed Size, floored at zero per axis (R39).
- A (right, 40 lower): moves right by the width growth only; no vertical move. This is the beside-but-lower case R40 was designed for (A15).
- B (directly below): not past the right edge → moves down by the height growth only.
- C (below and right): past the right edge → moves right by the width growth only; does not move down.
- D (overlaps S's closed rect): neither at/past the right edge nor at/past the bottom edge → does not move.
When recorded: the new positions are written into the Map by the Open Edit itself, once (R38, R43, [0084]); nothing is derived at render. Why not both axes for C: one axis is enough to stay clear; taking `x` first keeps a Resource beside the subject from moving vertically; the constant collapsed rect makes Open and Close select the same set; touching counts as clear (R40, [0093]). Rejected: independent per-axis moves (A15) and bands against the Open rect (A16). Cost accepted: a grid no longer scales uniformly, and a Resource below the subject but not clear on `x` moves down however far left it sits.

**Q8. Closing after the author moved things**
Close reads the Map as it is now and reclaims room from every Resource currently clear of S, including ones moved there while S was Open — so R is moved by the negation, unless S has been dragged past the neighbours its Open displaced, in which case nothing moves (R41, [0084], [0093]). Reason: Open and Close are memoryless. The reviewer's suggestion: no — never record which Resources an Open pushed (R41, A14). Per-open state goes stale, and identical Maps would behave differently. Cost accepted: Close reclaims from Resources moved into the room. Edge case: a Resource dropped past the collapsed edge inside an Open subject was never pushed; Close carries it inside the subject and a reopen skips it — stated, not clamped (R42). A clean round trip otherwise holds because growth is nonnegative.

**Q9. Switching the Graph the author is working in**
Not an Edit. Activating a Graph is navigation; it neither submits nor dirties, because it changes nothing authored (R29, A18, [0028], [0041], [0079]). Canvas: emphasis, not filtering — every owned Graph is still drawn, with the Active Graph emphasised; there is no second "selected Graph" (R29). New Edges join the Active Graph (Orientation). Persistence: activation itself is not durable; a later successful Edit in that Map records the resolved `activeGraph` explicitly (R10, R29); this lasting cost is intended (R29). If `activeGraph` is unset, the first Graph opens — a read, never a write (R28). Intake rejects an `activeGraph` that dangles or names another Map's Graph (R28). Don't make activation a side effect of drawing or reading; it must be deliberate (R29).

**Q10. Read-only grid view of a whole Space with its own URL**
No, not as asked. A Map is the only canvas context; it alone is selectable and addressable (R8, [0079], [0069]). There are no Computed or Space Views and no flatten across Maps, no dormant compatibility, and obsolete identities are invalid input whose URLs are not found (R8). Automatic strategies are non-addressable capabilities; none draws the canvas (R3). What the architecture offers: an authored Map — add one, then add Resources to it from the Resources View (R11), addressable at `/spaces/:spaceId/maps/:mapId` (R8); the Resources View already lists a Space's Resources outside any Map (R16); an explicit Auto-arrange Edit over a Map using the grid could produce a grid — accepted but not built (R6). Why removed: keeping Computed Views dormant keeps most of the removed complexity (A4, [0079]); cost accepted: V1 loses the cross-Map flatten. Render-time arrangement is a placement nobody authored and nothing persists (R2, A3).

## Known only from AGENTS.md
Nothing relevant that I could answer only from AGENTS.md; every answer above is supported by the two route files. I deliberately did not use the in-context AGENTS.md.

## Contradictions and dead ends
- No contradictions between ROUTE.md and the contract.
- Open points the contract flags: G1 (Open-room rule on removal has no ADR), D12 (undo undecided; ADRs 0086/0084 vs 0048/0074), and whether Auto-arrange records which strategy produced the positions.
- Gaps: the contract does not say whether Add Map changes `defaultMap`; nor exactly how Remove from Map's room-giving interacts with a position dragged inside an Open rect (Q6). Q10's "own URL" has no direct treatment of a read-only Space-wide view beyond the removal of Computed/Space Views.
- Broken links: none followed; relative-link depth looked consistent (`../../../../docs/adr/...` from the specimen dir) but I did not verify targets exist.
- ROUTE.md → `../inventory.md` is referenced only through the contract's "evidence" line; not opened.

## Confidence
- Q1: high
- Q2: high
- Q3: high
- Q4: high
- Q5: high
- Q6: medium (Open-room part pending G1; the Open-state wording is my inference)
- Q7: high
- Q8: high
- Q9: high
- Q10: medium (rule is clear; "what the architecture offers" partly inferred from R8/R11/R16/R6)
