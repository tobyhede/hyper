# 08 — A walk of a loop has no end

**What to build:** Decide what presenting does when a Walk returns to a Card it
has already visited, and then build that decision. ADR 0032 named three
candidate shapes — warn, limit, visualise — and deliberately picked none. This
ticket is where that choice gets made; it is not a place to make it in advance.

**Blocked by:** nothing. `07` gave a cyclic Route a place to start. This is the
other end of the same walk.

**Status:** needs-triage — reviewed and deliberately deferred, 2026-08-05.

## Deferred

Read in full and consciously not scheduled. The status stays `needs-triage`
because that is the truth: the ticket needs a decision, and none of the five
triage labels means "not now". Deferral is a scheduling state, not a triage one,
so it is recorded here rather than encoded in a label that would then be lying.

Nothing about the analysis is disputed and nothing is being waited on — this is
a choice not to spend the decision yet, which the ticket's own framing supports:
it is unbounded state with no signal attached, not a runaway loop, and one
keypress still buys exactly one entry.

**What should prompt picking it up:**

- Anyone presenting a real cyclic Route and being confused by it. That is the
  problem this describes, and it has not been observed yet — the case is
  reachable but no author has walked into it outside a test.
- A second reason to touch `moves()`. The cheapest candidate answer — marking a
  move whose target is already in the walk — is a derived read needing no new
  state, so it costs little if something else is already opening that function.
- Any work that bounds or reshapes the walk for another reason, since `advance`
  and `retreat` read and write the same list and a change to one is a change to
  both.

**Not** a reason to pick it up: the ticket being the only open one left in this
directory. Closing a directory is not a reason to make a design decision early,
and ADR 0032 deferred this once already on its merits.

## Why this is reachable now

Before `07` it was not, and that is the whole reason this is being filed rather
than left in ADR 0032. `routeStartCard` (`traversal.ts:70`) answered `undefined`
for a fully cyclic Route, `present()` returned without a `setState`, and no walk
of a loop could begin at all. The deferral cost nothing because nothing could
reach what was deferred.

`07` made `routeStartCard` fall back to the first Edge's `from`, so every
schema-valid Route now begins somewhere. `packages/app/e2e/new-space.spec.ts`
("the Route that self-connection mints can be presented") proves that the first
authoring gesture this effort ships — a self-connection on `Card 1` — produces a
Route that enters presenting mode. The deferred behaviour is now the ordinary
behaviour of a new Space's first Route.

## What actually happens

`advance()` (`navigation.ts:189-196`) refuses exactly one thing: no outgoing Edge
from the active Card (`navigation.ts:194`). A Card on a loop always has one, so
the guard never fires and `navigation.ts:195` appends `edge.to` to the walk.
Nothing in the module bounds that list.

For the self-edge Route — the case the first gesture produces — `edge.to` is the
Card already at the end of the walk, so nothing downstream moves:

- `PresentingChrome` renders `presenting-end` only when `moves.length === 0`
  (`PresentingChrome.tsx:35-38`), and its own doc comment says "A sink renders as
  none, which is how the walk says it has ended" (`PresentingChrome.tsx:23`). A
  loop has no sink, so that branch is never taken. The chrome offers the same
  single move forever, and the walk cannot say it has ended because on this Route
  it has not.
- `PresentingCamera`'s effect (`GraphView.tsx:136-171`) is keyed on
  `activeCardId` (`GraphView.tsx:171`), which does not change between steps, so
  the effect does **not** re-run and the camera does nothing.
- The available moves are recomputed every render (`App.tsx:137`, calling
  `navigation.ts:220-228`) and answer the identical one-item list.

Holding ArrowRight (`App.tsx:435`) therefore changes nothing on screen while
`walk` grows by one CardId per keypress. The one observable effect is
`canRetreat` (`App.tsx:118`, `walk.length > 1`) flipping true after the first
press, so `← back` appears; each press can then be unwound one at a time by
`retreat` (`navigation.ts:197-207`).

State plainly what this is and is not. It is **not** a runaway loop: nothing
advances by itself, which ADR 0032 says outright, each entry is one string
reference, and one keypress buys one entry. It is unbounded state with no signal
attached to it — the presenter cannot tell a loop from a very long line, and the
app never tells them.

A multi-card cycle differs in one way that may matter more: `activeCardId` does
change, so the camera *does* move, and the repeat is shown as progress.

## What is NOT being decided here

Deliberately. This ticket records a question. The design conversation comes
before the code (`docs/agents/workflow.md`).

- **Whether the answer is a warning, a limit, a visualisation, or nothing at
  all.** ADR 0032 lists the first three and chooses none of them. "Nothing at
  all, and here is why" remains a legitimate outcome — this may resolve as
  `wontfix` with the reasoning written down, and that is a real result, not a
  failure to act.
- **Whether the walk is bounded, and how.** Capping it, collapsing repeats,
  storing visit counts rather than a list, and leaving it unbounded are all open.
- **Where the answer lives.** `advance()`, the moves derivation,
  `PresentingChrome` and the camera are each plausible homes, and no two of them
  imply the same design.
- **A Route naming its own end.** `07` floated the mirror of this — a Route
  naming its own start (`traversal.ts:66-68`) — and left it floated for being a
  schema change, an import/export change and a new authoring surface. An authored
  end is the same kind of change and must not be smuggled in through a
  presentation ticket.
- **How a cycle is drawn in the overview.** `.scratch/multiple-routes/findings.md`
  owns that; it is a layout problem and a separate one.

## Acceptance criteria

- [ ] The decision is recorded before any code: an ADR if it locks a trade-off
      (`docs/agents/workflow.md`), otherwise an `## Answer` on this ticket that
      names the alternatives considered and why they lost.
- [ ] `07`'s acceptance survives: presenting a self-edge Route still starts,
      still draws the Card, and still offers its one outgoing move.
- [ ] The presenter can tell a repeat visit from a first arrival — or the ticket
      records why they should not be able to.
- [ ] Whatever bounds the walk, if anything, is stated and proven, including a
      decision to leave it unbounded.
- [ ] `retreat` stays consistent with whatever `advance` does: the two read and
      write the same list (`navigation.ts:189-207`), so a change to one is a
      change to both.
- [ ] Both a self-edge and a multi-card cycle are covered. They present
      differently — the camera moves for one and not the other — so one passing
      does not imply the other.
- [ ] A Route with a cycle and a tail (`A→B, B→C, C→B`) still walks its tail as
      ordinary forward moves and is unaffected until it reaches the cycle.
- [ ] `pnpm verify` and `pnpm e2e` pass.

## Out of scope

- Automatic traversal of any kind. ADR 0032 is explicit that nothing advances by
  itself, and user story 32 asks for cyclic Routes to be presentable "through
  deliberate Walk moves".
- Constraining what an author may draw. The deferral exists precisely so that
  presentation does not reach back into the domain — remaking ADR 0023's
  exception for cycles is the specific thing to avoid.
- Layout or edge routing for cyclic Edges in the overview.
