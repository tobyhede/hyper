# 02 — Title Lines in the domain

Status: ready-for-agent
Blocked by: none

**What to build:** Teach `@project/core` that a Title is one or more Title
Lines: normalize one at the schema boundary, and answer both the lines with
their roles and the Card's name through two named operations (ADR 0083).

**Why:** The structure lives in the `string`, so the *reading* of it must have
one home. A `split('\n')` at each call site is the same rule copied as many
times as there are surfaces, and the roles are domain knowledge — what an
author's second line means is not a renderer's positional convention.

- [ ] `titleLines(title)` answers each line with its role: line 1 `title`,
      line 2 `subtitle`, line 3 and every line after it `caption`. No fourth
      role, no cap, no refusal for a long Title.
- [ ] `titleName(title)` answers the first line. It is the operation nearly
      every consumer wants and exists so that no one writes
      `titleLines(t)[0].text`.
- [ ] Normalization happens where a Title is parsed, not at each use: CRLF and
      lone CR folded to LF, per-line trailing whitespace trimmed, leading and
      trailing blank lines dropped, interior blank lines kept verbatim.
- [ ] A Title that has no non-empty line after normalization fails validation —
      that is what `min(1)` now means. It applies to every Card kind's
      frontmatter schema and to the import variants.
- [ ] The rule is exercised as a property, not only by example: for any input,
      the normalized Title round-trips through normalization unchanged, has no
      leading or trailing blank line, and `titleName` equals the first element
      of `titleLines`.
- [ ] Space, Layout and Graph titles are untouched. They share the field type
      and not the capability.

Nothing in this ticket draws anything. `@project/graph`'s `loadSpace` intake and
the Card file parser are the boundary this normalization sits at, so a stored
Title and an imported one get the same answer.
