# Leaving with unsaved work asks first

Status: open
Blocked by: 01

A `beforeunload` listener registered while the space is unsaved, so closing the tab or reloading on an unsaved arrangement is a question rather than a silent loss. ADR 0029 names this as the mitigation for the cost it accepts, and is explicit that it is a mitigation and not what makes the decision safe.

Held out of `01` deliberately. Playwright dismisses `beforeunload` dialogs by default but `page.reload()` behaviour around them is exactly what `01`'s round-trip tests depend on, and a guard that quietly breaks the tests proving the feature is a bad trade to make in the same commit. Land the feature, then land the guard against a suite that already passes.

The listener must be registered and removed with the unsaved state, not registered once and made conditional inside — a handler that is always attached asks the browser to treat every navigation as interesting, and Chrome's own guidance is to add it only when there is something to lose.
