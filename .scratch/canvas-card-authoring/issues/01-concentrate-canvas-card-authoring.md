# 01 — Concentrate canvas Card authoring behind one deep module

**What to build:** Refactor Layout Card interaction behind one React-local canvas Card-authoring module. It owns caret state, Open/Edit composition, replacement invalidation, completion outcome handling, and projected Card decoration through one deep interface. This is structural only: every current application behaviour remains unchanged, and the old callback-heavy canvas path is removed in the same change.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Opening, Closing, Edit-on-Closed, title editing, Markdown editing, Save, Cancel, resize, replacement invalidation, focus continuation, and keyboard behaviour remain observationally unchanged.
- [x] Edit-on-Closed still completes the existing Open operation before installing the body editor; no combined Space Authoring completion is introduced.
- [x] The new module is React-local and uses the existing Space Authoring and render adapter interfaces rather than introducing observable state, callback adapters, or a package seam.
- [x] Alias metadata authoring, Edge Authoring, canvas-wide commands, React Flow rendering, persistence state, and refusal wording retain their current owners.
- [x] The keyed canvas remount and projected-node reconciliation remain the replacement-invalidation mechanisms; the replacement epoch does not cross the new interface.
- [x] The old canvas Card-authoring props, caret implementation, outcome-routing path, and compatibility aliases are removed atomically rather than retained beside the new module.
- [x] State-machine tests exercise the same module interface production uses; canvas tests retain only composition and wiring evidence, while browser coverage continues to prove real keyboard, focus, replacement, and React Flow behaviour.
- [x] No performance optimization, domain or persistence-format change, new domain term, ADR revision, or visible UI change is included.
- [x] Production UI work follows the repository's shadcn-first workflow, with no new interactive primitive or uncatalogued production surface introduced.
- [x] `pnpm verify` and `pnpm e2e` pass, and `pnpm e2e:ladle` also passes if the changed production module participates in a stable story; the ticket records the real command results.

## Answer

Canvas Card interaction now lives behind one React-local module interface. The application supplies the existing Space Authoring, Navigation, session, and render adapter collaborators; the canvas composes the returned decorated Cards and canvas commands. The previous callback path and duplicate caret/outcome logic were removed in the same change.

Verification:

- `pnpm verify` — passed: 156 files, 1,753 tests passed, 8 skipped.
- `pnpm e2e` — passed: 117 tests.
- `pnpm e2e:ladle` — passed: 51 tests.
