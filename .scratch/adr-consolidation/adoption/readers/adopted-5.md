# Adopted-route reader 5 (fresh session)

Route: a separate `claude -p` session (Sonnet, tools Read/Grep/Glob only) started in a detached checkout of `71019361`, so its project instructions were the adopted `AGENTS.md`. Questions, grading, earlier readings, reports, specimen, research, spec and tickets removed; `pilot/inventory.md` kept because the contract links it. Wall time: 50s (shell-measured). The report is recorded verbatim below.

## Reading log
1. `CLAUDE.md` / `AGENTS.md` (project instructions in context, plus the `AGENTS.md` copy listed in the directory): read in full, about 6,500 words. I didn't open the `AGENTS.md` file separately, so the count is for the copy in context.
2. `docs/agents/maps-and-graphs.md`: read whole, about 3,700 words (all of R1–R44, A1–A18, "Accepted, not built", Provenance).
3. `CONTEXT.md`: partial, lines 88–99 (Active Graph, Authoring) and 141–146 (Placement), about 600 words.

Total: about 10,800 words.

I did not open any ADR, inventory, `.scratch` or other `docs/agents` file. The contract states its own rules and reasons, so I answered from it alone.

## Answers

**Q1.**
- **Where it runs:** this is Auto-arrange (R6). It runs as an explicit Edit in `graph`, invoked by a named tool, never at render. Only the positioned strategy runs while the canvas draws (R2). It would be a pure automatic strategy over a `LayoutStrategyGraph` (R3, R5). The ESLint ban on elkjs and render-time engines has to be re-sited to allow this (R6).
- **What it changes:** it rewrites that existing Map's positions in one atomic Edit (R6, R43). The result is authored like any other position. A strategy carries positions only, so no routed geometry is stored (R4).
- **What it must never become:**
  - a canvas, a selectable or addressable context, or a render-time decision (R6, R8, R3, A3);
  - incremental placement, or a way to honour a drop point (R7, A12);
  - a creator of a new Map (R6).
- **Status:** not built. Two open questions are recorded in `.scratch/auto-arrange/issues/01-auto-arrange-a-map.md`. One is whether the Edit records which strategy produced the positions. The other is whether it asks for confirmation before rewriting a whole Map, given that undo doesn't exist.
- **Reason:** the render path was the mistake, not the strategy it ran (R6).

**Q2.** No (R5, A1; ADR 0005, ADR 0014, ADR 0086).
- The contract has no intermediate arranged-result type. A strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry filled in.
- Every consumer wants positions, so a separate value type only adds a translation step at a seam meant to stay thin. React Flow has no layout entity either.
- The cost accepted is that the noun "arrangement" names nothing on screen. It stays prose, not a domain term.

**Q3.**
- **Listing:** no, it must not give them a Map. Listing, import completion, export and reference validation read stored state and never initialize (R18, ADR 0079, ADR 0080).
- **Why they exist:** a mapless stored or imported Space is valid (R15, A5).
- **First open:** the first complete working-state read persists one atomic Edit before returning. That Edit creates an empty `Map 1`, its empty Active `Graph 1`, and `defaultMap` (R16). Direct open, Enter, rendering an Open Space Resource and making a link target working all go through the one server-side boundary (R18).
- **Commit ordering:** initialization commits before the Space becomes working. A conflict reloads and accepts a competing initialization (R19).
- **Existing Resources:** they are not placed, and no strategy seeds them. Nothing authored says where they go (R16, A9, ADR 0080). They stay in the Resources View, outside the Map, and the author adds them.
- **Rejected:** a read-only or draft first open (A6); inferring newness from Resource count or storing a creation marker (R20, A7, A8).

