# 04 — Make Space Cards select initialized Layouts

Status: ready-for-agent
Tags: release/v1
Blocked by: 02, 03; `space-cards/03`; `space-cards/01`

**What to build:** Make every Space Card select a durable Layout and Graph in its
target Space, as ADR 0079 requires. Card creation initializes a layoutless target
before completing, and Opening or Entering restores the Card's selected Layout
context without changing the target Space's own navigation selection.

- [ ] Space Card content stores a target Space, selected Layout and selected
      Graph, with no Space View or Computed View alternative.
- [ ] Creating a Space Card against a layoutless target waits for durable target
      initialization and stores the resulting default Layout and Active Graph.
- [ ] Initialization or target-load failure produces no Card, dangling reference
      or partially persisted aggregate Edit.
- [ ] Opening and Entering use the Card's Layout and Graph context; navigation
      while inside remains transient until an authored Edit records a selection
      under the established ownership rules.
- [ ] Several Space Cards may reference one target while selecting different
      Layouts and Graphs, and each selection survives aggregate round-trip.
- [ ] Direct, self, missing and incompatible target contexts retain stable refusal
      or not-found semantics with accessible recovery where one exists.
- [ ] Application, Ladle and E2E evidence covers an initialized target, a
      layoutless target, two selections of one target and initialization failure.

This ticket owns the Space Card's selected-Layout content and the initialization
it requires of a target.
[entity URL 07](../../entity-url-addressability/issues/07-author-a-space-card-reference.md)
keeps ownership of Space Card creation and cascade semantics, and
[V1/08](../../v1-release/issues/08-round-trip-multi-space-import-and-export.md)
owns preserving these selections through the aggregate round trip.
