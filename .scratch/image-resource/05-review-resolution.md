# Image replacement review resolution

The review was checked against the implementation, ADR 0106 and the originating
ticket. The author subsequently chose to make an in-flight replacement exclusive:
navigation and authoring wait for its result; pan and zoom remain available.

| Finding | Outcome and evidence |
| --- | --- |
| A1 — Cancel disappears when the Resource is unselected | Fixed. `ResourceNode` keeps the toolbar visible while `imageReplacer` exists. The regression first failed because the toolbar was absent. Application and Ladle tests cover both deselecting an active target and starting from an unselected failed image. |
| D1 — Replacement does not fit the new image | Design clarified in ticket 05. ADR 0106 explicitly preserves remembered Map-owned Open Size. Manual resize is the accepted means of changing it; no automatic re-fit was introduced. No behavior changed. |
| D2 — Re-entering the same URL cannot retry a failed image | Refuted. A new application test proves that same-URL submission remounts the picture and retries loading without an Edit or revision change. It does not remeasure the stored natural size. |
| L1 — Busy controls accept and silently ignore input | Fixed. Upload and URL controls become disabled; the target announces busy state and refuses the drop cursor. The regression first failed on the missing busy state; application coverage exercises the disabled controls. |
| L2 — Leaving the target can hide a later refusal | Fixed with the confirmed exclusive-operation lock. Navigation and authoring wait while the target stays mounted; pan and zoom remain available. Back/Forward entries survive a blocked traversal. Upload refusal, transport failure and timeout release the lock and display their answer locally. Resource Close and Delete were already unavailable during replacement. |
| L3 — An upload has no timeout | Refuted. `HttpSpaceBackend` applies a 120-second upload timeout, including response-body consumption. Existing unanswered-request and stalled-response-body tests passed. |
| L4 — Transport errors use a different surface from image creation | Refuted as a defect. ADR 0057 gives feedback to the surface conducting the operation. Replacement displays its error in the target and reports unexpected errors diagnostically. |
| L5 — `interactiveDeviations` is not checked mechanically | Confirmed limitation, not a violated requirement. The catalogue declares two checked lists; the deviation policy requires a recorded justification. The existing entry supplies it. Continued justification relies on review. |
| L6 — `ImageReplacement` is declared twice | Fixed. The application imports the UI-owned type. No runtime behavior changed. |
| T1 — No same-stored-file regression | Coverage added: uploading a file whose stored URL is already current preserves the snapshot and makes no commit. |
| T2 — No measurement-rejection regression | Coverage added: an unexpected measurement rejection preserves the old image, reports the error and displays target-local feedback. Ordinary browser load failure resolves without a size and accepts the new URL, as ADR 0106 specifies. |
| T3 — Multi-file no-store assertion is indirect | Evidence clarified with an explicit store spy. The previous helper already rejected any store call; the strengthened assertion states the invariant directly. |
| T4 — The unmounted-target test could pass before the answer | Refuted by mutation: removing the mounted guard made the original test fail with one unexpected end callback. The guard was restored; awaited React `act` now makes settlement clearer. |
| W1 — Multi-file refusal wording assumes choosing a visible picture | Fixed: “Use one image at a time.” Copy and its tests agree; no new behavior to regress. |

## Verification

Behavioral regression references:

- A1: `packages/react-flow-adapter/test/ResourceNode.test.tsx:551`, with application
  and Ladle proofs in their image replacement suites.
- L1: `packages/ui/test/ImageReplaceTarget.test.tsx:139`.
- L2: `packages/app/test/browser-location.test.ts:116`,
  `packages/app/test/open-spaces.test.tsx:162`,
  `packages/app/test/image-replacement-activity.test.ts:5`,
  `packages/ui/test/CanvasResource.test.tsx:12`, and
  `packages/app/e2e/image-resource.spec.ts:863` and `:929`.
- Measurement timeout: `packages/app/test/image-measurement-timeout.test.tsx` runs
  the production measurement through startup and proves the ten-second budget.
- T1: `packages/app/test/image-replacement.test.ts:290`; T2:
  `packages/app/test/canvas-resource-authoring.test.tsx:851`; T3:
  `packages/app/test/image-replacement.test.ts:98`.

D1 and L6 change documentation or type ownership, with no behavior to regress.
W1 changes copy whose existing application and Ladle assertions were updated.

The L2 regressions first showed enabled authoring operations and an accepted Map
change during replacement. Withdrawing actions then exposed a remount that lost
the target's busy state; the stable Resource wrapper fixes that regression too.
The strengthened read-only Resource test exposed an unwanted action trigger,
which is now withdrawn while the wrapper remains stable.