**Q4.**
- **What the Edit produces:** Add Map creates and selects an empty Map in one Edit. It has no Resources and owns one empty Graph, which is its Active Graph (R11). The Edit also records the new Map as `defaultMap` and writes its resolved `activeGraph` (R10, which says Add Map is included).
- **Which Resources appear:** none. Existing Resources are not copied in, and the author adds them, for example from the Resources View (R11, R31 on omission). Membership is the set of position keys (R31).
- **Deleting every Map:** the last Map cannot be deleted, because a working Space needs a durable default (R12, ADR 0079). Delete Map isn't offered while one Map remains, and `planContextDeletion` answers "unchanged" when there is no survivor. There is no refusal code.
- **Related:** deleting the default Map moves `defaultMap` to the selected survivor, else the first (listed under "Treatment without an ADR"). Deleting a Map also relocates every Space Resource that selects it (R13).

**Q5.**
- **Deleting the Active Graph:** the first surviving Graph becomes active (R27). Survivors keep their order (R25).
- **Deleting the only Graph:** it can't be done. Delete Graph isn't offered while the Map has one Graph, and `planContextDeletion` answers unchanged. A Map owns a non-empty ordered collection of Graphs (R22, R27).
- **Related rules:**
  - Deleting a Graph relocates every Space Resource that selected it (R13).
  - Add Graph appends an empty Graph and activates it, in one Edit (R26).
  - Activating a Graph is navigation, not an Edit, and not durable until a later Edit in that Map records it (R29, A18).
- **Reuse across Maps:** no. Each Graph belongs to exactly one Map and is authored only through it (R22, A10). With a shared Graph, removing a Resource from one Map would leave a dangling Edge or change every other Map. Two Maps telling one narrative hold two Graphs, which diverge independently. A Graph id is also unique across the Space (R24).

**Q6.**
- **Changes (one Edit, R34):**
  - Because the Resource is Open, it is Closed first in the same Edit. Close reclaims the room it held, using the memoryless rule, before the removal (R35, R41).
  - Its membership and position in that Map are removed (R34, R31).
  - Every incident Edge in that Map's Graphs is removed, which here means the Edges in both Graphs (R34, R23).
- **Left alone:**
  - the Resource itself in the Space;
  - its placement and Open/Closed state in the second Map (R32, R34);
  - Edges in other Maps' Graphs;
  - the now-possibly-empty Graphs, which remain (R34).
- **Not moved by the removal:** removal itself never displaces; only Open, Close and Resize do (R35). There is no gap-leaving, because nothing could reclaim it later.
- **Not the same as deleting from the Space:** that runs the same cascade in every Map (R36).

**Q7.** The rule is R40 (ADR 0093), decided against S's collapsed (closed) rect. Growth is Open Size minus the Closed Size, floored at zero per axis (R39).
- **A** (right, top 40 lower): it sits at or past the collapsed right edge, so it moves right by the width growth only. It doesn't move vertically, because `x` is checked first and the vertical offset doesn't matter.
- **B** (directly below): it is not clear on `x`, but it is at or past the collapsed bottom edge, so it moves down by the height growth only.
- **C** (below and right): it is at or past the right edge, so it takes the width growth on `x` only and doesn't move down.
- **D** (overlaps the collapsed rect): it is not at or past either edge, so it doesn't move.
- **When positions are recorded:** the Open Edit itself applies the displacement once and writes the new positions into the Map. The positions are authored at that moment, and between Edits the drawn position is the authored one (R38). All the moves are one unit (R43).
- **Why C isn't moved right and down:** one axis is enough to stay clear. Checking `x` first keeps a Resource beside the subject from moving vertically. The constant collapsed rect makes Open and Close select the same set, and touching counts as clear (R40, ADR 0093). The rejected options were independent per-axis thresholds (A15) and bands against the Open rect (A16).
- **Accepted costs:** a grid no longer scales uniformly. A Resource below the subject but not clear on `x` moves down however far left it sits.

**Q8.**
- **What happens to R:** Close is memoryless. It reads the Map as it is now and reclaims from every Resource currently clear of the closing Resource, including ones moved there while it was Open. So R, which is now clear of S on the right or below, is pulled back by the growth along that axis (R41, R38, ADR 0084, ADR 0093). The exception is that if S had been dragged past the neighbours its Open displaced, Close reclaims from none of them (R41).
- **A caveat from R42:** a Resource dropped past the collapsed edge inside the Open subject was never pushed, so Close carries it inside the subject.
- **The suggestion:** no. Never record which Resources an Open pushed (R41, A14). Per-open state goes stale, and identical Maps would behave differently depending on history. The cost accepted is that Close reclaims from Resources moved into the room.

