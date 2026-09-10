# 02 — Title Lines in the domain

Status: resolved
Blocked by: none

**What to build:** Teach `@project/core` that a Title is one or more Title
Lines: normalize one at the schema boundary, and answer both the lines with
their roles and the Card's name through two named operations (ADR 0083).

**Why:** The structure lives in the `string`, so the *reading* of it must have
one home. A `split('\n')` at each call site is the same rule copied as many
times as there are surfaces, and the roles are domain knowledge — what an
author's second line means is not a renderer's positional convention.

- [x] `titleLines(title)` answers each line with its role: line 1 `title`,
      line 2 `subtitle`, line 3 and every line after it `caption`. No fourth
      role, no cap, no refusal for a long Title.
- [x] `titleName(title)` answers the first line. It is the operation nearly
      every consumer wants and exists so that no one writes
      `titleLines(t)[0].text`.
- [x] Normalization happens where a Title is parsed, not at each use: CRLF and
      lone CR folded to LF, per-line trailing whitespace trimmed, leading and
      trailing blank lines dropped, interior blank lines kept verbatim.
- [x] A Title that has no non-empty line after normalization fails validation —
      that is what `min(1)` now means. It applies to every Card kind's
      frontmatter schema and to the import variants.
- [x] The rule is exercised as a property, not only by example: for any input,
      the normalized Title round-trips through normalization unchanged, has no
      leading or trailing blank line, and `titleName` equals the first element
      of `titleLines`.
- [x] Space, Layout and Graph titles are untouched. They share the field type
      and not the capability.

Nothing in this ticket draws anything. `@project/graph`'s `loadSpace` intake and
the Card file parser are the boundary this normalization sits at, so a stored
Title and an imported one get the same answer.

## Answer

`9739ddc5`, with `ba2925ce` completing it.

`@project/core` gains `titleLines`, `titleName`, `normalizeTitle`, `TitleLine`, `TitleLineRole` and `CARD_TITLE_REQUIRED` (`packages/core/src/title.ts`). One private `cardTitleSchema` in `schema.ts` is shared by all three Card kinds; `omit`/`extend` copy a field schema by reference, so the stored document and the import variants inherit the rule rather than restating it — which `card-document-equality.test.ts`'s reference-identity guard holds them to. Space, Layout and Graph titles are untouched, asserted verbatim-preserving.

The property is in `packages/core/test/title.property.test.ts`: idempotence, no `\r`, no per-line trailing whitespace, no leading or trailing blank line, the role ladder, and `titleName === titleLines[0].text`, over 500 runs with post-hoc counters proving the multiline, nameless and interior-blank cases were actually drawn.

### Two defects this ticket left behind, both fixed in `ba2925ce`

- **The refine carried `params` and no `message`.** A blank Title failed intake as `cards/a.md: title: Invalid input`, where before this branch it named its rule. A stable code and a legible message are not alternatives: the code is the identity an authoring surface words for itself (ADR 0057), the message is what a file that failed to parse prints. It carries both now.
- **The write path did not adopt the rule.** Normalization landing at the schema boundary is only half the job; `space-authoring.ts`'s `edited-card` arm went on trimming the whole string, so the boundary that *parses* a Title and the path that *writes* one disagreed. A single-line Title hides that disagreement and ticket 03's `Shift+Enter` does not — a whole-string trim cannot reach the trailing whitespace on an interior line. See ticket 03's answer.

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.
