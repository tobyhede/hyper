# 01: Correct the stale facts in the agent docs

**What to build:** an agent reading AGENTS.md, `docs/agents/*` or the ADR index meets no claim the pre-release audit found false. Each fix states what is true now, in present tense, and replaces a count or a ticket status that drifts on its own with a pointer to the file or ticket that holds it.

**Blocked by:** None (can start immediately).

**Status:** resolved

Findings from the pre-release audit, still open after the release fixes:

- ADR 0064 is marked "being built", but its behaviour is asserted by the e2e and Ladle suites and no open delivery ticket remains. Confirm, then mark it built or name the open ticket.
- AGENTS.md says React Flow specifics live only in `react-flow-adapter`, and a later bullet says `app` imports it legitimately. State the boundary once: no React Flow imports in `core`, `graph`, `persistence` or `ui`.
- The eslint suppression counts disagree (AGENTS.md says 47 sites in 25 files, the anti-slop guide says 79 in 36, the file holds 46). The typing-fixture counts disagree too (the docs say seven must-fail, there are eight). AGENTS.md's coverage-threshold list omits `http`. Point at the files instead of stating numbers.
- The workflow guide's loop tells agents to run `/grilling` and `/improve-codebase-architecture`, and the same guide says that skill pack was removed.
- The rendering guide says structural deletion has no control (Delete from Space is one) and points to an ADR 0040 entry in the editing-and-persistence guide that does not exist.
- The UI guide cites `sidebar.tsx`, which is deleted, as the `#subpath` example.
- The refusal-cascade guide says "two guards common to every action". There is one, `map-not-found`.
- The Maps-and-Graphs provenance table labels R44 "Accepted, not built". R44 is built.
- The editing-and-persistence preamble refers to Reference Resource retargeting text that is no longer below it.
- The workflow guide's "Capture" example uses the ELK port-id collision (ELK is gone). The triage-labels guide ends in template text.
- AGENTS.md names a "repo-meta test" that does not exist. The tests that shell out to `git ls-files` are current-domain-vocabulary, conflict-markers and docs-agents-citation-accuracy.
- The ADR index's lines use retired vocabulary (Card, Layout, Thing, Diagram, Alias, View) with no translation note.
- Two source comments still state the superseded fixed Closed size or resize-only-when-Open: the header of the app's `resource` module and the "Resizing this Open Resource" comment in the adapter's projection.

- [x] Every item above is corrected or recorded as refuted with its evidence.
- [x] No prose in the agent docs states a suppression, fixture or coverage count.
- [x] `docs-agents-citation-accuracy`, `current-domain-vocabulary` and prettier pass.

## Answer

Every finding held when checked against the tree on 2026-10-10; none is refuted. Two were wider than the audit stated, and the fix follows the tree.

- **ADR 0064.** No open ticket delivers it: of the `.scratch` files citing 0064 with an open status, `resource-aria-description/issues/01` is about aria descriptions, the two specs (`resource-has-no-front`, `size-independent-of-open`) have every issue resolved, and `expanded-cards/issues/03` is `implemented` (the cross-fade). Close-disabled-while-editing is asserted in `packages/app/e2e/overview.spec.ts`, `packages/app/e2e/image-resource.spec.ts` and `packages/app/ladle-e2e/resource-open.spec.ts`. AGENTS.md now says built.
- **React Flow boundary.** `eslint.config.js` bans `@xyflow/react` from `core`, `graph`, `http`, `persistence` and `ui` (the `http` zone too, which the audit's list omits). AGENTS.md states it once, in the hard rules, and the package bullet no longer says "the ONLY place".
- **Counts.** `eslint-suppressions.json` held 46 suppressions across 24 files; `tools/typing-fixtures/` holds eight `must-fail` and four `must-pass`; `vitest.config.ts` gates `core`, `graph`, `http` and `persistence`. AGENTS.md, `docs/agents/anti-slop.md` and `tools/typing-fixtures/README.md` now point at those files and state no number.
- **Workflow loop.** The Survey and Grill steps name no skill. The Capture example is the ADR 0122 resize-control drift.
- **Rendering.** Structural deletion is Delete from Space in the Resource's Actions menu (`resource-rail-actions.tsx`, `resource-deletion.ts`, `ladle-e2e/delete-confirmation.spec.ts`); the dangling ADR 0040 pointer is gone.
- **UI guide.** The `#subpath` example is `components/card.tsx` (`#lib/utils`).
- **Refusal cascade.** One guard, `map-not-found`, asked by every action but `created-map` and `renamed-space`.
- **Maps and Graphs.** R44's provenance row no longer says "Accepted, not built"; the contract's "Accepted, not built" list already omitted it.
- **Editing and persistence.** The preamble states Target immutability and no longer refers to text below it.
- **Triage labels.** The table's column names the canonical role, and the template line is gone.
- **Repo-meta test.** AGENTS.md names the scans that shell out to `git ls-files`: `current-domain-vocabulary`, `conflict-markers`, `docs-agents-citation-accuracy`, and those reading through `test/support/structural-scan.ts`, which the audit's list omits.
- **ADR index.** `docs/adr/README.md` carries a translation table for Card, Thing, Layout, Diagram, View, Alias and Reference Thing; the historical lines are unchanged.
- **Source comments.** `packages/app/src/resource.ts`'s header describes the Closed Size as the default and floor of an authored size, independent of Open; `packages/react-flow-adapter/src/projection.ts`'s `resize` doc says Open or Closed.

Checks: `pnpm exec vitest run test/unit` (81 files passed), `pnpm exec prettier --check` on the changed files, `pnpm exec eslint` on the two source files.
