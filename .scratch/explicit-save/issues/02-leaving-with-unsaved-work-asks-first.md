# Leaving with unsaved work asks first

Status: resolved

A `beforeunload` listener registered while the space is unsaved, so closing the tab or reloading on an unsaved arrangement is a question rather than a silent loss. ADR 0029 names this as the mitigation for the cost it accepts, and is explicit that it is a mitigation and not what makes the decision safe.

Held out of `01` deliberately. Playwright dismisses `beforeunload` dialogs by default but `page.reload()` behaviour around them is exactly what `01`'s round-trip tests depend on, and a guard that quietly breaks the tests proving the feature is a bad trade to make in the same commit. Land the feature, then land the guard against a suite that already passes.

The listener must be registered and removed with the unsaved state, not registered once and made conditional inside — a handler that is always attached asks the browser to treat every navigation as interesting, and Chrome's own guidance is to add it only when there is something to lose.

## Answer

Built as an effect in `App` keyed on `unsaved`, so registration follows the state rather than being tested inside a permanent handler.

**`preventDefault()` alone, no `returnValue`.** The long-standing advice is to set both. `event.returnValue = ''` is deprecated, and the lint config that arrived with the `toolchain-hardening` merge fails the build on deprecated APIs — which is the right call here rather than a suppression: current Chromium, Firefox and Safari all honour the spec'd `preventDefault`, and this prototype runs in none of the browsers the legacy assignment was for. Recorded in the code comment so it is not "fixed" back in.

**The Playwright worry the ticket was held back for turned out to be real, and in the opposite direction to the fear.** Playwright dismisses dialogs when no `dialog` listener is registered, and for `beforeunload` dismissing means *stay* — so the risk was a cancelled reload, not a hung one. In practice `new-space.spec.ts`'s unsaved-reload test still passes untouched: the reload goes through, and that test would have failed loudly if it had not, since it asserts the card is back at its last saved position rather than where the drag left it.

The new test lives in `editing.spec.ts` and asserts both halves against the same reload mechanism: with the space saved, nothing is asked; after a drag, exactly one `beforeunload` dialog. It registers a listener that **accepts** — "leave the page" — so the reload proceeds and the assertion is about the dialog rather than about navigation.

`pnpm verify` green, 358 tests across 27 files. `pnpm e2e` 34 green, up from 33.
