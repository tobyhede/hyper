# Map and Graph pilot: grading of readers W, X, Y and Z

Graded against `questions.md` (rubric, Must state, Must not contradict, Ambiguities 1–5), with `inventory.md` and the ADRs under `docs/adr/` used to check disputed claims. Readers are graded on content only.

This grading is frozen evidence for the snapshots in `REPORT.md`. The refusal codes `space-must-keep-map` and `map-must-keep-graph` it records (Q4, Q5) existed then; PR #336 later removed both, and the last Map and last Graph are now simply not offered for deletion. The grades were not revisited.

## How errors were treated

- **A missing Must-state item fails the question.** Where a "why" is required, a restatement of the rule or an appeal to authority ("AGENTS.md says don't") does not count as the reason.
- **A wrong extra claim fails the question when it contradicts a live rule the question preserves, or asserts a resolution of an open ambiguity.** That covers asserting that undo works (Ambiguity 1, D12) and contradicting R6 or R24.
- **A peripheral imprecision is recorded as a finding and does not fail the question.** This means one that touches no graded rule.
- **D12 (undo).** Ambiguity 1 fails "an answer asserting that a working undo command reverses it". "Undoable like any other", "undo reverses all of it together" and "one undo reverses all of them" were treated as that assertion. A sensitivity count without that rule is given below the matrix.
- **G1 (room given back on removal).** Stating the reclaim was accepted, with or without naming G1. No reader said the neighbours stay displaced.
- **D16 (recording the default Map).** No reader asserted "always" or "never", and none treated selection as an Edit.

## Summary matrix

| Reader | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **10/10** |
| X | FAIL | PASS | PASS | FAIL | FAIL | FAIL | PASS | FAIL | FAIL | FAIL | **3/10** |
| Y | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **10/10** |
| Z | FAIL | FAIL | FAIL | PASS | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | **2/10** |

Sensitivity to D12: some questions fail only because they assert a working undo. Those are X Q6, and Z Q1, Q6 and Q7. If the D12 assertions were recorded as findings and not as failures, X would score 4/10 and Z 5/10. W and Y are unaffected.

---

## Reader W: 10/10

**Q1 PASS.**
- Must-state items are all present:
  - It is an explicit Edit over an existing Map, by a named tool.
  - It rewrites positions in one Edit.
  - It never runs at render and is not a canvas or selectable context.
  - It is not built, and no delivery issue exists.
- Negatives preserved:
  - It creates no Maps (R6).
  - No strategy is privileged (R3).
  - It never honours a drop point (R7).
  - The ban is re-sited, not obeyed.
- Undo: "claim no Edit can be undone until decided". This is acceptable under Ambiguity 1, because it names D12 and asserts no working undo.
- It names G6 (provenance) as undecided.

**Q2 PASS.**
- Verdict: it rejects the proposal.
- It gives the same shape with geometry filled, and no intermediate type.
- Reasons given:
  - Every consumer wants positions.
  - It adds a translation step at a thin seam.
  - React Flow has no layout entity.
- Negatives preserved:
  - No ports or routed sections (R4), because a Map stores only a Resource and its position.
  - "Arrangement" is prose, not a domain term.
  - It does not rely on elkjs being present.

**Q3 PASS.**
- Listing, import, export and validation never initialize.
- The trigger is the first working load: open, Enter, an Open Space Resource, or a link.
- That load atomically persists `Map 1`, the empty Active `Graph 1` and `defaultMap`.
- Existing Resources are not placed, because "nothing authored says where they go".
- Negatives preserved:
  - Commit before use, conflict reload, other failure blocks (R19).
  - No newness inference or marker (R20).
  - A Space with Maps but no default records its first Map (R17).
  - A6 is named.

**Q4 PASS.**
- One Edit creates and selects an empty Map with one empty Active Graph.
- Existing Resources are not copied.
- `space-must-keep-map`, with the "durable default" reason.
- It names D16 as unspecified, which is acceptable.
- Minor omission (not graded): choosing a Map is navigation is not restated here. It is present in Q9 via R10.

