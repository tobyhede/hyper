# Map and Graph reading-path pilot: evaluation report

Status: evaluation complete, non-normative. This report adopts no policy; adoption is ticket 02's.

## Snapshot

- Baseline route: `main` at `d27124479`, read in a detached checkout with `.scratch/adr-consolidation/` removed so the prior audit could not act as a shortcut.
- Candidate route: branch `adr-consolidation-pilot` at `8b0b42df`, read in a detached checkout holding only the two specimen files from this pilot (inventory, questions, readings, research audit, spec and tickets removed). At that snapshot the entry file was `specimen/ROUTE.md`; after review it was renamed `READING-PATH.md` and four avoided words were replaced (see "Changes after evaluation").
- Inventory and questions: pinned to `e836ecab` (2026-10-03). Four locator corrections were applied afterwards (see "Inventory corrections"); none changes a rule or an expected answer.
- Date: 2026-10-03.

## Method

1. [inventory.md](inventory.md) records 44 live rules (R1–R44), 18 rejected alternatives (A1–A18), 35 omitted historical claims each classified with a reason (O1–O35), 20 source disagreements (D1–D20, 19 resolved by a status or refinement relationship) and 6 rules true and built but with no ADR source (G1–G6).
2. [questions.md](questions.md) fixes ten task-framed questions with expected answers, must-state items, must-not-contradict items and a rubric, before any specimen was drafted. The drafter was barred from reading it.
3. [specimen/maps-and-graphs.md](specimen/maps-and-graphs.md) and [specimen/READING-PATH.md](specimen/READING-PATH.md) were drafted from the inventory by a separate agent. Every R and A id appears in its provenance table, and every relative link was checked to resolve.
4. Four independent fresh readers (Sonnet, no shared context) answered the questions: two from `AGENTS.md` through the existing guidance ([baseline-1](readers/baseline-1.md), [baseline-2](readers/baseline-2.md)), two from the specimen entry file ([candidate-1](readers/candidate-1.md), [candidate-2](readers/candidate-2.md)). Neither arm could read source code.
5. A separate grader marked the answer sets against the rubric ([grading.md](grading.md)). Reader labels were replaced by W–Z and the reading logs removed, but specimen answers cite R/A ids, so the grader could infer the route; treat the grading as independent of authorship, not as blind.

## Results

| Route | Reader | Correct (rubric) | Files opened | Words read | Tool uses | Wall time |
|---|---|---|---|---|---|---|
| Existing | baseline-1 | 3/10 | 6 | ~16,300 (incl. AGENTS.md 9,730) | 10 | ~89 s |
| Existing | baseline-2 | 2/10 | 11 | ~18,600 (incl. AGENTS.md 9,730) | 14 | ~92 s |
| Specimen | candidate-1 | 10/10 | 2 | ~3,660 | 3 | ~55 s |
| Specimen | candidate-2 | 10/10 | 2 | ~3,660 | 3 | ~54 s |

Tool uses and wall times come from the harness task notifications, not the readers' self-reports. Words read are the readers' own estimates. Wall time includes answer writing.

Failures on the existing route, by cause:

- **A working undo stated as fact** (4 failures: baseline-1 Q6; baseline-2 Q1, Q6, Q7; baseline-1 also asserted it in Q8, which failed for another reason). ADR 0086 and the `AGENTS.md` 0084 entry state it; ADRs 0048 and 0074 and the code say V1 has no undo. This verdict holds under either resolution of D12, since both agree no undo exists in V1. Without these, the baseline scores are 4/10 and 5/10.
- **The reason missing or replaced** — the commonest cause. Readers kept the behaviour but cited an authority ("AGENTS.md says don't") or gave a neighbouring reason or the accepted cost in its place: default-Map reason, why Graphs are never shared, why not record the push set, the dormant-complexity reason for removing Computed Views, why first load places nothing, why there is no result type.
- **A rule taken from an ADR body a later ADR changed.** baseline-2 stated Graph ids are scoped to their Map from ADR 0040's body; ADR 0108 makes them unique across the Space, and 0040's body carries no mark at that paragraph.
- **A fixture sentence applied as a general rule.** baseline-1 used `rendering.md`'s "don't compute them and write the result back" (about the test fixture) to forbid Auto-arrange's write-back, contradicting R6.
- **The first-Graph fallback missed** (both, Q9): `AGENTS.md` shows it only inside the Space Resource `link` description.

Neither specimen reader reported a contradiction, a dead-end pointer, or a point they knew only from the in-context `AGENTS.md`. Both named D12 and G1 as open rather than settling them.

## Verdict

**Correctness: pass.** Every fixed question passed on the specimen route for both readers, preserving the applicable rules and important negatives, with no dead-end pointer. At grading, the specimen carried two source disagreements (D12, G1) that it surfaced rather than created; no specimen reader treated either as settled. Scoring ran before the user resolved D12, G1 and D16, contrary to the spec's order. All three were resolved afterwards (below). Every grade they touched stands, so the pass is final and the specimen now carries no unresolved contradiction.

