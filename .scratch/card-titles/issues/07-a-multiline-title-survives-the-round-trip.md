# 07 — A multiline Title survives the round trip

Status: resolved
Blocked by: 02

**What to build:** A focused proof in `@project/graph` that a multiline Title
survives parse → stringify → parse through the Card file's YAML frontmatter.

**Why:** The `yaml` package writes a multiline string as a block scalar, so this
is expected to work rather than expected to break — which is exactly why it
needs a test that says what broke when it stops working. The aggregate round
trip in `.scratch/v1-release/issues/08-round-trip-multi-space-import-and-export.md`
will catch a break long after this effort and will not say what caused it.

- [x] A three-line Title round-trips through a Card file unchanged, for every
      Card kind's frontmatter.
- [x] A Title with an interior blank line round-trips with the blank line
      intact — this is the case normalization deliberately preserves and the one
      a block scalar is most likely to lose.
- [x] A Title whose lines have leading spaces, and one whose lines could be read
      as YAML syntax (a leading `-`, a trailing `:`), round-trip unchanged.
- [x] The property is stated over generated Titles rather than three examples:
      any Title that survives normalization survives the round trip.

## Answer

`56b2d4b8`. Tests only — **no production code changed**, which was the hoped-for result rather than a foregone one.

`packages/graph/test/multiline-title-round-trip.property.test.ts`: five named shapes × three Card kinds, plus the property. Assertions compare `titleLines(...)` rather than raw strings, so a lost line is a one-entry array diff carrying its role, and a file that fails to parse throws with the serialized Card file inline.

**The interior blank line survives.** `yaml@2.9.0` writes the Title as a literal block scalar and emits a blank line inside one with no indentation, which is legal and read back verbatim. A leading space on the *first* line is the case that needs the explicit indentation indicator, and the writer emits `title: |2-` — so that survives too.

The property generates 1–6 lines joined with `\n` or `\r\n` from a weighted pool (blank, whitespace-only, indented, tab-indented, `- a sequence entry`, `a mapping key:`, `---`, `# a comment`, trailing whitespace, free string), normalizes, and `fc.pre`s out what normalizes to nothing. Five counters assert after the run that each interesting case was actually drawn — measured over 1000 runs at 743 / 288 / 483 / 778 / 760. Proved to bite: loosening `splitFrontmatter`'s closing-fence regex turned the three YAML-syntax examples red and shrank the property to `["---\n!", "markdown"]`.

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.
