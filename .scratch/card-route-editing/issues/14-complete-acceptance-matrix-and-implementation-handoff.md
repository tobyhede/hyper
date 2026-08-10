# Complete the acceptance matrix and implementation handoff

Type: task
Status: resolved
Blocked by: 01, 02, 03, 05, 06, 07, 09, 11, 12, 13

## Question

What final cross-operation acceptance matrix, authority order, implementation
sequence and proof obligations make the complete Card and Graph authoring
specification decision-complete and ready for implementation planning without
mixing the pure rename, aggregate restructuring and interaction slices?

## Handoff

[Complete Card and Graph authoring — implementation handoff](../implementation-handoff.md)

## Answer

The accepted handoff reconciles the current domain, interaction, keyboard,
persistence and focus records under an explicit authority order. Its domain and
interaction matrices specify every completed Edit, Algorithmic-View crossing,
no-op or refusal, cancellation rule, pointer path, keyboard path and focus
destination. Shared acceptance covers optimistic failure, latest-working retry,
stored-Space replacement and `replacementEpoch` invalidation rather than
repeating those rules in every operation.

Implementation is divided into ten independently gated work packages. The pure
Graph vocabulary rename lands first, followed by the version 1 aggregate,
semantic authoring interface, Card/Alias authoring, Cards View membership, Graph
management, Edge lifecycle, Space deletion, keyboard navigation and final
acceptance hardening. The order prevents compatibility scaffolding and keeps
the rename, ownership change and product slices independently reviewable.

The proof matrix assigns each invariant to the cheapest authoritative seam,
with one complete database-free HTTP E2E journey proving the author outcome and
focused browser tests reserved for real pointer, focus and React Flow behavior.
The handoff also fixes the planning boundary: nested-Space Card authoring,
Graph-scoped Views, manual Graph ordering, undo/recovery, collaboration, bulk
operations, touch gestures and compatibility migration remain out of scope.
