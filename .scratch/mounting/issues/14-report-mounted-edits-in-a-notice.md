# 14 — Report where a mounted session's Edits are kept in a notice, not the Dock

Status: resolved

**What to build:** ADR 0131's fact, that a mounted session's Edits are kept in the page and lost on reload, reported by the shell's notice slot instead of the Command Dock's "Edits lost on reload" `Badge` (`UnsavedMark`). The Dock holds commands; a mark in it read as a warning chip among them, and it was drawn before the reader had edited anything, so it warned about nothing.

- **When:** from the reader's first Edit in the page, never before. An Edit is a session acknowledging a revision past the one it opened at, so the in-page host's first working load (`maps-and-graphs.md` R16) does not count. Each mounted session listens only until the page has reported.
- **Where:** the `AppShell` notice slot, as `MountedEditsNotice` in `packages/app/src/components/ShellNotice.tsx`: `ShellNotice` with a new `fact` tone and its `icon`, the default `Alert` variant, `role="status"` and Lucide `SaveOff` (`UnsavedIcon`). A refusal keeps the destructive `role="alert"`.
- **How long:** one answer for the page (`createMountedEdits`, `packages/app/src/mounted-edits.ts`, owned by `OpenSpaces`), so every open Space shares it and a dismissal lasts for the page. The fact does not change, so it is not reported again.
- **Copy:** "Edits kept in this page only. Reloading or closing this page discards them. Nothing is written to GitHub."
- `UnsavedMark`, `DockChrome.unsaved` and the claim `command-dock-marks-a-mounted-session-unsaved` are removed. The Dock's `Mounted` story claims `command-dock-offers-a-mounted-session-every-edit`; the notice claims `mounted-edits-notice-reports-where-edits-are-kept`.
- `docs/agents/ui.md` records the channel rule: a fact that is not a failure is a neutral notice in the shell, never a mark in the Dock.

**Acceptance:**

- `packages/app/test/mounted-session.test.tsx`: no notice at rest, mounted or not; the notice after an Edit and not in the Dock; dismissed for the page across later Edits; never unmounted.
- `packages/app/e2e/mount.spec.ts` and `packages/app/ladle-e2e/operational-feedback.spec.ts` carry the notice's parity claim.
- Ticket 11's edited mark is this notice, reading "Edited in this browser".
