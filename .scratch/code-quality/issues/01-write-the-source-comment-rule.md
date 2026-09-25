# 01: Write the source comment rule

**What to build:** A written rule for what a source comment may carry, sitting beside the existing comment rules, so ticket 10 can apply it mechanically and review can hold it afterwards. A comment states what the code does, why, and the invariant it keeps. It does not narrate lineage — what the code replaced, what was retired, what it "used to" do, which alternative was rejected. An ADR or ticket citation is kept only where the constraint it names is not visible in the code itself.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The rule is written with at least one before/after example for lineage prose, and one for a citation that stays
- [x] The rule says where lineage goes instead (commit message, ADR, ticket)
- [x] Every vocabulary-test mask and exemption that depends on comment text is listed, with whether removing that text would break it
- [x] `pnpm verify` green

## Answer

The rule is in `docs/agents/workflow.md` under "What a comment may carry", right after "What a comment may assert". `AGENTS.md` has a one-bullet pointer beside the existing comment bullet. The rule is a check applied one sentence at a time:

1. **Lineage test:** would the sentence still be true, and still worth saying, if the code had been written this way from the start? If not, it is lineage and goes. The signal words (_replaced, retired, no longer, used to, was once_ …) count only when their subject is the source or the design. A sentence about runtime state ("a Space replaced under it") stays.
2. If the lineage was guarding an invariant, keep the invariant as a present-tense constraint ("Do not X: X causes Y").
3. A citation stays only when it names a constraint the code cannot show **and** the cited document holds the reasoning. A `.scratch/` citation stays only while that ticket is open.
4. Lineage goes to the commit message by default. A decision and its rejected alternatives go to an ADR. A negative result, measurement or open follow-up goes to a ticket.

The examples are real. Two are pure deletions (`CommandDock.tsx`'s "It replaces `SpaceSidebar` …", `camera.ts`'s `PRESENTING_DURATION`). One reduces lineage to its invariant (`placement.ts` `roomAxis`). One citation stays (`displace`'s ADR 0084 memorylessness) and one goes (`snapshot-edits.ts`'s module summary).

### Inventory: gates that read comment text

**Method.** This was measured, not read off the test. `git archive HEAD` went into a scratch copy. Every non-directive comment was blanked with the TypeScript parser's comment ranges (`/* */` in `.css`, `//` in `.prisma`), keeping `eslint-`, `@ts-`, `prettier-ignore` and `///` directives. The copy still typechecks with `tsc` exit 0. It was then run through the full `vitest run`, `eslint`, `oxlint` and `ui:catalog:check`, with `current-domain-vocabulary.test.ts`'s `expect` switched to `expect.soft` so that every failing mask is reported and not just the first. Two scopes were run: ticket 10's own scope (`packages/*/src`, `src/`, `scripts/`), then everything under `packages/`, `src/`, `scripts/` and `test/`. Two timeouts that appeared under parallel load (`sqlite-root-env`, `space-resource-embedded-map`) both passed when re-run alone on the stripped copy, so they are not comment-dependent.

**Would break inside ticket 10's scope (`packages/*/src`, `src/`, `scripts/`):**

