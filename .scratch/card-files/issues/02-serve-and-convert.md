# 02 — Serve the card files, convert the fixture

Status: open
Type: task
Blocked by: 01

Where the app changes shape. The behaviour a user sees must not.

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
- `pnpm verify` green.
