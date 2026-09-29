# 02: A replacement withholds navigation through the availability answers, not a fieldset

**What to build:** While an Image Resource's replacement is in flight, every navigation command the Command Dock offers is drawn unavailable and stays keyboard-reachable (ADR 0073): choosing a Space, a Map or a Graph, Open Spaces, the opener's "Go to" crumb, Exit, and the persistence notice's Open of a blocking Space. Availability gains one `navigate` answer, false while a replacement runs, and it is the one place the Dock reads that rule from. The native fieldset around the Dock and the Dock's close-every-disclosure-when-disabled rule are removed, so the Dock no longer holds a second copy of the lock. The domain's own navigation refusals stay as the enforcement behind the drawn state. Because Retry was withheld only by the fieldset, Retry becomes available during a replacement, as ticket 05 of image-resource allows: it re-commits the working Space and replaces nothing.

**Blocked by:** 01

**Status:** resolved

Test seams (confirmed): the availability table; app e2e over a held replacement; the replace-image story in Ladle.

- [x] Availability answers `navigate` false while a replacement runs, and true otherwise.
- [x] During a held replacement, each Dock navigation command reports `aria-disabled="true"`, and arrow keys cross it in order.
- [x] Pressing a withheld navigation command does nothing and raises no failure notice.
- [x] With a failed save standing, Retry is available during a held replacement and pressing it re-commits.
- [x] Completion, refusal and failure of the replacement make every navigation command available again.
- [x] The Dock is no longer wrapped in a fieldset, and has no disabled rule of its own.
- [x] The parity claim that a replacement holds navigation is reworded to say navigation is drawn unavailable and stays focusable, with both its Ladle and application proofs (ADR 0052).
- [x] `ui:catalog:check` passes once the fieldset has no consumer.

## Resolution

`AuthoringAvailability` answers `navigate`, false while a replacement runs and true otherwise; the table in `packages/app/test/authoring-availability.test.ts` holds both. `useDockChrome` hands it down unchanged as `DockChrome.navigate`, and it is the only thing the Dock draws navigation from: `CommandDock` gives `!chrome.navigate` to `SpacesControl` (the opener's "Go to" crumb, Open Spaces and the Space name), `MapControls` and `GraphControls`, and to `PersistenceReport`, which passes it to `PersistenceNotice` and `PersistenceControl` as `navigate` for the Open of a blocking Space. That button is `disabled` with `focusableWhenDisabled`, so it reports `aria-disabled`. Exit's `exitDisabled` also reads `!availability.navigate`. The Space menu that holds Exit cannot be opened during a replacement, so no test reaches Exit itself.

`App` no longer wraps the Dock in a `FieldSet`, and `CommandDock` has no `disabled` prop and no longer closes its open disclosure when disabled. `FieldSet` now has no application consumer, and `pnpm ui:catalog:check` passes without an inventory entry. `open-spaces.ts`'s `assertNavigationAvailable` and `browser-location.ts`'s guards are unchanged and still enforce the rule.

Retry was only withheld by the fieldset, so it is now available during a replacement. It re-commits the working Space and replaces nothing. A conflict's Reload and Keep local and retry are still withheld as before: `PersistenceControl`'s `disabled` is now driven by `!navigate` from the Dock, until ticket 03 introduces `replaceSession`.

Evidence:

- The app e2e `a replacement in flight holds the target up and shows its answer there` asserts Open Spaces and the Space, Map and Graph names each report `aria-disabled` with no native `disabled`, walks them in the arrow order (`expectArrowOrder` in `e2e/graph.ts`), finds that pointer and Enter open no menu and raise no alert, and finds them available again once the refusal lands. The existing timeout, HTTP 500 and network failure tests, plus the Ladle completion path, now see the Map name through `aria-disabled` rather than a fieldset.
- The app e2e `a failed save is retried while a replacement is held, and the replacement goes on` retries a failed save mid-replacement. The revision advances by one while the target stays busy.
- The Ladle `Replacing` story test covers the opener's crumb and the four menu buttons as unavailable, in the arrow order and inert. The `replace-image` Ladle test focuses the withheld Map name mid-replacement.
- The parity claims `image-resource-replace-holds-navigation` and `command-dock-draws-its-menu-buttons-unavailable` are reworded to say navigation is drawn unavailable and stays focusable, with their Ladle and application proofs.
- The way to a blocking Space is not driven end to end during a replacement. `packages/app/test/persistence-control.test.tsx` holds it at the component for both the notice and the conflict dialog.
