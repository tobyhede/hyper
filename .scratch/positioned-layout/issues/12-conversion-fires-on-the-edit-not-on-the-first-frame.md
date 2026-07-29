# Conversion fires on the edit, not on the first frame

Status: resolved
Type: task
Prerequisite for: ADR 0021

`createEditorStore`'s `syncNodes` seeds `positions` from the first resolved layout and says so outright: *"created on open, before any gesture, so no edit is ever what brings it into being."* That is ADR 0017's decision, stated on the line that implements it, and ADR 0025 moved it — *"Only what fires it moves, from opening the space to editing it."*

**Nothing observable turns on this today, and the ticket should keep saying so** rather than dressing it up as a bug. Three independent reasons:

`revision` stays at 0 through the seed, so the space opens saved and `save` early-returns. The seeded value is byte-identical to what a convert-on-edit would copy, because the layout resolves exactly once — `graph` is memoized over inputs (`visibleCardIds`, `visibleHandles`, `visibleEdges`) that cannot change in the app's lifetime. And the seed already copies **every** card, which is 0025's copy-what-is-on-screen requirement, whichever moment it fires at.

What fixing it buys is that `nodes === null` stops carrying three meanings at once — no layout yet, not editable, no Layout — and that there is then one defined moment a structural edit can hook into. That is what ADR 0021 needs, which is the reason this is worth doing before it rather than during it.

Expect to keep the seeded node array — React Flow needs one from the first frame — and move only the `positions` map, or to distinguish "the arrangement on screen" from "the Layout" with a flag. Either way the store's own tests are where the intent gets restated.

## Answer

An automatic strategy still prepares the complete arrangement in live React Flow nodes during load, but initial synchronization leaves authored positions null and revision zero. A positioned view initializes from its existing, possibly sparse Layout without advancing the revision.

Moving callbacks retain per-node gesture origins; the separate settled callback compares against that origin, clears it, and only a real completed move advances the revision. The first automatic-view conversion captures every card currently on screen and overlays edited coordinates without moving any other card. A drag returning to its origin and a settled no-op do not convert or submit.

Auto-arrange remains an explicit authored edit, may replace placement with a sparse map, clears drag origins and persists. Snapshot preparation narrows positions and builds the snapshot before `App` advances its submission watermark.

Fresh verification passed: `pnpm verify` reported 35 test files and 317 tests passed; `pnpm e2e` reported 32 tests passed.
