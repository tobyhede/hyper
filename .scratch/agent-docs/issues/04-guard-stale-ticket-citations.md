# 04: Make a stale ticket citation in the agent docs fail a test

**What to build:** text in AGENTS.md or `docs/agents/*` that says something is not built until a cited `.scratch` ticket, or that a cited ticket's work is "being built", fails a unit test once that ticket's `Status:` is resolved. This is the drift that left AGENTS.md calling the ADR 0122 resize control unbuilt after its ticket was resolved.

**Blocked by:** 01.

**Status:** resolved

- [x] The guard reads ticket statuses in both spellings the tracker uses.
- [x] It fails on a fixture that pairs "until" or "being built" with a resolved ticket, and passes on today's corrected docs.
- [x] It sits beside `docs-agents-citation-accuracy` and runs in `verify`.

## Answer

`test/unit/docs-agents-ticket-status.test.ts`, beside `docs-agents-citation-accuracy` in `test/unit`, so `verify`'s `test:coverage` runs it. It reads the tracked AGENTS.md and `docs/agents/*.md`, finds every `.scratch/<feature>/issues/<NN>` citation (bare number or full file) in a sentence containing "until" or "waits on", in an entry (top-level bullet with its indented sub-bullets, numbered step, table row or paragraph) containing "being built", or directly after an `Open:` pointer, resolves it to the tracked ticket file, and fails when that ticket's status closes it — `resolved`, `done`, `implemented`, `built`, `wontfix` or `superseded` — or when no ticket has that number. Sentences split before a capital or a digit, but not after "e.g." or "i.e.". The status reader takes both `Status: resolved` and `**Status:** resolved`.

Red first, on 2026-10-10: before the guard's table-row split and the doc fix, the real-doc assertion reported two faults. One was real: AGENTS.md's ADR 0122 entry, "built, bar the control (ticket 02)", still said the resize control is offered only on an Open Resource "until `.scratch/size-independent-of-open/issues/02`", which is resolved. That entry now says built and points at R44. The other was a false match across rows of `maps-and-graphs.md`'s rejected-alternatives table, fixed by making each table row its own entry and held by a fixture.

Fixtures: "until" with a resolved ticket fails, as does "until" with a ticket closed by each other closing status; "being built" with a ticket cited later in the entry, or in its indented sub-bullet, fails; "waits on" with a resolved ticket fails; an `Open:` pointer to a resolved ticket fails; "until" with an open ticket passes; a resolved ticket cited without a pending claim passes; "until" and "waits on" stay within their sentence, "until" within its table row, a sentence starting with a digit ends the one before it, and an "e.g." citation stays in its sentence; a citation naming no ticket fails.

Checks: `pnpm exec vitest run test/unit/docs-agents-ticket-status.test.ts test/unit/docs-agents-citation-accuracy.test.ts test/unit/current-domain-vocabulary.test.ts test/unit/agent-skill-commands.test.ts` (124 passed), `pnpm exec eslint` and `pnpm exec oxlint -c .oxlintrc.json` on the new test, `pnpm exec prettier --check`, `pnpm typecheck`.
