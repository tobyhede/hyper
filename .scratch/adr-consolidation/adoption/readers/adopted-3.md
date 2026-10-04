# Adopted-route reader 3 (fresh session)

Route: a separate `claude -p` session (Sonnet, tools Read/Grep/Glob only) started in a detached checkout of `c00cae99`, so its project instructions were the adopted `AGENTS.md`. Questions, grading, earlier readings, reports, specimen, research, spec and tickets removed; `pilot/inventory.md` kept because the contract links it. Wall time: 49s (shell-measured). The report is recorded verbatim below.

## Reading log

1. `AGENTS.md` / `CLAUDE.md`. This was supplied as session context, and I read it whole and skimmed the sections unrelated to these questions. About 6,500 words.
2. `docs/agents/maps-and-graphs.md`. Read whole: Read-this-before, R1–R44, the A1–A18 table, Accepted-not-built and the Provenance table. About 3,300 words.
3. `CONTEXT.md`. Read whole; the Space, Graph, Active Graph, Map, Placement, Layout strategy and Opening entries were the ones I used. About 4,700 words.
4. `docs/adr/0079-v1-exposes-only-layouts-and-first-open-initializes-one.md`. Read whole. About 480 words.
5. `docs/adr/0093-a-thing-makes-room-on-one-axis-once-clear-of-the-collapsed-subject.md`. Read whole. About 560 words.

Total: about 15,500 words, of which about 9,000 were opened as files and about 6,500 came with the session context.

## Answers

**Q1.** The command is Auto-arrange, which is an explicit, author-invoked, destructive Edit over an existing Map (`maps-and-graphs.md` R6, ADR 0086).
- **Where it runs:** it is to live in `graph`, attached to an Edit. It never runs at render, because only the positioned strategy runs while the canvas draws and nothing computes placement at render (R2, R3, A3).
- **What it changes:** it rewrites that Map's positions in one atomic Edit, and the result is authored like any other position (R6, R43). It creates no Map and does not seed from a drop point (R7).
- **What it must never become:** a canvas or selectable context, a renderer decision, or incremental placement (R6).
- **Not built:** `maps-and-graphs.md` lists Auto-arrange under "Accepted, not built", with delivery tracked in `.scratch/auto-arrange/issues/01`.
- **Open questions:** whether the Edit records which strategy produced the positions, and whether it asks for confirmation given that undo does not exist.
- **Strategy contract:** `gridStrategy` is the only automatic strategy, and it is used only by tests (R3). A strategy carries positions only, with no ports or routed sections (R4).
- **Undo:** it is a future feature, so the Edit is reversed only by another Edit.
- **elkjs ban:** building this means re-siting the render-time `elkjs` lint ban rather than obeying its message (R6, `AGENTS.md`).

**Q2.** No; reject it (R5, A1, ADR 0005, 0014, 0086).
- **Contract:** a strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry filled in (R5). There is no intermediate arranged-result type.
- **Reason:** every consumer wants positions, so a separate type only adds a translation step at a seam meant to stay thin (A1). React Flow has no layout entity either.
- **Cost accepted:** "the noun names nothing on screen".
- **Vocabulary:** "arrangement" is prose, not a domain term, and `CONTEXT.md` lists it under _Avoid_.

**Q3.** No. Listing reads stored state and never initializes (R18, ADR 0079/0080).
- **Mapless is valid:** a stored or imported Space may have no Map, and so no Graph (R15).
- **First open:** the first complete working-state read, whether by direct open, Enter, rendering an Open Space Resource, or making a link target working, persists one atomic Edit (R16, R18). That Edit creates an empty `Map 1`, an empty Active `Graph 1`, and `defaultMap`. It commits before the Space becomes working (R19).
- **Existing Resources:** they are not placed, and no strategy seeds them, because nothing authored says where they go (R16, A9). They stay in the Resources View, which is the collection of Resources absent from the selected Map (`CONTEXT.md`).
- **Cost accepted:** first open writes state (A6).
- **Variant:** a Space with Maps but no default just records its first Map as default and creates nothing (R17).

