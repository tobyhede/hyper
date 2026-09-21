# Architecture tickets admitted to the release candidate

Audited: 2026-09-20 against `b1ac983d` and the supplied working-tree tickets.

Scope: the three architecture-report candidates and their five named supporting
tickets. This is not an audit of every ticket in `.scratch/`. The user requested
that the audited work join the release candidate roadmap. Existing draft changes
were preserved and corrected in place; no implementation was changed.

| Ticket | Current evidence and correction | Release disposition |
| --- | --- | --- |
| [command-dock/28](../command-dock/issues/28-open-spaces-owns-its-listing.md) | `App.tsx` still reconstructs rows and chooses open/switch; the Dock adds closed Meta; `openTree` remains public. PR 240 is merged, so remove that blocker. | Ready for agent; blocks final proof. |
| [database-persistence/25](../database-persistence/issues/25-repository-behaviour-lives-in-the-contract.md) | Per-database tests still duplicate portable behaviour. Raw revision and missing-Meta hooks already exist; restart browser steps already share `restart-proof.ts`, but fixtures/export assertions remain separate. SQLite cleanup must keep id/count-only operations. | Ready for agent; precedes 26. |
| [database-persistence/26](../database-persistence/issues/26-one-database-target-composition.md) | Host still rejects relative SQLite paths while CLI resolves them; the dev shell still chooses its default before dotenv. Two runtime compositions remain. SQLite already has an invariant give-up test, so do not call all its retry proof absent. | Ready for agent after 25; blocks final proof. |
| [database-persistence/31](../database-persistence/issues/31-the-unavailable-arm-is-named.md) | Six current classification sites plus two blanket GET catches. Part A is designed; Part B still asks cap versus reported persistent failure. Correct the promise of no named-arm behaviour change: those two GET catches also change status for broken state. | Needs info for Part B; blocks final proof. |
| [database-persistence/34](../database-persistence/issues/34-nontransactionalhandle-execute-is-speculative-generality.md) | Non-transactional execute remains unreached. There are five non-transactional tables call sites, including the omitted post-conflict reload. Removal has type-shape costs and no demonstrated runtime defect. | Needs triage; explicit keep/remove disposition blocks final proof. |
| [database-persistence/39](../database-persistence/issues/39-replaceallspaces-has-no-stated-error-interface.md) | Replacement lacks initialization's duplicate-Thing proposal contract case. Catch filters are recoverable cases, not exhaustive thrown sets; the relock loop raises stale revision before the shared method. No repository operation itself answers HTTP 503. | Coverage/interface cleanup, not a proven reachable defect; blocks final proof. |
| [database-persistence/40](../database-persistence/issues/40-a-revision-cannot-be-constructed-out-of-range.md) | Revision remains bigint and advancement adds 1n. There are three reclassification catches plus an error constructor. A valid maximum cannot advance; SQL raw-revision proofs skip memory. | Needs triage for ownership and ceiling outcome; blocks final proof. |
| [database-persistence/41](../database-persistence/issues/41-sqltables-is-nineteen-members-over-one-difference.md) | The ordering callback leaks one fixed query. Order is used, not technically phantom. Identical table expressions do not erase generated typing constraints; merging lock operations must not spread placeholder-write obligations. | Needs triage; blocks final proof. |

## Dependency model

The only hard dependency among these eight is 25 → 26. The suggested sequence
31 → 40 → 41 concerns overlapping edits and design vocabulary, not inability to
start. Those suggestions now live outside `Blocked by`, so the generator does
not misrepresent them as prerequisites. Ticket 39 can accompany 31; 34 and 41
can be investigated together or separately.

All eight carry `release/v1`. [V1/07](issues/07-prove-the-v1-release.md) names the
seven terminal prerequisites. `.scratch/ROADMAP.md` continues to name V1/07 as
the gate; there is no second manually maintained critical-path list. The tool's
unit-weight critical subgraph is a dependency-depth calculation, not a priority
ranking or duration estimate. Do not invent sequencing to force every required
ticket into that subgraph.

## Limits and preserved decisions

- ADR 0095's shared SQL repository and ADR 0096's repository-owned lifecycle
  remain; none of these tickets reopens lifecycle extraction.
- The fast-path missing-Meta fix, database-persistence/29, is already resolved
  in HEAD; it is not scheduled again.
- ADR 0101 remains proposed. This audit keeps the current Thing/Diagram terms.
- Stale line references were replaced where they affected the audited claims;
  older provenance sections remain historical evidence, not fresh test results.
- The wider V1 handoff and Definition of Done contain historical vocabulary
  and evidence requiring reconciliation against the final candidate. This audit
  does not certify those unrelated claims or mark implementation checkboxes done.

## Verification

Completed on the audited planning changes:

- `pnpm exec vitest run test/unit/roadmap.test.ts`: 36 tests passed.
- `pnpm roadmap`: generated successfully with 12 open release tickets; the
  critical subgraph includes 25 → 26 → V1/07 alongside the existing
  V1/16 → V1/19 → V1/07 chain.
- `pnpm exec tsx scripts/roadmap.ts --html`: regenerated `.scratch/roadmap.html`
  and `.scratch/v1-release/roadmap-space/` from ticket metadata.
- An assertion over `buildRoadmap`/`planRelease` confirmed all eight audited
  tickets are in `release/v1` and are ancestors of V1/07; the planner accepted
  the dependency graph without a cycle or missing release blocker.
- `git diff --check`: passed.

Full `pnpm verify`, application/browser/Ladle and database suites were not run:
only Markdown planning files changed, so those suites cannot establish the
ticket claims. No implementation or final-candidate behaviour is certified by
this audit. The generator emitted Node's existing `module.register()` deprecation
warning and exited successfully.