**Q5 PASS.**
- Add appends and activates.
- The first survivor becomes active, and order is preserved.
- `map-must-keep-graph`.
- Graphs are never shared, with the dangling-Edge-or-change-every-Map reason and the divergence cost.
- Space-unique ids, with the A11 reason.
- Space Resources that selected the Graph are relocated.

**Q6 PASS.**
- Membership and position are one fact, removed from this Map only.
- Incident Edges in both of this Map's Graphs are removed, in one Edit.
- Emptied Graphs remain.
- The Resource stays in the Space and in the second Map.
- Room is given back, with G1 named.
- The Space-delete contrast is given.
- Finding (not failing): the reader's own inference that the Open Size record leaves with the membership is flagged as inference, so it is acceptable.
- Not stated, and not Must-state: re-add arrives Closed with no Edges restored; the canvas invents no position.

**Q7 PASS.**
- A moves right, B moves down, C moves right only, D does not move.
- Growth is floored.
- "At or past" the collapsed edges.
- Written by the Open Edit, never at render.
- All three one-axis reasons, plus the grid cost.

**Q8 PASS.**
- R moves back.
- Close is memoryless.
- The push set is rejected, with both the stale-state and the identical-Maps reasons.
- Round trip for nonnegative growth.
- The "reclaims from none" edge case.
- The drop-inside asymmetry, which inventory R42 confirms.
- Not restated, and not Must-state: Open Size survives Close (R44).

**Q9 PASS.**
- It is not an Edit, and it is navigation.
- All Graphs are drawn, emphasis only, and there is no second selected Graph.
- New Edges join the Active Graph.
- It is persisted by a later Edit in that Map.
- It falls back to the first Graph as a read.
- Accepted cost: not durable until then.
- Intake rejection is not stated here, but W states it in Q5 (R28). It is not Must-state for Q9.

**Q10 PASS.**
- Only a Map is a canvas or addressable context.
- No Computed View, Space View or flatten.
- Obsolete URLs are not found.
- `gridStrategy` is not addressable.
- The alternatives are a Map plus Add to Map, and Auto-arrange as an unbuilt Edit.
- The dormant-complexity reason, and the lost cross-Map flatten.

---

## Reader X: 3/10

**Q1 FAIL.** Wrong claim contradicting R6:
- X quotes: "Its output must not be computed and written back as if it were the authored placement — rendering.md says of the fixture: 'don't compute them and write the result back'".
- Checked: `docs/agents/rendering.md:58` says this of the tracked fixture's hand-set positions only.
- R6 (ADR 0086, ADR 0084) says Auto-arrange does exactly that: it computes positions and writes them into the Map, where they gain authored standing.
- So the claim forbids the operation the question asks about, and contradicts X's own earlier sentence that it "rewrites the positions".

Other findings:
- Must-state items otherwise present:
  - It is an Edit over an existing authored Map.
  - It rewrites positions.
  - It is not a render path or canvas.
  - It is not built.
- "Explicit" is only implied, by "Edit".
- No drop-point negative (R7). This is not Must-state.
- The elkjs re-siting sentence is garbled ("must not be re-sited into core/graph… as a render-time engine"), but it still ends in `graph`, attached to an Edit.

**Q2 PASS (borderline).**
- It rejects the proposal.
- Contract: `LayoutStrategyGraph → LayoutStrategyGraph`, optional `x`/`y`, positions are the whole output.
- Reason given: "a separate coordinates value would also be a second thing in the position-to-canvas path". This is accepted as equivalent to the translation-step reason, together with "positions are the whole output".
- Finding: X says "I found no ADR text directly ruling" and that the refusal is inferred. ADR 0005 paragraph 3 and ADR 0014's "costs accepted" do rule on it (inventory R5), so the reader under-read the sources but reached the right answer.
- Ports and routed sections are not mentioned; there is no contradiction.

