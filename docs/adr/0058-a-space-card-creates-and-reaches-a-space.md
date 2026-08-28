# A Space Card creates and reaches a Space

Status: superseded
Superseded by: 0068
Refines: 0001, 0030
Related: 0009, 0051, 0053
Refined by: 0059, 0060

ADR 0001 decided a card may itself be a space, arbitrarily deep, but left the payload undefined — ADR 0009 explicitly deferred it "to the change that actually builds recursive spaces." This is that change: a Space Card is a Card of kind `space` whose entire additional field is a reference to another Space, addressed by id (`spaceId`), mirroring how `alias` owns one field, `target` (ADR 0051). It carries no Layout or View pin — opening it always renders whatever the target Space's own renderer choice currently is, so a Space Card cannot become a second place selecting the same canvas choice ADR 0053 already gives one home.

Creating a Space Card is one atomic Edit: it mints the Card and a new, empty target Space (ADR 0018's one-card template) together, through the same composition-time `newId` seam that already mints a completed Edit's Card and Layout ids. A Space Card is never created pointing at nothing, so no code has to handle a Space Card whose target doesn't yet exist.

The reference is ownership, not a shared pointer. A Space Card is the only path to the Space it names — unlike an Alias's `target`, it is not retargeted once minted — so deleting a Space Card deletes the Space it owns, and everything nested inside it, in the same Edit. This is deliberately destructive and carries no soft-delete. The alternative — detaching instead of deleting, leaving the target Space stored but unreachable — was rejected because it reintroduces the exact orphan state this decision closes off everywhere else.

A Space Card may not target a Space already open along the chain that reaches it. `loadSpace` (ADR 0010) rejects a Space Card whose target is an ancestor of the Space authoring it, the same intake point every other reference check already runs through. Arbitrary depth is kept; cycles are not.

## The chooser is retired, not redesigned

Before this, the only way to reach a second Space was `WorkspaceSelection`, a startup screen gating the whole app whenever more than one Space existed in the store — reachable in practice only through the CLI-only, insert-only `importSpaces` (ADR 0030). That screen is deleted outright, along with the startup branch that renders it. A Space is now reached the same way any nested content is: by opening the Card that owns it. This is ADR 0001's own reasoning about a nested Space applied to the top level too — a separate concept sitting beside cards "duplicated the space idea and gave authors two things to learn"; the chooser was exactly that second thing, one level up.

Because a Space is now only reachable through the Space Card that owns it, `importSpaces` (ADR 0030) is refined to mint a linking Space Card in the root Space for each Space it inserts, in the same transactional import. Without this, an imported Space would be stored but unreachable — the orphan case this decision closes off for authored deletes would reopen at the one remaining path that creates a Space without going through a Space Card.

The root Space — the one Space ADR 0018 already mints at first boot — needs no new bootstrap and no special enforcement. It is an ordinary Space; nothing in the schema or validation restricts what it may contain. That it functions as a directory of other Spaces is a matter of what an author chooses to put in it, not a system rule — enforcing that would cost exactly the "two things to learn" this decision avoids elsewhere.

## Left undecided

How a Space Card is navigated into — replacing the whole canvas view, matching how opening any other Card reads it in place, versus a zooming, nested-canvas presentation — is not decided here. Neither is whether a Space is addressable by its own URL: today nothing is, the app has exactly one route. Both remain open follow-on work; the only constraint this decision places on them is that the reference stays a bare `spaceId`, so neither mechanic is foreclosed.
