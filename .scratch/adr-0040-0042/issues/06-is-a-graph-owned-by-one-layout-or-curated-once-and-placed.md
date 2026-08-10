# Is a Graph owned by one Layout, or curated once and placed in several?

Status: ready-for-human

Surfaced by: analysing issue `02`, which turns out to be a symptom of this

## The question

Take a Graph that appears in two Layouts. A Card is added to it in Layout 1. Is
it added in Layout 2?

The two models in the tree answer differently, and neither answer is argued.

**The built model says yes, because there is only one Graph.** `spaceFileSchema`
holds `graphs: z.array(graphSchema)` at Space level, and a Layout's `graphs` is
`z.array(idSchema).optional()` — a filter of *ids*, not a container. Two Layouts
naming the same id point at one object, so an Edge authored through either is
authored in both. Sharing is not a feature anyone chose; it falls out of the
ids-and-filter shape.

**ADR 0040 says the question cannot arise.** "Every Route belongs to exactly one
Layout… Routes are not reusable objects and a Layout no longer filters a
Space-level Route collection." Sharing is abolished, so there is no propagation
to decide.

## Why this is the root and issue `02` is the symptom

ADR 0040's two headline changes are load-bearing on each other, and neither
survives alone.

The built model needs its internal fallback band for unplaced Cards *because*
Graphs are shared: a shared Graph can name a Card that a given Layout does not
position, and something has to be drawn. ADR 0040 deletes that band — "Omitted
Cards are absent from that Layout and must not render in an
implementation-defined fallback region" — and can only afford to because it
also ended sharing. Its own text marks the dependency, in a sentence whose
"therefore" is doing real work:

> The old deterministic placement of omitted Cards outside the authored region
> is **therefore** retired rather than promoted to a product concept.

So exclusive ownership is not a tidy-up. It is what makes per-Layout closure
statable at all.

Issue `02` found that a Graph-scoped View's conversion can strand an Edge
outside the new Layout's Card set. That conversion rule — "copies its source
Route under a fresh identity owned by the new Layout; it never reuses or
reparents the source" — is *this* decision, applied at the one place the model
lets two Layouts reach for one Graph. `02` is where copy-not-share first draws
blood, not a separate defect. Settling `02`'s sentence without settling this
would patch the symptom.

## What the decision costs

Under ADR 0040 an author cannot have one narrative path appear in two Layouts.
An overview Layout and a detail Layout that both want "the onboarding path" get
two independent Graphs that share a name and drift apart silently, with nothing
telling the author they have diverged.

That may well be right — a Graph is a curated argument over a *specific*
arrangement of Cards, and an arrangement is exactly what a Layout is. Two
Layouts placing the same Cards differently may genuinely warrant two Graphs.

But ADR 0040 does not make that argument. It takes exclusive ownership to make
the closure invariant and the fallback deletion work, and the product
consequence is never weighed. That is the gap: not a wrong answer, an unargued
one.

## What to decide

Which of these a Graph is:

- **Layout-owned (ADR 0040 as written).** A Graph belongs to one Layout and is
  copied when it needs to appear elsewhere. Closure holds by construction, the
  fallback band goes, and divergence between copies is the author's problem.
  Then say so as a decision, with the sharing case named and rejected — and
  answer what a copy is called, which is the part `02` is stuck on.
- **Space-level and placed (the built model, made deliberate).** A Graph is
  curated once and drawn by any Layout that names it. Editing it anywhere edits
  it everywhere. Then the fallback band, or some successor to it, has to stay,
  because a shared Graph will name Cards a Layout does not place — and ADR 0040
  needs reopening rather than implementing.
- **Something in between**, if there is a shape where a Graph is shared but a
  Layout's projection of it is closed. Nobody has looked for one; it is not
  obviously impossible and it is not obviously worth the complexity.

## Constraint that must survive

Whatever is decided, the two halves stay coupled: any model that permits a
shared Graph must say what a Layout draws when that Graph names a Card the
Layout does not place. Deleting the fallback band and permitting sharing cannot
both be true.

## Acceptance

- ADR 0040 states which model a Graph follows and why, with the alternative
  named and its cost stated rather than passed over.
- The answer covers what happens to a Card added to a Graph visible in two
  Layouts, in the vocabulary the chosen model makes available.
- Issue `02` is resolved consistently with it, or explicitly deferred to the
  deferred Graph-scoped View work with the closure invariant left true.

## Note

ADR 0040 is accepted and **not built**, so this is reopening an accepted
decision rather than correcting a built one — cheaper now than after the
version 1 aggregate lands. `docs/agents/workflow.md` holds that an accepted
ADR receives no edit but its status line, so the likely shape is a new ADR
that refines or supersedes 0040 rather than a rewrite of it. Issue `01`
raises the same tension about editing 0041's body and is unresolved; the two
want answering together.
