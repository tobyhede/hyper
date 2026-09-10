# Card → Thing (ADR 0085, change two): reconnaissance inventory

Read-only survey taken at `ca2a8a9a`, before the codemod was written. Counts are approximate and regenerable; the judgement calls and hazards are the part worth keeping.

Governing ADR: `docs/adr/0085-thing-and-diagram-are-the-first-public-names-for-card-and-layout.md`. Not 0083 — that is Title Lines.

## Scale

Over tracked regular files, excluding the trees the change-one codemod excludes (`docs/adr/`, `docs/superpowers/`, `.scratch/`, `pnpm-lock.yaml`, `skills-lock.json`, `.agents/skills/`): **410 files, ~16,300 occurrences of `/card/i`**, and **84 tracked paths whose basename contains `card`**. Change one touched 242 files.

Heaviest trees: `packages/app` 7662, `packages/ui` 1303, `packages/graph` 1083, `packages/react-flow-adapter` 611, `test/unit` 424, **`migrations/app` 327**, `packages/persistence` 267, `packages/core` 236.

## The hazard change one did not have: `migrations/`

Layout was never a table, so the change-one codemod's `EXCLUDED_PATHS` never had to consider `migrations/`. Card is a table, and this is the same *shape* of failure the change-one header records as fatal — invisible locally, red on a clean CI:

- `migrations/app/` holds 40 files / 327 occurrences: `table: 'cards'`, `index: 'cards_space_id_idx'`, `name: 'cards_space_id_fkey'`, and every `start-contract.json` / `end-contract.json` / `end-contract.d.ts` snapshot. **Migration snapshots are history and are not rewritten** (ADR 0085 says so explicitly). A swept snapshot passes against an already-migrated local database and fails against a fresh one.
- `src/prisma/contract.prisma:14,28,37` — `cards Card[]`, `model Card`, `@@map("cards")`. ADR 0085: this is **one forward migration**, authored, not swept.
- `src/prisma/contract.json` and `contract.d.ts` are generated (`pnpm contract:emit`, checked by `contract:check` via `git diff --exit-code`). Regenerate; do not sweep.
- Runtime SQL identifiers travel with the migration: `src/persistence/postgres-space-repository.ts:93,309,346`.
- The guard scans `migrations/` today (`scannableFiles()` excludes only the four historical trees), so the Card block needs `migrations/` as either a historical tree or a file exemption. That is a design call, not a mechanical one.

**Only `pnpm test:integration:postgres` and `pnpm e2e:postgres` can observe this, and neither is in `verify`, `e2e` or `e2e:ladle`.**

## Carve-outs

**Vendored shadcn registry** — `packages/ui/src/components/card.tsx` (7 exports, `data-slot="card"`, `bg-card`/`text-card-foreground`, `--card-spacing`). Imports, exhaustive: `packages/ui/src/index.ts:134-142`, `packages/ui/src/CanvasCard.tsx:13`, `packages/ui/src/CardRail.tsx:4`. Tokens: `packages/app/src/tailwind.css:11,12,58`, `packages/app/stories/review/card-icons.css:11`.

The registry alias **resolves rather than persists**: `index.ts:137` exports `CardContent as CardSection` only because the domain `packages/ui/src/CardContent.tsx` occupies the name. Once that is `ThingContent`, delete `CardSection`, export the registry component as `CardContent`, and re-point its 10 consumers. This is the one place the sweep edits the carve-out's neighbourhood rather than skipping it.

`packages/app/stories/parity-claims.ts` names `storyFile: 'components/card.stories.tsx'` 14 times — that is the **domain** story file, not the registry module. Both spell `components/card`.

