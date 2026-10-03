# Baseline reader 2

Route: existing guidance (AGENTS.md entry point) in a clean detached checkout of `main` at `d27124479`, with `.scratch/adr-consolidation/` removed. Model: Sonnet. Tool uses: 14. Wall time: about 92 s. The reader's report is recorded verbatim below.

## Reading log
Worktree: /Users/tobyhede/psrc/hyper/.worktrees/adr-pilot-baseline. No `.scratch/` files or source code read.

1. AGENTS.md — ~9,730 words (whole file; the full text was already in my context as project instructions; re-read lines 1–27 on disk to confirm it matched).
2. docs/agents/editing-and-persistence.md — ~1,950 words (header + bullets at lines 15–22 and 37–39, plus grep hits; file is 5,381 words total).
3. CONTEXT.md — ~1,800 words (lines 60–90: Graph, Edge, Active Graph; lines 133–160: Map, Placement, Layout strategy, Resources View; plus grep hits; file is 6,469 words total).
4. docs/adr/0086-automatic-arrangement-is-an-edit-not-a-render-path.md — 1,824 words (whole file).
5. docs/adr/0079-v1-exposes-only-layouts-and-first-open-initializes-one.md — 542 words (whole file).
6. docs/adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md — 518 words (whole file).
7. docs/adr/0093-a-thing-makes-room-on-one-axis-once-clear-of-the-collapsed-subject.md — 726 words (whole file).
8. docs/adr/0040-layouts-own-card-membership-and-routes.md — ~700 words (lines 1–60 of 949).
9. docs/adr/0041-graph-is-the-first-public-name-for-route.md — ~350 words (lines 15–40 + grep hits).
10. docs/agents/rendering.md — ~400 words (grep hits only; line 56 on multi-Graph rendering; file is 7,660 words total).
11. docs/agents/ui.md — ~100 words (one grep hit, the Command Dock bullet).

Total ≈ 18,600 words read (≈ 8,900 excluding the in-context copy of AGENTS.md).

## Answers

**Q1. Automatic tidy-up command**
Where it runs and what it changes: Auto-arrange is an Edit over an existing authored Map — the computation sits behind the Edit, not in the renderer. It is a "destructive authoring operation over an existing [Map]": the author places Resources, invokes a named tool, and the Map's positions are rewritten in one Edit, undoable like any other (ADR 0086; AGENTS.md first paragraph; CONTEXT.md "Layout strategy"). The code belongs in `graph`, "attached to an Edit" (AGENTS.md package-layout `react-flow-adapter` entry; ADR 0086 "A removal, not a prohibition"). The strategy takes a graph and answers positions, which are written into the Map's placement; `gridStrategy` is pure, exists, and is currently unused.
What it must never become: a render path, a second kind of canvas, a second selectable/addressable context, or anything the renderer decides (ADR 0086; ADR 0079). Privileged — no strategy is "what layout means" (AGENTS.md; CONTEXT.md). A render-time computation of an arrangement nobody authored and nothing persists (ADR 0086). It is constrained by ADR 0025's negative: do not seed or constrain elkjs to honour a drop point — that reshuffled existing Resources and placed the new one arbitrarily; the destructive whole-Map form is explicitly clear of that finding.
elkjs and layering: re-adding elkjs is allowed, but only attached to an Edit (ADR 0086); the ELK port-ordering lessons are in `.scratch/layout-seam/issues/01` and `04` (named only in ADR 0086; not opened). The lint zone banning `elkjs` in `core`/`graph` needs re-siting when you add it — it is not something to obey as written (AGENTS.md "Hard rules").
Status: CONTEXT.md says Auto-arrange is "planned and not yet built". Automatic strategies are non-addressable capabilities.