**Q4.** Add Map creates and selects an empty Map in one Edit (R11, ADR 0079/0040/0041).
- **What the Edit produces:** the new Map has no Resources and owns one empty Graph, which is its Active Graph.
- **Which Resources appear:** none. Existing Resources are not copied in; the author adds them, for example from the Resources View.
- **`defaultMap`:** every Edit through the canvas's Map records that Map as `defaultMap`, Add Map included. It also writes the Map's resolved `activeGraph` explicitly (R10).
- **Deleting every Map:** the last Map cannot be deleted. A working Space must keep a durable default (R9, R12). Delete Map is not offered while one Map remains, `planContextDeletion` answers "unchanged" when no survivor exists, and there is no refusal code.

**Q5.** For deletion:
- **Deleting the Active Graph:** this activates the first surviving Graph (R27). Survivors keep their order (R25).
- **Deleting the only Graph:** it cannot be done. Delete Graph is not offered when the Map has one Graph, and `planContextDeletion` answers "unchanged" with no refusal code (R27). A Map owns a non-empty Graph collection (R22).
- **Space Resources:** deleting a Graph also atomically relocates every Space Resource that selects it, so no selection dangles (R13, ADR 0091).
- **Persistence:** activation is navigation, not an Edit. It is not durable until a later Edit in that Map records it (R29, A18).

For adding, Add Graph appends an empty Graph and activates it in one Edit (R26). It also activates the new Graph when the Edit goes through a Map drawn inside an Open Space Resource (R10).

A second Map cannot reuse one of this Map's Graphs. Each Graph belongs to exactly one Map and is authored only through it (R22). The reason given is that a shared Graph would dangle an Edge or change every other Map when a Resource is removed from one Map (A10). Graph ids are unique across the whole Space (R24, ADR 0108).

**Q6.** Remove from Map is one Edit (R34, R35, ADR 0084/0040).

What it changes:
- **Closes first:** because the Resource is Open, it is Closed in the same Edit. The memoryless Close reclaims the room from every Resource currently clear of it (R35, R41). This is the only displacement removal causes.
- **Removes from this Map:** it removes the Resource's membership and position (which are one fact, R31), and every incident Edge in that Map's Graphs.
- **Sets the Open record aside:** the Open state and Open Size are Map-owned (R37), so they go with the position. The docs do not say whether the Open Size is kept anywhere else.

What it leaves alone:
- **Emptied Graphs:** the two Graphs that held its Edges remain, even if now empty.
- **The Resource itself:** it stays in the Space.
- **The second Map:** its placement, Open state, Open Size and Edges are untouched, because placement belongs to the Map, not the Resource (R32).
- **Other positions:** removal itself never displaces; only Open, Close and Resize do.

**Q7.** The rule is R40 / ADR 0093. A Resource moves on at most one axis, decided against S's collapsed rect. The growth is the Open Size minus the fixed Closed Size, floored at zero on each axis (R39). Neither document gives the numeric Closed Size.
- **A:** it is at or past the collapsed right edge, so it moves right by the width growth only. Its top being 40 units lower is irrelevant, and that case is the one ADR 0093 was written to fix.
- **B:** it is not clear on x, but it is at or past the collapsed bottom edge, so it moves down by the height growth only.
- **C:** it is clear on x, so it moves right by the width growth only. It does not move down.
- **D:** it overlaps the collapsed rect, so it does not move.

All new positions are written into the Map by the Open Edit itself, once, as one unit (R38, R43). No render-time displacement is involved.

Why C does not move both ways:
- **One axis is enough.** A Resource that has taken the width growth is past the Open right edge, so it cannot overlap the grown subject.
- **Independent thresholds were rejected (A15).** They would leave the beside-but-lower jump in place for a Resource dragged beside the Open subject below its collapsed bottom edge.
- **Cost accepted:** a grid no longer scales uniformly.