**Q3 PASS (borderline on reason).**
- Listing never initializes (ADR 0079 quote).
- The first working read atomically and durably persists an empty `Map 1`, `Graph 1` as active, and `defaultMap`.
- Existing Resources are not placed.
- Reason given: "because Map membership is authored". This is accepted as the principle-level equivalent of "no authored basis for guessing positions", though it is close to a restatement.
- Not stated (not Must-state):
  - Commit-before-use, conflict and failure handling (R19).
  - The Maps-but-no-default case (R17).
  - The no-newness-inference rule (R20).
- No contradictions. The extra claims about aggregates and baseline references check out against `AGENTS.md`'s 0079 entry.

**Q4 FAIL.** Missing Must-state item: "The last Map cannot be deleted, with the default-Map reason."
- X gives "follows from the rule that a working Space always has at least one Map". That is CONTEXT's wording of the rule, not the durable-`defaultMap` reason.
- The rest is correct: an empty Map with one empty Active Graph, created and selected in one Edit, and no existing Resources.
- The `'map-name'` continuation is extra and correct.

**Q5 FAIL.** Missing Must-state items:
- "Append and activate on add". X has "new Graphs append" and no activation.
- "Graphs are never shared, with the dangling-Edge-or-cross-Map-change reason". X gives only "every Edge endpoint must be a Resource in that Map", and no reason for refusing sharing.
- "The first survivor becomes active": X hedges, "the fallback is the Map's first Graph (or its named one)". The "or its named one" cannot apply, because the named Graph was just deleted. X admits "I am inferring".

Correct points:
- Last Graph not deletable.
- Survivor order kept.
- No Space-level `graphs` key.
- The colour and arrow-head detail.
- Graph id uniqueness is not mentioned; there is no contradiction.

**Q6 FAIL.** It asserts a D12 resolution: "Undo reverses all of it together."
- V1 has no undo (ADR 0048, ADR 0074, `DeleteConfirmation.tsx`, inventory D12). This asserts a working undo.

The Must-state items are otherwise present:
- Membership and rect are removed in this Map.
- Incident Edges in both Graphs are removed. One Edit is implied by the room-reclaim sentence, "in the same Edit".
- The Graphs remain.
- The Resource is untouched in the Space and the second Map.
- Room given back is stated.

**Q7 PASS.**
- A moves right, B moves down, C moves right only, D does not move.
- Growth is floored.
- "At or past" the collapsed edges.
- Written by the Open Edit; Close applies the negation and Resize the difference.
- Reason: the beside-but-lower jump on Close, "do not restore independent per-axis moves".
- Notes:
  - X says "I did not read the ADR 0093 body". The collapsed-rect pairing reason and the grid cost are absent, but one reason suffices.
  - No undo claim appears in this answer.

**Q8 FAIL.**
- Missing Must-state item: "Reject recording the push set, with at least the stale-state or history-dependence reason."
  - X rejects it only by citing `AGENTS.md` ("do not answer it by recording…") and restating "Open and Close remember nothing".
  - Neither per-Open state going stale nor identical Maps behaving differently is given.
- It also asserts a D12 resolution: "One Edit may change several Resources, and undo reverses all of them."
- Correct points:
  - R moves back.
  - Close is memoryless.
  - The "reclaims from none" case.
  - The nonnegative round trip.

**Q9 FAIL.** Missing Must-state item: "The fallback is the first Graph."
- X mentions `activeGraph ?? graphs[0]` only as Space Resource `link` behaviour, and says it could not find the persisted field.

Correct points:
- It is not an Edit.
- Emphasis, not filtering, with all Graphs drawn.
- New Edges join the Active Graph.
- Nothing persisted at switch; recorded by a later Edit ("may become the authored selection").
- One Active Graph, no second selection.
- Intake rejection (R28) is not mentioned. It is not Must-state.

**Q10 FAIL.** Missing Must-state item: "The dormant-complexity reason."
- X's reason is "a Map-less view of a Space's Resources gave two ways to draw the canvas". That is not the source reason, and X says it did not read ADR 0079's rejection text.

