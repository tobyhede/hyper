# 08 — A traversal of a loop has no end

**What to build:** Decide what presenting does when a traversal returns to a
Resource it has already visited, and then build that decision. ADR 0032 named
three candidate shapes — warn, limit, visualise — and deliberately picked none.
This ticket is where that choice gets made; it is not a place to make it in
advance.

**Blocked by:** nothing. `07` gave a cyclic Graph a place to start. This is the
other end of the same traversal.

**Status:** ready-for-human — deferred 2026-08-05; triaged 2026-10-09, and
the decision ADR 0032 defers is still open.

## Deferred

Read in full and consciously not scheduled. Nothing about the analysis is
disputed and nothing is being waited on — this is a choice not to spend the
decision yet, which the ticket's own framing supports: it is unbounded state
with no signal attached, not a runaway loop, and one keypress still buys exactly
one entry.

**What should prompt picking it up:**

- Anyone presenting a real cyclic Graph and being confused by it. That is the
  problem this describes, and it has not been observed yet — the case is
  reachable but no author has walked into it outside a test.
- A second reason to touch `moves()`. The cheapest candidate answer — marking a
  move whose target is already in the Traversal history — is a derived read
  needing no new state, so it costs little if something else is already opening
  that function.
- Any work that bounds or reshapes the Traversal history for another reason,
  since `advance` and `retreat` read and write the same list and a change to one
  is a change to both.

**Not** a reason to pick it up: the ticket being the only open one left in this
directory. Closing a directory is not a reason to make a design decision early,
and ADR 0032 deferred this once already on its merits.

## Why this is reachable now

Before `07` it was not. The start rule answered `undefined` for a fully cyclic
Graph, `present()` returned without publishing, and no traversal of a loop could
begin at all.

