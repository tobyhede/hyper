# 18 — Reproduce the Diagram/Graph name click that opens a Thing

Status: wontfix
Tags: release/v1
Blocked by: nothing. Closed without a reproduction; clicking a Space, Diagram
or Graph name on the Dock cannot Open a Thing, for the two reasons below.

**What was needed:** a reproduction. Clicking the Diagram or Graph name in the
Command Dock was reported to Open a Thing on the canvas as well as beginning the
rename. `11` could not obtain it, and closed on that rather than on a fix.

**Closed as `wontfix`.** A later session widened the gesture set past what `11`
tried. None opened a Thing. Clicking or keyboard-activating a Space, Diagram or
Graph name on the Dock cannot reach a Thing's Open, and that does not depend on
timing, slot or whether a Thing is selected. That is the positive argument this
ticket asked for, and it is now a claim: `renaming a Space, Diagram or Graph
from the Dock does not Open a selected Thing` in
`packages/app/e2e/dock-interactions.spec.ts`.

## What was already tried, and did not reproduce it

From `11`'s Answer, which is the record this has to beat rather than a head
start on it:

- Diagram and Graph names clicked with another disclosure menu already open.
- Both at 0 ms and at 120 ms press durations, after `hoverAfresh` and the
  disclosure helper's automatic Escape were removed from the test helpers —
  which was done precisely so the gestures under test were the real ones.
- Asserting in each case: the rename editor takes focus, cancel restores, the
  Thing's state is unchanged and the Space's revision is unchanged.

None opened a Thing.

**Outside-press propagation was the standing hypothesis and it is *not*
established.** No speculative event fix was made, deliberately.

## What this session added, and still did not reproduce it

A red-capable Playwright loop first opened Thing A through its real Open
control, so the detector was proved against the symptom, then closed it and
walked the gestures `11` never tried:

- Space, Diagram and Graph names clicked with no menu open.
- The same clicks with Thing A selected first.
- Completing each rename with Enter while Thing A stayed selected.
- Activating each name from the keyboard with Enter and with Space.
- Double-clicking each name.
- Clicking each name while Thing A was already Open (Open count stayed at one).
- Clicking the Diagram name after moving the Dock to each edge's midpoint
  (top centre, right middle, bottom centre, left middle).
- `elementsFromPoint` on the Diagram name at bottom-centre: the stack is Dock
  chrome (`SPAN` / `BUTTON` `Rename Diagram: Collection 1` / the Command Dock
  toolbar). No Thing and no Open control is under the pointer.
- New Diagram's continuation, which presses the Diagram name the way a reader
  does (`ChromeContinuation`).

None opened a Closed Thing. The first pass of the "already Open" case was a
false positive: the detector counted the Thing the setup had left Open.

## Why it cannot happen

A Thing Opens in two ways. Neither is reachable from a press on a Space,
Diagram or Graph name.

**A pointer does not Open.** ADR 0036: no pointer gesture on a Thing's body
Opens it — the Thing's own control does. Held by
`packages/app/test/SpaceCanvas.test.tsx` (`does not happen on a single click /
double click of the Thing body`) and `packages/app/e2e/editing.spec.ts`
(`a click selects a Thing, and no pointer gesture on its body opens it`).
The name's `onClick` only begins that name's rename (`CommandDock.tsx`
`IdentityName`). A click that somehow missed the Dock and landed on a Thing
would select it, not Open it. At the slot most likely to cover Things,
`elementsFromPoint` never left the Dock.

**A key does not Open from the Dock.** `SpaceCanvas`'s `handleKeyDown` sits on
React Flow's wrapper, not on `window`, and Opens only when Enter or Space
arrives from inside `.react-flow__node` and the target is not
`NOT_A_CANVAS_COMMAND`. That selector includes `button`, `input`, `textarea`
and `.nokey`. The Dock toolbar is `.nokey`; the name is a `ToolbarButton`; the
editor is a textbox. A key on either fails the node-target check before Open
runs. Completing the rename with Enter is the same exclusion.

**The application-driven press is the reader press.** `ChromeContinuation`
renames by `element.click()` on the same control. New Diagram's continuation
was in the loop and did not Open a Thing.

The path is broken at the name's `onClick` (pointer) and at
`handleKeyDown`'s node-target / `NOT_A_CANVAS_COMMAND` guards (keyboard).
There is no third Open door for a Space, Diagram or Graph name to walk through.

## What would move this ticket

- [ ] A reproduction: the gesture, the Dock slot and orientation, the Thing's
      Open/Closed state, and whether the Space had pending or failed work.
      A recording or a failing Playwright case is worth more than prose.
- [x] Failing that, a positive argument that it cannot happen — the event path
      from a Space, Diagram or Graph name press to a Thing's Open, shown to be
      broken at some specific point. Then this closes as `wontfix` with the
      argument recorded, which is a real outcome and not a lesser one.
- [x] Either way, whatever is established here becomes a claim, so the next
      change to the Dock's press handling cannot quietly reintroduce it.

## Comments

**Raised by `11`, which could not obtain the reproduction.** It was originally
closed there with the non-reproduction recorded in the ticket's own prose and no
file of its own. Review found that reasoning cited `16` as authority for not
minting a ticket when `16` exists to argue the opposite, and that the result was
invisible to every scan the repo runs — `roadmap.ts` reads `Status:` lines, and
`docs/agents/issue-tracker.md`'s body grep looks for `deferred`/`out of
scope`/`follow-up`, none of which a disclaimed non-deferral matches. Hence this
file.
