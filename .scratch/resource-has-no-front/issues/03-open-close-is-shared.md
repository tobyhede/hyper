# 03: Open and Close are shared, not a kind's operation

**What to build:** Move `onOpenChange` off every arm of `KindOperations` onto a shared `CanvasResource` prop beside `onBeginTitleEdit`, and delete the `preview` arm so the creation ghost passes `{ kind: 'markdown' }`. Before the move, rename node data's `onEditResource` to `onOpenChange` in a commit of its own.

**Blocked by:** 02.

**Status:** resolved

**Spec:** `.scratch/resource-has-no-front/spec.md`, decisions 6–7.

- [ ] `onEditResource` → `onOpenChange` lands as a rename-only commit.
- [ ] No arm of `KindOperations` carries `onOpenChange`; `CanvasResource` takes it as a shared prop.
- [ ] No `preview` arm; `NewResourcePreview` draws what it drew.
- [ ] E2E and Ladle E2E unchanged.
