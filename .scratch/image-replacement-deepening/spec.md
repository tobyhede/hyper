# Image replacement owns its complete attempt

**Status:** resolved — delivered in PR #331; `CI passed` green on f549d219 (run 36966992919).

## Problem Statement

Maintainers must currently follow the canvas adapter, a generic exclusive activity and the replacement operation to understand one Image Resource replacement. The caller joins current Resource lookup, exclusivity, execution and failure reporting. Tests prove those pieces separately and use a mounted canvas hook to prove their coordination. This spreads knowledge of the replacement lifetime across modules and makes future changes more expensive to verify.

The existing author-facing behavior is the contract to preserve. This is an architectural refactor, not a reproduced product defect.

## Solution

One deep image replacement module owns the complete attempt behind a replacement operation and observable busy state. A caller asks to replace an identified Resource; it cannot omit the exclusive lifetime or supply a stale copy of the current image URL. The canvas adapter retains the Interaction draft and displays the answer. Authors retain the same replacement experience, navigation restrictions and recovery behavior.

## User Stories

1. As an author, I want to replace an Image Resource from a URL, so that I can change its picture without recreating the Resource.
2. As an author, I want to replace an Image Resource from one file, so that a locally held picture can become its content.
3. As an author, I want a multiple-file replacement refused before storage, so that one replacement cannot accidentally create several images.
4. As an author, I want unsupported declared file types refused before upload, so that the target explains which file cannot be used.
5. As an author, I want host storage refusals shown in the target, so that I can correct the input without losing the old picture.
6. As an author, I want unsupported image URLs refused before loading, so that an invalid replacement changes nothing.
7. As an author, I want the current URL to produce no Edit, so that submitting it does not create unnecessary persistence work.
8. As an author, I want replacement to preserve the Resource's identity, Title, placement, Edges and remembered Open Size, so that changing its content preserves my authored Maps.
9. As an author, I want the replacement's natural size recorded when measurable, so that a later first Open can use it.
10. As an author, I want an unmeasurable picture to remain valid content, so that a loading failure does not prevent setting its URL.
11. As an author, I want one replacement attempt to exclude another, so that concurrent attempts cannot overwrite each other.
12. As an author, I want navigation and incompatible authoring held during replacement, so that the initiating context stays visible.
13. As an author, I want panning and zooming to remain available, so that I can inspect the canvas while replacement runs.
14. As an author, I want Cancel and Escape withheld only while an attempt is running, so that an idle replacement draft remains cancellable.
15. As an author, I want success, refusal and unexpected failure to release the busy state, so that I can continue working.
16. As an author, I want successful replacement to complete one Edit without waiting for persistence acknowledgement, so that saving does not prolong the exclusive operation.
17. As an author, I want Keep local and retry to remain available while replacement runs and Reload to remain unavailable, so that recovery preserves the current attempt's context.
18. As an author, I want a result from a replaced working Space discarded, so that an old asynchronous attempt cannot edit the accepted Space.
19. As an author, I want browser Back and Forward to retain the current context during replacement without losing history entries, so that navigation remains available afterward.
20. As a maintainer, I want dependencies supplied once at composition, so that replacement has one visible source of image storage, measurement and diagnostic reporting.
21. As a maintainer, I want to test the complete attempt through its operational interface, so that tests establish exclusivity and Edit completion together without mounting the canvas.
22. As a maintainer, I want creation to retain its independent lifetime, so that multi-file creation and completion on another Map are not constrained by replacement's rules.

## Implementation Decisions

