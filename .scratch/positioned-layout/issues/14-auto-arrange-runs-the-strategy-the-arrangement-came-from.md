# Auto-arrange runs the strategy the arrangement came from

Status: open
Type: task
Blocked by: 08

`resolveView` gives every positioned view `elkStrategy()` as its `automatic`, and a save overwrites `defaultView` with the Layout id — so converting a space destroys the record of which built-in it opened in. Author a space with `defaultView: "grid"`, drag one card, save, reload, press Auto-arrange: every card lands in an ELK arrangement that was never on screen.

Within a single session the behaviour is right — an automatic view is given *itself* as its `automatic`, so Auto-arrange on a grid re-runs the grid, and a test pins that. It is only the save boundary that loses the answer.

This is `08`'s provenance question widened past sorting layouts: `08`'s option 4 — the positioned Layout records which strategy it was copied from — is exactly the fix, and it fixes the grid case for free. **Do not build ahead of `08`'s decision.** The point of writing this down now is that `08` should know its scope includes the grid and not only sorts.

Worth noting for `08`: its premise is currently unbuildable. `BUILT_IN_STRATEGIES` offers `graph` and `grid`, and no sorting strategy exists to lose its rule.

Reachability, stated honestly: no space in the repo sets `defaultView: "grid"` — neither the fixture nor `newSpace()` — so this takes hand-authoring to reach.
