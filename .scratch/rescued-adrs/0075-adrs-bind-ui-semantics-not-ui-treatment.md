# ADRs bind UI semantics, not UI treatment

Status: accepted
Refines: 0053, 0064, 0065, 0066, 0068, 0073
Related: 0047, 0048, 0050, 0052

An ADR may bind a durable UI boundary: authored state and its ownership,
cross-module coordination, persistence and atomicity, stable domain outcomes,
or an accessibility obligation that survives a redesign. It does not bind the
current visual treatment, layout, control placement, gesture, shortcut,
responsive geometry, component choice, mounting strategy, animation, or
canvas-composition technique.

Those details change through UX iteration. The current issue, prototype,
stable story and behavior tests state the implementation being evaluated. A UI
may diverge from an ADR's historical treatment without a new ADR when it still
preserves the durable semantic boundary. Review must not force the UI back to
historical treatment merely because an accepted ADR describes it.

When UI and ADR diverge, first separate outcome from treatment. A changed
durable boundary requires a new ADR and reciprocal status links. A changed
treatment updates its issue, story and tests; the accepted ADR remains an
immutable record of why the earlier design looked right.

For ADR 0053, the one selected Space View remains the semantic boundary; its
placement in a Sidebar does not. For ADRs 0064–0066, Layout-owned Open state and
Open Size remain; exact controls and activation gestures do not. For ADR 0068,
Space Card identity, selection ownership and persistence safety remain; Open
Spaces placement, Exit treatment, canvas topology, cameras and gestures do not.
For ADR 0073, accessible keyboard operation of repeated Card commands remains;
the rail, component names, grouping, ordering and exact toolbar treatment do
not.
