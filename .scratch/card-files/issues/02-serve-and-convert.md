# 02 — Serve the card files, convert the fixture

Status: done
Type: task
Blocked by: 01

Where the app changes shape. The behaviour a user sees must not.

**This is the whole cutover, and it is atomic.** 01 narrowed to the parser once
it turned out the schema change cannot land alone: twelve test files across all
four packages build space files with a `cards:` array, and zod strips unknown
keys, so dropping `cards` does not fail them loudly — it gives them a space with
no cards and then fails every route reference. So the schema, the intake, the
fixtures and every test fixture move together, in one commit.

- `core`: `spaceFileSchema` drops `cards`. What remains is `version`, `id`,
  `title`, `routes`, `layouts`, `defaultView`. `cardSchema` becomes
  `cardFrontmatterSchema` plus a `body`, and `content` goes.
- `graph`: `loadSpace` takes the space file **and** the raw card files, parses
  each with `parseCardFile`, sorts by title, then validates references and
  indexes exactly as it does now. It stays synchronous and does no I/O — that is
  the property to protect, and the one a reviewer will assume was lost.
- A duplicate card id across files is a load error, alongside the existing
  reference errors. Name the files, not just the id: "which two" is the only
  useful part of that message. (`parseCardFile` already carries each error's
  `path` for this.)
- Every test fixture that builds a space converts. Mechanical, and the bulk of
  the diff.
- The dev-server plugin serves the card files alongside the space file. Read
  scope is the two locations ADR 0020 names, non-recursive: `*.md` beside the
  space file and `cards/*.md`. `import.meta.glob` already does eager raw loading
  and is the obvious mechanism; the plugin is where read scope is decided.
- `space.ts` hands both to `loadSpace`. `markdownByCardId` and the
  `*Missing content file*` fallback go — a card carries its body.
- Convert `fixture/` and `example/`: metadata moves from `space.json` into each
  file's frontmatter, and `space.json` loses its `cards` array. The fixture keeps
  `cards/`; leave at least one card beside `space.json` so the two-location scan
  is exercised by the thing the app actually loads.
- `space-files.test.ts` loads both real spaces; it has to grow the card files
  too, and it is the regression test that they are still authored correctly.

Then remove what the old shape required: AGENTS.md's rule that a card body must
not start with a heading, and the `a card title appears once, not twice` e2e
test. The hazard is gone once the title is in the same file as the body. Do not
delete the test before this ticket — until the format changes, it guards a real
thing.

## Acceptance

- `pnpm e2e` green and **unchanged** apart from removing the title-duplication
  test. That is the guard that this was a storage change and not a behaviour
  change.
- A card whose body starts with a heading renders it once, as a heading.
- A property test: for any set of card files with distinct ids, the loaded cards
  are the same set, ordered by title.
- `pnpm verify` green.

## Answer

`pnpm verify` green (185, from 182), `pnpm e2e` green at 19 — the same 19, with
the title-duplication test replaced rather than merely deleted. `pnpm build`
green too, which matters because the plugin is not `apply: 'serve'` and a build
reads the card files the same way.

**The e2e suite was run twice on purpose.** Once before touching the tests, with
the title-duplication test still in place: 19 passed, identical set. That is the
guard the ticket asked for — the storage changed and no behaviour did. Only then
was the test replaced.

**A README beside a space file is a card.** ADR 0020 says every `*.md` beside the
space file is a card, and `fixture/README.md` was one. It has moved to
`packages/app/README.md`, outside the space, and AGENTS.md now says why. This is
the ADR's "nowhere to leave a draft" cost showing up on day one, in the one
place nobody thought to look.

**The plugin reads the card files with `fs`, not `import.meta.glob`.** The ticket
suggested the glob, but read scope had to be decided in the plugin and the glob
runs client-side — so `virtual:space-file` now exports `spaceFile` and
`cardFiles`, both read server-side, non-recursively, from the two locations. It
also keeps the existing deliberate property that nothing watches the space: a
card edit lands on the next full page load, not mid-drag. Only the space file has
a `.local` variant; a card file is read where it is authored.

**A numeric id is a load error, and that is now pinned.** The ordering property
failed on a generated `id: 0` — frontmatter is YAML, so that is the *number* zero
and zod rejects it. Quoting fixes it. Left as-is rather than coerced (the error
names the file and the field, and ids here are slugs), but there is now a unit
test saying so, so the behaviour is decided rather than accidental.

**The test helper emits YAML through `stringify`.** First cut built frontmatter
with a template string, and the property test immediately started failing on
titles like `,` and `-` — the helper's escaping under test instead of
`loadSpace`. `graph`'s helper now uses the real serializer. The `app` and
`react-flow-adapter` helpers still use templates, deliberately: their inputs are
fixed literals, and neither package declares `yaml`.

**Both properties were mutation-checked** by deleting the sort from `loadSpace`
and watching them fail; likewise the new e2e test, by removing the heading from
`c.md`.

Left for 03: a card still cannot be written. `space.local.json` shadows the space
file, and a space is now a directory — whether "unsaved work versus authored
base" survives that is the open question, and it is the one most likely to be
worse than it looks.
