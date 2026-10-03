# Map and Graph deletion use the coordinated lifecycle alone

**Status:** implemented by ticket 01 (`issues/01-remove-unused-map-and-graph-deletion-completions.md`), pending CI

The user has confirmed outright removal and the test migration strategy below. The design discussion is complete.

## Confirmed decision

Remove `deleted-map` and `deleted-graph` from Space Authoring's completion vocabulary outright, together with their implementation, exclusively associated types and embedded navigation fix-up. Do not retain a compatibility or forwarding path.

The coordinated Space Resource lifecycle remains the production deletion interface. Preserve its existing survivor selection, reference relocation, asynchronous outcomes and navigation reconciliation. Do not change it to reproduce the obsolete single-Space completion behavior. ADR 0076's coordinated lifecycle and ADR 0091's atomic relocation already establish this ownership; no new domain term or ADR is needed for removing the unused alternative.

## Verified scope

Production Map and Graph authoring commands use the lifecycle's deletion operations. The removed completion kinds are invoked externally only by tests.

The obsolete completions refuse the last Map or Graph with `space-must-keep-map` or `map-must-keep-graph`. Production commands withhold those operations, and lifecycle planning answers unchanged when no successor exists. Remove the two obsolete refusal identities, their presentation branches and exhaustive test fixtures; preserve shared identities such as `map-not-found` and `graph-not-owned`.

Update live documentation of the completion vocabulary and refusal cascade with the implementation. Accepted ADR bodies remain historical records and are not rewritten to remove old spellings.

## Test migration findings

- Direct deletion tests assert survivor selection, unchanged Resources and positions, ownership and navigation repair. Preserve useful guarantees through production authoring commands and the coordinated lifecycle, reusing existing coverage where it already proves them.
- Map and Graph command tests use deletion to arrange stale capabilities. Keep their stale-invocation assertions and arrange deletion through the existing lifecycle.
- An Image Resource creation test deletes the addressed Map while measurement is pending. Keep the asynchronous proof that resumed creation refuses `map-not-found` and changes no snapshot.
- A placement test uses embedded Graph deletion to prove that a subsequent top-level Edit sees the authoritative snapshot. A surviving embedded Edit can exercise that same guarantee without introducing coordinated deletion into the test.
- The embedded-authoring test's obsolete deletion row tests rejection of the wrong operation; the removed kind no longer belongs in its table.
- The synchronous Space Authoring property suite generates `deleted-graph`. That kind will leave its generator along with the operational interface.
- Existing production command tests already cover reference relocation, survivor selection, navigation changed during deletion and preservation of the relevant canvases. Extend only where a useful assertion would otherwise be lost.

## Confirmed test migration strategy

Retain the synchronous property suite for the remaining Space Authoring vocabulary. Remove the obsolete deletion generator arm and test deletion guarantees at the existing production command/lifecycle seams rather than converting that suite to asynchronous lifecycle orchestration.

Keep stale-command assertions and the asynchronous Image Resource creation proof. Use a surviving embedded Edit where a test needs an arbitrary Edit to establish authoritative snapshot behavior. Existing production coverage satisfies overlapping guarantees; add tests only where migration would otherwise lose a useful assertion.

This is a behavior-preserving removal of an unused implementation. No broader authoring decomposition, new seam or deletion product change is included.
