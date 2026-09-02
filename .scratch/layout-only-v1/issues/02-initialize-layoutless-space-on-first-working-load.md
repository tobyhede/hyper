# 02 — Create complete new Spaces and initialize layoutless stored Spaces

Status: ready-for-agent
Tags: release/v1
Blocked by: 01

**What to build:** Keep two deliberately different paths. A Space Hyper creates
starts complete: its one Card is centered in `Layout 1`, which owns an empty
Active `Graph 1`, and that Layout is its default. A stored or imported layoutless
Space instead receives an *empty* default Layout and Active Graph on its first
working load; its existing Cards begin in the Cards View and its source Markdown
remains untouched until explicit Export.

- [ ] Record the correction to ADR 0079 in a new accepted refining ADR, with
      reciprocal status-block relationships; do not rewrite accepted ADR 0079's
      body.
- [ ] `newSpace()` and `initializeSpace()` create `Layout 1`, `Graph 1`, the
      Active Graph and `defaultLayout` together with the first Card, and place
      that Card at the canonical centered starting position.
- [ ] Ordinary startup and Space Card creation persist that complete shape
      atomically, so a newly created Space never crosses the layoutless
      first-working-load initialization path and never opens on an empty canvas.
- [ ] Direct opening, Entering through a Space Card and rendering an open Space
      Card all cross one initialization boundary before receiving the working
      state of a stored or imported Space.
- [ ] Initialization atomically persists `Layout 1`, `Graph 1`, the Active Graph
      and `defaultLayout` through the normal optimistic repository lifecycle,
      with an empty placement regardless of how many Cards the Space holds.
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
- [ ] Memory, HTTP and PostgreSQL evidence proves both creation-time completeness
      and first-working-load initialization are idempotent and survive a fresh
      application host.

This ticket owns both sides of the boundary: creation-time completeness belongs
in the constructors and provisioning paths that know Hyper just made the Space;
first-working-load repair belongs in the server-side repository and never
guesses from Card count or stores a "new Space" marker. The repository work
composes with rather than duplicates ADR 0078's Meta lifecycle ownership.
