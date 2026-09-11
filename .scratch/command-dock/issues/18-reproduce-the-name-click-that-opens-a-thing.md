# 18 — Reproduce the Diagram/Graph name click that opens a Thing

Status: needs-info
Tags: release/v1
Blocked by: a reproduction. That is the whole of what this ticket is waiting for.

**What is needed:** a reproduction. Clicking the Diagram or Graph name in the
Command Dock was reported to Open a Thing on the canvas as well as beginning the
rename. `11` could not obtain it, and closed on that rather than on a fix.

**`needs-info` is the honest label.** There is no work an agent can pick up
here: a fix with no reproduction has nothing to fail against, and the candidate
explanation has already been ruled out. This file exists so the report is
scannable rather than buried in the tail of a resolved ticket — the failure `16`
and `17` were both created to answer.

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
established.** No speculative event fix was made, deliberately. Do not start by
assuming it — if it is the cause, the reproduction will show it.

## What would move this ticket

- [ ] A reproduction: the gesture, the Dock slot and orientation, the Thing's
      Open/Closed state, and whether the Space had pending or failed work.
      A recording or a failing Playwright case is worth more than prose.
- [ ] Failing that, a positive argument that it cannot happen — the event path
      from an `IdentityName` press to a `ThingNode`'s Open, shown to be broken
      at some specific point. Then this closes as `wontfix` with the argument
      recorded, which is a real outcome and not a lesser one.
- [ ] Either way, whatever is established here becomes a claim, so the next
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