**Q2. Result type for strategies**
Reject it. Reasons in ADR 0014 and ADR 0005, both restated as binding by AGENTS.md and editing-and-persistence.md. ADR 0005's decision still binds: no `Arrangement` type; geometry rides as optional fields on the elements (ADR 0014 "costs accepted"; editing-and-persistence.md line 17: "There is no `Arrangement` type ... don't introduce one"). The strategy contract is `LayoutStrategyGraph -> LayoutStrategyGraph`, carrying positions only (editing-and-persistence.md line 17). CONTEXT.md "Placement" and "Layout strategy": applying a strategy "produces no separate entity — the Resources themselves carry the positions". Writing computed coordinates into the Map is the Edit's job (ADR 0086). Mild caveat: ADR 0014 describes Auto-arrange as the opposite direction from `positionedStrategy` (a graph in, positions out); nothing in the docs says what exact type that direction returns, so this is the unspecified area. The rule is still not to mint a coordinates-only entity or type that persists as an arrangement.

**Q3. Mapless stored Spaces**
Listing must not give them one: listing, import completion, export and reference checks do not initialize (ADR 0079; editing-and-persistence.md line 15). The first complete working read — the first open as working state — performs one atomic persisted Edit before returning: it creates `Map 1`, `Graph 1`, makes the Graph active, and records `defaultMap` (if Maps exist but no default, it persists the first Map as default). It must commit before the Space becomes working state; on a conflict it reloads and accepts a competing initialization, otherwise it retries; any other commit failure prevents the Space from opening (ADR 0079). Import does not rewrite source Markdown. Existing Resources stay in the Space and are not placed on the new empty Map — they are not lost; they are added later via the Resources View / Add to Map (ADR 0079: "existing Cards remain outside it until added from the Cards View"; CONTEXT.md "Placement", "Resources View"). Space Resources pointing at such a Space also trigger initialization (AGENTS.md ADR 0079 entry); a mapless ordinary Space cannot be in a valid aggregate unless it is Meta (AGENTS.md ADR 0079 entry) — matters only for fixtures.

**Q4. Add Map**
One Edit creates and selects an empty Map with one empty Active Graph (AGENTS.md ADR 0079; ADR 0079; CONTEXT.md "Graph"). No existing Resources appear on it — Resource membership is explicit position keys; omission means "not in that Map" (CONTEXT.md "Placement"; ADR 0040). Resources are added later via the Resources View / Add to Map. The pending continuation after Add Map lands in the new Map's name field (AGENTS.md `app` entry on `ContinuationControl`). The last Map cannot be deleted — a working Space always has a durable default Map (ADR 0079; AGENTS.md). Choosing a Map is navigation, not an Edit; a later successful Edit may record it as `defaultMap` (editing-and-persistence.md line 16).

**Q5. Managing Graphs**
Add Graph appends and activates a new empty Graph (ADR 0040 "Add Route", renamed in ADR 0041); the new Graph gets the palette colour farthest from the Map's others, and the arrow head shape (CONTEXT.md "Graph"). Deleting the Active Graph: survivors are considered in authored order and the first survivor becomes active (ADR 0040; Active Graph fallback is the first Graph, CONTEXT.md); deletion preserves the relative order of survivors (CONTEXT.md). Deleting the only Graph is refused: "The last Graph cannot be deleted through Graph management" (CONTEXT.md; ADR 0041). If a no-Graph result were produced, intake rejects it; intake also rejects a dangling `activeGraph` (ADR 0040). Both authoring and intake enforce the same rule (ADR 0040). A second Map cannot reuse a Graph: a Graph belongs to exactly one Map and is authored only through it (CONTEXT.md; ADR 0040; editing-and-persistence.md line 19); Graph ids are scoped to the owning Map (ADR 0040). Reuse was rejected — two Maps needing the same narrative duplicate it, and later edits are independent (ADR 0040 "Why ownership follows authoring"). Graphs are the Map's only connection structure; do not add a parallel `edges` array (editing-and-persistence.md line 19). Gap: the docs do not say what an interactive UI does beyond these rules (e.g. whether deletion needs confirmation).

