# 03 — Upstream the fixes owed to `@project/ui`

Status: resolved

**What to build:** Eight small changes to `@project/ui`, grouped because they are
one package, one skill and one gate — and because **each one deletes something in
the consumer**. Every item below exists as a workaround in `command-dock.css` or
`command-dock.stories.tsx` today; the deletion is the acceptance criterion.

This is the epic. Take the items in any order; each stands alone.

**All eight are done.** Seven landed in `b5369013`, merged as `d5e51a31`, and
their boxes went unticked at the time; each was re-checked against the tree
before ticking here — `Popover` carries `shadow-lg` with the numbered value gone,
`Separator` has its `align` prop, `Input` has `compact`, `Breadcrumb` has `size`,
`PresentIcon` has `filled`, and the consumer-side deletions that were the
acceptance criterion have all happened: `command-dock.css` has no
`.dock-proto__panel.z-50` and no `!important` at all, and
`command-dock.stories.tsx` has no `String(next)`. The eighth is `ParentIcon`,
below, which waited on a name.

- [x] **`Popover`'s shadow is a dark-face value written in numbers.**
      `packages/ui/src/Popover.tsx:80` hard-codes
      `shadow-[0_12px_40px_rgba(0,0,0,0.5)]`, which reads as a smudge on any light
      ground. Make it a token. Deletes `.dock-proto__panel.z-50`
      (`command-dock.css:71`), which selects on another package's Tailwind class
      and misses menu popups anyway.
- [x] **`Separator` needs an alignment variant.** It carries
      `data-[orientation=vertical]:self-stretch` (`components/separator.tsx:11`),
      which overrides a centred bar and cannot be beaten by a plain class. `cn` is
      `twMerge(clsx(...))`, so a caller passing
      `data-[orientation=vertical]:self-center` resolves it — confirm that, then
      delete the three-selector rule at `command-dock.css:114` and the essay above
      it. While there, the local `Divider` wrapper
      (`command-dock.stories.tsx:892`) should say which axis its `vertical` prop
      names; it names the *surface's*, which reads as inverted at every call site.
- [x] **`DropdownMenuItem`'s destructive variant is being fought with
      `!important`** at `command-dock.css:466`. Fix the variant so the consumer
      does not have to; delete the rule.
- [x] **`Input` needs a compact `size`.** `h-7 rounded-md px-2 py-0 text-sm` is
      open-coded identically at `command-dock.stories.tsx:1384` and
      `packages/ui/src/InlineTitleEditor.tsx:110`. Two copies is the signal.
- [x] **`DropdownMenuRadioGroup` should be generic over its value type.** Five
      call sites launder Base UI's `any` through `String(next)`
      (`:1036`, `:1168`, `:1213`, `:1909`, `:2462`). Fixing the seam once removes
      all five and stops the next consumer needing to know. Note ADR 0062: no new
      type assertions, and `eslint-suppressions.json` is a ceiling that is never
      hand-edited.
- [x] **`Breadcrumb` needs a size variant** and **`PresentIcon` a `filled` prop.**
      The latter deletes `command-dock.css:119`, which reaches into
      `.dock-proto__present svg` to override Lucide's `fill="none"` presentation
      attribute.
- [x] **`ParentMark` belongs in `packages/ui/src/icons.tsx`** — done, as
      `ParentIcon`. The glyph is settled (the cube) and the human named it
      `Parent`, which is what unblocked this: minting the export was always a
      naming decision rather than a move.

      It no longer inlines Lucide path data at all. The prototype hand-copied
      three `<path>` elements because `packages/app` may not import
      `lucide-react`; in `@project/ui` the facade wraps `Box` itself, so the day
      Lucide redraws the cube this follows. The path data was checked against
      the installed `lucide-react@1.31.0` rather than against memory, and the
      three paths matched exactly.

      The optical correction came across unchanged and is now explained where it
      lives: Lucide's cube has a 20-unit geometry box against `Frame`'s 22, so
      it is scaled until 20 units plus the stroke comes to 24, and the stroke is
      divided back out by the scale so the correction changes the silhouette and
      not the weight. The quarter-unit of extra stroke is the same trade
      `GraphIcon` already makes for its pastel colour.

      **No new stable story.** Every other icon in the facade — `AliasIcon`,
      `SpaceCardIcon`, `LayoutIcon` — is proved through the surfaces that draw
      it rather than by a story of its own, and none has an entry in
      `design-system-inventory.ts`. `ParentIcon`'s only consumer today is the
      Dock prototype; `07` is what mounts it in production, and that is the
      surface ADR 0052's two proofs attach to.

**Evidence.** Every item reaches `packages/ui`, so `pnpm e2e:ladle` is mandatory —
it is neither in `verify` nor in `e2e`, it is its own CI job, and a story broken
by a component change is caught nowhere else. `pnpm ui:catalog:check` runs inside
`verify`. Go through `$shadcn-first-ui`: search `@project/ui`, then the shadcn
registry, and record any deviation before writing it.
