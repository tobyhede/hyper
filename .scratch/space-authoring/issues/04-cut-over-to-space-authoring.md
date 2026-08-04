# 04 — Cut existing interactions over to Space Authoring

**What to build:** Route every existing authoring interaction through one deep,
framework-neutral Space Authoring module that installs a validated Edit and its
navigation consequences before publishing one optimistic state change.

**Blocked by:** 01 — Session observers cannot interrupt persistence; 02 —
Navigation has one owner; 03 — React Flow publishes nodes and Edges coherently.

**Status:** ready-for-agent

- [ ] Settled Card movement, connecting existing Cards and create-and-connect
      all use the same Space Authoring interface.
- [ ] React and React Flow types do not cross that interface, and no new
      workspace package is introduced for its single application caller.
- [ ] The render adapter installs completed placement before notifying Space
      Authoring; notifications carry the completed authoring fact rather than a
      proposed snapshot, destination identity, conversion flag or effect plan.
- [ ] Preview eligibility and completion use the same boolean policy, and
      cancelled, duplicate, zero-movement and stale-context attempts produce no
      Edit and do not throw.
- [ ] Editing an Algorithmic View copies every on-screen Card position into one
      new Layout without moving a Card; editing a selected Layout updates it in
      place.
- [ ] The first successful connection mints and activates `Route 1`, and
      create-and-connect changes the Card, Route, Edge and Layout atomically.
- [ ] Card, Route and Layout identities are generated inside Space Authoring;
      callers neither provide identity generators nor choose the identities.
- [ ] Derivation and normal Space intake finish before any authored state
      changes; invariant failure is the only synchronous rejection path.
- [ ] Reentrant completions queue behind the fully installed preceding state,
      while persistence failure remains visible asynchronous state and does not
      disable further Authoring.
- [ ] External subscribers receive one publication after the optimistic Space
      and navigation consequences are installed.
- [ ] Normal submission and retry mutate the session only through Space
      Authoring, and the application no longer executes the Edit effect order.
- [ ] The former placement-editor and Edit-completion interfaces are removed
      rather than retained as compatibility modules.
- [ ] Assembly-heavy tests are replaced by tests through the Space Authoring
      interface; browser tests retain responsibility for gesture translation and
      handle behaviour.
- [ ] `pnpm verify` and `pnpm e2e` pass.