**Q6. Remove from Map (Open Resource)**
What it changes — one Edit, undoable as one: removes the Resource's membership and rect in this Map; removes every incident Edge in all of this Map's Graphs in the same Edit (CONTEXT.md "Graph", "Placement"; ADR 0040); and because it was Open, "giving back the room it held" (CONTEXT.md "Remove from Map") — i.e. the negated displacement applied to Resources currently clear of it, by the memoryless rule (ADR 0084 via AGENTS.md).
What it leaves alone: the Resource in the Space, with its content and kind; its membership, position and Edges in the second Map (ADR 0040: it does "not affect another Layout"); Graphs that become empty — they remain until explicitly deleted (CONTEXT.md; ADR 0040); the Active Graph. Deleting the Resource from the Space is a different operation; it cascades Remove from Map in every Map (ADR 0040).

**Q7. Open of S**
Rule: growth = `openSize - COLLAPSED_RESOURCE_SIZE`, floored at zero per axis; each neighbour moves on at most one axis, decided against S's collapsed rect (ADR 0093; ADR 0084; AGENTS.md; CONTEXT.md "Placement").
- A: right of S's collapsed right edge → moves right by the width growth only; being 40 units lower is irrelevant.
- B: directly below; not at or past the right edge but at or past the collapsed bottom → moves down by the height growth only.
- C: below-right; at or past the right edge → width growth only, moves right only, does not move down.
- D: overlaps the collapsed rect → does not move.
"At or past" means touching counts as clear (ADR 0093). When recorded: the new positions are written into the Map by the Open Edit itself, once; there is no per-render derivation; a drawn position is an authored one (ADR 0084; ADR 0093; CONTEXT.md). One undo reverses all of them.
Why not C both ways: one axis suffices to stay clear. Independent per-axis thresholds were rejected — they leave the reported jump (a Resource beside S but 48 units lower was pulled up 441 units on Close) and make the set selected at Open differ from the set selected at Close. Measuring against the Open rect changes the set between Open, Resize and Close, breaking the round trip. Accepted cost: Open no longer scales a grid uniformly. "Do not restore independent per-axis moves" (AGENTS.md; ADR 0093).

**Q8. Close after the author moved R**
R is treated like any other neighbour currently clear of S's collapsed rect: beside S (at or past the right edge) it gets the negated width growth and moves left; below S it moves up by the height growth. Close reads the Map as it is at that moment and reclaims from every Resource currently clear of S, "including ones the author moved there while it was open" (ADR 0084; ADR 0093; CONTEXT.md "Placement"). If R was dropped past the collapsed edge inside the Open S, Close carries it back inside, and a reopen skips it (ADR 0093 "Consequences"). Do not accept the reviewer's suggestion: Open and Close are deliberately memoryless, and AGENTS.md says "do not answer it by recording which Resources a particular Open pushed" (AGENTS.md ADR 0084 entry; CONTEXT.md). The Open/Close round trip rests on growth being nonnegative (the floor), so `displace(displace(p,c,g),c,-g) = p` (ADR 0093). Reason for memoryless: the docs' reason is ADR 0093's — the set Close reads must equal the set Open reads; the jump was fixed by narrowing the set, not by adding memory (ADR 0093 "The memoryless Close was not the defect and is not revisited").

**Q9. Switching the Active Graph**
Is it an Edit? No: "Activating is not itself an edit — it touches no Resource and no Graph" (CONTEXT.md "Active Graph"); "Changing it is a deliberate act, never a side effect of drawing or reading." Canvas: activation is emphasis, not filtering, at all times, not only while presenting (rendering.md line 56); the Map overview still draws every Graph the Map owns, with the Active Graph emphasised; there is one Active Graph in the current Map, not a selection plus an emphasis (rendering.md line 56; ADR 0040/0041). New Edges join the Active Graph (CONTEXT.md). Persistence: nothing is persisted at the moment of switching; the Active Graph "may become the authored selection when an Edit records the surrounding Map" (CONTEXT.md), so the persisted `activeGraph` changes only on a later successful Edit (compare editing-and-persistence.md line 16 for `defaultMap`). Navigation owns the transient state (AGENTS.md `app` entry).