**Q8.** What happens depends on where R was dropped (R38, R40, R41, A14).
- **Drop position is authored:** R sits where it was dropped, with no conversion (R38).
- **Close is memoryless:** Close reads the Map as it is now and reclaims from every Resource currently clear of S, including ones moved there while S was Open (R41).
- **If R is beside S:** if R was dropped at or past S's collapsed right edge, it is clear on x. Closing S moves R left by the width growth only, even though the Open never pushed it.
- **If R is inside S's Open rect:** if R was dropped past the collapsed edge but inside the Open rect, it is also treated as clear. Close carries it inside S's old area, and a reopen skips it (R42, ADR 0093 Consequences).

Should you remember which Resources S's Open pushed? No (A14). The reasons given are that per-open state goes stale and identical Maps would behave differently. The cost accepted is that Close reclaims from Resources that were moved into the room.

**Q9.** Switching is not an Edit; it is navigation (R29, A18, ADR 0028; `CONTEXT.md` "Active Graph" and "Authoring").
- **What changes on the canvas:** the emphasis only. Every owned Graph is still drawn, so this is emphasis, not filtering. There is no second "selected Graph".
- **Where new Edges go:** into the Active Graph, which is the one new Edges join.
- **What is persisted:** nothing at the moment of switching. The activation is not durable until a later Edit in that Map writes the Map's resolved `activeGraph` explicitly (R10, R29).
- **Dirty state:** switching neither submits nor dirties, and it must be a deliberate act rather than a side effect of drawing or reading.
- **Without a recorded Graph:** the Map's first Graph opens when `activeGraph` is not recorded (R28).

**Q10.** Not as asked.
- **Why not:** a canvas shows only a Map's own Graphs. V1 exposes only authored Maps as the selectable and addressable way to see a Space. Computed View and Space View were removed from the domain, persisted selections, product URLs and application registry (R8, A4, ADR 0079). Obsolete URLs are not found, and the Space has no un-curated "whole Space" view.
- **Why the shape was removed:** keeping Computed Views dormant would preserve most of the complexity being removed (IDs, schema cases, URL semantics, conversion path, renderer resolution). The cost accepted is losing the cross-Map flatten (A4).
- **Offered instead:**
  - The Map is the addressable context, at `/spaces/:spaceId/maps/:mapId` (R8).
  - A mapless Space gets an empty `Map 1` on first open, with its Resources not placed (R16).
  - The Resources View (`CONTEXT.md`) lists the Space's Resources absent from the selected Map. It is a popover on the Dock, and the docs say that mounting is not part of its identity.
  - Auto-arrange could place a Map's Resources by an automatic strategy as an explicit Edit. It is not built (R6).
- **Open question:** no document says a stable URL for the Resources View is allowed or forbidden. I would answer that a new addressable view would need its own decision, because R8 says the Map is the *only* canvas context.

## Notes

- **Retired names:** ADRs 0079, 0093 and 0084 use older names (Layout, Card, Thing, Route) that the contract's Orientation section maps to current ones. The ADR files themselves still carry the old names, and 0079's text refers to `defaultLayout`.
- **Closed Size:** no document I read states the numeric Closed Size. Q7 therefore gives directions and "growth" amounts, not numbers.
- **Q6, Open Size:** nothing says whether a removed Resource's Open Size survives anywhere. I inferred it goes with the position from R31 and R37.
- **Q10, Resources View URL:** this is the one point I answered by inference.
- **Stale pointers:** `maps-and-graphs.md` links `.scratch/adr-consolidation/pilot/inventory.md` and `pilot/REPORT.md`. The git status shows `.scratch/adr-consolidation/pilot/*` deleted in this worktree, so those links are probably dead. I did not open them.
- **`AGENTS.md`:** it is large and mostly about build status. The Map and Graph questions were answerable almost entirely from `maps-and-graphs.md`, which `AGENTS.md` points to correctly.
- **Source code:** I did not read any source code or tests.
