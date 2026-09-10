# 07 — A multiline Title survives the round trip

Status: ready-for-agent
Blocked by: 02

**What to build:** A focused proof in `@project/graph` that a multiline Title
survives parse → stringify → parse through the Card file's YAML frontmatter.

**Why:** The `yaml` package writes a multiline string as a block scalar, so this
is expected to work rather than expected to break — which is exactly why it
needs a test that says what broke when it stops working. The aggregate round
trip in `.scratch/v1-release/issues/08-round-trip-multi-space-import-and-export.md`
will catch a break long after this effort and will not say what caused it.

- [ ] A three-line Title round-trips through a Card file unchanged, for every
      Card kind's frontmatter.
- [ ] A Title with an interior blank line round-trips with the blank line
      intact — this is the case normalization deliberately preserves and the one
      a block scalar is most likely to lose.
- [ ] A Title whose lines have leading spaces, and one whose lines could be read
      as YAML syntax (a leading `-`, a trailing `:`), round-trip unchanged.
- [ ] The property is stated over generated Titles rather than three examples:
      any Title that survives normalization survives the round trip.
