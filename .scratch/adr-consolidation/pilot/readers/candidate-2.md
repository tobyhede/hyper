# Candidate reader 2

Route: specimen `ROUTE.md` → `maps-and-graphs.md`, in a detached checkout of `8b0b42df` with the inventory, questions, prior readings, research audit, spec and tickets removed. Model: Sonnet. The reader was told AGENTS.md might be in its context and to cite only documents opened through the candidate route, listing separately anything known only from AGENTS.md. The reader's report is recorded verbatim below.

## Reading log
1. `.scratch/adr-consolidation/pilot/specimen/ROUTE.md` — 551 words (whole file)
2. `.scratch/adr-consolidation/pilot/specimen/maps-and-graphs.md` — 3107 words (whole file)

Total ≈ 3,658 words. (Did not open ADRs, CONTEXT.md, or the inventory; the contract was sufficient.)

## Answers

**Q1. Automatic tidy-up command**
It is an Auto-arrange: a destructive Edit over an existing Map, to live in `graph` (R6). The author invokes it explicitly via a named tool; it rewrites that Map's positions in one Edit; the result is authored like any other position (R6). It must never become a canvas or selectable context, a renderer decision, incremental placement, a creator of Maps (R6), a render-time computation (R2, A3), or an engine that honours a drop point (R7, A12). Reason: the render path was wrong, not the algorithm — only the positioned strategy runs while the canvas draws, and nothing may compute placement at render time (R2). Automatic strategies are non-addressable capabilities; none is privileged; if a change works for one strategy only, the seam has leaked (R3). Auto-arrange is not built and no delivery issue exists ("Built vs accepted-but-unbuilt"). The render-time `elkjs` lint ban in `eslint.config.js` must be re-sited, not obeyed (R6). Undo is open (D12) — claim no Edit can be undone until decided. Whether the Edit records which strategy produced positions is undecided.

**Q2. A new result type for strategies**
Reject (R5, A1). A strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry filled; there is no intermediate arranged-result type (R5). Why: every consumer wants positions, so a separate type adds a translation step at a seam meant to stay thin; React Flow has no layout entity either (A1). The contract carries positions only (no ports, no routed sections), because a Map stores only a Resource and its position, so routed geometry has nowhere to land (R4). "Arrangement" is prose, not a domain term (R5).

**Q3. Listing Spaces with no Map**
No — listing, import completion, export and reference validation read stored state and never initialize (R18). A mapless Space is valid stored state (R15, A5). On first working load (direct open, Enter, rendering an Open Space Resource, or making a link target working) one server-side boundary persists one atomic Edit adding an empty `Map 1`, its empty Active `Graph 1`, and `defaultMap` (R16, R18). Initialization commits before the Space becomes working; on conflict it reloads and accepts a competing initialization, else normal retry; any other failure stops the Space opening (R19). Existing Resources are not placed — no strategy seeds them, because nothing authored says where they go; they stay in the Resources View outside the Map (R16, A9). Rejected: a read-only/draft Map on first open (A6; cost: first open writes state), inferring newness from Resource count or storing a creation marker (R20, A7, A8). A Space with Maps but no default records its first Map as `defaultMap` and creates nothing (R17). Import does not rewrite its source Markdown (R21).

**Q4. Adding another Map**
Add Map creates and selects an empty Map in one Edit: no Resources, owning one empty Graph that is its Active Graph (R11). Existing Resources are not copied in; the author adds them, e.g. from the Resources View (R11). The last Map cannot be deleted — `space-must-keep-map` — because a working Space must keep a durable default (R12, R9). The specimen is silent on whether choosing the new Map as `defaultMap` happens in the Add Map Edit itself; R10 only says a later Map-writing Edit may record it.

**Q5. Managing a Map's Graphs**
Add Graph appends an empty Graph and activates it in one Edit (R26). Deleting the Active Graph activates the first survivor (R27); survivors keep their order (R25). Deleting the only Graph is refused with `map-must-keep-graph` (R27). Deleting a Map or Graph atomically relocates every Space Resource that selects it, so no selection dangles (R13). A second Map cannot reuse it: a Graph belongs to exactly one Map and is authored only through it (R22); never shared or filtered from a Space-level collection (A10). Reason: with a shared Graph, removing a Resource from one Map would leave a dangling Edge or change every other Map (R22, A10); cost accepted: duplicate Graphs diverge independently (A10). A Graph id is unique across the Space (`duplicate-graph-id`) because lookup, the Graph URL and render keys resolve a Graph without a Map (R24, A11). `activeGraph` is optional; intake rejects one that dangles or names another Map's Graph (R28). Manual reordering is accepted but has no operation in code and no delivery issue (R25, "Built vs accepted-but-unbuilt").