Correct points:
- Only a Map is a canvas or addressable context.
- Obsolete URLs are not found.
- Strategies are non-addressable.
- The alternative is a Map plus Auto-arrange, unbuilt.
- The Resources View is correctly described as Resources absent from the selected Map.

---

## Reader Y: 10/10

**Q1 PASS.**
- It is an explicit Edit over an existing Map, by a named tool.
- It rewrites positions in one Edit, and the result is authored.
- It creates no Map.
- It never runs at render and is not a selectable context.
- It is not built, and there is no delivery issue.
- Negatives preserved:
  - No drop-point seeding (R7, with its source).
  - No privileged strategy (R3).
- D12 is named, and no working undo is claimed.
- G6 is named as undecided.

**Q2 PASS.**
- It rejects the proposal.
- Same shape with geometry filled.
- Reasons: every consumer wants positions, the translation step, and React Flow has no layout entity.
- Positions only, no ports or routed sections (R4), with the reason.
- "Arrangement" is prose.

**Q3 PASS.**
- Listing, import, export and validation never initialize.
- The first working load, on all four triggers, persists `Map 1`, the Active `Graph 1` and `defaultMap` in one atomic Edit, before returning.
- Existing Resources are not placed, because "nothing authored says where they go".
- Also covered:
  - R19 handling.
  - No newness inference or marker (R20).
  - The Maps-but-no-default case (R17).
  - A6's cost.

**Q4 PASS.**
- One Edit creates and selects an empty Map with one empty Active Graph.
- Existing Resources are not copied.
- `space-must-keep-map`, with the durable-default reason.
- D16 is named as not covered, which is acceptable.
- "Choosing a Map is navigation" is not restated. It is not Must-state.

**Q5 PASS.**
- Add appends and activates.
- Survivor order is kept.
- The first survivor becomes active.
- `map-must-keep-graph`.
- Graphs are never shared, with the dangling-Edge-or-every-Map reason and the divergence cost.
- Space-unique ids (R24, ADR 0108).
- Space Resources that selected the Graph are relocated (R13).
- Reordering is accepted but unbuilt.

**Q6 PASS.**
- Membership, position and incident Edges in this Map's Graphs are removed in one Edit.
- Room is given back by Close's negation, with G1 named.
- Emptied Graphs remain.
- The Resource stays in the Space, and its state in the second Map is untouched.
- The Space-delete contrast is given.
- Re-add behaviour is not stated. It is not Must-state.

**Q7 PASS.**
- A, B, C and D are all correct.
- Growth is floored.
- "At or past"; touching counts as clear.
- Written by the Open Edit, not at render.
- All three one-axis reasons.
- A15 and A16 are named as rejected.
- The grid cost.
- The extra cost, "a Resource below… moves down however far left it sits", was checked and is correct: ADR 0093, line 74.

**Q8 PASS.**
- R moves back.
- The edge case where S was dragged.
- Close is memoryless.
- The push set is rejected, with the stale-state and identical-Maps reasons.
- The A14 cost.
- The R42 asymmetry, checked against inventory R42.
- The nonnegative round trip.

**Q9 PASS.**
- It is not an Edit; it neither submits nor dirties.
- Emphasis, not filtering; no second selected Graph.
- New Edges join the Active Graph.
- It is persisted by a later Edit in that Map, and the cost is intended.
- It falls back to the first Graph as a read.
- Intake rejects a dangling or foreign `activeGraph`.
- Activation is never a side effect.

**Q10 PASS.**
- Only a Map is a selectable or addressable context.
- No Computed or Space Views, no flatten.
- Obsolete URLs are not found.
- Strategies are not addressable.
- The alternatives are a Map plus Add to Map, and Auto-arrange as an unbuilt Edit.
- The dormant-complexity reason, and the lost flatten.
- Finding (not failing): "the Resources View already lists a Space's Resources outside any Map (R16)" is imprecise. CONTEXT "Resources View" says it lists Resources *absent from the selected Map*, which includes Resources placed on other Maps. Read literally, "outside any Map" is wrong. It touches no graded rule.

---

