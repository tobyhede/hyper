# 24 — Explain blocked saves and offer explicit Retry

**What to build:** When a coordinated save cannot replay, show the current reason, identify any Space whose conflict blocks it, and provide a way to reach that Space. Preserve unsaved Edits and offer explicit Retry after the blocker is resolved. Resolving the blocker does not automatically replay the save.

**Blocked by:** None — can start immediately. Recovery correctness prerequisites 14 and 23 are merged.

**Status:** resolved

**Priority:** P2

**Decision confirmed:** Use explicit Retry. A refused replay must be visible and recoverable without requiring another Edit. Automatic replay after another coordination resolves is outside this ticket.

**Reproduction:** A coordinated Space Resource creation leaves Meta and TARGET rejected under recovery C0. A later creation leaves TARGET and CHILD conflicted under C1. Editing Meta attempts C0's replay, which refuses because TARGET needs C1's recovery. Previously, Meta retained its original rejection without explaining that TARGET now blocks saving; resolving C1 alone did not save Meta's Edits.

- [x] Drive that sequence and assert that Meta's persistence feedback identifies TARGET as the Space requiring recovery, instead of retaining only the original rejection.
- [x] The application provides a way to reach the blocking Space and resolve its conflict while preserving all unsaved Edits.
- [x] Resolving the blocking coordination does not automatically replay the requesting save; an explicit Retry saves the latest working Edits without requiring another Edit.
- [x] A failed replay read or another refused Retry updates the displayed reason and leaves Retry available with unsaved Edits intact.
- [x] Retry continues to respect participant ownership and duplicate-attempt protection established by the merged recovery fixes; it cannot overwrite a newer recovery.
- [x] Persistence tests cover refusal, blocker resolution and deliberate retry, and application tests prove actionable feedback and the Retry flow.

## Answer

**State.** A refused replay is part of the requesting participant's persistence state. `SaveBlock` (`packages/persistence/src/session.ts`) is `persistence-recovery-required` naming the blocking Space's id, title and needed recovery, or `persistence-read-failed`. `runCoordination` records the replay's refusal and passes it to the predecessor's `resumeRecovery`, which installs it as `blocked` on every participant still holding that recovery. `blocked` is optional on `failed`, `rejected`, `refused` and `conflicted`; the next outcome installed replaces it. A thrown replay records nothing, so the outcome it recovered from still stands.

**Retry.** `canRetry` is the one predicate for explicit Retry: `failed`, or `rejected`/`refused` carrying `blocked`. `SpaceSession.retry` acts on exactly those states. On a coordinated participant it asks the recovery to replay again, so the latest working Edits are saved without another Edit. Presses while a replay is pending are still ignored, and `planReplay` still refuses while another coordination holds a Space. Resolving the blocker replays nothing. An Edit still retries as before. An ordinary rejection or refusal still offers no Retry (`v1-release/17`). Ticket 22 can widen `canRetry` for `payload-too-large`, and the notice and Dock follow it.

**Surface.** The Dock draws every `canRetry` state as `PersistenceNotice`, a standing `Alert` rather than a dialog, so the canvas stays usable. The reason is the latest attempt's (`describeSaveBlock`). A blocking Space gets an **Open <title>** button, which runs `OpenSpaces.enter`, so the Opener's **Go to** leads back. A blocked rejection draws no rejection dialog. A conflict whose Keep local replay was refused shows the reason inside its dialog. `compose` in `open-spaces.ts` opens a Space that has a live session on that session instead of a backend read. That is how a created Space no commit has stored, such as TARGET in the reproduction, is reached.

**Evidence.** Persistence: `space-resource-lifecycle.test.ts` (`Space Resource recovery another coordination holds`: names the blocker, no replay on resolution, Retry saves the latest Edits, refused Retry, read-failed Retry, duplicate Retry presses; the ticket-14 read-failure tests now also assert `blocked`) and `coordinated-commit.test.ts` (`records a refused replay on the participants it recovers`). Application: `packages/app/test/blocked-save-retry.test.tsx` drives C0, C1 and the Meta Edit through `createOpenSpaces` and the rendered application: notice, Open Target, Reload, Go to Meta, no commit, then Retry. `persistence-control.test.tsx` and `authoring-refusal.test.ts` cover the copy and controls. Story `SaveBlocked`, whose Ladle test is `command-dock.spec.ts`, carries the claim `command-dock-names-the-space-blocking-a-save`. Its application evidence is the Vitest test, because the memory e2e host cannot script the rejection and conflict sequence.

**Left:** exiting a blocked rejected Space still shows the rejected-work warning ("no way to save them"), although Retry is now available.