- Scope is image replacement only. Creation remains separate and retains its existing access to the same ImageSources and shared storing implementation.
- The replacement module owns current Resource lookup, exclusive execution, URL/file handling, measurement, replacement-epoch checks, Edit completion and diagnostic reporting.
- Its operational interface takes the Resource identity and replacement input, rather than a caller-supplied current URL. Its observable interface exposes the busy state used by existing navigation and availability consumers.
- Retire the generic activity execution interface. There must be no remaining independently callable replacement path that bypasses the owned lifetime.
- Require ImageSources at application composition. Open Spaces forwards the sources it already requires; isolated compositions and stories supply explicit dependencies. Do not introduce an optional replacement capability or ambient defaults at that seam.
- Compose one replacement module per composed Space, preserving the current scope of the activity. Do not introduce a second global lock or another copy of busy state for navigation.
- Return typed outcomes, including the existing replacement outcomes and named outcomes for an already-running attempt and an unexpected failure. Keep expected refusals distinct from broken operations. Application presentation retains wording and the existing target response behavior.
- The canvas retains the local draft, opening/closing of the replacement target and display of its answer. Its local busy handling for controls remains an interaction concern; it does not own application-wide exclusivity.
- The module contains diagnostic-reporter failures and releases its activity on every settled path. A second attempt must not clear the first attempt's activity.
- Continue to complete semantic Edits through Space Authoring. Success ends exclusivity after applying the Edit, without waiting for persistence acknowledgement or retry.
- Preserve replacement-epoch invalidation, unchanged-URL behavior and the one-Edit replacement semantics of ADR 0106.
- Preserve current availability decisions, including the later refinement that Keep local and retry remains available while Reload is withheld. Do not broaden the lock to every neutral command.
- ADR 0042 keeps Interaction drafts local; ADR 0057 keeps failures typed across seams and wording in application presentation; ADR 0109 keeps nondeterministic dependencies at composition.
- No schema, stored format, HTTP contract or domain vocabulary changes are needed.

## Testing Decisions

- The user confirmed one primary test seam: the deep replacement module's interface, composed with real Space Authoring and a memory-backed session plus controlled ImageSources.
- Assert observable busy transitions, returned outcomes, working snapshots and persistence requests. Avoid assertions about private helpers or internal execution structure.
- Preserve the existing replacement tests' coverage of file/URL validation, storage refusals, measurement, unchanged content, one Edit, preserved authored properties and replacement-epoch discard; exercise them through the owned operation.
- Add combined lifetime proofs for a held upload and held measurement, a competing attempt, successful completion, refusal, unexpected rejection and a throwing diagnostic sink. Verify that the active attempt alone releases its activity.
- Prove that the Resource is read at invocation and that callers cannot bypass exclusivity by invoking a separate execution function.
- Retire standalone generic-activity tests once their behavioral guarantees are covered through the replacement interface. Move coordination assertions out of hook tests while retaining target mounting, draft retention, wording and dismissal proofs at the canvas adapter.
- Existing image replacement, replacement activity and canvas Resource authoring tests are the prior art. Existing browser-location, Open Spaces, availability, conflict recovery, application E2E and Ladle proofs protect the surrounding behavior.
- A story that previously held an arbitrary activity must hold a real replacement through controlled ImageSources. Preserve its visible behavior and existing browser assertions.
- Run targeted local checks, including both TypeScript checks and affected lint/tests. Keep behavior-preserving application and Ladle E2E expectations unchanged. The full verification bar runs in CI on a draft PR, and completion requires observing its gate pass.

## Out of Scope

- Combining image creation and replacement into a generic image workflow.
- Map/Graph command binding, the other architecture-review candidate.
- New cancellation, timeout, retry, navigation or persistence policies.
- Moving Interaction drafts into the replacement module or Space Authoring.
- Changing remembered Open Size, image storage ownership, supported media or image deletion.
- Redesigning the replacement target, adding a new generic command framework, or creating adapter seams for deterministic helpers.
- Changing Space retirement behavior or treating disposal as a newly defined cancellation event.

## Further Notes

The architectural decisions, primary test seam and single-ticket implementation breakdown were confirmed in the conversation. The spec and issue 01 are ready-for-agent; issue 01 has no blockers.

The deletion test supports absorbing the activity implementation and canvas coordination into replacement: deleting the activity alone would merely move its necessary state into callers. Depth comes from removing the caller's protocol obligations, not from adding another forwarding module.

A read-only follow-up found that the current activity has no disposal operation and Space Authoring disposal removes subscriptions without advancing the replacement epoch or disabling completion. Do not assume disposal discards an outstanding attempt. Preserve existing retirement behavior in this refactor; if implementation uncovers a reachable late-completion defect, record it separately with evidence rather than silently defining a new cancellation policy.

Source inspection informed this spec; no defect reproduction or runtime test run was performed while writing it.
