# 22 — Explain oversized saves and allow recovery

**What to build:** When a save exceeds the existing 1 MiB request-body limit, explain the refusal, preserve unsaved Edits, and let the author reduce content and retry saving. Keep the current limit and full-snapshot transport; changing either requires later evidence and a separate decision.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Priority:** P3

**Decision confirmed:** Keep the current limit and provide actionable feedback. The limit applies to the submitted candidate request, including all participating Spaces in a coordinated save, rather than a fixed Resource count. A sufficiently large reduction already permits saving; a reduction that leaves the request over the limit still fails. This corrects the original premise that shrinking Edits could never save. Ticket 17's measurements demonstrate request-size growth, not a supported maximum Resource count.

**Verified baseline (origin/main 0ff11d50):** Specific oversized-save feedback already exists, and submitting a new Edit after an ordinary rejection already attempts saving the latest working state. Preserve these behaviors. Remaining work is to verify the complete recovery flow, address the agreed explicit retry affordance, and make feedback accurate for the whole submitted request.

- [x] An oversized save produces a specific explanation that the save is too large and content must be reduced before retrying.
- [x] The refusal preserves current unsaved Edits and does not present them as saved.
- [x] The author can reduce content and retry through the application without reloading or making an unrelated Edit solely to trigger saving.
- [x] A test across the HTTP boundary proves an oversized candidate is refused without a stored change, while a subsequent candidate below the limit succeeds.
- [x] A reduction that remains oversized is still refused with actionable feedback and retained working state.
- [x] Coordinated saves respect the total request-body limit; feedback does not claim a per-Space or Resource-count guarantee.
- [x] Application coverage proves the refusal, retained edits and recovery flow. The request limit and transport remain unchanged.

## Answer

**State.** Unchanged: a request over `MAX_COMMIT_BODY_BYTES` (1 MiB, still full-snapshot transport) is refused at the HTTP boundary as `payload-too-large` with nothing stored, and every participant lands in `rejected` with that failure. `canRetry` (`packages/persistence/src/session.ts`) now also admits a `rejected` state whose failure is `payload-too-large` (`OversizedRejection`), so `SpaceSession.retry` acts on it: on a single Space it recommits the latest working snapshot; on a coordinated participant it asks the recovery to replay, exactly as ticket 24's blocked Retry does. A Retry still over the limit is rejected again the same way, with the working Spaces untouched. A new Edit after the rejection still retries the latest working state, so the reducing Edit is itself an attempt.

**Wording.** `describePersistenceFailure('payload-too-large')` is drawn in the Dock's `PersistenceNotice` beside Retry, not in the rejection dialog: "This save is larger than the server accepts in one request, counting every space it includes. Shorten or remove content, then retry." It makes no per-Space or Resource-count claim. Exiting a Space rejected for size is refused with `persistence-recovery-required` (`retry`), as ticket 24 refuses every `canRetry` state, rather than warned about as unsavable.

**Evidence.**
- HTTP boundary: `test/unit/oversized-save.test.ts` — `HttpSpaceBackend` → `createSpaceHttpApp` → `MemorySpaceRepository`: an oversized candidate (limit + 1 byte) is refused with the stored Space unchanged and a candidate of exactly the limit stores; a session keeps its Edit through Retry and a still-over reduction, then saves a reduction that fits; a coordinated Space Resource creation whose Meta saves alone is refused on the total, retried, and saved after Meta is reduced.
- Persistence: `session.test.ts` (`a save over the request size limit`) and `space-resource-lifecycle.test.ts` (`A coordinated save over the request size limit`), over `test/size-limited-backend.ts`.
- Application: `packages/app/test/oversized-save-retry.test.tsx` renders `OpenSpacesApplication` over a backend enforcing the real limit — notice text, no dialog, Edit retained through Retry and a still-over reduction, then saved; and the coordinated case. `persistence-control.test.tsx` and `authoring-refusal.test.ts` cover copy and controls, and `open-spaces.test.tsx` the exit refusal.
- Story `SaveTooLarge` with claim `command-dock-explains-an-oversized-save`: Ladle test in `command-dock.spec.ts`; application evidence is the real-host e2e in `packages/app/e2e/http-persistence.spec.ts`, which pastes over 1 MiB into a Resource, sees the host's 413 explained, retries into a second 413, and saves a reduction that survives reload.
