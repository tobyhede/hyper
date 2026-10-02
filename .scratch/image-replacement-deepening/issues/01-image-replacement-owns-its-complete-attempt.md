# 01 — Image replacement owns its complete attempt

**What to build:** Preserve the author's existing Replace experience while moving the complete replacement lifetime behind one module. The canvas asks to replace an identified Image Resource and displays a typed answer; the module owns lookup, exclusivity, storing, measuring, stale-result discard, Edit completion and failure reporting. Navigation observes that same module's busy state. Image creation remains independent.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Application composition requires ImageSources and constructs one replacement module per Space using its Space Authoring and diagnostic reporter. Open Spaces forwards its existing sources; isolated tests and stories supply explicit dependencies without ambient defaults.
- [x] Callers use one replacement operation plus observable busy state. The operation reads the current Resource itself; no caller supplies the current image URL or assembles the lock and execution sequence.
- [x] The generic activity execution interface and independently callable replacement execution path are removed, with all consumers migrated in this ticket.
- [x] A concurrent replacement answers with a typed pending outcome, starts no image work and cannot release the active attempt's busy state.
- [x] URL trimming, URL validation, unchanged input, one-file limits, declared-type refusals, host refusals and measurement retain their existing behavior.
- [x] A successful replacement completes one Edit preserving Resource identity, Title, placement, Edges and remembered Open Size, and recording the new URL and available natural size.
- [x] Busy state spans storage, measurement and applying the Edit, and ends without waiting for persistence acknowledgement. Every settled success, refusal or unexpected failure releases it.
- [x] Unexpected failures are reported through the composed reporter, reporter failure is contained, and typed outcomes let presentation retain the existing wording and target behavior.
- [x] Replacement-epoch changes discard stale results without modifying the accepted working Space. No new disposal or cancellation policy is introduced.
- [x] The canvas retains its Interaction draft and target controls. Navigation, availability, Back/Forward behavior, panning/zooming, Cancel/Escape, neutral commands and conflict recovery retain their existing behavior.
- [x] Image creation keeps its separate lifetime, multi-file behavior and existing shared storing implementation.
- [x] Tests exercise the whole attempt through its interface with real Space Authoring, a memory-backed session and controlled ImageSources, including concurrency, both held asynchronous stages, refusals, rejection, a throwing reporter, stale results and commit timing.
- [x] Standalone generic-activity tests are retired after their guarantees move to the replacement interface. Canvas tests retain presentation and draft assertions rather than duplicating module coordination tests.
- [x] Stories that held an arbitrary activity instead hold an actual replacement. Existing application and Ladle E2E behavior assertions remain unchanged.
- [x] Targeted local typechecking, lint and affected tests pass; a draft PR runs the full repository verification bar and its CI gate is observed green before this ticket is resolved.

## Scope constraint

Space Authoring disposal currently does not invalidate asynchronous replacement work. Do not rely on it doing so. A newly demonstrated retirement defect belongs in a separately evidenced follow-up rather than an unagreed behavior change in this refactor.
