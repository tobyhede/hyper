# Shared Map and Graph command binding

**Status:** ready-for-agent

The user has confirmed the scope, seam, contextual deletion claim and test surface below. The design discussion is complete; no implementation work has begun.

## Confirmed scope

Concentrate Map and Graph rename, Graph colour and head-shape changes, and confirmed Map and Graph deletion in one application module shared by the Command Dock and the Open Space Resource rail.

Creation, selection, copy links and focus continuation stay with each adapter. Preserve author-facing behavior.

## Confirmed seam

The shared module receives already-addressed Map and Graph capabilities. It owns the binding from capability availability to offered controls, outcome-channel selection, inline rename answers and deletion confirmation.

Existing authoring modules continue to own live availability checks, stale-address checks, semantic Edits, refusal information and coordination across Spaces. The binding does not construct their authoring contexts.

Command Outcomes keeps ownership of reports, stale-result discard and continuation requests. Delete Confirmation keeps ownership of the armed question, cancellation and asynchronous confirmation lifetime. Interaction drafts and focus remain local to the adapters. These existing ownership decisions are preserved, consistent with ADR 0042.

The binding is an application implementation concept, not a new domain term. No glossary addition is warranted. This consolidation does not yet establish a hard-to-reverse, surprising trade-off warranting another ADR.

## Evidence and depth

Both adapters currently bind addressed capabilities to the same rename answers, command-outcome channels and deletion questions. The shared module earns its seam only if it hides this complete binding protocol; extracting individual forwarding functions would provide little depth.

The contexts have a necessary difference: successful deletion of the Map shown by the Dock moves the reporting canvas to its survivor; deletion of an embedded Map changes the target Space and the Space Resource's selection without moving the containing canvas. Command Outcomes already represents this distinction through its Map completion claim.

Pure authoring modules deliberately exclude continuation, React and DOM dependencies. Absorbing reporting and confirmation into those modules would undo an existing separation rather than deepen this application binding.

## Contextual deletion

Each adapter supplies the existing Map completion claim: true for the Dock, false for the embedded rail. The binding passes that claim to Command Outcomes when running a confirmed Map deletion; it does not infer the context or introduce a new context framework.

Each adapter supplies its focus fallback when asking for deletion. The shared module assembles the deletion question and routes the confirmed operation through the appropriate outcome channel. Delete Confirmation continues to own the question's lifetime.

## Test surface

The shared binding's interface is the primary test seam for capability availability, inline rename answers, outcome reporting and deletion confirmation. Exercise both contexts using real authoring modules and memory persistence.

Verify that unavailable capabilities produce unavailable controls, that invocation still respects the capability's live checks, that refused renames retain their inline answer and report through the correct channel, and that deletion asks before executing. Cover both contextual Map completion claims so a successful Dock deletion survives its own canvas move while embedded work retains the containing canvas's existing staleness rules.

Keep lower authoring tests for semantic rules and coordination across Spaces. Keep browser proofs for focus, Interaction drafts and controls. Move duplicated binding assertions into tests at the shared seam rather than adding a second copy of the same tests.

## Completion constraints

Creation, selection, copy links and focus continuation remain outside this change. Preserve existing author-facing behavior and browser proof expectations. Do not add a generic command framework, a new draft owner or another authoring context model.

No production code has changed. This document records the design conversation, not a verified implementation or a reproduced defect.
