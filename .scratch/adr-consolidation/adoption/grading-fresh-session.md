# Adopted-route fresh-session readers: grading of R and S

## Method

Two answer sets were graded against the fixed rubric in `.scratch/adr-consolidation/pilot/questions.md` (all Must-state items present in any wording, no Must-not-contradict item contradicted, no rejected behaviour introduced, and the source reason where a question asks why), applying the standard of "How errors were treated" in `.scratch/adr-consolidation/pilot/grading.md` and of `.scratch/adr-consolidation/adoption/grading.md`: a missing Must-state item or a contradiction of a live rule the question preserves fails the question; a peripheral imprecision touching no graded rule is a finding; self-declared inferences count as claims, failing only where they contradict a live rule. R is `.scratch/adr-consolidation/adoption/readers/adopted-3.md` and S is `adopted-4.md`; only their Answers sections were graded. Disputed claims were checked against `.scratch/adr-consolidation/pilot/inventory.md`, `docs/agents/maps-and-graphs.md` and the ADRs (0093 Consequences, 0116). The resolutions in force were applied: D12 (undo is not built in V1; asserting a working undo fails), G1 (removing an Open Resource Closes it in the same Edit by the memoryless reclaim, then removes it; removing a Closed Resource moves nothing; removal itself never displaces), D16 with D21 (ADR 0116: every Edit through the canvas's Map records it as `defaultMap`, Add Map included, and writes its resolved `activeGraph`; an Edit through a Map drawn in an Open Space Resource does neither for the target Space, except that Add Graph activates the Graph it creates; choosing a Map records nothing), and PR #336 (the last Map and last Graph are not offered for deletion and there is no refusal code). The grader knew both sets came from the adopted route (fresh `claude -p` sessions whose `AGENTS.md` points to the Map and Graph contract), so grading is independent of authorship but not blind to route.

## Summary matrix

| Reader | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL | **9/10** |
| S | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **10/10** |

D12 sensitivity is moot: both readers say undo does not exist and the Edit is reversed only by another Edit (R Q1, S Q1). Sensitivity for R Q10: if "only authored Maps are selectable and addressable" is read as entailing the separate Must-state item "automatic strategies are not addressable", R scores 10/10. Every earlier grading checked that item separately, so it is graded as missing here.

## FAIL

### R Q10: missing Must-state item "Automatic strategies are not addressable"

- R states that only authored Maps are the selectable and addressable way to see a Space, that Computed View and Space View were removed from the domain, selections, URLs and registry, that obsolete URLs are not found, the dormant-complexity reason (A4), the lost cross-Map flatten, and Auto-arrange as an unbuilt explicit Edit over a Map (R6).
- It never says that automatic strategies are non-addressable capabilities or that none draws the canvas (R3, R2). The only strategy mention is that Auto-arrange "could place a Map's Resources by an automatic strategy". The pilot and adoption gradings recorded this item separately for every reader (W, X, Y, Z, P, Q), so it is not taken as implied by the Map-only statement.
- R does say elsewhere (Q1) that only the positioned strategy runs while the canvas draws, but each question is graded on its own answer.
- Nothing in R's Q10 contradicts a live rule: its open question about a Resources View URL is hedged and defers to "its own decision" under R8.

## Notable findings (no grade effect)

### Q1

- Both state every Must-state item (explicit Edit over an existing Map, rewrites that Map's positions in one Edit, never at render and never a selectable context, not built) and reject Map creation (R6), drop-point seeding (R7) and a privileged strategy (R3). Both name the two open questions in the delivery ticket (provenance, confirmation), which keeps clear of Ambiguity 4.

### Q2

- Both: no separate type, geometry filled into the given `LayoutStrategyGraph`, and the A1 reason (every consumer wants positions; a translation step at a thin seam). S adds R4 (positions only, so nothing extra to hold). Neither leans on elkjs being present.

### Q3

- Both state listing never initializes (R18), the atomic first-working-read Edit with `Map 1`, Active `Graph 1` and `defaultMap` committed before use (R16, R19), Resources not placed with the no-authored-basis reason (A9), and R17.
- Finding (S): its "Why" bullet gives A6 (a Map makes a Space usable; a read-only draft rejected), which answers why first open writes rather than why Resources are not placed. The no-basis reason is still stated in the preceding bullet ("because nothing authored says where they go"), so the Must-state item is present.

### Q4

- Both state the empty Map with one empty Active Graph, created and selected in one Edit; no existing Resources added; the last Map not deletable with the durable-default reason (R12, R9); and the post-#336 behaviour (not offered, `planContextDeletion` unchanged, no refusal code). Both give the D16/D21 resolution precisely (Add Map records `defaultMap` and writes the resolved `activeGraph`).

### Q5

- Both pass all four Must-state items, including the dangling-Edge-or-every-other-Map reason (A10), and preserve R24, R25 and R13.
- Finding (R): a "Persistence" bullet placed under deletion says "activation is navigation, not an Edit. It is not durable until a later Edit in that Map records it". As a statement about switching the Active Graph (R29, A18) it is right; read as describing the activation that follows deleting the Active Graph, it would be wrong, since Delete Graph is itself an Edit that writes the resolved `activeGraph` on the canvas Map (R10, ADR 0116). The placement is ambiguous rather than a contradiction, and it touches no Q5 graded rule.
- R correctly adds the ADR 0116 exception that Add Graph activates its Graph inside an Open Space Resource too.

### Q6

- Both state the G1 resolution: Closed first in the same Edit, reclaiming by the memoryless rule, then removed; removal itself never displaces (R35, R41). Both state membership and position leaving this Map only (R31), incident Edges removed in that Map's Graphs in the same Edit (R34), emptied Graphs remaining, and the Resource staying in the Space and the second Map (R32).
- Both declare as an inference that the remembered Open Size goes with the removed placement entry; hedged and consistent with R37.
- Neither states the afterwards items (re-add arrives Closed, no Edges restored, R33); not Must-state.

### Q7

- Both: A right only, B down, C right only, D unmoved, positions written by the Open Edit (R38), "at or past" the collapsed edges (R40), the zero floor (R39). R gives "one axis is enough" and A15; S gives "one axis is enough" and the beside-but-lower jump. Neither claims undo.

### Q8

- Both: R moves back, Close is memoryless and reads current positions (R41), and the push-set suggestion is rejected with both the stale-state and history-dependence reasons (A14). Both add the drop-inside-the-Open-rect case, which matches ADR 0093's Consequences ("Close carries it back inside the subject and a reopen skips it"); S's label "negative growth" is ADR 0093's own term. Neither contradicts R42 or R44, though neither states that S keeps its Open Size.

### Q9

- Both state every Must-state item: not an Edit, all owned Graphs drawn with only emphasis moving, new Edges join the Active Graph, persisted only by a later Edit in that Map, and the first-Graph fallback (S adds that it is a read, never a write). Neither states intake rejection of a dangling or foreign `activeGraph` (R28); not Must-state, and not contradicted.

### Q10

- S states every Must-state item, including that automatic strategies are non-addressable and never draw the canvas (R3, R2, A3), and offers Auto-arrange as an unbuilt Edit plus authoring a new Map (R11).
- Finding (S): S correctly notes the Resources View has no URL and is not a whole-Space view, and leaves a non-canvas listing as undocumented rather than resolving it.
