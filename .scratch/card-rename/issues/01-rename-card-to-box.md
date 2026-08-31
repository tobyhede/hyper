# Rename Card to Box

Status: needs-triage

Surfaced by: a scoping question, not a defect. Nothing is broken; this records what the rename would cost and the one finding that argues against the proposed target word.

## Context

`Card` is the domain's oldest name — CONTEXT.md says it is named for HyperCard's card — and it reaches further than any other term in the repo. A rename to `Box` was raised; this is the survey.

### Raw size

15,842 occurrences of `card` (case-insensitive) across 634 tracked files.

| tree | occurrences | files |
|---|---|---|
| live source (`packages`, `src`, `test`, `tools`, `scripts`) | 10,191 | ~276 |
| docs (`CONTEXT.md`, `AGENTS.md`, `docs/`, `.agents/`) | 1,514 | 82 |
| `.scratch/` (historical) | 4,005 | 259 |
| `migrations/` | 124 | 10 |

173 files carry `card` in the **path** — 82 in live source, 91 in `.scratch/`.

The precedent is ADR 0041's Route to Graph rename: `7a2a860` was 139 files / ~2,200 lines, with `bf4aa81` and later corrections behind it. Card is roughly 4x that in live source, and unlike Route it reaches the database, the on-disk format, the stylesheets and the test ids.

## The finding: `Box` collides with a word already in use

`box` is this repo's existing word for *a rectangle*, and it is load-bearing:

```
box 196   combobox 126   textbox 117   boundingBox 43   cardBox 31
titleBox 25   boxOf 25   handleBox 5   nodeBox 3
viewBox / boxShadow / boxSizing / letterbox / checkbox / listbox
```

Two consequences:

- `cardBox` becomes `boxBox`. `titleBox`, `handleBox`, `growBox`, `closeBox`, `editBox`, `previewBox` all lose the contrast that made them readable — each named *the box of* something, and the something would now be a Box too.
- `combobox`, `textbox` and `listbox` are ARIA role strings in test queries and in Base UI's own API. No pattern-driven rename can run unattended over them.

CONTEXT.md's `_Avoid_` lists exist to stop one word naming two things, and two of them have already cost a guard test to enforce (`arrangement`, and the retired chrome word issue 11 covers). Box would be the first term deliberately introduced *into* a collision rather than out of one.

**If the motivation is to move off HyperCard's inheritance, the target word needs to be one the geometry is not already using.** That decision comes before any of the work below is worth scoping further.

## What makes it more than a search-and-replace

**Database.** Prisma model `Card`, `@@map("cards")`, and the constraint name `cards_pkey` written literally in `src/persistence/postgres-space-repository.ts:57`. Two migrations carry contract snapshots (`ops.json`, `end-contract.json`, `end-contract.d.ts`) naming the table. ADR 0054/0056 make every database derived, so this is a regenerate rather than a data migration — but schema, fixtures and tests roll forward in one change, and `pnpm e2e:postgres` has to run once with PostgreSQL up because the table name moved.

**On-disk format.** The `cards/` directory in `src/export/export-space.ts` and `src/import/read-single-space.ts`; 15 tracked card files under `packages/app/example/cards/` and `packages/app/fixture/cards/`; the `cards:` key in `spaceSnapshotSchema` and `importSpaceSchema`. Card frontmatter itself has no `card` key (`id` / `title` / `kind` only), so the frontmatter survives — the directory name, the snapshot key and the prose do not.

**CSS and test ids.** ~66 distinct class blocks across 8 stylesheets (`.canvas-card`, `.rf-card-node`, `.card__title`, `.card-pane`, `.card-editor`, `.markdown-card-body`), and 12 `data-testid` values (`add-card`, `open-card`, `close-card`, `card-content`, `canvas-card-actions`, `markdown-card-body-edit-target`, ...). `packages/app/stories/design-system-inventory.ts` records hand-rolled blocks **by class name** with prose reasons; `pnpm ui:catalog:check` fails until ~10 entries and their explanations are rewritten in the same commit.

**Guard tests that encode names.**

- `test/unit/current-domain-vocabulary.test.ts` would take Card into its retirement list. Its identifier-shape patterns (`Card[A-Z]`, `\bcard[A-Z]`, `\bCARDS?\b`, `\bcards["']?\s*[:=]`, `\.cards\b`) fire on the ADRs and CONTEXT.md that have to name the retired word — `HISTORICAL_TREES` already accounts for `docs/adr/`, `docs/superpowers/` and `.scratch/`, so the existing scoping carries, but the new patterns need the same read against `combobox`/`textbox` that the collision above implies.
- `test/unit/graph-package-surface.test.ts` — the curated export list, 19 hits.
- `test/unit/canvas-card-contrast.test.ts` (18), `test/unit/ui-catalog.test.ts` (26).
- The I/O suites: `hyper-cli.test.ts` (70), `export-space.test.ts` (57), `read-single-space.test.ts` (40), `memory-space-repository.test.ts` (35).

**shadcn collision.** `packages/ui/src/components/card.tsx` is the vendored shadcn `Card` primitive. Renaming it diverges from the registry `$shadcn-first-ui` requires searching first, and the next `shadcn add` re-adds `card.tsx`. Realistically it keeps shadcn's name, leaving the domain's Box composed on top of shadcn's Card — defensible (it is the arrangement `Sidebar` already has) but worth deciding deliberately rather than discovering.

**Ladle story ids.** 11 hardcoded `story=components--card--*` ids in `packages/app/ladle-e2e/`, derived from story file paths. `pnpm e2e:ladle` is its own CI job that neither `verify` nor `e2e` runs, so a missed id fails only there.

**`eslint-suppressions.json`** names `packages/app/src/card.ts` and `packages/graph/src/card-file.ts` by path. It is generated and never hand-edited, and `--prune-suppressions` only shrinks — so it regenerates in the same commit, and the ADR 0062 ratchet has to still hold across the moved files.

**ADRs are immutable.** 60 of 68 ADRs mention Card; 16 carry it in the filename, including `0004-cards-are-the-graph.md`. `docs/agents/domain.md` and `docs/agents/workflow.md` forbid editing an accepted one. So the documentation half is not a rename at all — it is a new ADR ("Box is the first-public name for Card"), a CONTEXT.md rewrite and the guard test, exactly the shape ADR 0041 took, leaving 60 ADRs speaking the old word permanently.

## Direction

Not ready for an agent. Two things have to be settled by a person first:

1. **Whether to rename at all.** Card is not wrong — it is the domain's own metaphor, recorded as such in CONTEXT.md. Nothing here is a defect.
2. **What the target word is**, if yes. Box is the wrong one for the reason above.

If both land, `docs/agents/workflow.md` is explicit that a repo-wide rename runs **alone and early**, never riding along with a structural change, because every ticket completed before it adds new surface in the old vocabulary. Four commits:

1. ADR + CONTEXT.md + AGENTS.md — the decision, before any code.
2. Domain and storage: `core` schemas, `graph`, `persistence`, Prisma, migrations, fixtures, `example/` and `fixture/` directories.
3. UI: components, CSS blocks, test ids, stories, `design-system-inventory.ts` entries, Ladle story ids.
4. Guard test, regenerated `eslint-suppressions.json`, docs sweep.

`.scratch/` (4,005 hits, 259 files) is historical and stays as written, like the ADRs.

Verification bar for a behaviour-preserving rename: `pnpm verify` green, `pnpm e2e` green **and unchanged** (that is the proof it preserved behaviour), `pnpm e2e:ladle` green, and `pnpm e2e:postgres` once with PostgreSQL up.
