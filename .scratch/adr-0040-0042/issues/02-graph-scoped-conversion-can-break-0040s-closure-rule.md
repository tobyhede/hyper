# A Graph-scoped conversion can break ADR 0040's own closure rule

Status: ready-for-human

Surfaced by: review of PR #39

## Context

ADR 0040 states the closure invariant in its opening paragraph:

> every Edge in that Route has both endpoints in the owning Layout's Card set

Its "Algorithmic Views have explicit subjects" section then says a Route-scoped
View:

> borrows one Layout-owned Route and projects the Cards that View selects from it

and its conversion rule says converting one:

> copies its source Route under a fresh identity owned by the new Layout

Nothing says the View must take *every* Card of the source Route. Select a
subset, convert, and the copied Route carries Edges whose endpoints are not
members of the new Layout — violating the invariant three paragraphs above.

The feature is explicitly deferred: Route-scoped Views are "an architectural
allowance, not a version 1 product feature". That lowers urgency but does not
dissolve the finding, because ADR 0040 makes a claim about exactly this:

> The ownership rules here prevent that future feature from reopening the
> aggregate when it is designed.

This is a case where they do not. The gap is in the ADR's own guarantee, not in
unbuilt code.

## Direction

One sentence in ADR 0040, choosing between:

- A Graph-scoped View's subject is the whole of its source Graph's Cards, so a
  conversion cannot strand an Edge; or
- Conversion copies only Edges whose endpoints are among the selected Cards, and
  the resulting Graph is a projection rather than a copy — in which case say
  what that means for its title and identity.

The first is simpler and probably right. The second is more expressive and needs
more said about it.

## Acceptance

- ADR 0040 answers what a partial Graph-scoped conversion does.
- The answer is consistent with the closure invariant as stated.
