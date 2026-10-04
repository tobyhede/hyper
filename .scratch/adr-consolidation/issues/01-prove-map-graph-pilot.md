# 01 — Prove the Map and Graph reading-path pilot

**What to build:** a reviewable comparison showing whether a contributor can understand Map and Graph rules through a single current contract while retaining the important reasons in the historical record. The specimen remains non-normative.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Inventory the pilot's live rules, important rejected alternatives, sources and outstanding implementation gaps before drafting; classify historical claims omitted from the specimen.
- [x] Fix questions and expected answers for Map ownership and membership, automatic arrangement, initialization, Graph creation, displacement and memoryless Close; resolve source disagreements explicitly. (Resolved after scoring, not before as the spec orders; no re-score was run. See the Verdict in `pilot/REPORT.md`.)
- [x] Produce a specimen route and contract using current domain language without modifying accepted history or declaring the new policy adopted.
- [x] Compare independent fresh readers on the existing and specimen routes; record correctness, retained constraints, sources encountered and reading effort with the tested snapshot.
- [x] Report a pass only if all fixed questions preserve the applicable rules and important negatives with no unresolved contradiction or dead-end pointer; assess reading savings separately.
- [x] Leave a concrete recommendation for adoption or adjustment. A failed pilot does not unlock policy adoption.

## Comments

Evidence: [pilot/REPORT.md](../pilot/REPORT.md). Both specimen readers scored 10/10 and the baseline readers 3/10 and 2/10. At evaluation, three source disagreements were open: D12 (undo), G1 (room given back on removal) and D16 (recording the default Map). The recommendation is to adopt through ticket 02.

2026-10-04: the user resolved the three open disagreements. Each is recorded in `pilot/inventory.md` and the specimen. They were resolved after scoring, contrary to the spec's order, and no reader was re-scored; the affected grades were reviewed and judged unchanged. Whether to re-score is the user's decision.
- D12: undo is not built and is a planned future feature. Every Edit is one atomic unit that a future undo reverses whole.
- G1: keep current behaviour as a live rule. Removing or deleting an Open Resource Closes it in the same Edit, then removes it.
- D16: a Space opens on the Map most recently edited in.

Ticket 02 is unblocked. The proposed ADR it revises is committed as 0115.

2026-10-04, after merging `main` at `9cb40e16`: R10, R12 and R27 were corrected against code changed by PRs #332 and #336, without re-grading (`pilot/REPORT.md`, "Corrections against current code"). That opened D21, whether an Edit through a drawn Map should record `defaultMap`, which awaits the user.

2026-10-04: D21 resolved as a rule and recorded as ADR 0116 in ticket 02.

2026-10-04: the user accepted the resolve-after-scoring deviation; no pilot re-score. The adoption readers answered with all four resolutions in force (`../adoption/REPORT.md`).
