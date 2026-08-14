# 08 — Whole-project migration report

The per-component reports 02–07 each answer for one component. This is the document ticket 08 asks for over all of them: what the foundation is now, what the dependency graph actually holds, what behaviour changed and why four of those changes must not be tidied away, and — separately and honestly — which claims a test run cannot make at all.

## Scope and outcome

ADR 0047 established that a shadcn component is the default and a hand-roll is a deviation, but deliberately left the primitive layer open. ADR 0050 took that whole-repo decision: **Base UI and Lucide**. This migration landed it over thirteen commits, `90231e0`..`d324c47`, one component per ticket.

Five surfaces moved onto `@base-ui/react` 1.7.0: `Button`, `Select` (the View, Layout and Graph selectors), `Popover` (with Card endpoint editing), `Dialog` (the Card Editor, rebuilt as `CardPane`), and the `Menu` behind `AddCardControl`. Every icon facade in `packages/ui/src/icons.tsx` is a Lucide glyph and none is a local SVG; the rule going forward is that a custom `@project/ui` icon is kept only when no Lucide glyph communicates a genuinely Hyper-specific concept, and that exception is taken by naming the missing meaning rather than a preferred silhouette.

**`cmdk` behind `Command` was deliberately not migrated**, and this is the one exception worth stating in its own right. It is a search primitive, not a Radix wrapper — nothing about it is a component Base UI ships an equivalent of — so migrating it would mean writing the search model we chose a dependency to avoid writing. It does carry `@radix-ui/react-dialog` and friends transitively, which is why a lockfile grep for `@radix-ui` still answers and why that answer needs the explanation in the next section rather than a fix.

Hyper's palette and spatial presentation are preserved. The custom classes were replayed onto the Base variants; the registry style is a component-generation baseline, not a product restyle, and the migration was not an occasion to change how the app looks.

## Dependency delta

`packages/ui` declared three Radix runtime dependencies at the start of the migration and declares none now:

```
- "@radix-ui/react-dropdown-menu": "^2"
- "@radix-ui/react-popover": "^1.1.15"
- "@radix-ui/react-select": "^2.3.3"
```

`@base-ui/react` at `^1.7.0` and `lucide-react` at `^1.31.0` are the replacements, both declared in `packages/ui`. `packages/app` declares no UI primitive of its own — it names neither `@radix-ui/*`, `@base-ui/react`, `lucide-react` nor `cmdk`, which is the package boundary holding: reusable UI lives in `ui`, and `app` composes it.

The three removals happened **after** the last authored consumer moved, not alongside it, and the lockfile was regenerated once at that point.

The lockfile still carries 80 `@radix-ui` lines across twenty distinct package versions. **All of them are cmdk's.** `cmdk@1.1.1` names four Radix packages as direct dependencies — `react-compose-refs`, `react-dialog`, `react-id`, `react-primitive` — and the remaining sixteen are those four's own transitives (`react-dismissable-layer`, `react-focus-scope`, `react-portal`, `react-presence`, `react-slot`, `primitive`, and the `use-*` hooks). No workspace manifest names a Radix package, so any lockfile hit is transitive by construction. Anyone auditing this later should read a `@radix-ui` lockfile entry as evidence about cmdk, never about Hyper's own UI layer.

## Consumer sweep

Run at `d324c47` plus this change, over tracked files only:

```
$ git grep -n "@radix-ui" -- 'packages/*/src' 'packages/*/test' 'src' 'test'
(no output)

$ git grep -n "@radix-ui" -- '*/package.json' 'package.json'
(no output)

$ grep -c '@radix-ui' pnpm-lock.yaml
80
```

The first sweep is the load-bearing one: no authored module — source or test, in any package — imports a Radix primitive. The second says no manifest declares one. The third is cmdk's, as above.

`shadcn info` was run against both workspaces and both report the intended Base configuration:

| | `packages/ui` | `packages/app` |
| --- | --- | --- |
| style | `base-nova` | `base-nova` |
| base | `base` | `base` |
| baseColor | `neutral` | `neutral` |
| iconLibrary | `lucide` | `lucide` |
| tailwindVersion | v4 | v4 |
| framework | Manual | Vite |

Both derive zero authored Radix wrappers from the shared UI source. `packages/ui` reports "No components installed", which is the known residue described at the end of this document rather than a migration gap.

## Behaviour deltas, and why four of them resist cleanup

These are the decisions where the migrated component does something a reader would plausibly "fix". Each is load-bearing, and each has a specific failure waiting behind it.

**`PopoverAnchor` is inert on purpose.** Base UI has no Anchor part. A non-trigger anchor is expressed as a ref handed to `PopoverContent`'s `anchor` and forwarded to `Positioner`; the Edge toolbar is the one caller. The surviving `PopoverAnchor` export is a bridge for old imports, not a component. The related trap is that positioning props belong to `Positioner` and popup props to `Popup` — a `side` left on the popup does nothing at all, silently.

