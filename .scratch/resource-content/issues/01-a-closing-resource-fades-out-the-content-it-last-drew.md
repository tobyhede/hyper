# 01: A closing Resource fades out the content it last drew

**What to build:** When an Open Resource Closes, its content stays drawn through the exit fade instead of blanking. The presence hook that keeps the content area mounted while leaving becomes generic over the value it draws and keeps the last value it drew until it unmounts; re-opening mid-fade takes the new value. An editor or image replacer is never drawn while leaving. This alone fixes the Markdown Resource's mid-fade blank, before any content model changes.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Closing an Open Markdown Resource keeps its text drawn for the whole fade; the application proof of Close records the leaving content and asserts it is not empty.
- [x] Re-opening a Resource while it is leaving draws the new content, not the retained one.
- [x] A Resource closed while its body is being edited fades out rendered Markdown, not the editor.
- [x] The hook's contract is tested directly: nothing mounted for an initial absent value; leaving holds the last value; unmounts after the exit duration.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Comments

**2026-09-29** — Built. `usePresence<T>(value: T | null, exitDurationMs)` now answers `{ mounted: false } | { mounted: true; state; value }`: visible means `value !== null`, `leaving` holds the last non-null value until the exit duration has passed (then releases it), and re-entering takes the new value. It holds the value by identity, so `CanvasResource` memoises its open content (`{kind:'markdown', source}` or `{kind:'image', url}`, `null` while Closed) and draws the content area from `presence.value`; while leaving it passes no body editor, no image replacer and no edit/Replace target, so leaving content is always drawn at rest. `CanvasResource` was the hook's only caller. Evidence: `packages/ui/test/use-presence.test.tsx` (initial absent value mounts nothing; leaving holds the last value and unmounts after the duration; re-entry draws the new value; a new value while present is drawn), `packages/ui/test/CanvasResource.test.tsx` "CanvasResource Close fade" (Markdown and image retained while leaving; re-open while leaving draws the new source; closed-while-editing fades rendered Markdown with no editor), and `packages/app/e2e/overview.spec.ts` "the Close action closes an opened resource" now records the leaving commit's text in the same MutationObserver and asserts it is non-empty — red on the parent commit (`text: ""`), green here. `pnpm verify` (274 files, 3873 tests), `pnpm e2e` (264 passed) and `pnpm e2e:ladle` (137 passed) all pass.
