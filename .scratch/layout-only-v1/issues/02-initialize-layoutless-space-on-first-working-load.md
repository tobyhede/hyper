# 02 — Initialize a layoutless Space on first working load

Status: ready-for-agent
Tags: release/v1
Blocked by: 01

**What to build:** When the complete working state of a stored or imported
layoutless Space is first requested, durably create its empty default Layout and
initial empty Active Graph before showing it, as ADR 0079 requires. Existing
Cards begin in the Cards View and source Markdown remains untouched until
explicit Export.

- [ ] Direct opening, Entering through a Space Card and rendering an open Space
      Card all cross one initialization boundary before receiving working state.
- [ ] Initialization atomically persists `Layout 1`, `Graph 1`, the Active Graph
      and the default Layout through the normal optimistic repository lifecycle.
- [ ] A Space that already has Layouts but no default durably adopts its first
      Layout in authored order without creating another Layout or Graph.
- [ ] A concurrent winner is accepted after conflict reload; other retryable,
      rejected and failed commits use the established load recovery and never
      expose partial or application-owned draft state.
- [ ] Listing summaries, completing import, exporting and checking references do
      not initialize a Space or modify imported source files.
- [ ] The client that receives a newly initialized empty Layout opens the Cards
      drawer once; another client that merely observes the initialized Space
      treats it as ordinary.
- [ ] A zero-Card Space opens the same drawer with an accessible empty state and
      the existing Add Card action.
- [ ] Memory, HTTP and PostgreSQL evidence proves initialization is idempotent and
      survives a fresh application host.

This ticket owns the initialization boundary itself. The server-side repository
is where it lives, so it composes with rather than duplicates ADR 0078's Meta
lifecycle ownership.
