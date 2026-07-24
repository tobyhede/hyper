# 01 — Frontmatter cards, parsed by `loadSpace`

Status: open
Type: task

ADR 0020's core. Pure — `core` and `graph` only, no app change, no fixture change
yet, so it lands green while the app still runs on the old shape.

- `core`: a card schema that validates **frontmatter** rather than a JSON object.
  `content` leaves the markdown variant — the body is the content — and the card
  type carries the body as text. `kind` keeps its default-to-markdown
  preprocessing untouched.
- `core`: `spaceFileSchema` drops `cards`. What remains is `version`, `id`,
  `title`, `routes`, `layouts`, `defaultView`.
- `graph`: `loadSpace` takes the space file **and** the raw card files, parses
  each one's frontmatter, sorts by title, then validates references and indexes
  exactly as it does now. It stays synchronous and does no I/O — that is the
  property to protect, and the one a reviewer will assume was lost.
- A duplicate card id across files is a load error, alongside the existing
  reference errors. Name the files, not just the id: "which two" is the only
  useful part of that message.

The parser: `---\nYAML\n---\nbody`. Hand-rolling the fence is easy and
hand-rolling YAML is not, so take a dependency. Check what is already in the
lockfile before adding one — `marked` renders markdown but does not read
frontmatter.

Watch for: a file with no frontmatter at all, a file with frontmatter and no
body, and a body containing a `---` line of its own. The third is the one that
looks fine until someone writes a horizontal rule.

## Acceptance

- Unit tests: a card parses from frontmatter; a missing `kind` defaults to
  markdown; an alias parses with an empty body; a body starting with a heading is
  accepted and preserved verbatim; a duplicate id fails and names both files.
- A property test worth having: for any set of card files with distinct ids, the
  loaded cards are the same set, ordered by title.
- `pnpm verify` green.
