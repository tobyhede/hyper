# 02 — A Card is a Thing

Status: ready-for-agent
Blocked by: 01

**What to build:** The Card → Thing sweep — ADR 0085's second and larger change,
carried by a tracked codemod in the shape of
`.scratch/thing-and-diagram/rename-layout-to-diagram.mjs`, so a branch in flight
can replay it rather than hand-merge ~410 files.

**Why:** ADR 0085 decides the vocabulary and states the completion criterion: a
case-sensitive repository scan finds no domain `Card`, `CardId` or `cards`
outside the historical trees and the registry carve-out. Change one proved the
mask/rewrite/unmask design; this is the same instrument against a harder word.

- [ ] Domain and module interfaces take the names in ADR 0085's table:
      `Thing`/`ThingId`, `thingSchema`, `markdownThingSchema`, `aliasThingSchema`,
      `spaceThingSchema`, `thingPlacementSchema`, `things`, `LayoutStrategyThing`,
      `CanvasThing`, `ThingNode`, `ThingRail`, `ThingContent`,
      `ThingSearchCombobox`, `ThingKindIcon`, `AddThingControl`, `ThingsDrawer`,
      `MarkdownThingBody`, `NewSpaceThing`, and `nextThingTitle` minting the
      author-visible `Thing N`.
- [ ] The snapshot and import document keys become `things`; the space file has
      no `cards` key to rename and gains none.
- [ ] The on-disk inventory directory is `things/`, in both the reader and both
      writers.
- [ ] The product URL segment is `/spaces/:spaceId/things/:thingId`, with the
      destination-kind literals that travel with it. `/api/spaces` is unchanged.
- [ ] Test ids, CSS classes, accessibility labels, completion kinds and refusal
      codes follow the product vocabulary; `design-system-inventory.ts` records
      the class names that moved.
- [ ] The shadcn registry's `Card` family, its tokens and its `data-slot` values
      are untouched, and `packages/ui/src/index.ts` stops aliasing
      `CardContent as CardSection` — the registry component is exported under its
      own name and its consumers are re-pointed.
- [ ] `migrations/` is not swept. The database rename is 03.
- [ ] The codemod is tracked beside the change-one one, with a header recording
      its mask list's reasons and whatever it damaged before the list was right.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green, and `test/e2e/`
      is grepped by hand because nothing in those three observes it.

## What the codemod must not open

Change one's `EXCLUDED_PATHS` argument transfers, and one entry is added:

- `pnpm-lock.yaml` — has **zero** `card` hits today, so this is a principle
  exclusion rather than the live hazard it was for Layout. Keep it: the reason it
  exists is that a local check cannot see the damage and a clean CI install can.
- `skills-lock.json`, `.agents/skills/` — vendored guidance carrying shadcn's own
  registry vocabulary, pinned by a lock that records a provenance.
- `docs/adr/`, `docs/superpowers/`, `.scratch/` — history.
- **`migrations/`** — 40 files and ~344 occurrences of `table: 'cards'`,
  `cards_space_id_idx`, `cards_space_id_fkey` and the `start-contract` /
  `end-contract` snapshots. ADR 0085 says migration snapshots are history and are
  not rewritten. This is the same invisible-locally, fatal-on-CI shape the
  change-one header records: a swept snapshot passes against an already-migrated
  local database and fails against a fresh one.
- Keep `REGULAR_FILE_MODES`: `.claude/skills/*` and `CLAUDE.md` are tracked
  symlinks.

## What the codemod must not rewrite

- **`cardinality`** — 67 occurrences, and it opens on a word boundary, so a
  `\bcard` rule does not save it. It must be masked explicitly, exactly as
  `LayoutStrategy` was. `discard*` (~290), `scorecard` (27) and `wildcard` (4)
  are all handled by the boundary.
- **The registry carve-out** — `packages/ui/src/components/card.tsx` and its
  three importers, the Tailwind tokens in `packages/app/src/tailwind.css` and
  `packages/app/stories/review/card-icons.css`. Note that
  `packages/app/stories/parity-claims.ts` names `components/card.stories.tsx` 14
  times and that is the **domain** story file, not the registry module — both
  spell `components/card`.
