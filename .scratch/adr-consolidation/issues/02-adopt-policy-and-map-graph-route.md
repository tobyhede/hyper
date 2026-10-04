# 02 — Adopt the policy and Map and Graph reading path

**What to build:** contributors can use the validated Map/Graph contract through normal project guidance, with explicit rules for how current guidance and historical ADRs relate.

**Blocked by:** 01 — Prove the Map and Graph reading-path pilot, with a successful evaluation.

**Status:** resolved

- [x] Revise existing proposed ADR 0115 around current-contract ownership, history preservation, reading order, conflict resolution and same-change maintenance; record adoption explicitly with supporting pilot evidence.
- [x] State that guidance cannot silently override accepted decisions and that implementation evidence is distinct from accepted design.
- [x] Integrate the pilot's contract and task pointers; replace duplicate live Map/Graph accounts with links in the same change while retaining glossary definitions.
- [x] Preserve historical ADR identities, bodies and existing relationships; introduce no consolidation statuses or generation machinery.
- [x] Give unmigrated topics an explicit existing route so partial adoption cannot hide needed guidance.
- [x] Clarify ADR admission and the responsibilities of the glossary, current contracts, catalogue and delivery issues.
- [x] Demonstrate the fixed pilot tasks through the actual adopted route and run relevant existing navigation, status and vocabulary checks.

## Comments

2026-10-04: implemented.

- **Policy.** ADR 0115 is revised and accepted. Because it was still proposed, its file was renamed to `0115-current-contracts-state-the-live-design-and-adrs-keep-its-history.md`. Its number is unchanged and nothing linked the old filename.
- **Where the rules now live.** The policy's working rules are in `docs/agents/workflow.md` "Current contracts", which holds the one list of topics that have a contract. The contract is `docs/agents/maps-and-graphs.md`.
- **Pointers.** The duplicate Map and Graph accounts in `AGENTS.md` (the intro, and the 0079, 0064, 0066 and 0084 entries), `editing-and-persistence.md` and `rendering.md` now point to the contract. The `AGENTS.md` 0084 undo wording is corrected.
- **D21.** The user ruled it a rule. ADR 0112 permits a difference only when an ADR records it, so ADR 0116 records it, refining 0079 and 0112.
- **Delivery issues for unbuilt rules.** `.scratch/auto-arrange/issues/01` and `.scratch/graph-reordering/issues/01`.
- **Reader check.** Two fresh readers scored 10/10 through the adopted path: `../adoption/REPORT.md`.
- **Checks run.** `adr-status-blocks`, `current-domain-vocabulary`, `docs-agents-citation-accuracy` and `agent-skill-symlinks` pass, and a relative-link check over every changed Markdown file found no broken link.

Left for ticket 07, which owns the glossary: `CONTEXT.md` still states some behaviour that the contract now owns, such as the one-axis displacement rule under "Placement" and Graph order under "Graph". Their definitions are kept, as this ticket asked.
