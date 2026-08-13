# The Frame 5 Alias modifier gestures are unbuilt and unowned

Status: resolved

Surfaced by: review of the Card and Alias creation branch against package 4

## Context

The accepted Alias storyboard specifies two direct-creation gestures in its
Frame 5:

> Modifier-dragging a Card body previews an Alias ghost while leaving the source
> Card in place. Drop creates and selects the Alias at that position.

> Using the Alias modifier while dropping a connection on empty canvas creates
> the same Alias and the active Route Edge atomically.

The keyboard contract assigns the modifier the storyboard deliberately left to
it: "`Shift` is the Alias creation modifier for both Card-body drag and
connection empty-drop."

Package 4 declined both, and says so in the handoff — "the connection-drop half
would need a sixteenth completion — create an Alias *and* an Edge — that package
3 did not build. That is interface work, not surface". That is a real reason for
that half. What is missing is anywhere for either half to go afterwards.
Packages 5 to 9 build Cards View membership, Graph management, the Edge
lifecycle, Space deletion and keyboard navigation, and none of them mentions an
Alias modifier; the handoff's Out of scope list, which does name nested-Space
Cards, changing a Card's kind, bulk authoring and touch gestures, does not name
these either. Accepted behaviour with no package and no exclusion is behaviour
that leaves the build by attrition.

Nor will the closing gate notice. Package 10's bar is:

> Do not close implementation while any matrix row lacks its required pointer
> and keyboard path or replacement case.

It counts **matrix rows**, and Add Alias's row is satisfied: its pointer path is
the Add Card menu into the Target picker, its keyboard path is the same
controls, and package 4 built both. The Frame 5 gestures are accelerators over
that row rather than a row of their own, so the one gate that would catch a
missing path cannot see them. That is the collision — not that the bar is
breached, but that these can be dropped without any bar being breached.

## The two halves differ, and should not be triaged as one

**Body drag.** Needs no new completion. `created-alias` already names a Target,
an optional title and an `anchor: LayoutPosition`
(`packages/app/src/space-authoring.ts:72-77`), and `App.tsx` already dispatches
it; an Alias dropped at a point is that completion with a different anchor.
Whether it also wants a `rendered` Placement beside the anchor — as
`create-and-connect` and the other two pointer gestures carry one, because a
pointer gesture is the only thing that knows where React Flow drew the Cards —
is a field on an existing completion, not a new one. The work is surface: a
modifier-aware drag on the Card body, a ghost preview, the single resolution of
an Alias source to its non-Alias target that Frame 5 requires, and a drop.

**Connection drop.** Needs the sixteenth completion first. Fifteen exist, and
its Markdown sibling `create-and-connect` is one of them; the Alias form of that
atomic Card-and-Edge Edit is not, and package 3 is marked done. Reopening the
authoring interface is a deliberate act with its own gate, which is exactly why
package 4 refused to improvise it in the canvas.

## What is not being asked

Not a re-argument of the gestures. Frame 5 is accepted, its modifier is
assigned, and the map records "modifier drags provide direct spatial creation"
as part of what issue `03` decided. This ticket asks where they go, not whether
they are right.

Declaring them out of first-public scope is a legitimate answer here, but it is
an answer that has to be written into the handoff's Out of scope list where the
next reader will find it, together with what becomes of the keyboard contract's
`Shift` assignment. An absence is not a decision.

## Why needs-triage

The specification is complete and nothing waits on a reporter, so this is
neither `needs-info` nor blocked on design. It is not `ready-for-agent` either:
that label means the destination is known and only the building remains, and the
destination is the open question. At least three answers are defensible — assign
the body-drag half to a surface package and the connection-drop half to package
7 behind a reopened interface addition; build only the body-drag half, whose
cost is small and self-contained; or move both out of scope — and choosing
between them decides what first-public contains, which is the maintainer's call
rather than something an agent can settle from the records. `wontfix` would be
one of those answers, not a description of the ticket's current state.

## Acceptance

- [x] Each half is either assigned to a named work package or listed in the
      handoff's Out of scope, separately, since their costs differ.
- [x] If the connection-drop half is kept, the sixteenth completion is named as
      interface work with the package that adds it, not left to the canvas.
- [x] If either is dropped, the keyboard contract's `Shift` assignment is
      retired with it rather than left specifying a modifier nothing reads.

## Answer

The halves are split, as this ticket asked for.

**Body drag is in scope**, as package **4b**. It needs no new completion:
`created-alias` already carries a Target, an optional title and an `anchor`, and
`App.tsx` already dispatches it, so an Alias dropped at a point is that
completion with a different anchor. The work is what this ticket described —
a modifier-aware drag on the Card body, a ghost preview, the single resolution
of an Alias source to its non-Alias Target, and a drop. Whether it also carries
a `rendered` Placement beside the anchor is settled at build time as a field on
an existing completion, not as an interface question.

**Connection drop is out of scope for first-public**, and is now listed in the
handoff's Out of scope with its reason. The judgement is the one this ticket
framed: it is an accelerator over a matrix row that already has a working
pointer path and a working keyboard path, and buying it means reopening package
3's closed authoring interface for a sixteenth completion. An accelerator is not
a reason to reopen a closed interface.

**The `Shift` assignment is narrowed rather than retired.** The keyboard
contract said "`Shift` is the Alias creation modifier for both Card-body drag
and connection empty-drop"; it now names Card-body drag alone, so no modifier is
specified that nothing reads.

Sequencing: 4b follows package **4a**, the pane corrections that ADRs 0047 and
0048 require. Both halves of that ordering matter — body drag creates an Alias
and leaves the author standing in the pane, so it should land on the pane in its
corrected form rather than on the one being replaced.