## Reader Z: 2/10

**Q1 FAIL.** It asserts a D12 resolution:
- Z writes: "the Map's positions are rewritten in one Edit, undoable like any other (ADR 0086 …)".
- This repeats ADR 0086's wording as settled fact. ADR 0048, ADR 0074 and the code say V1 has no undo (inventory D12, UNRESOLVED), and Z does not name the conflict.

Otherwise the Must-state items are all present:
- It is an explicit Edit over an existing Map, by a named tool.
- It rewrites positions.
- It is not a render path, canvas or addressable context.
- It is "planned and not yet built".

Negatives preserved:
- No privileged strategy.
- No drop-point seeding, with the spike reason.
- Re-site the lint ban.

**Q2 FAIL.**
- Missing Must-state item: the reason, either "every consumer wants the positions / it adds a translation step" or "the only output is positions, which the Map's placement already holds".
  - Z justifies the rejection by authority alone: "ADR 0005's decision still binds", and editing-and-persistence.md "don't introduce one".
  - "The Resources themselves carry the positions" restates the rule.
- Weakening finding: "the unspecified area … The rule is still not to mint a coordinates-only entity or type that **persists** as an arrangement".
  - This narrows R5 to persisted types.
  - R5 and ADR 0041 forbid any intermediate arranged-result type, whether persisted or not, and say the strategy returns the same shape (inventory R5).
- Present: rejects the proposal; no type; geometry as optional fields; positions only.

**Q3 FAIL.** Missing Must-state item: "The reason: no basis for guessing positions."
- Z says the Resources "are not lost; they are added later via the Resources View", which describes what happens and gives no reason for not placing them.

Otherwise strong:
- Listing never initializes.
- An atomic Edit before returning creates `Map 1`, `Graph 1` as active and `defaultMap`.
- R19 handling.
- The Maps-but-no-default case.
- Import does not rewrite Markdown.
- Finding: the quoted ADR 0079 text uses superseded vocabulary ("Cards View"), and Z correctly translates it to the Resources View.

**Q4 PASS.**
- One Edit creates and selects an empty Map with one empty Active Graph.
- No existing Resources.
- The last Map is not deletable, because of a durable default Map.
- Choosing a Map is navigation; a later Edit may record `defaultMap`, which is consistent with D16.

**Q5 FAIL.** Contradicts a Must-not-contradict item, "Graph id is unique in the Space (R24)":
- Z writes: "Graph ids are scoped to the owning Map (ADR 0040)".
- Checked: ADR 0040, line 30, does say "Route identity is scoped to the owning Layout".
- ADR 0108 (`Refines: 0040, 0041`) replaces it: ids are unique across the Space, and `duplicate-graph-id` refuses repeats. ADR 0108 says of 0040's scoping, "Neither is what is built".
- A11 rejects Map-scoped ids.

Also missing a Must-state item: the never-shared reason.
- Z gives the accepted cost ("duplicate it, and later edits are independent") in place of the reason (dangling Edge, or a change to every other Map).

Present:
- Append and activate.
- The first survivor becomes active.
- Order is kept.
- The last Graph cannot be deleted.
- One Map only.

**Q6 FAIL.** It asserts a D12 resolution: "one Edit, undoable as one".

Otherwise all Must-state items are present:
- Membership and rect are removed in this Map only.
- Incident Edges in all of this Map's Graphs are removed, in the same Edit.
- Room is given back, by the memoryless rule.
- Emptied Graphs remain.
- The Resource and its second-Map state are untouched.
- The Space-delete contrast is given.

**Q7 FAIL.** It asserts a D12 resolution: "One undo reverses all of them."

Otherwise exemplary:
- A, B, C and D are all correct.
- "At or past"; touching counts.
- Written by the Open Edit, not derived at render.
- All three reasons, including the measured 48-unit offset and 441-unit jump, which were checked against ADR 0093, lines 31–32.
- The grid cost.

