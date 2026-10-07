# 01 — Share Map and Graph command binding across the Dock and embedded rail

**What to build:** Preserve the same rename, Graph appearance and confirmed deletion behavior in the Command Dock and the Open Space Resource rail while binding those commands through one application module. Both adapters use the same availability, reporting, inline rename answers and deletion-question protocol, retaining their distinct canvas context and focus behavior.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] One shared application module receives already-addressed Map and Graph capabilities and binds Map/Graph rename, Graph colour and head-shape changes, and confirmed Map/Graph deletion for both adapters.
- [ ] Both adapters migrate to the shared binding in this ticket. The binding owns the complete repeated protocol rather than exposing individual forwarding helpers that leave callers choosing outcome channels or assembling confirmation.
- [ ] Existing authoring modules retain availability checks, stale-address checks, semantic Edits, refusal information and coordination across Spaces; the shared binding neither constructs their contexts nor duplicates those rules.
- [ ] Unavailable capabilities produce unavailable controls, and a previously available control still respects the capability's live checks when invoked. Last-Map and last-Graph deletion remain unavailable.
- [ ] A refused rename retains its inline answer and reports through the existing appropriate outcome channel; successful, unchanged, unavailable, broken and discarded answers retain their existing draft behavior.
- [ ] Graph colour and head-shape changes run through the existing Graph reporting channel and preserve their existing semantic and presentation behavior.
- [ ] Map and Graph deletion ask the existing Delete Confirmation before running an Edit. Cancel authors nothing; confirmation runs the addressed capability through the appropriate outcome channel using the existing question wording.
- [ ] The Dock supplies the existing Map completion claim as true and the embedded rail supplies it as false. The shared binding passes the claim to Command Outcomes without inferring context or introducing another context model.
- [ ] Successful Dock Map deletion retains its completed outcome through the canvas move it causes. Embedded Map deletion preserves the containing canvas's existing stale-result rules while the existing lifecycle relocates affected Space Resource selections.
- [ ] Each adapter supplies its own focus fallback when asking for deletion. Delete Confirmation retains the armed question's lifetime; Command Outcomes retains reports, stale-result discard and continuation requests; Interaction drafts and focus stay local.
- [ ] Creation, selection, copy links and focus continuation remain with each adapter. No generic command framework, new draft owner, schema change or domain vocabulary change is introduced.
- [ ] The shared binding's interface is tested in both contexts using real authoring modules and memory persistence. Tests assert observable availability, inline answers, notices, confirmation state and authored results rather than private calls or helper structure.
- [ ] Tests cover stale availability, refused rename reporting, Graph appearance changes, cancellation, confirmed deletion and both contextual Map completion claims.
- [ ] Duplicated binding assertions move to the shared seam; existing lower authoring tests retain semantic and cross-Space coordination coverage. Browser proofs retain focus, draft and control coverage, with behavior-preserving expectations unchanged.
- [ ] Production UI wiring follows the repository's shadcn-first workflow. Targeted local checks pass, including both TypeScript checks and affected lint/tests; the full verification bar runs on a draft PR and its CI gate is observed green before resolution.

## Scope

This is a behavior-preserving deepening of application command binding. It is independent of image replacement deepening and has no dependency on that ticket. Its implementation may share edited files with other work, which requires ordinary integration care rather than a blocking edge.
