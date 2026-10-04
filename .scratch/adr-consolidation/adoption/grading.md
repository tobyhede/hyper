# Adopted-route readers: grading of P and Q

## Method

Two answer sets were graded against the fixed rubric in `.scratch/adr-consolidation/pilot/questions.md` (Must state, Must not contradict, no rejected behaviour introduced, source reason where a question asks why), applying the standard from the "How errors were treated" section of `.scratch/adr-consolidation/pilot/grading.md`: a missing Must-state item or a contradiction of a live rule the question preserves fails the question; a peripheral imprecision that touches no graded rule is a finding. P is `.scratch/adr-consolidation/adoption/readers/adopted-1.md` and Q is `adopted-2.md`; only their Answers sections were graded. Disputed claims were checked against `docs/agents/maps-and-graphs.md` and `.scratch/adr-consolidation/pilot/inventory.md`. Four resolutions made after the questions were fixed were applied: D12 (undo is not built in V1; asserting a working undo fails, saying it is unbuilt or that a future undo reverses an Edit whole is fine); G1 (removing an Open Resource Closes it in the same Edit, reclaiming room by the memoryless rule, then removes it; removal itself never displaces); D16 with D21 (ADR 0116: every Edit through the canvas's Map records it as `defaultMap`, Add Map included, and writes its resolved `activeGraph`; an Edit through a Map inside an Open Space Resource does neither for the target Space; choosing a Map records nothing); and PR #336 (the last Map and last Graph are not offered for deletion and there is no refusal code, so omitting or denying `space-must-keep-map` / `map-must-keep-graph` is not a failure). Self-declared inferences were graded as claims. The grader knew both sets came from the adopted route (`AGENTS.md` pointing to the Map and Graph contract), so grading is independent of authorship but not blind to route.

## Summary matrix

| Reader | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **10/10** |
| Q | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **10/10** |

No question failed for either reader. D12 sensitivity is moot: neither reader asserts a working undo; both say undo is not built (P Q1, Q Q1 and Q7).

## Per-question notes

No FAIL to report. Notable findings follow.

### Q1

- Both state every Must-state item: explicit Edit over an existing Map, rewrites that Map's positions, never at render and never a selectable context, not built. Both reject drop-point seeding (R7) and Map creation (R6), and treat no strategy as privileged (R3).
- Both give the D12 position the resolution accepts: undo is not built (P cites "§6 Undo is not built"; Q says the Edit is reversed only by another Edit).
- P correctly declines to choose a strategy ("nothing says the command must use it"), which keeps clear of Ambiguity 4.

### Q2

- Both: no separate type, geometry filled into the given shape, and the A1 reason (every consumer wants positions; a translation step at a thin seam). Neither justifies the answer by elkjs being present (A1, O4).

### Q3

- Both state every Must-state item, including the no-authored-basis reason (R16, A9), and every expected-answer item beyond it (R17, R19, R20).

### Q4

- Both state the empty Map with one empty Active Graph, created and selected in one Edit; existing Resources not added; last Map not deletable with the durable-default reason (R12).
- Both state the D16/D21 resolution precisely: Add Map records the new Map as `defaultMap` and writes its resolved `activeGraph`.
- Both describe the post-#336 behaviour (not offered, planner answers unchanged, no refusal code), which is correct.
- Both add the default-Map-deletion fallback (selected survivor, else first); the contract lists it as treatment without an ADR, so it is accurate.

### Q5

- Both pass on all four Must-state items, including the dangling-Edge-or-every-other-Map reason (A10).
- Finding (Q): "Deleting the only Graph is refused by design" is loose wording, since there is no refusal; the same sentence then says correctly that Delete Graph is not offered and there is no refusal code. Touches no graded rule.
- Finding (Q): Q declares as an inference that "first survivor" means first in authored order; that is the expected answer, hedged and consistent.

### Q6

- Both state the G1 resolution exactly: Closed first in the same Edit, reclaiming by the memoryless rule, then removed; removal itself never displaces (R35).
- Both state membership and position leaving this Map only, incident Edges removed from that Map's Graphs in the same Edit, emptied Graphs remaining, and the Resource staying in the Space and the second Map.
- Finding (P): its hedged inference that the remembered Open Size goes with the Map entry is consistent with R37 (Open Size is authored on the Map). Q states the same as fact, which is also consistent.
- Neither states the afterwards items (re-add arrives Closed with no Edges, R33); not Must-state.

### Q7

- Both get A right, B down, C right only, D unmoved, the positions written by the Open Edit (R38), "at or past" the collapsed edges (R40), the zero floor (R39), and all three one-axis reasons.
- P's "as one unit (R38, R43)" makes no undo claim; Q explicitly says undo is not built.

### Q8

- Both: R moves back, Close is memoryless, and the push-set suggestion is rejected with both the stale-state and the history-dependence reasons (A14). Both also give the R41/R42 corner cases. Neither contradicts R44.

### Q9

- Both state every Must-state item, including the first-Graph fallback (as a read, never a write), and add the ADR 0116 carve-out for a Map drawn inside an Open Space Resource correctly.
- Neither states that intake rejects a dangling or foreign `activeGraph` (R28); not Must-state, and not contradicted.

### Q10

- Both: not buildable because only a Map is selectable and addressable; automatic strategies are non-addressable; the alternative is Auto-arrange as an Edit over an existing Map (unbuilt); the dormant-complexity reason (A4).
- Finding (Q): Auto-arrange "reusing the grid strategy" invents which strategy Auto-arrange uses. Ambiguity 4 records such an invention as a finding, not a failure, and it does not contradict R6. It does sit awkwardly beside R3, which keeps `gridStrategy` "not because a grid is what returns". P avoids this.
- Finding (Q): its suggestion of a whole-Space Map via Add Map plus Add to Map is self-declared as an inference and matches the expected answer.
