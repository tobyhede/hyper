# Adopted-route reader 6 (fresh session)

Route: a separate `claude -p` session (Sonnet, tools Read/Grep/Glob only) started in a detached checkout of `71019361`, so its project instructions were the adopted `AGENTS.md`. Questions, grading, earlier readings, reports, specimen, research, spec and tickets removed; `pilot/inventory.md` kept because the contract links it. Wall time: 41s (shell-measured). The report is recorded verbatim below.

## Reading log
1. `AGENTS.md` (the project instructions supplied in context), read in full, about 6,500 words. I used the "Decided" section and the "Maps and Graphs" pointer.
2. `docs/agents/maps-and-graphs.md`, read in full (R1–R44, A1–A18, accepted-not-built, provenance), about 4,300 words.
3. `.scratch/auto-arrange/issues/01-auto-arrange-a-map.md`, read in full, about 200 words.

Total: about 11,000 words. I did not open `CONTEXT.md`, the ADRs, `workflow.md` or the inventory. Every answer cites the contract's rule ids, which in turn cite ADRs.

## Answers

**Q1.**
- **Where it runs:** The command is an explicit, author-invoked Edit over the selected existing Map, not a render path. Nothing computes placement at render, because a render-time arrangement is unauthored and nothing persists it. Only the positioned strategy runs while the canvas draws (R2, ADR 0086, ADR 0079, ADR 0084).
- **Where the code lives:** Auto-arrange is to live in `graph`. That means re-siting the `elkjs` lint ban in `eslint.config.js` rather than obeying it (R6).
- **What it changes:** It rewrites that Map's positions in one atomic Edit. The result is authored like any other position (R6). It is destructive, and undo is not built, so only another Edit reverses it (§6 "Undo").
- **What it must never become:**
  - a canvas or selectable context
  - a renderer decision
  - incremental placement
  - a Map creator (R6)
  - a way to honour a drop point, because seeded or constrained optimisers reshuffled existing Resources and placed the new one arbitrarily (R7, A12)
  - a strategy that is privileged or leaks into one seam (R3)
- **Status:** Auto-arrange is **not built**. The issue is `needs-triage` and has two open questions: whether the Edit records which strategy produced the positions, and whether it asks for confirmation while undo doesn't exist (`.scratch/auto-arrange/issues/01`).
- **Strategies:** `gridStrategy` is the only automatic strategy, pure and used only by tests (R3).

**Q2.** No. R5 says there is no intermediate arranged-result type. A strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry filled in. The reviewer's value type is rejected alternative A1 (an `Arrangement` type). It adds a translation step at a seam meant to stay thin, since every consumer just wants positions, and React Flow has no layout entity either (ADR 0005, ADR 0014, ADR 0086).
- The contract also says "arrangement" is prose, not a domain term.
- R4 adds that the contract carries positions only, because a Map stores a Resource and its position and nothing else, so extra geometry has nowhere to land.
- The accepted cost of A1 is that the noun names nothing on screen.

**Q3.** No, listing must not give them one. Listing, import completion, export and reference validation read stored state and never initialize (R18). A mapless Space is valid stored state (R15, A5).
- **First open:** First working load initializes it (R16). Before returning, it persists one atomic Edit: an empty `Map 1`, its empty Active `Graph 1`, and `defaultMap`.
- **Existing Resources:** They are **not** placed, and no strategy seeds them, because nothing authored says where they go. They stay in the Resources View, and the cost accepted is that they start outside the Map (R16, A9, ADR 0079, ADR 0080).
- **Commit order:** Initialization commits before the Space becomes working. A conflict reloads and accepts a competing initialization, otherwise it retries. Any other failure stops the Space opening (R19).
- **Related cases:** Direct opening, Entering, rendering an Open Space Resource and making a link target working all go through the same one server-side boundary (R18). A Space with Maps but no default just records its first Map and creates nothing (R17).

**Q4.** One Add Map Edit creates and selects an empty Map (R11, ADRs 0079, 0040, 0041).
- The new Map has no Resources and owns one empty Graph, which is its Active Graph.
- Existing Resources are not copied in. The author adds them later, for example from the Resources View. So **no** Resources appear on the new Map.
- Because every Edit through the canvas's Map records that Map as `defaultMap`, Add Map included, the new Map also becomes `defaultMap` and has its resolved `activeGraph` written explicitly (R10).
- The last Map cannot be deleted, because a working Space must keep a durable default (R12). Delete Map isn't offered while one Map remains, and `planContextDeletion` answers "unchanged" when no survivor exists. There is no refusal code. When Maps are deleted, any Space Resource selecting them is relocated atomically (R13, ADR 0091).

**Q5.**
- **Deleting the Active Graph:** The first surviving Graph becomes active, and survivors keep their order (R27, R25).
- **Deleting the only Graph:** The last Graph of a Map cannot be deleted (R27). Delete Graph isn't offered, and `planContextDeletion` answers "unchanged". There is no refusal code. A Map owns a non-empty ordered collection of Graphs (R22).
- **Activation:** Activating a Graph is navigation, not an Edit. It is emphasis, not filtering, since every owned Graph is still drawn. It isn't durable until a later Edit in that Map records it (R29, A18). Add Graph appends an empty Graph and activates it, in one Edit (R26).
- **Reuse by a second Map:** No. Each Graph belongs to exactly one Map and is authored only through it (R22). Sharing was rejected as A10, because removing a Resource from one Map would leave a dangling Edge or change the other Maps. Two Maps telling one narrative hold two Graphs that diverge independently. Graph ids are unique across the whole Space (R24, ADR 0108).

