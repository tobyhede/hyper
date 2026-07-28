# 01 — Version 2 UUID migration

**What to build:** Advance the authored interchange format and in-memory domain to UUID identity, while preserving the existing space-directory structure and creating a distinct import shape in which every entity id may be absent.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Version 2 `space.json` accepts only UUIDs for every explicit space, route, layout, card reference, alias target, edge endpoint, position key, and view reference.
- [ ] Space, card, route, and layout ids may be absent only in import input; every loaded `Space` and stored snapshot is fully identified.
- [ ] The normal domain intake continues to validate aliases, references, duplicate ids, layout scope, and route acyclicity after identity resolution.
- [ ] All committed fixtures, examples, unit tests, property generators, and end-to-end helpers migrate to deterministic UUIDs.
- [ ] New-space creation no longer relies on constant slug identities.
- [ ] Version 1 and unconstrained string identity are removed after all call sites migrate; there is no indefinite dual-format compatibility layer.
- [ ] Card filenames remain irrelevant to identity, and the physical `space.json` plus Markdown-card structure is unchanged.
- [ ] The migration is isolated from unrelated behavior changes and leaves the full verification and end-to-end suites green.