| Gate | Text it needs | Only home | What 10 should do |
|---|---|---|---|
| `current-domain-vocabulary` › "a Space is named once" › keeps no mask that has stopped earning itself (`RETIREMENT_NOTICES`) | `"manifest" is retired` | `packages/core/src/schema.ts:325` doc comment on `spaceFileSchema` | **Keep the sentence verbatim.** A strict reading of the lineage test would remove it, but it is one of the gate-held texts the rule sets aside ("What the rule does not touch"), and it guards the retired name at the place the name would come back. The alternative is to drop the entry from `RETIREMENT_NOTICES` in the same commit, after which the sentence is no longer masked, so it has to go too. |
| same test, same array | `not a manifest.` | `packages/core/src/schema.ts:326`, the same sentence | Same as above. The two go together. |
| oxlint `anti-slop/require-safety-comment-for-type-assertion` | a `SAFETY:` comment before each assertion | 27 assertions in scope: `persistence/src/http-protocol.ts` (5), `app/src/render-adapter.ts` (5), `graph/src/space.ts` (4), `graph/src/placement.ts` (2), `app/src/space-authoring.ts` (2), `src/sqlite/sql-store.ts` (2), one each in `src/prisma/sql-store.ts`, `src/export/export-aggregate.ts`, `src/aggregate-directory/aggregate-file.ts`, `ui/src/components/input-group.tsx`, `persistence/src/observable-state.ts`, `graph/src/resource-file.ts`, `app/src/resource.ts`. Also 2 in `packages/app/vite-space-http-plugin.ts` | Shorten the lineage inside a `SAFETY:` comment, but keep `SAFETY:` and the checked invariant. |
| ESLint `no-empty` | any comment inside an intentionally empty block | `http/src/index.ts:145`, `:543`; `persistence/src/http-protocol.ts:355`; `persistence/src/observable-state.ts:27`; `src/cli/main.ts:18`; `src/http/database-http-runtime.ts:14`; `src/startup/database-startup.ts:134`; `scripts/space-resource-drag-benchmark/drag.benchmark.ts:61` | Keep one present-tense line saying why the block is empty. |

**Would break outside ticket 10's scope (tests and stories).** These are listed because the rule covers them too, and a later sweep of test comments would reach them:

| Gate | Text it needs | Only home | What a sweep should do |
|---|---|---|---|
| `current-domain-vocabulary` › "a Map is named once" › keeps no exemption that has stopped earning itself (`QUALIFIED_SPELLINGS`) | `re-layout` | comments at `packages/app/stories/support/ReactFlowCanvas.tsx:102` and `packages/app/test/placement-rendering.test.tsx:39` (the second is lineage: "since it stopped forcing …") | If both go, delete the `re-${retiredMapLower}` entry from `QUALIFIED_SPELLINGS` in the same commit. The mask then has nothing to forgive. |
| `docs-agents-citation-accuracy` › finds at least one citation in this quoted shape | a comment in the form `` `docs/agents/X.md` pins under "…" `` | `packages/graph/test/space-snapshot.test.ts:68`, the only real one, inside a lineage paragraph ("`parseSnapshot` … used to reach …") | Reduce the paragraph to its invariant but keep the citation sentence, or relax the "at least one" assertion in the same commit. |

**Does not depend on comment text** (all pass with every comment blanked in both scopes): every other `expectEachExemptionEarned` list (`FOREIGN_BARE_FILES`, `MONOREPO_VOCABULARY`, `RETIRED_SURFACE_FILES`, `RETIRED_OPENER_FILES`, `FOREIGN_MAP_FILES`, `FOREIGN_RESOURCE_FILES`, `FOREIGN_BARE_RESOURCE_FILES`, `FOREIGN_ALIAS_FILES`); every other `QUALIFIED_SPELLINGS` entry; `FOREIGN_SPACE_SPELLINGS`; `QUALIFIED_RESOURCE_SPELLINGS`; `QUALIFIED_ALIAS_SPELLINGS`; `AGGREGATE_RETIREMENT_NOTICE`; `REFERENCE_RESOURCE_RETIREMENT_NOTICE`; the `README.md` copy of `"Manifest" is retired`; `ui:catalog:check`; and every other repository-scanning test in `test/unit`. Each of these is held by code or by a Markdown document. A rewrite in ticket 10 could still *add* a hit, and the vocabulary test's "finds no …" arms catch that on their own.

**Correction (PR #300):** `HISTORICAL_QUOTATIONS` does depend on comment text. Its `layout-header` entry is earned only by a comment in `packages/app/test/SpaceApp.test.tsx`, and removing that comment fails the test. #300 keeps the word in a present-tense rewrite and points the mask's own comment at that file.