**Q6.** Remove from Map is one Edit (R34, R35).
- **What it changes:**
  - Because the Resource is Open, it is **Closed first in the same Edit**. Close's memoryless reclaim gives back the room it held, moving the neighbours now clear of it (R35, R41).
  - It then removes the Resource's membership and position from that Map (R31).
  - It removes every incident Edge in that Map's Graphs, in both Graphs it touched.
- **What it leaves alone:**
  - The Resource itself stays in the Space.
  - Its placement, Open state and size in the second Map are untouched, because placement belongs to the Map (R32).
  - Emptied Graphs remain, so no Graph is deleted.
  - The removal step itself displaces nothing. Only Open, Close and Resize displace (R35).
- **Remembered Open Size:** The docs don't say explicitly whether it is dropped with the position. Open Size is authored on the Map and stored per Map (R37, R44). The docs only say it survives Close.

**Q7.** The rule is R40 (ADR 0093). Growth is Open Size minus the fixed Closed Size, floored at zero per axis (R39). Each neighbour is judged once, against S's collapsed rect.
- **A:** It moves **right** by the width growth only. It is at or past the collapsed right edge, so x is checked first, and its 40-unit vertical offset doesn't matter.
- **B:** It moves **down** by the height growth only. It is not at or past the right edge, but it is at or past the collapsed bottom edge.
- **C:** It moves **right** by the width growth only. It is at or past the right edge, so x wins and it does not move down. Moving C on both axes is not needed: one axis is enough to stay clear, and x-first stops a Resource beside the subject moving vertically.
- **D:** It does not move. It is neither at or past the right edge nor the bottom edge of the collapsed rect. The docs give no further rule for overlapped Resources.
- **When recorded:** The positions are written into the Map by the same Open Edit that causes the displacement, once. It is one atomic unit, with no render-time derivation (R38, R43). Touching counts as clear (R40).
- **Why one axis:** C moves right only, not right and down, for the one-axis reason above. The cost accepted is that a grid no longer scales uniformly (A15, A16).

**Q8.** R keeps its dropped position. Between Edits a drawn position is the authored one, and a drop lands where it was dropped with no conversion (R38).
- **On Close:** Close is memoryless and applies the negation of the growth to every Resource currently clear of S, including ones moved there while S was Open. R, being in the cleared space, is reclaimed like any other (R41). The one exception is the negative-growth asymmetry (R42). If R was dropped past the collapsed edge but inside the Open S rect, so it was never pushed, Close carries it along by the growth amount and a reopen skips it. R's "pushed" status isn't tracked.
- **If S has been dragged past the neighbours its Open displaced:** Close reclaims from none of them (R41).
- **The reviewer's suggestion:** No. Recording which Resources an Open pushed is rejected alternative A14, with "Never record" stated in R41. Per-open state goes stale, and identical Maps would behave differently. The accepted cost is that Close reclaims from Resources moved into the room (ADRs 0084, 0093).

**Q9.** No, it isn't an Edit. Activating a Graph is navigation (R29, A18, ADR 0028).
- **Canvas:** The Active Graph is drawn emphasised, and every owned Graph is still drawn (R29). It is emphasis, not filtering.
- **New Edges:** They join the Active Graph (Orientation section of the doc).
- **What is persisted:** Nothing is persisted at switch time. It neither submits nor dirties, and there is no second "selected Graph".
- **When it persists:** The activation becomes durable only when a later Edit in that Map writes it. Edits through the canvas's Map write the resolved `activeGraph` explicitly (R10). The cost accepted is that an activation isn't durable until then (A18).
- **Fallback read:** A Map's `activeGraph` is optional. If it is absent, the first Graph opens. That fallback is a read and never a write (R28).
- **Presenting:** An empty Graph may be active but can't be presented until it has an Edge (R30).

**Q10.** No, not as asked.
- **Why it is removed:** A Map is the only canvas context, and the only thing selectable or addressable at `/spaces/:spaceId/maps/:mapId`. Computed and Space Views are removed, with no cross-Map flatten and no dormant compatibility. Obsolete identities are invalid input and their URLs are not found (R8, ADR 0079, ADR 0069). An automatic strategy is also not addressable and never draws the canvas (R3), so a computed view of a Space has no URL to live at.
- **Why the shape was dropped:** Keeping Computed Views dormant was rejected as A4, because it keeps most of the removed complexity. V1 accepts losing the cross-Map flatten. Render-time placement is also unauthored and not persisted (R2, A3).
- **What the architecture offers instead:**
  - Authors build a Map and add Resources to it, for example from the Resources View (R11, R16).
  - The Resources View is where unplaced Resources live.
  - A future author-invoked Auto-arrange could tidy a Map, but it is not built (R6).

## Notes
- **Contradictions:** None found. The contract's own caveat is that older ADRs use retired names (Layout/Diagram → Map, Card/Thing → Resource, Route → Graph, Expanded → Open). Every ADR link therefore points to a file with an old-name slug, such as `0040-layouts-own-card-membership-and-routes.md`. I did not open any of them.
- **Dead links:** The contract links to `.scratch/adr-consolidation/pilot/inventory.md` and `pilot/REPORT.md`. The git status shows the `.scratch/adr-consolidation/pilot/` files as deleted in this worktree, so those links are likely dead. I did not try to open them.
- **Gaps in the docs:**
  - D (an overlapped Resource, Q7) isn't addressed explicitly. My answer derives from R40's "otherwise it does not move".
  - Whether Remove from Map discards the Resource's remembered Open Size (Q6) isn't stated.
  - Whether a new Map's Add Map Edit records `defaultMap` for an empty canvas is covered only by R10's "Add Map included".
- **Background knowledge:** None used beyond reading the rules. The Q7 geometry is my application of R39/R40.
- **Scope:** I read only `AGENTS.md`, the Maps and Graphs contract and one issue, all of which the question set is plainly built around. Other docs, especially `CONTEXT.md`, might add nuance.
