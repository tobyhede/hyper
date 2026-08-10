# Define the transient authoring and failure contract

Type: task
Status: resolved
Blocked by: 02, 03, 05, 06, 07, 09, 12

## Question

What shared contract distinguishes interaction-local drafts, cancellation,
completed optimistic Edits, persistence failure and remote-conflict replacement
across every Card, Alias, Graph, Edge and Layout-membership operation without
creating a partial-Space Draft or a monolithic interaction registry?

## Specification

[Transient authoring and failure contract](../prototypes/transient-authoring-contract.md)

## ADR

[ADR 0042 — Interaction drafts stay local and Space replacement invalidates them](../../../docs/adr/0042-interaction-drafts-stay-local-and-space-replacement-invalidates-them.md)

## Answer

An Interaction draft belongs to the field, picker, primitive or gesture that
understands it. It is never a partial Space or pending Edit, and cancellation
discards it without a compensating transition. Every completed pointer and
keyboard path crosses the same semantic Space Authoring interface, which
re-reads current state, derives and validates the complete next Space, installs
it optimistically and submits it asynchronously.

Semantic operations share three outcomes: completed, unchanged and refused.
Expected refusals retain the initiating surface and explain the problem;
programming errors are not hidden as validation. Add Card and Add Graph complete
before their follow-up title drafts, so cancelling the rename keeps the entity.
Add Alias remains a draft until it has an eligible Target because an Alias
without one is not a valid Card.

Pending, retryable failure, permanent rejection and conflict retain the newest
local Space, open drafts and focus. Later local Edits remain legal. Retry and
Keep local commit the newest complete working Space, not the snapshot that
first failed. No operation-specific rollback or modal is introduced.

Accept stored is the only replacement event. Space Authoring validates first,
then atomically installs session state, placement and fresh Navigation and
advances a monotonic `replacementEpoch`. Each interaction owner observes or is
keyed by that epoch and applies its own normal cancellation; Space Authoring
keeps no registry of drafts or callbacks. Target-bound surfaces close,
selection and Traversal history clear, and App composition focuses the canvas
after replacement. A refused stored Space clears nothing.