**Reading effort, assessed separately:** about 3,660 words in 2 files against 16,000–18,600 words in 6–11 files, a reduction of roughly 78–80%, with fewer tool calls. The saving does not drive the verdict; the existing route also failed on correctness, so the comparison is not a shorter answer passing over a longer one.

## Limits of this evidence

- **Small sample.** Two readers per arm, one model. The difference is large and consistent, but a sample this size establishes direction, not a rate.
- **`AGENTS.md` was in every reader's context.** Subagents receive the project instructions automatically, so both arms began with the 9,730-word `AGENTS.md`, including its ADR 0079 and 0084 entries. Specimen readers were told to cite only the candidate route and to list anything known only from `AGENTS.md`; both listed nothing. The candidate arm therefore measures the specimen on top of an `AGENTS.md` it was told to ignore; an adopted route would replace those entries with pointers, which ticket 02 should re-test.
- **Shared authorship of inventory and expected answers.** The specimen was built from the same inventory the expected answers cite. That is the intended property — a faithful contract should contain the source reasons — but it means the test checks fidelity to the inventory; the inventory's own fidelity rests on its review against the ADRs (see corrections below), not on this evaluation.
- **Blinding was partial.** The grader saw anonymised answers, but specimen answers cite R/A ids, which reveal the route.
- **Baseline readers read partially** (grep hits, line ranges), as contributors do. That is part of what the route is meant to fix, not a flaw in the arm.

## Inventory corrections made after drafting

Found by the specimen drafter against the source ADRs; recorded in `inventory.md` without changing a rule:

- R11 and R26 cited ADR 0040 paragraph 4; the sentences are in paragraph 3.
- R41's "Close reclaims from none when the subject has been dragged past its displaced neighbours" appears in no ADR; it is sourced to CONTEXT "Placement" and follows from the memoryless rule.
- R44's "the kind's default size": ADR 0066 says only "the concrete default Open Size"; the kind choosing it is CONTEXT "Opening".
- R7 and A12 generalise ADR 0086's "do not seed or constrain elkjs to honour a drop point" to any engine; kept, noted as a generalisation.

## Changes after evaluation

Review against the repository's vocabulary rules found avoided words in the specimen. Fixed after the readings, without changing any rule:

- `ROUTE.md` renamed `READING-PATH.md`, and its heading changed, because CONTEXT avoids "route" outside qualified HTTP and graph-layout prose.
- "engine" and "algorithm" (CONTEXT avoids both for a layout strategy) replaced in R6, R7, the Built section and the reading path.
- "A Map is authored placement" (CONTEXT avoids placement as a name for a Map) reworded.

## Decisions resolved after evaluation

1. **D12 — undo. Resolved 2026-10-04.** Undo is not built and is a planned future feature; every Edit is derived, submitted and stored as one atomic unit, so a future undo reverses an Edit whole. The specimen's pending note now states this, and the grades it affected stand unchanged. Whether Auto-arrange asks for confirmation while undo does not exist is left to its future delivery issue. Ticket 02 must correct the `AGENTS.md` 0084 entry, whose "undoing it undoes all of them" reads as if undo exists (two baseline failures).
2. **G1 — room given back on removal. Resolved 2026-10-04: keep the current behaviour, as a live rule.** Removing or deleting an Open Resource Closes it in the same Edit, then removes it; removing a Closed Resource moves nothing; removal itself never displaces. Sourced to ADR 0084, CONTEXT and the property test, with no new ADR. Leaving the gap was considered and declined. All four readers stated this rule in Q6, so no grade changes.
3. **D16 — recording the default Map. Resolved 2026-10-04: the code's behaviour is the rule.** A Space opens on the Map most recently edited in. Selecting a Map saves nothing, and every Edit in a Map records it as `defaultMap`, Add Map included. This narrows ADR 0079's "may" without changing code. No grade changes.

## Recommendation

Adopt, through ticket 02, with three adjustments:

1. Carry the D12, G1 and D16 resolutions into the adopted contract, and correct the `AGENTS.md` 0084 entry's undo wording.
2. When integrating, replace the Map/Graph entries in `AGENTS.md` (ADR 0079, 0084, 0064's displacement sentences, 0041's model sentences) and the overlapping Map/Graph accounts in `docs/agents/editing-and-persistence.md` and `rendering.md` with pointers, then rerun the fixed questions through the adopted route with fresh readers. That rerun removes this pilot's main confound.
3. Keep the provenance table and the "Built vs accepted-but-unbuilt" section. They are what let a reader tell Auto-arrange and manual Graph reordering are unbuilt, and what let a reviewer check completeness.

Findings for the existing record, independent of adoption: ADR 0040's Graph-id paragraph reads as live although ADR 0108 refines it; `rendering.md`'s fixture sentence reads as a general rule; `editing-and-persistence.md` says `map-resolution.ts` exports four names where it exports five; the `layout.ts:20` doc comment still says "the view"; CONTEXT cites ADR 0079 for new-Space completeness where ADR 0080 is the source. Auto-arrange has no delivery issue.
