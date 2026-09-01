# Reconcile the confirmed V1 release contract

Status: resolved
Tags: wayfinder:task, release/v1
Parent: [Chart the V1 source release](../map.md)
Blocked by: none
Assignee: unassigned

## Question

Bring the V1 Definition of Done and the existing V1 implementation tickets into
agreement with the confirmed release contract recorded in the map's Notes. In
particular, replace the stale one-Markdown-Card Meta bootstrap with deterministic
Default Content, represent first-run initialization and explicit CLI hard reset,
and preserve the distinction between the End-to-end checkpoint and the
`v1.0.0` release. What contradictions, missing ownership or newly sharp
decisions remain after the reconciliation?

## Answer

The Definition of Done and implementation tickets now agree with the map's
confirmed contract:

- Ticket 16 owns both the deterministic Default Content aggregate and the
  explicit destructive CLI hard reset. Ticket 01 owns the permanent Meta Space
  lifecycle seam it consumes, not a generic one-Markdown-Card bootstrap.
- First initialization uses the canonical Default Content generator; later
  loads never reseed. Confirmed or forced hard reset regenerates that same
  aggregate atomically. Ticket 08's destructive aggregate import remains a
  separate source-driven replacement operation, not reset or seeding.
- End-to-end remains an earlier untagged observed-use checkpoint. Ticket 07 owns
  the later complete Definition-of-Done proof and `v1.0.0` go/no-go gate, and now
  depends on Default Content/reset delivery.

No contradictory implementation ownership remains in tickets 01–08 and 16.
The deliberately unresolved decisions remain with the downstream planning
tickets: ticket 10 audits canonical-journey coverage and ownership; ticket 11
defines the exact End-to-end boundary; tickets 12–13 decide sequencing and
feedback-driven scope control; and tickets 14–15 assign final proof and produce
the release handoff. Exact Default Content copy and visual treatment remain
intentionally low-fidelity, as the map specifies.
