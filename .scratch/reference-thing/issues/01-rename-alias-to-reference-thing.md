# 01 — Rename Alias to Reference Thing

Status: ready-for-agent
Blocked by: none

**What to build:** The repo-wide rename ADR 0092 records. Alias becomes
Reference Thing. `kind: 'alias'` becomes `kind: 'reference'`. The rename runs
alone — no Copy link, Jump, or highlight work in the same change.

**Why:** Authors do not understand Alias. The kind is a pointer and a read-only
view; Reference is the word. `CONTEXT.md` already speaks the new name. The code
does not.

- [ ] Tracked codemod, not a `sed` one-liner, under this directory. Read the
      headers of `.scratch/thing-and-diagram/rename-*.mjs` before writing it:
      mask-then-rewrite-then-unmask, spellings it must not change, files it
      must not open.
- [ ] Schema, fixtures, refusals, Create Reference, kind glyph, accessible
      names (`Reference Thing`, `Reference to a Markdown Thing`,
      `Reference to a Space Thing`).
- [ ] `SpaceReferenceError`, `validateReferences`, `referenceableSpaces`, and
      Space Thing “reference” prose are not this kind. Do not rename them.
- [ ] `test/unit/current-domain-vocabulary.test.ts` gains a block that reports
      the retired word in the identifier shapes it was written in, including
      kebab-case arms. The rename is not finished until that scan holds.
- [ ] Merge with `-M20%`. Check the replay rather than trusting a `--dry`.
- [ ] `pnpm verify` on the finished state. `pnpm e2e` and `pnpm e2e:ladle`
      because the glyph, menu and stories change.

## Out of scope

- Copy link to Target (issue 02).
- Jump to Target (`.scratch/alias-cards/issues/05`).
- Highlight-on-select.
