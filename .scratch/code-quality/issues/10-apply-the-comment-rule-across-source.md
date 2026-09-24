# 10: Apply the comment rule across source

**What to build:** Every source comment across all packages and the root `src` brought within 01's rule in one pass. Lineage prose is removed or cut down to the invariant it was protecting. Citations are kept only where 01 allows. The result is a source tree that says what the code does and why, without its history.

**Blocked by:** 01, 04, 06, 07, 08, 09 (runs after the splits, so moved code is edited only once)

**Status:** ready-for-agent

- [ ] Lineage phrasing ("replaces", "retired", "no longer", "used to", "was once") no longer appears in source comments, except where a comment states a live constraint
- [ ] No comment on a public export loses its statement of contract or invariant
- [ ] The change touches comments only: the compiled output is unchanged, which can be checked by building before and after and diffing
- [ ] Vocabulary-test masks and exemptions still pass, or are updated in the same change as 01 recorded
- [ ] `pnpm verify` green
