# 07 — Close the superseded displacement tickets

Status: ready-for-agent
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
- [ ] The e2e test 06 added is gone (ticket `04`), and `07`'s measured sweep is
      preserved in this effort's `05` as the case that must now land at the drop
      point.
- [ ] ADR 0064's displacement section and `docs/agents/rendering.md` agree with
      0084. Neither describes a derived displacement or two interaction drafts.
