# A Route may contain cycles; presenting decides how to traverse them

Status: accepted
Supersedes: 0012, 0023
Refines: 0003, 0009
Refined by: 0041
Related: 0021, 0024, 0027, 0033

A Route is a set of directed card Edges. It may contain forks, merges, cycles,
and self-edges. The authoring surface records the graph the author draws; it
does not reject an Edge because a particular presentation or layout strategy
would find that graph awkward to display or traverse.

Presentation owns traversal. Presenting already records a Walk rather than
deriving a single global order from the Route, and moving through a cycle is
therefore another deliberate move in that Walk. Nothing advances
automatically, so a cyclic Route creates no infinite process by itself. How a
presenting surface warns, limits, or visualises repeated visits is presentation
work and must not constrain what can be authored.

An exact duplicate `(from, to)` within one Route is different: a set cannot
contain the same Edge twice, and the second copy adds no information. The
authoring gesture is an idempotent no-op and domain intake rejects duplicate
Edges. The same pair in two different Routes remains two Edges because each
belongs to its Route.

## Why this changes the earlier decision

ADR 0023 stated the right general rule — presentation is a display problem and
must not constrain the domain — then made an exception for cycles. Its stated
domain reason was that returning through an Alias produced a fresh forward
card and preserved terminating traversal. That made Alias carry two jobs:
showing the same content at another authored position, and working around a
presentation constraint.

Only the first job belongs to Alias. An Alias remains useful when the author
wants another card with its own title and position showing the same content.
It is not required merely to draw an Edge back to an existing card.

We rejected keeping cycles out for the convenience of route-driven layout and
presenting. Both consumers must render or traverse the authored graph they are
given. We also rejected silently deduplicating imported Edge arrays: intake
should not normalize ambiguous authored input, while the live authoring gesture
can safely be idempotent before anything is persisted.

## The cost we accept

A Route no longer guarantees a terminating traversal or a globally forward
drawing. Algorithmic Views must route cyclic Edges legibly, and presenting must
make repeated visits comprehensible. A self-edge may appear semantically thin,
but forbidding the smallest cycle while permitting every larger one would be an
arbitrary authoring restriction.
