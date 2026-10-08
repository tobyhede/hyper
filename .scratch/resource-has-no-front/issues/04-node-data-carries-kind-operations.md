# 04: Node data carries a kind's operations whole

**What to build:** Make `ResourceNodeData` a union over kind whose arm carries that kind's `kindOperations`. Each per-kind decoration pass returns its kind's operations, switching on `kind`, and a `display` where it changes it. Delete `kindFrontOf` and the flat per-kind fields (`onBeginBodyEditing`, `onResourceShapeChange`, `spaceRail`, `portal`). `ResourceNode` passes `kindOperations` through and keeps React Flow geometry.

**Blocked by:** 03.

**Status:** resolved

**Spec:** `.scratch/resource-has-no-front/spec.md`, decisions 9–10.

- [ ] `data.kind` and `data.kindOperations.kind` cannot disagree, by type.
- [ ] Decoration keeps its shared pass and one memoised pass per kind; no pass returns a patch of per-kind flat fields.
- [ ] `ResourceNode.test.tsx` holds that node data's `kindOperations` reaches `CanvasResource` unchanged.
- [ ] `contentAction` and `display` are unchanged in meaning.
- [ ] E2E and Ladle E2E unchanged.
