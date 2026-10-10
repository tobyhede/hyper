# 07: Move the `ui` and persistence detail into their guides

**What to build:** AGENTS.md's `ui` package entry and its ADR 0095 SQL-repository entry each shrink to a responsibility plus the rules that still guard something, such as "do not restore `AddResourceControl`" and "do not add a second picker for choosing a Resource". The remaining detail moves to the UI guide and the editing-and-persistence guide. Deletion history is dropped.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Each rule from the two entries is in exactly one place.
- [ ] Phrases like "is gone", "went", "spent a while with none" and "this file used to record" are gone from the entries and from the guides they move into.
- [ ] The citation and vocabulary unit tests pass.
