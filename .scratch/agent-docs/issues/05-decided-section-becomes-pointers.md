# 05: Turn AGENTS.md's "Decided" section into pointers

**What to build:** each ADR entry in AGENTS.md's "Decided" section becomes one line: its build status, the guide that owns its rules, and its open ticket if there is one. The rules themselves live only in the topic guides. An agent therefore meets one copy of each rule, the copy that is kept current.

**Blocked by:** 01, 04.

**Status:** resolved

- [x] No rule stated in the Maps-and-Graphs, editing-and-persistence, rendering or UI guides is restated in AGENTS.md.
- [x] A rule that has no home yet moves into the guide that owns its area before AGENTS.md loses it.
- [x] ADR 0112 has its own entry instead of sitting inside ADR 0070's.
- [x] The stale-citation guard from 04 passes.

## Answer

Each "Decided" entry is now one line: build status, the guide that owns the rules, and the open ticket where there is one (Jump to Target, `.scratch/alias-cards/issues/05`). The ADR 0069 entry and the ADR 0095 entry stay as they were in this commit, because tickets 06 and 07 own their moves. Rules that had no home moved before AGENTS.md lost them:

- **ADR 0079, Space Resource selection** → `editing-and-persistence.md`, new bullet "A Space Resource's selection is durable": the required `map`/`graph`, the three dangling-reference refusals (`space-aggregate.ts`), `decideCommit`'s `baselineUnreferenced`, Enter through `resource-rail-actions.tsx`, and the mapless-Meta fixture rule (`aggregate-round-trip.test.ts`, the `a mapless Space` block). `maps-and-graphs.md` now points there instead of at AGENTS.md.
- **ADR 0061** → `build-tooling.md`, merged with the Conventions bullet, which is now a one-line pointer. The Build & tooling pointer names it.
- **ADR 0064** → `ui.md`, new bullet "Opening and editing a Resource are separate".
- **ADR 0070 / 0089** → `ui.md`'s Reference Resource bullet, rewritten without lineage: the Open controls, the Image Target's missing Replace, Create Reference naming the new Resource after its Target, the Space Resource entity menu. `rendering.md` gains "A Resource's content resolves once, in `graph`" (`resolveResourceContent`, `display`, `beginEditing`/`beginReplacing`, the Stage) and now holds ADR 0083 there rather than inside the fixture paragraph.
- **ADR 0112** → its own entry, pointing at `rendering.md`'s `createMapSurface` bullet, which already stated every rule.
- **ADR 0122** "general grid snapping is out of scope" → `rendering.md`'s resizing bullet. The rest was already `maps-and-graphs.md` R37–R44, A17, A26.
- **ADR 0084/0093** → already `maps-and-graphs.md` R40–R43 and Undo; `rendering.md`'s resizing bullet.
- **ADR 0062** → already `anti-slop.md` in full.
- **ADR 0041** → `domain.md`, "Graph is the name for what older records call Route".

`workflow.md`'s current-contracts section now says AGENTS.md's "Decided" pointers rather than "as before".

Checks: `pnpm exec vitest run test/unit/docs-agents-citation-accuracy.test.ts test/unit/docs-agents-ticket-status.test.ts test/unit/current-domain-vocabulary.test.ts test/unit/agent-skill-commands.test.ts test/unit/agent-skill-symlinks.test.ts` (129 passed); `pnpm exec prettier --check AGENTS.md docs/agents/*.md`. AGENTS.md 68,871 → 58,642 bytes.
