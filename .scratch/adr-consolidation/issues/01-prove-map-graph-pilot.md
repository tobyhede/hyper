# 01 — Prove the Map and Graph reading-path pilot

**What to build:** a reviewable comparison showing whether a contributor can understand Map and Graph rules through a single current contract while retaining the important reasons in the historical record. The specimen remains non-normative.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Inventory the pilot's live rules, important rejected alternatives, sources and outstanding implementation gaps before drafting; classify historical claims omitted from the specimen.
- [x] Fix questions and expected answers for Map ownership and membership, automatic arrangement, initialization, Graph creation, displacement and memoryless Close; resolve source disagreements explicitly.
- [x] Produce a specimen route and contract using current domain language without modifying accepted history or declaring the new policy adopted.
- [x] Compare independent fresh readers on the existing and specimen routes; record correctness, retained constraints, sources encountered and reading effort with the tested snapshot.
- [x] Report a pass only if all fixed questions preserve the applicable rules and important negatives with no unresolved contradiction or dead-end pointer; assess reading savings separately.
- [x] Leave a concrete recommendation for adoption or adjustment. A failed pilot does not unlock policy adoption.

## Comments

Evidence: [pilot/REPORT.md](../pilot/REPORT.md). Both specimen readers scored 10/10 and the baseline readers 3/10 and 2/10. The correctness pass is provisional. Three source disagreements await the user: D12 (undo), G1 (room given back on removal) and D16 (recording the default Map). That is why the second box stays open and the ticket is `ready-for-human`. The recommendation is to adopt through ticket 02 once all three are resolved.

2026-10-04: the user resolved the three open disagreements. Each is recorded in `pilot/inventory.md` and the specimen, and none changes a grade, so the pass is final.
- D12: undo is not built and is a planned future feature. Every Edit is one atomic unit that a future undo reverses whole.
- G1: keep current behaviour as a live rule. Removing or deleting an Open Resource Closes it in the same Edit, then removes it.
- D16: a Space opens on the Map most recently edited in.

Ticket 02 is unblocked. It still needs the proposed ADR 0112, which is not yet committed on any branch.
