# 01 — Version 2 UUID migration

**What to build:** Advance the authored interchange format and in-memory domain to UUID identity, while preserving the existing space-directory structure and creating a distinct import shape in which every entity id may be absent.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Version 2 `space.json` accepts only UUIDs for every explicit space, route, layout, card reference, alias target, edge endpoint, position key, and view reference.
- [x] Space, card, route, and layout ids may be absent only in import input; every loaded `Space` and stored snapshot is fully identified.
- [x] The normal domain intake continues to validate aliases, references, duplicate ids, layout scope, and route acyclicity after identity resolution.
- [x] All committed fixtures, examples, unit tests, property generators, and end-to-end helpers migrate to deterministic UUIDs.
- [x] New-space creation no longer relies on constant slug identities.
- [x] Version 1 and unconstrained string identity are removed after all call sites migrate; there is no indefinite dual-format compatibility layer.
- [x] Card filenames remain irrelevant to identity, and the physical `space.json` plus Markdown-card structure is unchanged.
- [x] The migration is isolated from unrelated behavior changes and leaves the full verification and end-to-end suites green.

## Answer

Version 2 is the only accepted format and validates every supplied identity as a UUID. `ImportSpace` is the only id-optional shape; normal `Space`, card, route, layout and persistence snapshot values are fully identified. The shared Zod UUID schema now brands its validated output, so a plain TypeScript string cannot enter an in-memory domain identity without crossing the validation seam. Generated ids, direct fixtures and property generators mint the same branded type by parsing rather than assertion.