`07` made the start fall back to the first Edge's `from`: `graphStartResource`
(`packages/graph/src/traversal.ts:70-71`) answers
`graphEntryResources(graph)[0] ?? graph.edges[0]?.from`, so every schema-valid
Graph now begins somewhere. `packages/app/e2e/new-space.spec.ts:327` ("the Graph
the explicit Map owns can be self-connected and presented") proves that the
first authoring gesture — a self-connection on `Resource 1` — produces a Graph
that enters presenting. The deferred behaviour is the ordinary behaviour of a
new Space's first Graph.

## What actually happens

Presenting draws on the Stage (ADR 0123); there is no presenting camera.

`advance()` (`packages/app/src/navigation.ts:437-448`) refuses exactly one
thing: no outgoing Edge at `branchIndex` from the current Resource. A Resource
on a loop always has one, so the guard never fires and the Resource the Edge
reaches is appended to `traversalHistory`. Nothing in the module bounds that
list.

For the self-Edge Graph — the case the first gesture produces — the appended
Resource is the one already at the end of the Traversal history, so nothing on
screen changes:

- `PresentingChrome` renders `presenting-end` only when `moves.length === 0`
  (`packages/app/src/components/PresentingChrome.tsx:178`), and its doc comment
  says "A sink renders as none, marking the end of this traversal" (:76). A loop
  has no sink, so that branch is never taken. The chrome offers the same single
  move forever.
- `PresentingStage` draws the presented Resource with `contentKey={resourceId}`
  (`packages/app/src/components/PresentingStage.tsx:28`). The key does not
  change between steps, so the Stage neither swaps its content nor resets its
  scroll (`packages/ui/src/Stage.tsx:33-35`).
- The available moves are recomputed every render (`App.tsx:153`, calling
  `navigation.ts:492`) and answer the identical one-item list.

Holding ArrowRight (`packages/app/src/presenting-keys.ts:96`) therefore changes
nothing on screen while `traversalHistory` grows by one ResourceId per keypress.
The one observable effect is `canRetreat` (`navigation.ts:106-108`,
`traversalHistory.length > 1`) flipping true after the first press, so Back
appears; each press can then be unwound one at a time by `retreat`
(`navigation.ts:449-469`).

State plainly what this is and is not. It is **not** a runaway loop: nothing
advances by itself, which ADR 0032 says outright, each entry is one string
reference, and one keypress buys one entry. It is unbounded state with no signal
attached to it — the presenter cannot tell a loop from a very long line, and the
app never tells them.

A cycle across several Resources differs in one way that may matter more: the
presented Resource does change, so the Stage swaps its content and resets its
scroll at each step, and the repeat is shown as progress.

## What is NOT being decided here

Deliberately. This ticket records a question. The design conversation comes
before the code (`docs/agents/workflow.md`).

- **Whether the answer is a warning, a limit, a visualisation, or nothing at
  all.** ADR 0032 lists the first three and chooses none of them. "Nothing at
  all, and here is why" remains a legitimate outcome — this may resolve as
  `wontfix` with the reasoning written down, and that is a real result, not a
  failure to act.
- **Whether the Traversal history is bounded, and how.** Capping it, collapsing
  repeats, storing visit counts rather than a list, and leaving it unbounded are
  all open.
- **Where the answer lives.** `advance()`, the moves derivation,
  `PresentingChrome` and the Stage are each plausible homes, and no two of them
  imply the same design.
- **A Graph naming its own end.** `07` floated the mirror of this — a Graph
  naming its own start — and left it floated for being a schema change, an
  import/export change and a new authoring surface. An authored end is the same
  kind of change and must not be smuggled in through a presentation ticket.
- **How a cycle is drawn in the overview.**
  `.scratch/multiple-routes/findings.md` owns that; it is a layout problem and a
  separate one.

## Acceptance criteria

- [ ] The decision is recorded before any code: an ADR if it locks a trade-off
      (`docs/agents/workflow.md`), otherwise an `## Answer` on this ticket that
      names the alternatives considered and why they lost.
- [ ] `07`'s acceptance survives: presenting a self-Edge Graph still starts,
      still draws the Resource on the Stage, and still offers its one outgoing
      move (`e2e/new-space.spec.ts:327`).
- [ ] The presenter can tell a repeat visit from a first arrival — or the ticket
      records why they should not be able to.
- [ ] Whatever bounds the Traversal history, if anything, is stated and proven,
      including a decision to leave it unbounded.
- [ ] `retreat` stays consistent with whatever `advance` does: the two read and
      write the same list (`navigation.ts:437-469`), so a change to one is a
      change to both.
- [ ] Both a self-Edge and a cycle across several Resources are covered. They
      present differently — for a self-Edge the Stage's `contentKey` never
      changes, so nothing swaps or scrolls back; for a longer cycle the Stage
      swaps content and resets its scroll at each step — so one passing does not
      imply the other.
- [ ] A Graph with a cycle and a tail (`A→B, B→C, C→B`) still traverses its tail
      as ordinary forward moves and is unaffected until it reaches the cycle.
- [ ] `pnpm verify` and `pnpm e2e` pass.

## Out of scope

- Automatic traversal of any kind. ADR 0032 is explicit that nothing advances by
  itself, and user story 32 asks for cyclic Graphs to be presentable "through
  deliberate Walk moves".
- Constraining what an author may draw. The deferral exists precisely so that
  presentation does not reach back into the domain — remaking ADR 0023's
  exception for cycles is the specific thing to avoid.
- Layout or Edge routing for cyclic Edges in the overview.

## Comments

**2026-08-13 — verification sweep. Behaviour unchanged; one stated pick-up
trigger has since fired unspent.**

The described behaviour survives the rename (`walk` → `traversalHistory`,
`Route` → `Graph`) intact: `advance` still appends unconditionally with the
no-outgoing-Edge case as the only guard (`packages/app/src/navigation.ts:
374-384`), nothing bounds the history, `presenting-end` still renders only on
`moves.length === 0` (`components/PresentingChrome.tsx:35-38`), and the camera
effect is still keyed on `activeCardId` (`components/cameras.tsx:101-118`), so
a self-Edge still moves nothing on screen. The presenter still cannot tell a
repeat from a first arrival.

Worth recording: the ticket named "a second reason to touch `moves()`" as the
cheap moment to take this. `moves()` has since been rewritten for branch
selection and single-read resolution (`navigation.ts:429-441`, with
`selectBranch` at :407-421) **without** the question being answered. The
trigger fired and was not spent, so the next one should be taken deliberately
rather than waited for.

### Triage, 2026-10-09

> *This was generated by AI during triage.*

**Category:** enhancement. **State:** ready-for-human.

Still real: `advance` appends with no check (`packages/app/src/navigation.ts:437-448`), nothing bounds `traversalHistory`, and `presenting-end` renders only when there are no moves (`PresentingChrome.tsx:178`). The camera argument is gone: `PresentingCamera` was deleted in `1637e45d` (presenting-stage/03) and presenting draws on the Stage (ADR 0123), so the body now states the Stage behaviour — a self-Edge leaves `contentKey` unchanged (`PresentingStage.tsx:28`), and a longer cycle swaps content and resets scroll. The body was refreshed to current vocabulary (Walk → Traversal history, Card → Resource, Route → Graph, `routeStartCard` → `graphStartResource` at `traversal.ts:70-71`), the current e2e test name (`e2e/new-space.spec.ts:327`) and current line refs; the 2026-08-13 sweep above is left as written. The open decision for a human is warn, limit, visualise or nothing, which ADR 0032:18 still defers.
