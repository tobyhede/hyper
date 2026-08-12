# Is a Graph owned by one Layout, or curated once and placed in several?

Status: resolved

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

## Answer

**Layout-owned. ADR 0040's model stands, and the premise it asserted is confirmed as a decision: Hyper has no requirement for one Graph, one identity, to appear in two Layouts.**

The framing that carries it: a Layout is the surface a collection of Cards and Graphs is authored on, so what is authored there belongs to it. That is ADR 0040's own "Routes are authored only through a Layout" said in the direction that makes the ownership follow rather than be stipulated. It is deliberately *not* the word "view" — a View is application-supplied and carries no authored positions (`CONTEXT.md` Layout `_Avoid_`), while a Layout is authored data the Space holds.

**One correction to this ticket, which its later readers should not inherit.** The claim that "ADR 0040 does not make that argument… the product consequence is never weighed" is too strong. 0040's "Why ownership follows authoring" section names the rejected model, states the reuse claim outright, gives a concrete failure of sharing, and accepts the cost in a sentence: "The price is deliberate duplication when two Layouts need initially identical narratives; subsequent edits are independent." What it does is *assert* the no-requirement premise rather than argue it. That is a narrower defect than an unargued decision, and it is what this answer settles.

0040's failure argument for sharing survived scrutiny and is the reason the decision went this way rather than the model-size one this ticket leads with. Under sharing, Remove from Layout either leaves an Edge whose endpoint is absent from that Layout or mutates a shared Graph and changes every other Layout drawing it. Both horns are wrong before any UI exists, so "how the change is communicated" is not the second-order problem it looks like.

**The ticket's structural argument for sharing does not hold.** The join is in the shared model, not the owned one: `layouts[].graphs` is `z.array(idSchema)` (`packages/core/src/schema.ts:150`), an id list into a Space-level collection, which is a many-to-many join expressed in JSON. Ownership makes it containment and deletes the join, the dangling-id check, and the "does `activeGraph` name a *visible* Graph" cross-field rule with it. What ownership genuinely costs is an extra hop to *enumerate* — "the Graphs of a Space" stops being stored — and no operation in the tree wanted that list except a Space-subject View, which ADR 0045 answers by flattening.

**The 1:1 alternative was raised and rejected.** A Layout holding exactly one Graph does not remove the hard rendering case, because ADR 0032 permits cycles inside a single Graph and `.scratch/multiple-routes/findings.md` shows a back-edge follows from a cycle in one Graph just as it does from two Graphs disagreeing. It also discards a measured capability — the fixture's Long/Mid/Short over one spine, three narratives through one arrangement, which the spike rendered with zero back-edges — and forces one full arrangement per narrative, which is more duplication than either model under discussion.

**The constraint this ticket said must survive, survives.** Sharing is not permitted, so nothing draws a Graph naming a Card it does not place, and the fallback band goes as ADR 0040 requires. The two halves stayed coupled.

**What was written.** ADR 0045 (*A View takes Cards and Graphs and returns a Layout*) refines 0040: one View interface over an open subject, with closure and fresh-identity as boundary obligations, and a Space-Card subject drawing every Graph flattened across Layouts. It resolves issue `02` as a consequence. `CONTEXT.md`'s Layout and View entries and package 2 of `.scratch/card-route-editing/implementation-handoff.md` were updated to match. Issue `01` was resolved separately and its precedent — that 0041's body was edited only under explicit authorisation on the exact text — did not need invoking here, because 0045 is a new ADR rather than a rewrite.
