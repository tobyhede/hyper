# 01 — Establish the shadcn design-system baseline

**What to build:** Make `@project/ui` the canonical Base UI/shadcn component surface: the CLI recognises generated components in their actual shared-package home, semantic tokens have one owner, and Ladle can render the baseline primitives. Existing product behaviour remains unchanged while the new baseline is established.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The shared UI package has one CLI-recognised component destination and public export path, with no generated component orphaned from its barrel.
- [x] The app and shared UI consume one semantic token contract; a component can be rendered in Ladle without relying on feature-owned visual tokens.
- [x] The baseline primitives needed by the follow-on work are available through `@project/ui`, documented by real Ladle stories, and the existing verification bar remains green.

## Answer

`packages/ui/components.json` makes the shared package the canonical shadcn
destination, and its generated primitives are exported through `@project/ui`.
The application and shared package consume the semantic tokens owned by
`packages/app/src/tailwind.css`. Real primitive stories in Ladle exercise that
public surface without introducing story-only implementations.
