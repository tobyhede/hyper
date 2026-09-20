# 02 — A Diagram is a Map and a Thing is a Resource

**Status:** resolved
**Blocked by:** 01 — Free the English prose the sweep would corrupt.

**What to build:** Run `.scratch/map-and-resource/rename-diagram-to-map-and-thing-to-resource.mjs`, then `pnpm exec prettier --write .`, then make by hand the six edits the script deliberately does not produce. One commit.

**Why:** ADR 0101. The vocabulary is decided; this is the change that lands it.

**Before running anything, the tree must be clear.** Every branch alive during the sweep is a full-range replay from its merge-base — never a tips-only rewrite, which changes the shape of the conflicts without reducing them (30 to 9, measured last cycle). PR #243 lands first: it modifies `test/unit/current-domain-vocabulary.test.ts`, which 04 rewrites, and `packages/persistence/src/repository.ts`, which declares the `SpaceResourceRepository` the script pre-renames.

**Scale:** 487 files rewritten, 128 paths renamed, in one pass. ADR 0085 needed two sweeps to do less.

**`pnpm exec prettier --write .` is not optional.** Both nouns change length, lines re-wrap, and `format:check` is red without it.

## The six edits the script does not produce

None of them is a spelling, which is why the script does not attempt them. A branch replaying this takes all six from the merge.

1. **The domain-initial bindings.** `(d)` becomes `(m)` and `(t)` becomes `(r)` over Map and Resource collections. The convention is the domain initial, not a spelling of the word.
2. **Sorted-assertion reorder.** A renamed directory or Title moves a row in a globally sorted expectation. No text substitution can see it and only a red test finds it. Both predecessors hit this; the second had to write `fixup-sort-order.mjs` to reproduce a fix the first had already made, so **look for it rather than waiting for it**.
3. **The sentences that name what ADR 0085 decided**, in `AGENTS.md` and `CONTEXT.md`, which would otherwise sweep into "Map and Resource are the first-public names for Map and Resource".
4. **The four type-position `Map<…>` annotations** ADR 0101 measures — `render-adapter.ts:292` and `:313`, `canvas-thing-authoring.ts:44`, `edge-lanes.ts:55` — and only where the module also imports the domain type. `ReadonlyMap` where the semantics allow; an aliased import where they do not.
5. **The guard block**, which is 04.
6. **The two migrations**, which are 03.

## The citation the script reports

`--dry` reports every bare `<feature>/NN` citation it rewrote, because the citation mask forgives a *shape* — a path under `.scratch/`, or an ADR slug — and cannot see one written without its prefix. Two escaped the Card sweep that way.

It currently reports one, and that one is **already broken**: `docs/agents/ui.md:20` cites `space-things/04`, but the directory is `.scratch/space-cards/`. The Card sweep rewrote the citation and not the directory it pointed at. Fix it to `space-cards/04` as part of this ticket — it is the same defect class, one rename earlier.

- [ ] The script ran, `prettier --write .` ran, and all six hand edits are in the same commit.
- [ ] `docs/agents/ui.md`'s `space-things/04` citation resolves again.
- [ ] `--dry` on the result reports zero files and zero paths.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, and the e2e suite is green **and unchanged** — that is what proves the sweep was behaviour-preserving.
- [ ] The commit contains no structural change. If something needed restructuring to compile, it is a separate commit before or after this one.

## Answer

Resolved in one stacked implementation commit. The codemod rewrote the current
source and renamed 128 paths, after which Prettier reformatted the complete
tree. Its finished-state dry run reports zero files and zero paths.

The manual sweep corrections are included: Resource and Map collection
callbacks use `(r)` and `(m)`; the sorted lifecycle and resource-discovery
expectations follow their renamed order; the current documentation retains the
meaning of the earlier vocabulary decisions; the four built-in `Map<…>` type
positions are explicit as `ReadonlyMap` or `globalThis.Map`; and
`docs/agents/ui.md` again resolves `space-cards/04`. The prerequisite's
`SpaceEndpointSelectors` filename and `EnteredFromSpaceEndpoint` story address
were also preserved where the path sweep encountered their earlier Thing-based
names.

Review found that the determiner-focused preparation report had not covered
every ordinary-English use of the old noun. The 49 additional comments and
current-document phrases it exposed have been reworded as their actual concept
— fact, rule, value, evidence, condition, proposal, operation or surface — so
the sweep leaves no lowercase `resource` pretending to name one of those.

The vocabulary guard and the two database migrations remain deliberately
owned by tickets 04 and 03 respectively; this commit does not cross those
ticket boundaries.

Verification:

- `pnpm verify` — passed: 229 files, 2,880 tests passed and 5 skipped.
- `pnpm e2e` — passed: 223 tests, with no behavioural test added or removed.
- `pnpm e2e:ladle` — passed: 112 tests. The first cold run exposed missing
  Vite optimiser chunks; after cache population, four affected Command Dock
  cases passed. One repeatable story-address mismatch was corrected before the
  complete green run.
