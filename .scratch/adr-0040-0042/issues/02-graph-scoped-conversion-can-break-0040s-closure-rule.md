# A Graph-scoped conversion can break ADR 0040's own closure rule

Status: resolved

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

## Answer

**Neither of the two directions was taken. The gap closed structurally instead, and this ticket resolves as a consequence of issue `06`.**

ADR 0045 replaces ADR 0040's "Algorithmic Views have explicit subjects" section with one View interface over an open subject: a View receives Cards and zero or more Graphs, and on conversion returns Cards with positions and one or more Graphs. Two rules sit at that boundary. **Closure** — every Edge endpoint of every returned Graph is among the returned Cards. **Fresh identity** — every returned Graph carries a new identity owned by the new Layout.

The closure obligation is what settles this ticket. The defect was that a rule stated for a Layout was not stated for the conversion that produces one, so a View selecting a subset of its source Graph's Cards could hand back Edges naming non-members. Stating it as the View's *output* obligation makes a stranded Edge unrepresentable rather than forbidden by a sentence, and it holds for Views nobody has designed yet — which is what a rule about a deferred feature has to do.

Both directions this ticket proposed remain legal implementations under that boundary. A View may take the whole of its source Graph's Cards (the direction the ticket called simpler and probably right), or prune to the selected Cards and return the projection. Neither needs deciding here, because neither can now violate the invariant, and the deferred Graph-scoped work chooses between them when it is actually designed.

**The over-claim this ticket identified is the part that had no fix in the original framing, and it now has one.** ADR 0040 said "The ownership rules here prevent that future feature from reopening the aggregate when it is designed" while supplying no mechanism. The fresh-identity rule is that mechanism: no View can return a source Graph's identity, so no future View can produce two Layouts owning one Graph. The claim was false when written and is true under 0045.

The finding's own framing was right and worth keeping: the gap was in the ADR's guarantee, not in unbuilt code. It was fixed by making the guarantee mechanical rather than by describing the code that would have to honour it.