**Q8 FAIL.**
- Missing Must-state item: the stale-state or history-dependence reason for rejecting the push set.
  - Z's reason is "the set Close reads must equal the set Open reads; the jump was fixed by narrowing the set, not by adding memory". That is ADR 0093's reason for one-axis displacement, not A14's reason (ADR 0084) for refusing per-Open memory.
- Present:
  - R moves back, with the direction worked out.
  - Close is memoryless.
  - It rejects the suggestion.
  - The R42 asymmetry.
  - The round trip.

**Q9 FAIL.** Missing Must-state item: "The fallback is the first Graph."
- Z states it under Q5 but not here.

Present:
- It is not an Edit, and never a side effect.
- Emphasis, not filtering, all drawn.
- One Active Graph.
- New Edges join the Active Graph.
- Persisted only by a later Edit.

**Q10 PASS.**
- Removed from the domain, selections, URLs and registry.
- Obsolete URLs are not found.
- Only Maps are addressable.
- The grid strategy is non-addressable.
- The dormant-complexity reason, with ADR 0079's list.
- The lost flatten.
- The alternatives are a Map plus Add to Map, and Auto-arrange as an unbuilt Edit.
- The Resources View is described correctly.

---

## Cross-reader patterns

1. **Undo (D12) is the largest single failure source.**
   - X (Q6, Q8) and Z (Q1, Q6, Q7) state that Edits are undoable as settled fact. Z quotes ADR 0086's "undoable like any other"; X echoes the `AGENTS.md` 0084 entry, "undoing it undoes all of them".
   - W and Y name D12 and claim no undo.
   - The unresolved claim is carried as fact by `AGENTS.md` and by ADR 0086 and ADR 0084. Until D12 is decided, any route through those texts will produce this error.
2. **"Why" items fail far more often than "what" items.** Every X and Z failure other than D12 is a missing or substituted reason, or a stale rule:
   - the default-Map reason (X Q4);
   - the never-shared reason (X Q5, Z Q5);
   - the push-set reason (X Q8, Z Q8);
   - the dormant-complexity reason (X Q10);
   - the no-basis-for-positions reason (Z Q3);
   - the reason for having no result type (Z Q2).

   Where reasons were missed, the reader either cited an authority ("AGENTS.md says don't") or substituted a neighbouring reason: the A10 cost for the A10 reason, and ADR 0093's set-equality reason for A14's. The behaviour is reachable through summaries, but the reasons are not.
3. **A superseded or refined ADR body was read as current.**
   - Z Q5 took Map-scoped Graph ids from ADR 0040, line 30, without ADR 0108's refinement.
   - Z Q3 had to translate "Cards View" out of ADR 0079.
   - A refining ADR does not mark the refined paragraph in the older body, so a reader who opens 0040 directly meets the retired rule.
4. **Guidance was misapplied out of context.** X Q1 turned a fixture-only sentence in `rendering.md:58` ("don't compute them and write the result back") into a ban on Auto-arrange's write-back. A sentence about the fixture reads as a general rule.
5. **The first-Graph fallback was missed in Q9 by X and Z.** In the material they used, it sits in CONTEXT "Active Graph", ADR 0028 and ADR 0040/0041, but the visible `AGENTS.md` mention is only inside the Space Resource `link` description.
6. **Some expected-answer items no reader stated.** None of these was Must-state, so none affected a grade:
   - Q6's afterwards items: re-add arrives Closed with no Edges restored (R33, G4 code-only), and the canvas never invents a position.
   - Q8's "S keeps its Open Size" (R44).

   Either the question does not prompt for them, or the readers' sources do not surface them. Consider whether they should be Must-state; if so, R33 and G4 need a source a reader can find.
7. **Q7 is the strongest question.** All four readers got the geometry of A–D, the Open-Edit timing and at least one reason right. Z's Q7 fails only on D12. Q4 is the next most robust.
8. **All four readers stated that Auto-arrange is unbuilt and that only a Map is addressable.** No reader asserted "always" or "never" for D16, or said that neighbours stay displaced on removal (G1). The ambiguity handling in `questions.md` therefore did not need to be invoked except for D12.
