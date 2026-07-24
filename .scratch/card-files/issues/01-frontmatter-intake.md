# 01 — The card file parser

Status: done
Type: task

The parser only, and nothing that consumes it. **Narrowed during
implementation** — this ticket originally also dropped `cards` from
`spaceFileSchema` and gave `loadSpace` its second argument, and claimed it would
land green with no app change. It cannot. Twelve test files across all four
packages build space files with a `cards:` array; zod strips unknown keys, so
they would not fail loudly on the key — they would parse to a space with no
cards and then fail every route's reference check. `packages/app/src/space.ts`
also reads `card.content`. The moment `spaceFileSchema` loses `cards` the
cutover is atomic across the repo, so it belongs in one commit, and that commit
is 02.

What is left here is the half with the edge cases in it. The rest — schema,
intake, fixtures, every test fixture — is breadth, and moved to 02.

- `core`: `cardFrontmatterSchema`, the discriminated union a card file's
  frontmatter must satisfy. No `content` key; `kind` keeps its
  default-to-markdown preprocessing. `CardFrontmatter` is the derived type. It
  stands beside the existing `cardSchema` for one commit rather than replacing
  it.
- `graph`: `parseCardFile({ path, text })` → the frontmatter and the body, or
  errors. Synchronous, no I/O.

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
  accepted and preserved verbatim; a body containing a `---` line is preserved.
- A property test: for any frontmatter and any body, writing a card file and
  parsing it gives both back unchanged.
- `pnpm verify` green.

## Answer

`yaml@2.9.0` over `gray-matter`. gray-matter's `index.js` opens with
`require('fs')` at module scope, for a `matter.read()` convenience we would
never call — and `loadSpace` runs in the browser, so that pulls a Node builtin
into the app bundle. It also pins `js-yaml ^3`, which is YAML 1.1, where a card
titled `No` parses as boolean `false` and reaches zod as the wrong type; `yaml`
defaults to 1.2, where it stays a string. And it carries excerpt extraction,
pluggable engines and a module-level parse cache keyed on input — a global cache
is how a test passes for the wrong reason. `yaml` is zero-dependency, ships its
own types, has separate node/browser export conditions, and is maintained.
`vfile-matter` drags in all of `vfile`; `front-matter` ships no types, which
fails on the first `import` under `verbatimModuleSyntax`.

**Four error kinds, because they are four different authoring mistakes**:
`missing-frontmatter` (no opening fence), `unterminated-frontmatter` (opens,
never closes), `invalid-yaml`, `invalid-frontmatter` (parses, is not a card).
Every message names the file.

**The body rule that makes the round-trip exact**: the body is everything after
the closing fence line with exactly one newline dropped. One, not all — a file
whose body deliberately opens with a blank line keeps it. That is not a
detail the unit tests would have caught; the property test found it when the
implementation was mutated to strip all leading newlines, and the counterexample
was a body of `"\n"`.

**The closing fence may be the end of the file.** A card with frontmatter and no
body, written without a trailing newline, ends `---` with nothing after it. The
first implementation searched for `\n---\n` and reported it unterminated.

**The property test's generator is the test.** With `fc.string()` as the body it
passed immediately and proved nothing — a random string essentially never
contains `---` on its own line, which is the one case the fence can get wrong.
The body is built from lines drawn from `---`, a heading, a blank, and arbitrary
prose. Verified it can fail by mutating the parser and watching it catch it.

Deferred to 02, which is where the loader can see them: the duplicate-id-across-
files error (it needs both filenames, so it needs more than one file in view) and
the order-by-title property.