**Q9.**
- **Is switching an Edit?** No. Activating a Graph is navigation, not an Edit. It changes nothing authored, it neither submits nor dirties, and it is deliberate, never a side effect of drawing or reading (R29, ADR 0028; CONTEXT.md "Active Graph" and "Authoring").
- **What changes on the canvas:** the emphasis only. Every owned Graph is still drawn, so activation is emphasis, not filtering. There is no second "selected Graph" (R29).
- **Where new Edges go:** into the Active Graph (CONTEXT.md "Active Graph").
- **What is persisted, and when:** nothing at the moment of switching. The activation becomes durable only when a later Edit in that Map records it. Every canvas Edit writes the Map's resolved `activeGraph` explicitly (R10, R29, A18). This is a stated cost: an activation is not durable until then. The Map's stored `activeGraph` is a read fallback, with the first Graph used otherwise, and that fallback never writes (R28).
- **Not built:** nothing in this area; the only unbuilt items are Auto-arrange and manual Graph reordering.

**Q10.** Not as asked.
- **Why:** a Map is the only canvas context, and it alone is selectable and addressable (R8, ADR 0079, ADR 0069). A computed view or Space View has no URL to live at, because an automatic strategy is non-addressable and never draws the canvas (R3, R8, A4). Computed and Space Views were removed. There is no flatten across Maps and no dormant compatibility, and obsolete identities are invalid input whose URLs are not found (R8).
- **Why it was removed:** keeping Computed Views dormant would keep most of the removed complexity. The cost accepted is that V1 loses the cross-Map flatten (A4). A render-time arrangement is also one nobody authored, and nothing persists it (R2, A3).
- **What the architecture offers instead:**
  - **A curated Map.** A new Map starts empty, and the author adds Resources from the Resources View (R11, R33), with the grid strategy available only as a non-addressable capability.
  - **Auto-arrange.** This is the intended way to get a grid. It is an explicit Edit that writes authored positions into a Map (R6), but it is not built.
  - **The Resources View.** This is mentioned as the place that holds Resources outside any Map (R11, R16). I didn't read its own definition, so I can't say whether it satisfies "read-only glance at every Resource".

## Notes
- **Dead links:** the Provenance section links to `.scratch/adr-consolidation/pilot/inventory.md` and `.scratch/adr-consolidation/pilot/REPORT.md`, and the working tree shows `.scratch/adr-consolidation/...` as deleted. I didn't follow them. R10, R35 and D12 cite them ("D16 and D21 in the inventory", "G1"), so those citations can't be checked from the tree I was given.
- **Not answerable from the docs I read:** the Q7 numbers. The contract gives rules, not numeric examples, and "by how much" is "the width growth" or "the height growth", which depend on the Open Size and Closed Size. Neither is specified numerically in what I read.
- **Pointer to a missing document:** R35 cites `snapshot-edits.property.test.ts`, which is a test I was told not to read.
- **Ambiguity on Q4:** R10 says every canvas Edit records the Map as `defaultMap`, Add Map included. R11 only says "creates and selects", so the `defaultMap` write for Add Map comes from R10.
- **Ambiguity on Q8:** R41 says Close reclaims from every Resource "currently clear" of the closing Resource. I assumed "clear" means the same collapsed-rect test as R40, since R40 says the constant collapsed rect makes Open and Close select the same set. R41 doesn't spell out the test itself.
- **Ambiguity on Q10:** the contract says that for a mapless Space, existing Resources stay in the Resources View. It doesn't define the Resources View's own behaviour, such as whether it is read-only or addressable. I didn't read those docs.
- **Unread pointers:** I did not read the ADRs, `docs/agents/workflow.md` or `.scratch/auto-arrange/...`, so the "why" statements are the ones the contract gives.
