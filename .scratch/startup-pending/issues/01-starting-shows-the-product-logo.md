# 01 — Starting shows the product logo until the Space opens

Status: resolved
Blocked by: None (can start immediately).

**What to build:** from the first paint until the opened Space draws, the page shows the Infinity Cube logo above the message "Starting…", centred on the application background, where today it is blank. The view covers both waits on startup: the bundle downloading, before React exists, and startup resolution crossing HTTP, while `Application` currently renders nothing. React's view replaces the static one without a visible change, apart from the spinner appearing.

## Decisions (settled in a grilling session)

- **Work on a new branch off `main`.** Take the logo asset from `default-space-on-load` with a checkout of that one file (`packages/app/public/infinity-cube-logo.svg`). The two copies are identical, so the branches merge without conflict whichever lands first.
- **The logo is the served asset, not `ParentIcon`.** Both copies draw it as an image with `src="/infinity-cube-logo.svg"` and an empty `alt`. It is decorative there, because the message is the accessible text. It is 96px wide with automatic height (the artwork is about 1.22:1).
- **The message is "Starting…".** It matches the failure view's "Application could not start". It avoids "Opening", which the glossary reserves for a Thing, and "Loading", which the glossary lists as a word to avoid for Importing.
- **Build shadcn-first, with no deviation.** `@project/ui`'s `StatusBusy` gains an optional mark slot, and the app's startup-pending view is built on it, beside the startup-failure view built on `StatusFailure`. `StatusBusy` keeps its one `role="status"` live region.
- **The static copy has no spinner.** It is the logo and message only, with the background set by a small inline style, because a CSS spinner there would be hand-rolled keyframes. The React view adds `StatusBusy`'s existing spinner.
- **No delay before showing.** The static copy is visible from first paint, so a delay in React would only open a blank gap between the two.
- **Startup only.** Entering another Space and opening in a new tab keep their existing feedback.
- **No ADR** — this is easy to reverse. The static copy carries a comment explaining why it exists, and the parity test below is what stops the two copies drifting.

## Acceptance criteria

- [x] The logo asset is on the branch, byte-identical to `default-space-on-load`'s.
- [x] Before any script runs, the served HTML draws the logo and "Starting…" centred on the application background colour.
- [x] While startup resolution is outstanding, `Application` draws the startup-pending view (mark, message, spinner) in one `status` live region, instead of nothing.
- [x] When resolution settles, the opened Space replaces the view. When it fails, the startup-failure view replaces it, as today.
- [x] `StatusBusy` accepts an optional mark and draws as before without one.
- [x] A `StatusBusy` story with a mark, with Ladle behaviour evidence and an application proof, satisfying ADR 0052. An inventory entry is added if `ui:catalog:check` requires one.
- [x] A test proves the pending view shows while resolution is outstanding and gives way to the Space once it settles.
- [x] A unit test holds the static copy to the React view: the same logo source, the same message, and a background equal to the `--background` token.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass on the finished state. **Left to
      CI on purpose** — the full bar is the six CI jobs on this push, not a local run. See
      the Answer for what was run locally.

## Answer

**`StatusBusy` took an optional `mark`, and nothing else changed shape.** The panel is
now a centred column — mark, then the labelled spinner row — inside the one
`role="status"` it already owned. Given no mark the column has a single child, so the
gap separates nothing and the busy panel draws exactly as it did; `PlacementPending` is
untouched and its story still reads `Arranging…`. The mark is decorative by contract:
the label is the accessible text, so it carries an empty `alt` and adds nothing to what
the region announces.

`StartupPending` is the app's view over it, beside `StartupFailure` and built the same
way — `min-h-dvh`, the served `/infinity-cube-logo.svg` at 96px, `Starting…`.
`Application` holds it as its initial view instead of `null`, so `startApplication`
renders over it and the failure arm replaces it as before.