**Q6. Removing an Open Resource from one Map**
Remove from Map is one Edit (R34). In that Map it removes the Resource's membership and position — membership is the position key, so they are one fact (R31) — and every incident Edge in all of that Map's Graphs, here the Edges in both Graphs (R34). Removing an Open Resource gives back its room by Close's negation (R35, R38) — built, but pending decision G1 because no ADR states it; keep the behaviour, cite no ADR for it. Leaves alone: emptied Graphs remain (R34); the Resource stays in the Space and in the second Map with its placement, size and Open state there (R32, R34); Edges in other Maps are untouched because Graphs belong to one Map (R22). The specimen does not say what happens to the Open Size record in this Map; Open Size is authored per Map, so it presumably goes with the removed membership (R32, R44) — my inference. Deleting from the Space instead runs this cascade in every Map (R36).

**Q7. Which neighbours an Open moves**
A Resource makes room on at most one axis, decided against S's collapsed rect, not its Open rect (R40, A16): at or past the collapsed right edge → width growth only; otherwise at or past the collapsed bottom edge → height growth only; otherwise no move (R40). Growth = Open Size − the fixed Closed Size, floored at zero per axis (R39).
- A (right, 40 lower): at or past the right edge → moves right by the width growth; no vertical move (R40).
- B (directly below): not past right, past bottom → moves down by the height growth (R40).
- C (below-right): at or past the right edge → moves right by the width growth only; not also moved down (R40).
- D (overlaps closed rect): neither at/past right nor at/past bottom → does not move (R40). Touching counts as clear.
The Open Edit writes the new positions into the Map, once, as one unit with the Open itself (R38, R43); between Edits a drawn position is the authored one. Why not C both ways: one axis is enough to stay clear; testing `x` first keeps a Resource beside the subject from moving vertically (the beside-but-lower jump A is exposed to); the constant collapsed rect makes Open and Close select the same set (R40, A15). Cost accepted: a grid no longer scales uniformly (R40).

**Q8. Closing after the author moved things**
Open and Close are memoryless and each reads the Map as it is now; Close reclaims from every Resource currently clear of the closing Resource, including ones moved there while it was Open (R41). So R is moved back by the negation of S's growth. Do not record which Resources the Open pushed — never do it (R41, A14). Reason: per-open state goes stale, and identical Maps would behave differently (A14). Cost accepted: Close reclaims from Resources moved into the cleared room (A14). Open then Close restores every position because growth is nonnegative (R42). Edge case: if S has been dragged past the neighbours its Open displaced, Close reclaims from none (R41); a Resource dropped inside an Open S was never pushed, so Close carries it inside S and a reopen skips it — stated, not clamped (R42).

**Q9. Switching the Graph the author works in**
Not an Edit: activating a Graph is navigation, deliberate, and neither submits nor dirties, because it changes nothing authored (R29, A18). Canvas: only emphasis — every owned Graph is still drawn, the Active Graph emphasised; not filtering, and no second "selected Graph" (R29, Orientation). New Edges go into the Active Graph (Orientation). Persisted: nothing at the moment of switching; a later successful Edit in that Map writes the resolved `activeGraph` explicitly (R10, R28). The cost is intended: an activation is not durable until then (R29). With no `activeGraph`, the first Graph opens; that fallback is a read, never a write (R28). An empty Graph may be active but cannot be presented until it has an Edge — built; no ADR states it in Graph terms (R30).

**Q10. A read-only grid view of a whole Space with its own URL**
Not as asked. A Map is the only canvas context and the only addressable one (`/spaces/:spaceId/maps/:mapId`); there are no Computed or Space Views, no flatten across Maps, no dormant compatibility; obsolete identities are invalid input and their URLs are not found (R8, A4). Why removed: keeping Computed Views dormant keeps most of the removed complexity; cost accepted: V1 loses the cross-Map flatten (A4). Instead: the Resources View lists a Space's unplaced Resources (R11, R16); an author can create a Map and add Resources (R11, R33); an explicit Auto-arrange as an Edit over a Map the author owns is accepted but not built (R6); `gridStrategy` is pure, test-only and not addressable (R3). Not settled: whether a new "add all Resources to a Map" action is allowed, and the Resources View's own URL, are not described.

## Known only from AGENTS.md
Nothing — all ten answers rest on the two documents read through the route.

## Contradictions and dead ends
- No contradictions within the two documents.
- Open points, both stated in maps-and-graphs.md: G1 (no ADR for the room given back on removing/deleting an Open Resource, R35) and D12 (undo undecided; ADRs disagree — 0086/0084 imply it, 0048/0074 deny it).
- Underspecified: R10's "may record" `defaultMap`; whether Add Map's selection becomes `defaultMap` in the same Edit (Q4); the per-Map Open Size on removal (Q6).
- Broken links: none seen (did not open the linked ADRs, CONTEXT.md or `../inventory.md`).
- Dead ends: none; ROUTE.md led straight to the contract.

## Confidence
- Q1: high
- Q2: high
- Q3: high
- Q4: high
- Q5: high
- Q6: medium
- Q7: high
- Q8: high
- Q9: high
- Q10: medium
