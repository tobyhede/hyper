# 03: Conflict recovery during a replacement is split by whether it replaces the session

**What to build:** When a conflict stands during an in-flight replacement, the conflict dialog offers "Keep local and retry", which re-commits the working Space and replaces nothing, and draws Reload unavailable, because accepting the stored Space replaces the session under the replacement. Availability gains a `replaceSession` answer, false while a replacement runs; the dialog reads it rather than a blanket disabled flag, and Open of a blocking Space follows ticket 02's `navigate` answer.

**Blocked by:** 02

**Status:** resolved

Test seams (confirmed): the persistence control through its roles; app e2e with a conflict standing during a held replacement.

- [x] Availability answers `replaceSession` false while a replacement runs, and true otherwise.
- [x] During a held replacement, "Keep local and retry" is available and pressing it re-commits.
- [x] During a held replacement, Reload is drawn unavailable and does nothing.
- [x] Once the replacement answers, Reload is available again.
- [x] The persistence control takes no blanket disabled flag.

## Resolution

`AuthoringAvailability` answers `replaceSession`, false while a replacement runs and true otherwise; the table in `packages/app/test/authoring-availability.test.ts` holds both. `useDockChrome` hands it down unchanged as `DockChrome.replaceSession`, beside `navigate`, and `CommandDock`'s `PersistenceReport` passes it to `PersistenceControl`. The conflict dialog's Reload is `disabled={!replaceSession}` with `focusableWhenDisabled`, so it reports `aria-disabled`, stays focusable and does nothing. Keep local and retry asks nothing of availability: it re-commits the working Space and replaces nothing. The Open of a blocking Space still follows `navigate`.

`PersistenceControl` has no `disabled` prop. Acknowledging a rejection never read it for anything but the conflict, and stays available.

Evidence:

- `packages/app/test/persistence-control.test.tsx`: 'keeps Keep local and retry during a replacement and withholds Reload until it answers' drives `replaceSession` through roles. Reload is `aria-disabled`, focusable and inert; Keep local and retry is available and calls through; Reload works once `replaceSession` is true.
- `packages/app/e2e/image-resource.spec.ts`: `conflictDuringReplacement` commits over the Space from outside the browser, parks the browser's Open of the Image Resource until an upload is chosen and held, then lets the parked save meet the newer revision. 'keeping local work during a held replacement re-commits it, and the replacement goes on' presses Keep local and retry mid-replacement. The revision advances by one while the target stays busy, and the replacement then lands as a further commit. 'Reload is withheld while a replacement is held and offered again once it answers' finds Reload `aria-disabled` with no native `disabled`, focusable, and inert to pointer and Enter. Once the upload is refused it is available, and pressing it installs the stored Space.
- No parity claim covers conflict recovery during a replacement, so no Ladle story was changed. `command-dock-resolves-conflict` is unchanged and its proofs still hold outside a replacement.
