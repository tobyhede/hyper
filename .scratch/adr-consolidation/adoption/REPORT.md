# Map and Graph adoption: reader check through the adopted reading path

Ticket: `../issues/02-adopt-policy-and-map-graph-route.md`, last checklist item. Date: 2026-10-04.

## Snapshot and method

- Adopted text: commit `21e0ece2` on `adr-consolidation-pilot`. Readers worked in a detached checkout of it with the questions, grading, earlier readings, pilot report, specimen, research, spec and tickets removed. `pilot/inventory.md` was kept because the adopted contract links it.
- Questions: the ten fixed questions in `../pilot/questions.md`, unchanged and given in the same order.
- Readers: two fresh Sonnet agents with no shared context, starting at the snapshot's `AGENTS.md` and following its pointers, with no source code. Their reports are in [readers/adopted-1.md](readers/adopted-1.md) and [readers/adopted-2.md](readers/adopted-2.md).
- Grading: a separate agent applied the pilot rubric, with the D12, G1, D16 and D21 resolutions and the PR #336 removal of the last-Map and last-Graph refusal codes ([grading.md](grading.md)). It knew both sets came from the adopted route, so the grading is independent of authorship but not blind to route.
- After the readings, review fixes changed wording in `AGENTS.md`, `workflow.md`, ADR 0115 and the ADR index. Those fixes moved the policy statement and the list of contracted topics to one place and removed "route" as a word for a reading path. No contract rule changed, and the readers were not re-run.

## Results

| Reader | Correct | Files opened (content) | Words read (reader's estimate) | Tool uses | Wall time |
|---|---|---|---|---|---|
| adopted-1 | 10/10 | 3 | ~6,500 | 7 | ~78 s |
| adopted-2 | 10/10 | 4 | ~9,100 | 10 | ~67 s |

Tool uses and wall times come from the harness. Neither reader reported a contradiction or a dead-end pointer. Both suspected that contract links using old ADR filenames, for example `0040-layouts-own-card-membership-and-routes.md`, might be dead. Those are the ADRs' real filenames, and every relative link in the changed files resolves, checked by script.

## Against the pilot

The pilot's specimen readers also scored 10/10, reading about 3,660 words. The adopted-route readers read more, about 6,500 and 9,100 words, because they started at `AGENTS.md` and read parts of `CONTEXT.md`, as a contributor would. The pilot's existing-route readers scored 3/10 and 2/10 on about 16,300 and 18,600 words.

## Remaining confound

The pilot's main confound is narrowed but not removed. The harness gave each reader the session's project instructions, which were the **pre-adoption** `AGENTS.md` with the long ADR 0079 and 0084 entries. adopted-2 noticed this and said it answered from the snapshot. Nothing in either answer set depends on text found only in the old entries. A rerun from a session that starts on the adopted `AGENTS.md` would remove the confound.

## Findings that change no grade

- adopted-2, Q10, said Auto-arrange "reuses the grid strategy". The contract says which strategy returns is undecided, and that `gridStrategy` is kept for the seam, not because a grid returns. The contract states this already; no change was made.
- Neither reader stated that re-adding a Resource restores no Edges (R33), or that intake rejects a dangling `activeGraph` (R28). Neither is a Must-state item.

## Verdict

Pass. Both readers answered every fixed question correctly through the adopted reading path, including the four resolutions made since the pilot.