**Foreign** — `pnpm-lock.yaml` has zero `card` hits (unlike Layout's `@radix-ui/react-use-layout-effect`), so it is a principle exclusion, not a live hazard. `patches/` clean. `.agents/skills/` has 9 files carrying shadcn's own registry vocabulary. `.claude/skills/*` and `CLAUDE.md` are tracked symlinks — keep the codemod's `REGULAR_FILE_MODES` filter.

**English words** — `discard*` ~290 (incl. `CONTEXT.md:76,103` and four anti-slop rule sources), `cardinality` 67, `scorecard` 27, `wildcard` 4. A `\bcard` boundary handles the first, third and fourth. **`cardinality` starts on a word boundary and must be protected explicitly**, exactly as `LayoutStrategy` was.

**Historical trees** — `docs/adr/` (77 files, 24 card-titled filenames), `docs/superpowers/` (6), `.scratch/` (~430 files, 140 card-named paths). Citations *into* them from live files must be masked or they become dangling pointers: `README.md:84,151,154,163,167,169`, `AGENTS.md:15,27`, `docs/agents/rendering.md:8,30`, `packages/app/src/edge-authoring.ts:87`, `packages/graph/test/card-file-round-trip.property.test.ts:18`, and the `<feature>/<NN>` shorthand `scripts/roadmap.ts` parses (`card-route-editing`, `card-titles`, `card-files`, `card-display`, `card-gestures`, `card-authoring`, `card-resizing`, `card-rename`, `card-title-one-activation`, `canvas-card-authoring`, `cards-drawer-component`, `space-cards`, `alias-cards`, `expanded-cards`, `opened-card-seam`).

## Judgement calls

**`CardId` → `ThingId`** — decided yes (ADR 0085 interface table). One declaration, `packages/core/src/types.ts:57` (`type CardId = Card['id']`); 275 + 697 uses follow. `LayoutStrategyCard` → `LayoutStrategyThing` is named explicitly by the ADR, the one Card-suffixed name inside an otherwise-protected family.

**The `cards` document key** — three different answers. The **space file has no `cards` key** (`schema.ts:296-302`, `spaceFileObjectSchema` is `.strictObject`): nothing to rename. The **snapshot and import** shapes do (`schema.ts:358,390`) and the ADR renames them to `things`. The **database** is the forward migration above.

**`cards/` directory** — ADR 0085: "The directory is named `things/`." The reader that makes it load-bearing is `src/import/read-single-space.ts:60-72`, which scans `*.md` beside `space.json` **and** `join(spaceDirectory, 'cards')` — renaming without that line is a silent zero-file import. Writers: `src/export/export-space.ts:167,170,180`, `packages/graph/src/new-space.ts:78`. Note the asymmetry: `packages/app/fixture/a.md` sits at the root deliberately, exercising the first scan location — do not tidy it into the directory. `fixture/a.md:6,8` also contains `collection's layout`, a change-one protected phrase: sweep `card` there, not `layout`.

**`card-file.ts` renames**, unlike `layout.ts`. The `layout.ts` carve-out rests on "the word in them is the verb"; that argument does not transfer — every export of `card-file.ts` is a domain name. It pulls 4 sibling test files and three `card-files.ts` helpers imported by 17 modules.

**Product URL** — two card segments, `product-destination.ts:55,66`, parsed at `:86,106`. Unlike change one's `/views/` → `/diagrams/` (which the script deliberately did not produce, "it is not a spelling"), `cards` → `things` **is** a spelling and can be mechanical. The destination-kind literals `'card'` (:14) and `'diagram-card'` (:17) travel with it. `/api/spaces` is unchanged.

**Completion kinds and refusal codes** — ADR 0085: test ids, CSS classes, labels and diagnostics follow the product vocabulary. The risk is that they are not one list: the nine completion kinds are declared at `space-authoring.ts:108-159` and **re-listed twice more in the same file** (:202-206, :406-411) plus switched on in `embedded-authoring.ts:35-40` and `render-adapter.ts:478,638`; the refusal codes are declared at `space-authoring.ts:236-260` and re-listed **three times** in `authoring-refusal.ts` (:46-82, :117-135, :170-188). A whole-file substitution moves them together; a hand-audited subset will not typecheck. `.coderabbit.yaml:94-95` quotes `graph-edge-card-outside-diagram`, which **already** does not match the code's `edge-card-outside-diagram` — stale before the sweep and stale after it. Human read.

**Single-letter binding** — the convention is stated at `test/unit/current-domain-vocabulary.test.ts:104` ("`(c)` for card, `(d)` for diagram, `(e)` for edge") and must become `(t)` for thing. 27 live sites bind `c` over a card collection (`graph/src/validate.ts:103,104,106`, `graph/src/grid.ts:41,42`, `graph/test/space.property.test.ts:70,75,89,90`, `react-flow-adapter/test/strategy-contract.test.ts:117,163,204`). A text sweep renames `.cards` → `.things` and leaves `(c) =>` — exactly the drift the Route block's initial-binding arm exists to catch. Decide whether the codemod rewrites it or it is a hand edit, as the URL was for change one.

**`nextCardTitle`** (`packages/app/src/titles.ts:46`) mints the author-visible `Card N`, which every `getByRole(… { name: 'Card 3' })` selector follows. But fixture titles like `Card Architecture`, `Card Strategies`, `Card Long Markdown` are **authored content**, not minted. Distinguish before sweeping spec strings.

**`thing` → `entity` prose substitution** — ADR 0085 makes this part of change two. 528 bare `thing`/`things` across 151 authored files (the ADR estimated 336; it has grown). `CONTEXT.md` was already converted by `2a106667`. **`test/unit/ui-catalog.test.ts` uses bare `Thing` 34 times** as a synthetic placeholder export — the ADR asks for a different placeholder, and it is the one place where the new domain name creates a false positive in an existing test's fixtures.

## The guard (`test/unit/current-domain-vocabulary.test.ts`)

1,266 lines, five blocks, shared helpers at 22-245. Retired words are never spelled literally — always `['L','ayout'].join('')` — so the file is scannable by its own scan. Keep that.

Shared: `HISTORICAL_TREES` (:136), `trackedFiles()` (:191, `REGULAR_FILE_MODES` so tracked symlinks are not read twice), `scannableFiles()` (:206, what every block starts from — **including `migrations/`, `src/prisma/` and fixtures**), `isImplementationSource` (:127, scopes the bare-name arm), `hits`/`spanningHits` (:210/:221), `expectEachExemptionEarned` (:239, an exemption that stops matching is deleted rather than left hollow).

The Layout block (1002-1266) is the template. Five shapes in `RETIRED_DIAGRAM_NAME` (:1040), each with its recorded reason: PascalCase opening with `(?<!use)` / `(?!Strategy)`; PascalCase closing with `s?` because a lowercase plural ends the word without a boundary landing; camelCase opening; screaming, where `LAYOUT_[A-Z]` has **no leading `\b` deliberately** since `_` is a word character; and the collection key `(?<!-)\blayouts?["']?\s*[:=]` plus `\.layouts\b`. Bare `\bLayout\b` (:1077) applies to implementation source only. Two exemption mechanisms, **both masking rather than skipping** — foreign spellings (:1102) and exact historical quotations (:1119) — so a domain compound added to an exempted file is still reported. Seven `it` blocks (:1144-1265), including one asserting the scan still reaches three known paths, so a file list that stopped resolving cannot report nothing forever.

What a Card block needs that Layout's did not: the registry exemption (but `packages/ui/src/index.ts` is a barrel exporting 25+ domain names — narrow the mask to the `from './components/card'` block rather than the whole file); a decision on `migrations/`; the `cardinality` protection; a replacement for `ui-catalog.test.ts`'s `Thing` placeholders; and the `(c)` convention line at :104, which sits above all five blocks.

## Path renames

83 basenames + 2 directories (17 files) = 100 paths. `packages/ui/src/components/card.tsx` excluded.

Directories: `packages/app/example/cards/` → `things/` (7 files); `packages/app/fixture/cards/` → `things/` (10 files; `fixture/a.md` and both `space.json` stay put).

- `core`: `src/card-geometry.ts`, `test/card-document-equality.test.ts`
- `graph`: `src/card-file.ts`, `test/card-file.test.ts`, `test/card-file.property.test.ts`, `test/card-file-round-trip.property.test.ts`, `test/serialize-card-file.test.ts`, `test/card-files.ts`
- `react-flow-adapter`: `src/CardNode.tsx`, `test/CardNode.test.tsx`, `test/card-files.ts`
- `ui/src`: `AddCardControl.tsx`, `CanvasCard.tsx`, `CardContent.tsx` (frees the registry name), `CardKindIcon.tsx`, `CardRail.tsx`, `CardRailActions.tsx`, `CardSearchCombobox.tsx`, `MarkdownCardBody.tsx`, `canvas-card.css`, `card-content-edit.ts`, `card-rail.css`, `card-search-combobox.css`, `markdown-card-body.css`
- `ui/test`: `AddCardControl-base-ui.test.tsx`, `AddCardControl.test.tsx`, `CanvasCard-rail-toolbar.test.tsx`, `CanvasCard.test.tsx`, `CardContent.test.tsx`, `CardSearchCombobox.test.tsx`, `MarkdownCardBody.test.tsx`, `canvas-card-embedded-diagram.test.ts`, `canvas-card-title-ladder.test.ts`
- `app/src`: `canvas-card-authoring.ts`, `card-choice.ts`, `card-creation-react.ts`, `card-creation.ts`, `card.ts`, `space-card-lifecycle.ts`, `space-card-targets.ts`, `components/CardPane.tsx`, `components/CardsDrawer.tsx`, `components/DeleteCardConfirmation.tsx`, `components/NewCardPreview.tsx`, `components/NewSpaceCard.tsx`
- `app/stories`: `components/card-and-alias-panes.stories.tsx`, `components/card-editing.stories.tsx`, `components/card.stories.tsx`, `components/space-card-panes.stories.tsx`, `review/card-icons.css`, `review/card-icons.stories.tsx`, `review/card-resize-close-snap.stories.tsx`, `review/space-card-canvas-prototype.css`, `review/space-card-canvas-prototype.stories.tsx`, `review/space-card-rail.css`, `review/space-card-rail.stories.tsx`, `support/CanvasCardSpecimen.tsx`, `surfaces/cards-drawer.stories.tsx`, `surfaces/space-card-embedded-diagram.stories.tsx` — **renaming a `.stories.tsx` changes its Ladle story id**, which every `?story=…` URL and every `storyFile:` entry in `parity-claims.ts` is keyed on
- `app/test`: `CardsDrawer.test.tsx`, `NewSpaceCard.test.tsx`, `canvas-card-authoring.test.tsx`, `card-authoring.test.tsx`, `card-creation-react.test.tsx`, `card-creation-state.test.ts`, `card-creation.test.tsx`, `card-files.ts`, `card-rail-actions.test.tsx`, `space-card-authoring.test.tsx`, `space-card-embedded-diagram.test.tsx`, `space-card-lifecycle.test.ts`, `space-card-selection.test.tsx`, `space-card-targets.test.tsx`
- `app/e2e`, `app/ladle-e2e`: `card-rail-hover.spec.ts`, `space-card.spec.ts`, `card-expand.spec.ts`, `card.spec.ts`, `cards-drawer.spec.ts`, `issue-03-card-and-alias-panes.spec.ts`, `space-card-embedded-diagram.spec.ts`, `space-card-panes.spec.ts` — `issue-03-…` encodes a `.scratch/design-system-baseline/issues/03-…` filename that keeps the old word; renaming it breaks that correspondence
- elsewhere: `packages/persistence/test/space-card-lifecycle.test.ts`, `test/unit/canvas-card-contrast.test.ts`

Path strings that must move with the renames rather than being renames themselves: `eslint-suppressions.json:27,52`; `.oxlintrc.json:95,114,115,338`; `packages/app/stories/design-system-inventory.ts:53,63`; `test/key-bindings.ts:29,37`.