**Q10. Read-only grid view with its own URL**
No, not as asked. ADR 0079 removed Computed Views and the union Space View from the v1 domain, persisted selections, URLs and registry; obsolete identities are invalid input and their URLs are not found. Only authored Maps are selectable and addressable canvas contexts (AGENTS.md; ADR 0079); product URLs exist only for Space, Resource, Graph and Map (AGENTS.md ADR 0069). Automatic strategies, including the grid, are non-addressable capabilities; none draws the canvas (CONTEXT.md; ADR 0086).
Why it was removed: keeping it "hidden for later" would preserve most of the complexity being removed — its IDs, schema cases, URL semantics, conversion path and renderer resolution (ADR 0079). Selecting a strategy at render time computes an arrangement nobody authored (ADR 0086). V1 "deliberately loses the Computed View that flattened Graphs across Layouts" (ADR 0079).
What the architecture offers instead: authors add Resources to a Map via the Resources View / Add to Map; a planned Auto-arrange Edit (`gridStrategy`) can rewrite an authored Map's positions — once built, that yields a curated Map with a real URL, and read-only viewing is a UI concern. Not built yet. The Resources View lists only the Space's Resources absent from the selected Map (CONTEXT.md). I found no doc specifying a read-only mode for Maps.

## Contradictions and dead ends
- Vocabulary drift: ADRs 0014, 0040, 0041, 0079, 0086 and 0093 use retired words (Layout, Card, Thing, Route, Diagram, Computed View); AGENTS.md and CONTEXT.md use Map, Resource and Graph. AGENTS.md says "Tickets 01–04 built" for ADR 0079 while ADR 0079's own text still says Layout, so ADR bodies cannot be read as current wording. Some of those ADRs' "Refined by" lines point at later ADRs I did not read (0085, 0087, 0101).
- Planned versus built: CONTEXT.md says Auto-arrange is "planned and not yet built" and ADR 0086 describes the future work. CONTEXT.md says "Two [strategies] exist — a grid and the positioned strategy" while ADR 0086 says `gridStrategy` is unused — compatible but could mislead.
- ADR 0093 "Refines 0084": CONTEXT.md/AGENTS.md describe the combined rule well; ADR 0093 itself uses Thing/Diagram, and its "Rejected" section is the only place the independent-axes alternative is explained.
- Q1 elkjs lint zone: AGENTS.md says the lint zone "names elkjs ... which is a dependency of no package", while ADR 0086 says elkjs comes back "attached to an Edit". Reconcilable — the ban is on render-time engines, so the zone would need re-siting.
- Q5: no doc specifies confirmation/UX for deleting a Graph, or whether deleting a Graph also clears `activeGraph` when the Graph was only the fallback.
- Q3: "mapless ordinary Space can only be referenced by the very Edit that initializes it" (AGENTS.md) is slightly in tension with "listing does not initialize" — consistent, since listing is not a reference.
- Dead ends: did not open `docs/agents/rendering.md` beyond one section, since it is heavily about handles and React Flow. The scoped docs sent me mostly to ADRs and CONTEXT.md, which had to be read in full to answer Q7 and Q10. AGENTS.md was the only doc that routed to the right place quickly.
- Q1 "what it changes": the exact write path (e.g. which function a new Auto-arrange Edit goes through) is not documented; did not look in `packages/**`.

## Confidence
- Q1: medium-high (where/what/must-not are clear; edit-seam details undocumented; unbuilt)
- Q2: high (explicit "don't introduce" statements, ADR 0005 via ADR 0014 and editing-and-persistence.md)
- Q3: high
- Q4: high
- Q5: medium-high (active-Graph deletion and last-Graph rules explicit in ADR 0040 and CONTEXT.md; UX/confirmation not addressed; ADR text uses Route/Layout)
- Q6: high
- Q7: high
- Q8: high
- Q9: high
- Q10: medium-high (rejection and reasons explicit; what a read-only Space-wide glance would look like is only inferable)