**`nokey` stays on every portalled popup and on the Select trigger.** React Flow subscribes its delete key on `document`, and a portalled surface sits outside the canvas's own guard. Remove `nokey` and typing in a popup deletes the selected Card behind it.

**Base UI spells the controlled empty state `null`.** That is what the View, Layout and Graph selectors pass, and it is why each ignores the `null` arriving from `onValueChange`: Hyper has no clear-selection action, so a `null` coming back out is the primitive's vocabulary rather than an author's intent.

**`CardPane` declines both of Dialog's focus hooks** — `initialFocus={false}`, `finalFocus={false}` — so the product's declared starting field and App's post-close focus restore win, while the primitive keeps the trap, Escape and `disablePointerDismissal`. This is the shape ADR 0047's second rule asks for: take the primitive's behaviour by default, deviate only where a product requirement is explicit and recorded. `CardPane` went from 175 hand-rolled lines reimplementing a focus trap to roughly fifty over a real Dialog.

Two further findings came out of the menu and picker work and belong in the same list. **`AddCardControl` is `modal={false}` and declines the focus return for exactly one close.** A modal menu traps focus until its popup unmounts, which happens *after* the item handler has opened the Alias pane — so the pane took focus in its mount effect and had it pulled straight back on the menu's way out, landing on `<body>`. Non-modal is also the honest description, since nothing behind a toolbar menu is unusable while it is open. Base UI then restores focus to the trigger on close, which is right for every close except the one that opened a surface, so `Menu.Popup`'s `finalFocus` callback answers `false` for that close alone and leaves the default for Escape and outside clicks. The mirror image rides along: a disabled control cannot take focus, and Add Card is disabled while its pane is open, so cancelling restores focus from an effect on the render that re-enables it rather than from the handler. **And cmdk's default `commandScore` runs over each item's `value`**, which in `CardPicker` is a Card UUID — a search for `a` matched every id carrying a hex `a`. The picker supplies a case-insensitive substring-over-title filter, and the value stays the id because that is what `onSelect` answers and because two Cards may legitimately share a title.

One test-environment fact is platform rather than application behaviour: Base UI dispatches a `PointerEvent` when a keyboard-activated menu item completes, and jsdom ships `MouseEvent` without that subclass, so `AddCardControl.test.tsx` stubs the missing constructor.

## Verification

Recorded by the review-fix pass on this ticket: `pnpm verify` exit 0 (1190 passed, 10 skipped), `pnpm build` exit 0, `pnpm e2e` exit 0 (93 passed).

Re-run at this commit, after the CONTEXT.md and wizard-template fixes and their two new regression suites: `pnpm verify` exit 0 — 110 test files, 1200 passed, 8 skipped. `pnpm e2e` was not re-run locally for this change, which touches no UI or graph source; CI runs the complete database-free Playwright suite plus the PostgreSQL job on every push, and PR #69's checks are the gate.

## Baseline comparison and manual QA

**This section is the ticket's honest remainder.** Everything above is derived from files, greps and command output. The following cannot be: a green Playwright run proves the flows it drives still work, not that a migrated surface *feels* the same as the Radix one it replaced, and no test in this repo compares against the pre-migration baseline because that baseline no longer exists in the tree.

A human should exercise each migrated surface against the pre-migration behaviour and confirm:

- **Button** — focus ring, disabled appearance and keyboard activation across variants.
- **Select** (View, Layout, Graph selectors) — open by keyboard, type-ahead, arrow navigation, Escape closing without changing the selection, and that the trigger keeps focus afterwards.
- **Popover** and the **Edge endpoint editor** — anchoring against the Edge toolbar (the `PopoverAnchor` path above), placement on both sides of the canvas, outside-click dismissal.
- **Dialog** / `CardPane` — initial focus landing on the declared field, focus returning to the opener on both Done and Escape/Cancel, Escape discarding every pending field, and pointer dismissal staying disabled.
- **`AddCardControl` menu** — opening the Alias pane from an item and confirming focus lands in the pane rather than `<body>`, then cancelling and confirming focus returns to the re-enabled Add Card control.
- **Delete-key containment** — with a Card selected on the canvas, open each portalled surface in turn and press Delete/Backspace while typing; the Card must survive. This is the `nokey` guarantee and it is the one most likely to regress silently.
- **Card search** — typing a single letter in the Card picker ranks by title, not by UUID noise.

## Known residue

`packages/ui/package.json` declares `#components/*` → `./src/components/*.tsx` and `#hooks/*` → `./src/hooks/*`, and **neither directory exists** — every component lives at `packages/ui/src/*.tsx` behind the curated `src/index.ts`. This is why `shadcn info` reports no installed components. A generated component therefore lands where the barrel does not cover it and must be added to `index.ts` by hand. Fixing it properly means either moving the components or repointing the `imports`/`exports` patterns, which is a package-layout decision rather than a migration leftover, and it is left for one.

The `components.json` `ui` alias was corrected during the review-fix pass from `#components/ui` to `#components` so both workspaces name the same directory.