Focused checks before the exclusive-operation change passed: 113 unit tests,
four application browser tests and three Ladle tests, plus typecheck and targeted
lint. The exclusive-operation change passed 209 focused unit tests, four
application browser tests and three Ladle tests; the final read-only and browser
unit checks passed 84 tests. Typecheck, targeted ESLint and oxlint passed.
Whole-tree `pnpm verify` passed: 272 test files, 3,801 tests passed and 20 skipped,
with the compiler checks, catalogue check, ESLint, oxlint, formatting and coverage
thresholds all passing. Its first run found a duplicate catalogue claim; the
busy-state proof now has its own claim and the full command passed on rerun.
`pnpm e2e` passed all 260 application browser tests. `pnpm e2e:ladle` passed all
135 catalogue browser tests. Database-specific integration and restart suites
were not run for these application changes; their shared browser selectors were
checked for compatibility with the Dock wrapper.

The application can hold navigation between its own history entries. Reload,
tab close and leaving the document use the browser's leave confirmation, which
the author can accept. This is a browser limitation, not an absolute navigation
lock outside the application.

## Second review (of 843f7dc6)

| Finding | Outcome and evidence |
| --- | --- |
| F1 — Disabling the busy controls drops keyboard focus | Fixed. Upload uses Base UI's `focusableWhenDisabled` and the URL field is read-only with `aria-disabled` while busy, so the focused control keeps focus. Red first: `packages/app/ladle-e2e/replace-image.spec.ts:125` (field not focused after a refused URL). Focus return to Replace after a successful replacement is proven again at `:96-99`. |
| F2 — Back into another Space racing a replacement reports not-found | Fixed. The lock refusal is `NavigationUnavailableError`, and the popstate listener may answer `false` late so the adapter rewinds. Red first: `packages/app/test/open-spaces.test.tsx:204`. |
| F3 — Replace offered without the lock | Fixed at the type level: `ImageReplacing` bundles `images` with its activity, and `SpaceCanvas` accepts both or neither. |
| F4 — A re-entrant `run()` rejects unhandled | Fixed: answered with `describeImageReplacementPending`. Red first: `packages/app/test/canvas-resource-authoring.test.tsx:872`. |
| F5 — AGENTS.md and a test comment misplace the history adapter | Fixed in AGENTS.md and `test/unit/app-http-startup.test.ts`. Whether ADR 0081 needs a refining ADR is open. |
| F6 — Retry and Continue editing blocked | Continue editing fixed (`packages/app/test/persistence-control.test.tsx:41`). Retry stays blocked by the Dock's fieldset; open. |
| F7 — Copy link withdrawn during replacement | Confirmed; open (product decision). |
| F8 — Dock disclosures close and do not reopen | Not a defect: matches the presenting rule that a list does not reopen itself and take focus. |
| F9 — Empty actions put `aria-disabled` on an article and swallow right-click | Fixed: the menu root is disabled instead. Red first: `packages/ui/test/CanvasResource.test.tsx:77`. |
| F10 — L3 cited a stalled-body test that did not exist | Test added: `packages/http/test/image-upload-timeout.test.ts:61`; it fails if the timer is cleared before the body is read. The L3 row above overstated the evidence at the time. |
| F11 — Same-URL retry test could pass with Replace then Cancel | Refuted as a gap: a refusal, an Edit or a kept target each fail the test. Added an explicit assertion that the target ends. |
| F12 — `createBrowserHistory` untested | Tests added: `packages/app/test/browser-history.test.ts`. They exposed two adapter limits. Rapid repeated Back during a rewind overshot, and in the stand-in never settled; fixed: the adapter keeps the rewinds it has issued, takes an arrival whose delta matches an outstanding one as the oldest such rewind (settling the older ones, which a reader's traversal may have pushed past an end), asks the listener about any other arrival, ending the return unless it holds, and issues one more rewind whenever the outstanding ones would land anywhere but the entry left (red first: `packages/app/test/browser-history.test.ts:192`, `:227`, `:247`, `:276`). A return whose rewinds a multi-entry jump pushes off an end can still leave the browser on another entry until the next traversal; open. An entry the adapter did not write could not be held and left later rewinds miscounted; fixed for a fragment link's entry, which is numbered and stamped as its `popstate` arrives (red first: `packages/app/test/browser-history.test.ts:237`, `:261`, `:274`, `:293`; Chromium: `packages/app/e2e/image-resource.spec.ts:1065`, which also asserts that a fragment navigation fires `popstate`). An entry written with no `popstate`, such as another script's `pushState`, stays uncounted; open. |
| F13 — Leave guard's replacement arm untested | Test added: `packages/app/test/app-hooks.test.tsx:601`. |
| F14 — Duplicate activity test cases | Collapsed to resolve, reject and re-entry. |
| F15 — `openPath`/`enter` untested; exiting a background Space blocked | Tests added. The exit over-block is unreachable (the Dock is disabled) and left open. |
| F16 — Stable-wrapper invariant unexplained | Comment added, naming its tests. |
| F17 — `replacingImage` optional and its rule duplicated | Fixed: required, documented, and derived from the one `editResourceBody` answer. |
| F18 — New standalone oxlint override | Fixed: folded into the existing named-predicate override. |
| F19 — Open-blocking-Space hidden rather than disabled | Fixed. Red first: `packages/app/test/persistence-control.test.tsx:59`. |
