# 02 — A Card is a Thing

Status: resolved
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

## Answer

Resolved by `.scratch/thing-and-diagram/rename-card-to-thing.mjs`: **365 files
rewritten, 100 paths renamed**, plus five hand edits the script deliberately does
not produce because none of them is a spelling. Its header records the mask list
and the arguments behind it.

### The two open decisions

**The 27 `(c) =>` bindings: hand edit, as recommended.** Twenty-five of them, over
ten files, and the two that were *not* touched are the finding: `elk-strategy.test.ts`
binds `(c)` over `spy.seen().children`, which is elkjs's collection and not ours.
The convention is the *domain* initial, so a foreign collection has no domain
initial to take. The convention line the guard documents reads `(t)` for thing now.

**`issue-03-card-and-alias-panes.spec.ts`: renamed, against the recommendation.**
The argument for keeping it was that its filename encodes
`.scratch/design-system-baseline/issues/03-recompose-card-and-alias-panes-…`,
which keeps the retired word. Two things beat it once looked at. Nothing cites
the filename — the correspondence is `issue-03` plus a subject, and `03` is what
actually locates the record, so renaming the subject half loses nothing a reader
uses. And the subject is a *live* surface being renamed in this very change,
sitting in a directory where `space-card-panes.spec.ts` and `card-expand.spec.ts`
both move — leaving it would half-sweep the directory to protect a correspondence
the number already carries.

### What the sweep needed that change one did not

**Regex citation masks instead of a literal list.** Change one masked bare
feature names (`layout-seam`, `layout-only-v1`) because Layout's citations had no
live homonyms. Card's do: `card-authoring` is both a `.scratch/` effort and the
stem of a live test file, so a bare mask would have frozen the file that had to
move. Only the citation *shape* is forgiven — a path under `.scratch/`, or an ADR
slug, which is the one thing in this repository that opens with four digits and a
hyphen.

That is not sufficient on its own and the gap is worth recording: a `.scratch/`
effort cited **without** its prefix is invisible to it, and two survived into the
first run — `docs/agents/issue-tracker.md` listing seven efforts in backticks, and
`docs/agents/ui.md`'s `space-cards/04`. Both were found by scanning for the swept
spellings of every card-named `.scratch/` directory and reading each hit, which is
the check to repeat rather than the mask to widen.

**Per-file masks.** The registry exports five names spelled identically to domain
ones — `Card` is the domain type in `@project/core`, `CardContent` a domain
component with its own module — so a global mask would have frozen the half that
had to move. `FILE_PROTECTED` names the registry usage at each of the five sites
that also carry domain vocabulary, in the exact shape it appears: an import
specifier, a closing tag, or an opening tag plus the character after it, which is
what separates `<Card` from `<CardRail` and the registry's `<CardContent className=`
in `CanvasThing` from the domain's `<CardContent title=` in `ThingNode`.

**The alias is deleted, not swept.** `packages/ui/src/index.ts` no longer
re-exports `CardContent as CardSection`; the domain component is `ThingContent`,
so the registry's own name is free and its five consumers now import it directly.
The barrel aliases nothing at all today, which cost the two `ui-catalog` comments
that used it as their worked example — the resolution rule still holds and its
fixtures are synthetic, so both comments now say so.

### Two fixture orderings the rename moved

Neither is a behaviour change and both would have been easy to "fix" in the wrong
place:

- `test/unit/read-single-space.test.ts` asserts a **global** sort over relative
  paths. `cards/` sorted before `root.md`; `things/` sorts after it, so the two
  inventory files moved to the end of the expected array.
- `packages/app/test/snapshot.test.ts` round-trips a snapshot whose things intake
  sorts by Title. The first fixture's Title was `Card`, ahead of `Next`; as
  `Thing` it follows. The array is declared in Title order now, with the reason
  written down.

### Verification

`pnpm verify:static` green — all seven commands. `pnpm e2e` **180 passed**,
`pnpm e2e:ladle` **82 passed**, both on the first run.

`pnpm test` is **one test red, and it is 03's**:
`test/unit/prisma-foundation.test.ts > reaches the emitted contract from the
existing migration head`. `pnpm contract:check` is red for the same reason, and it
is a CI step in the static job.

**That coupling is real and is not a sequencing mistake.** The sweep rewrites
`src/prisma/contract.prisma` because a Prisma model is a domain declaration like
any other, and it rewrites `src/persistence/postgres-space-repository.ts`, which
typechecks against the emitted contract. Reverting either half would break the
other, so the model rename lands with the sweep and the forward migration that
makes the head reach it is 03 — which needs a live database to generate, since
`prisma-next migrate` refuses without a connection.
