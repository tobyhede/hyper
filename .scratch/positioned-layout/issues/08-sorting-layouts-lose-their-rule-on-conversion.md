# A sorting layout loses its rule when editing converts it

Status: resolved
Type: grilling
Decision at stake: revisits a cost accepted in ADR 0025

## The cost

ADR 0025 makes any edit convert the current layout into a positioned Layout,
copying the on-screen arrangement. It accepts one cost this ticket exists to
revisit: **a sorting layout stops sorting once converted.** Arrange a space by
name ascending, move one card, and the positions are now literal — renaming a
card afterwards moves it in no list, because there is no longer a list.

## Why it bites here and not elsewhere

Algorithmic layouts are not alike, and 0025 treats them as if they are.

A grid or an ELK arrangement produces positions that are **arbitrary** — derived,
with no ongoing meaning. Freezing them loses nothing the author was relying on.

A sort produces positions that encode a **live rule**. The author's model is
"these are in name order", and that is a property they expect to keep holding as
the space changes. Conversion destroys the rule and leaves behind something that
looks identical, which is the worst shape a loss can take.

There is a sharper version of the same observation: dragging a card in a
name-sorted view is a semantically odd gesture to begin with. In a grid, position
is arbitrary, so overriding it is ordinary. In a sort, the position *is the answer
to a question*, and moving a card says "no, this one goes third" — which
contradicts the sort rather than adjusting it. So the surprise is not really the
conversion. It is that the author did not realise the sort was a rule and not an
arrangement.

That makes this an affordance question before it is a decision question.

## Options

**1. Leave it (ADR 0025 as written).** One rule, no mode, no branch. The cost
stands.

**2. Explicit "copy for editing", sorts only.** The same drag behaves two ways
depending on which strategy resolved — the inconsistency ADR 0013 and ADR 0017
already thrashed over once.

**3. Explicit "copy for editing", all algorithmic layouts.** Uniform, but it
reintroduces the on-ramp 0017 killed. Note 0017's objection was partly about
*naming* — "a button labelled Auto-arrange... announces rearranging rather than
enabling" — and "copy for editing" fixes that half. It does not fix the other
half: the author still drags a card and still nothing happens.

**4. Convert silently, but record provenance.** The positioned Layout records
which strategy it was copied from. The view can then say "Positioned — copied
from Name ↑", conversion becomes legible instead of silent, and re-applying the
sort is Auto-arrange with a known strategy rather than a guess. One field, no
mode, no gate.

**5. Presentation.** Make a sorted view *look* rule-driven rather than identical
to a free canvas. If a sort does not read as a place where cards sit wherever you
put them, the drag that surprises stops being the obvious gesture. Needs no ADR.

**6. Confirm on first edit, sorts only.** "This view is sorted by name. Copy it so
you can place cards freely?" Neither a silent failure nor a hidden button, and
cheap to add later — but it is a confirm dialog on a drag, so it wants evidence
that 4 and 5 were not enough.

## Recommendation

**4 and 5 together, keeping 0025's single rule.** They remove the silence and the
irrecoverability without reintroducing a gate or making one gesture behave two
ways. Hold 6 as the fallback if it turns out people still convert sorts they
meant to keep.

## Not in scope

Whether the app offers time-based sorts at all. Cards carry no created/updated
timestamps today, and adding them is its own decision.

## Answer

The loss is intentional. Editing every Algorithmic View follows one rule: the
card positions already on screen become a new Positioned Layout, and the
computed rule ends. Sorting Views get no confirmation, special drag behavior,
or retained strategy provenance.

The missing affordance is View selection, not reversibility. An icon selector
will distinguish application-supplied Algorithmic Views from Space-owned
Positioned Layouts. Selecting a sorting View later is a fresh rendering choice;
it does not undo or restore a converted Layout. ADR 0031 records the decision,
and issue 16 carries the implementation.
