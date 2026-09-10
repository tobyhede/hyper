# 07 — Close the superseded displacement tickets

Status: resolved
Blocked by: 05

**What to build:** Retire `.scratch/expanded-cards/issues/06` and `07`, which
this effort closes rather than answers.

**Why:** Both are about a derivation that no longer exists. Leaving them
`resolved` and `needs-triage` respectively invites someone to re-do 06's preview
or pick one of 07's three treatments for a band that is gone.

- [ ] `expanded-cards/06` records that its fix was superseded by ADR 0084, and
      why: it made release still by previewing the step during the gesture, which
      left the jump in place under the pointer.
- [ ] `expanded-cards/07` moves from `needs-triage` to `wontfix`, naming ADR 0084
      as the reason — none of its three options was taken, because the band it
      measured no longer exists.
- [x] The e2e test 06 added is gone (ticket `04`), and `07`'s measured sweep is
      preserved in this effort's `05` as the case that must now land at the drop
      point.
- [x] `docs/agents/rendering.md` describes neither a derived displacement nor
      two interaction drafts. **ADR 0064's body is not touched**: an accepted ADR
      is append-only and its status line is the only edit it ever receives
      (`docs/agents/workflow.md`). It already carries `Refined by: 0084`, and the
      reversal is stated in 0084 alone — a reader arriving at 0064 follows the
      link rather than finding it rewritten.

## Answer

**Two of this ticket's four boxes name files that do not exist, and they are left unchecked.**

`.scratch/expanded-cards/issues/` holds `01`–`05` and nothing else — no `06`, no `07` — in this
worktree, in the main checkout, and in every other worktree of this repo. So there is no ticket
to record a supersession on and none to move from `needs-triage` to `wontfix`. The work those
two tickets describe was never committed either: `git log -S moveDraft -- packages/app/src` is
empty, and the e2e test `06` is said to have added
(`dragging an Open Card displaces its neighbours before release, not after`) is not in
`packages/app/e2e/`. This effort's spec and tickets `04` and `07` were written against a tree
that assumed both had landed.

That is worth stating rather than silently ticking, because the risk this ticket exists to
close is real and unaddressed by anything absent: someone re-proposing `06`'s
preview-during-the-gesture fix, or picking one of `07`'s three treatments for the clamp band.
The guard against that now lives where a future session will actually be reading — in
`AGENTS.md`'s new ADR 0084 entry and in `docs/agents/rendering.md`, both of which state the
negatives directly: do not reintroduce a draft that republishes a Card's neighbours, do not add
a `move` draft, do not reintroduce a conversion at a drop site, and do not answer the
memoryless Close by recording which Cards a particular Open pushed.

**What was real, and is done:**

`07`'s measured sweep is preserved in this effort's `05` as
`a closed Card released inside an Open Card lands at the drop point` — the case that used to
land on the Open Card's origin now lands at the drop point, and it was shown failing against
`097ae2be` first.

`docs/agents/rendering.md` describes neither a derived displacement nor two interaction drafts.
**ADR 0064's body is untouched**, as this ticket requires: an accepted ADR is append-only, it
already carries `Refined by: 0084`, and the reversal is stated in 0084 alone.

Beyond the ticket, two documents outside `docs/agents/` still described the derived model and
were named nowhere in this effort: `CONTEXT.md`'s Placement entry, and `AGENTS.md`'s ADR 0064
and ADR 0066 entries. Both are corrected — see `04`'s answer.
