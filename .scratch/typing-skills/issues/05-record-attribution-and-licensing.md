# 05 — Record attribution and licensing

**What to build:** Correct provenance for the borrowed material, in the files that carry it.

**Status:** ready-for-agent

**Why:** The two upstream sources have different licenses and therefore different permissible uses, and getting that backwards is not a stylistic mistake.

- [ ] **Cursor pstack** — MIT. `typescript-best-practices`, `principle-type-system-discipline` and its TypeScript patterns may be copied and adapted directly. `references/type-system-discipline.md` opens with an attribution block naming the source skills, the repository, its MIT license, and what was adapted for this repository — specifically the change from pstack's absolute *no `as` casts* to this repository's narrowing/broadening distinction.
- [ ] **Metabase** — AGPL outside `enterprise`. Take the architecture only: the authoring/review split, `any` as a blocking review finding, mandatory type verification, using inferred and LSP types during review. Write this repository's wording independently. Do not paste sections of their skills, and do not paraphrase closely enough that the prose is theirs.
- [ ] **Anthropic `skill-creator`** — methodology reference for the baseline-versus-skill evaluation loop, cited where issues 06 and 07 use it.
- [ ] Provenance lives in the reference files, not in `skills-lock.json` (see issue 04) and not only in a commit message.
- [ ] Check whether `tools/oxlint/anti-slop/PROVENANCE.md` is the pattern worth following here. It pins an upstream source for vendored third-party code, which is close but not identical to an adapted work — decide, and be consistent.

**Rides with** whichever of issues 02 and 03 lands first; the attribution and the borrowed text belong in the same change.
