# 13 — Settle New Layout and New Space command outcomes

Status: needs-triage
Tags: release/v1
Blocked by: nothing.

**What to decide:** What an author gets from each creation command, including
where the author continues after creation and what cancelling does. Ticket 11
identified these as product decisions, not proven branch regressions.

New Layout currently creates and selects an empty Layout with its initial empty
Graph, then opens the Cards list. First Layout initialization also opens that
drawer. Both behaviors already exist at the promotion's merge base `a2082964`.
The reviewed handoff requests that New Layout create/select the Layout without
opening another surface. Decide the first-initialization case explicitly too;
changing it is not required to repair the Card geometry regression.

New Space currently opens the Space Card creation pane. Ordinary Spaces must be
created through owning Space Cards. Decide whether the command immediately
creates and Enters a new Space or opens a naming/creation step; specify where its
owning Space Card is authored, the initial title and context, and cancellation.
Do not implement a second Space creation path that bypasses ownership.

- [ ] Record the chosen visible outcome for both commands, including continuation
      and cancellation, before changing implementation or expectations.
- [ ] Prove each outcome through application gestures, including reload after a
      completed creation and no Edit after cancellation.
- [ ] Give each changed stable-story claim matching application and Ladle evidence.
- [ ] Keep Cards popover-versus-drawer treatment with ticket 10 and Space rename
      with ticket 09; neither is implicitly decided by command naming.

## Comments

Captured during ticket 11 implementation. Existing creation behavior remains
unchanged pending this explicit decision. This is assigned work, not a claim
that the current treatment was approved by the handoff.
