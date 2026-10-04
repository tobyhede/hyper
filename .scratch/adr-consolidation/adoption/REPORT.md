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

## Fresh-session check

The first pair had the pre-adoption `AGENTS.md` in context, and the guidance wording changed after they read. To remove both doubts, two more pairs were run as separate `claude -p` sessions (Sonnet, tools Read/Grep/Glob) started in a detached snapshot, so their project instructions were the adopted `AGENTS.md`. The glossary had by then been trimmed to definitions. Grading: [grading-fresh-session.md](grading-fresh-session.md).

| Snapshot | Reader | Correct | Words read (reader's estimate, incl. AGENTS.md) | Wall time |
|---|---|---|---|---|
| `c00cae99` | adopted-3 (R) | 9/10 | ~15,500 | 49 s |
| `c00cae99` | adopted-4 (S) | 10/10 | ~13,900 | 51 s |
| `71019361` | adopted-5 (T) | 10/10 | see file | see file |
| `71019361` | adopted-6 (U) | 10/10 | see file | see file |

R failed Q10 by omitting that automatic strategies are not addressable. The contract stated it only in R3, while R8, the rule a reader reaches for on that question, did not point there. `71019361` added that cross-reference to R8, and both readers on that snapshot stated it. This is one fix after one failure, with no further iteration. A reader who misses an item the contract states is a sampling risk that a single fix cannot rule out.

## Findings that change no grade

- adopted-2, Q10, said Auto-arrange "reuses the grid strategy". The contract says which strategy returns is undecided, and that `gridStrategy` is kept for the seam, not because a grid returns. The contract states this already; no change was made.
- Neither reader stated that re-adding a Resource restores no Edges (R33), or that intake rejects a dangling `activeGraph` (R28). Neither is a Must-state item.

## Verdict

Pass on the final text (`71019361`): both fresh-session readers answered every fixed question correctly through the adopted reading path, including the four resolutions made since the pilot. Across all six adoption readers, 59 of 60 answers passed; the one failure led to the R8 cross-reference.