**The static copy is a fixed full-viewport panel inside `#root`, not a style on `#root`.**
An inline style on `#root` itself survives React's first commit — the container keeps
its attributes — and `display: grid; place-items: center` left there would centre and
shrink-wrap the shell. A nested wrapper is removed wholesale by that commit, so nothing
of the static copy outlives it. It hard-codes three theme values it cannot reach, two of
which `startup-pending-parity.test.tsx` holds against `tailwind.css` (`--background`,
`--muted-foreground`); the font stack is the third and is not held, a fallback list
being cosmetic.

**The claim has a real application proof, and the exemption it briefly carried is
withdrawn.** `packages/app/e2e/startup-pending.spec.ts` holds `/src/main.tsx` and
`/api/spaces` open with `page.route`: it asserts the served copy before the script runs
(logo and message visible, no live region yet), releases the bundle and asserts the React
view, then releases the aggregate and asserts `space-title` with the message gone. The
spec was withdrawn mid-ticket on the reasoning that startup settles too fast to observe
— which was wrong, and is recorded here because it is the kind of wrong worth keeping:
`page.route` **holds** the wait open rather than chasing it, so there is no race to lose.
`operational-feedback-placement-pending`'s exemption is permission to ship without an
application proof, not a reason to decline one that works. The claim therefore declares
no `applicationEvidence`, and `ui:catalog:check` finds its one tagged test in
`packages/app/e2e`.

**Two non-obvious parts of that spec, both earned.** After releasing the bundle it waits
for `load` and gives the first status assertion 15s: every other spec reaches its first
assertion after a `load` that already absorbed the host's cold module transform, while
this one asserts *before* the script is even requested, so the wait for it has to be
explicit. And each hold counts the requests that reach its handler, asserted before that
hold is released. That is the answer to the one genuine objection to the approach:
`src/main.tsx` is the dev host's entry path and `api/spaces` is a wire path, so either
pattern can stop matching — and a pattern that matches nothing holds nothing, letting
startup complete before the first assertion and every assertion below it pass against
the opened Space instead of the wait. **Checked rather than assumed**: pointing the
bundle pattern at `src/main-moved.tsx` leaves the three static-copy assertions *green*
— `commit` returns before the script executes either way — and the run now fails on the
counter, with the message naming the reason. Without the counters that mutation is a
silent false green.

**The static copy outlives a bundle that never runs, so it corrects itself.** Only
React's first commit into `#root` removes the startup view, so a module script that
404s or throws while evaluating leaves "Starting…" claiming progress that will never
arrive — where the blank page it replaced claimed nothing. `startApplication` cannot
cover that: it is inside the module that failed. A classic `error` listener registered
before the module script swaps the message for the failure view's "Application could not
start", and the message element's absence is its guard, so after React commits there is
nothing left to correct. It answers two targets and no others — an uncaught throw
(`window`) and a script that failed to load — because a served asset that 404s leaves the
wait honest and must not blame the application. Both halves are held in
`packages/app/e2e/startup-pending.spec.ts`, each proved red first: aborting the bundle
left a permanent "Starting…", and aborting the logo wiped it for a false failure. A
timeout was rejected rather than untried — this spec's own first assertion needs 15s for
the host's cold module transform, so any threshold short enough to be useful would call a
working app broken. Raised in review of PR 255.

**Run locally:** `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm ui:catalog:check`,
`pnpm lint`, `pnpm lint:anti-slop`, `prettier --check .`, `pnpm test` (230 files, 2893
passed, 6 skipped), the four new or changed unit files individually, the
`operational-feedback` Ladle suite (5 passed), and `startup-pending.spec.ts` on its own —
green, plus the deliberate red above. An earlier `pnpm test` run reported 24 failures in
five untouched jsdom files (`space-resource-embedded-map` among them) and the re-run was
clean, which is the under-load flake other tickets in this tree already record.

**Not run:** `pnpm verify`, `pnpm e2e`, `pnpm e2e:ladle` in full — the bar moved to CI
for this ticket.
