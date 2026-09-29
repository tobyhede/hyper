# 02: A replacement withholds navigation through the availability answers, not a fieldset

**What to build:** While an Image Resource's replacement is in flight, every navigation command the Command Dock offers is drawn unavailable and stays keyboard-reachable (ADR 0073): choosing a Space, a Map or a Graph, Open Spaces, the opener's "Go to" crumb, Exit, and the persistence notice's Open of a blocking Space. Availability gains one `navigate` answer, false while a replacement runs, and it is the one place the Dock reads that rule from. The native fieldset around the Dock and the Dock's close-every-disclosure-when-disabled rule are removed, so the Dock no longer holds a second copy of the lock. The domain's own navigation refusals stay as the enforcement behind the drawn state. Because Retry was withheld only by the fieldset, Retry becomes available during a replacement, as ticket 05 of image-resource allows: it re-commits the working Space and replaces nothing.

**Blocked by:** 01

**Status:** ready-for-agent

Test seams (confirmed): the availability table; app e2e over a held replacement; the replace-image story in Ladle.

- [ ] Availability answers `navigate` false while a replacement runs, and true otherwise.
- [ ] During a held replacement, each Dock navigation command reports `aria-disabled="true"`, and arrow keys cross it in order.
- [ ] Pressing a withheld navigation command does nothing and raises no failure notice.
- [ ] With a failed save standing, Retry is available during a held replacement and pressing it re-commits.
- [ ] Completion, refusal and failure of the replacement make every navigation command available again.
- [ ] The Dock is no longer wrapped in a fieldset, and has no disabled rule of its own.
- [ ] The parity claim that a replacement holds navigation is reworded to say navigation is drawn unavailable and stays focusable, with both its Ladle and application proofs (ADR 0052).
- [ ] `ui:catalog:check` passes once the fieldset has no consumer.