- **Citations into the historical trees**, which a rename turns into dangling
  pointers: `README.md`, `AGENTS.md`, `docs/agents/rendering.md`,
  `packages/app/src/edge-authoring.ts`, the round-trip property test, and the
  `<feature>/<NN>` shorthand `scripts/roadmap.ts` parses — `card-route-editing`,
  `card-titles`, `card-files`, `card-display`, `card-gestures`, `card-authoring`,
  `card-resizing`, `card-rename`, `card-title-one-activation`,
  `canvas-card-authoring`, `cards-drawer-component`, `space-cards`,
  `alias-cards`, `opened-card-seam`, `expanded-cards`.
- **Authored fixture content** — titles like `Card Architecture`, `Card
  Strategies` and `Card Long Markdown` are content an author wrote, not the
  minted `Card N` that `nextCardTitle` produces and that every
  `getByRole(…, { name: 'Card 3' })` follows. Distinguish before sweeping spec
  strings.

## Hazards

- **`card-file.ts` renames, unlike `layout.ts`.** The kept-filename carve-out
  rests on "the word in them is the verb", and that argument does not transfer —
  every export of `card-file.ts` is a domain name. It pulls four sibling test
  files and three `card-files.ts` helpers imported by 17 modules.
- **Completion kinds and refusal codes are not one list.** The nine completion
  kinds are declared in `space-authoring.ts` and re-listed twice more in the same
  file, plus switched on in `embedded-authoring.ts` and `render-adapter.ts`; the
  refusal codes are declared once and re-listed three times in
  `authoring-refusal.ts`. A whole-file substitution moves them together; a
  hand-audited subset will not typecheck.
- **`.coderabbit.yaml` quotes `graph-edge-card-outside-diagram`, which already
  does not match the code's `edge-card-outside-diagram`.** Stale before the sweep
  and stale after it. A human read, not a codemod's problem.
- **`packages/app/fixture/a.md` sits at the root deliberately**, exercising the
  reader's first scan location. Do not tidy it into `things/`. It also contains
  `collection's layout`, a change-one protected phrase — sweep `card` there, not
  `layout`.
- **The `cards/` directory rename is silent if the reader is missed.**
  `src/import/read-single-space.ts` scans `*.md` beside `space.json` **and**
  `join(spaceDirectory, 'cards')`; renaming the directory without that line is a
  zero-file import that throws nothing.
- **Renaming a `.stories.tsx` changes its Ladle story id**, which every
  `?story=…` URL and every `storyFile:` entry in `parity-claims.ts` is keyed on.
- Path strings that must move with the renames rather than being renames
  themselves: `eslint-suppressions.json`, `.oxlintrc.json`,
  `design-system-inventory.ts`, `test/key-bindings.ts`.
- `pnpm exec prettier --write .` after the codemod is **not optional** — the new
  noun is a character longer, so files re-wrap and `format:check` is red without
  it. Change one learned this.

## Open decisions

Recorded here rather than guessed. Each has a recommendation.

1. **The 27 `(c) =>` bindings over Thing collections** — `graph/src/validate.ts`,
   `graph/src/grid.ts`, `graph/test/space.property.test.ts`,
   `react-flow-adapter/test/strategy-contract.test.ts`. A text sweep renames
   `.cards` → `.things` and leaves `(c) =>`, which is exactly the drift the
   guard's initial-binding arm exists to catch. **Recommendation: a hand edit,
   not the codemod** — `(c)` is a convention, not a spelling of the word, the
   same argument that kept `/views/` → `/diagrams/` out of the change-one script.
   The convention line itself moves in 04.
2. **`packages/app/ladle-e2e/issue-03-card-and-alias-panes.spec.ts`** — its
   filename encodes `.scratch/design-system-baseline/issues/03-…`, which keeps
   the retired word. **Recommendation: do not rename it**, and protect the
   `issue-03-card-and-alias-panes` spelling in the mask list with that reason,
   in the idiom change one used for every other citation into a historical tree.
