# 02 — Obey the ADRs the prototype cites

Status: resolved

**What to build:** Three accepted ADRs are contradicted by the prototype that
cites them. Two of the three became blocking the moment ADR 0082 was accepted;
they were stylistic before it and are obligations now.

- [x] **Placing a Card is possible without a pointer.** `CardList`'s rows are bare
      `<div draggable>` with no role, no `tabIndex` and no activation
      (`command-dock.stories.tsx:1397`), and HTML5 drag is the only way to place a
      Card into a Layout. ADR 0082 says a drag may be *a* way and never the only
      one. Give the rows a keyboard route to the same completion the drop reaches.
- [x] **Every accessible name contains its visible label.** The root switcher
      shows `Spaces` (`:1895`) under `aria-label="Switch Space. N open."` (`:1874`).
      "Spaces" is not in that string, which is WCAG 2.5.3 and ADR 0082's naming
      clause. Fix by sharing one token, not by hand-matching two strings.
- [x] **One toolbar with named groups, not four toolbars.** ADR 0073 specifies
      `role="toolbar"` with roving tabindex and `role="group"`s inside it. The
      prototype has four `Toolbar` roots (`:1011`, `:1136`, `:1629`, `:2030`) and
      imports `ToolbarGroup` — exported at `packages/ui/src/index.ts:218` — nowhere.
      Four roots is four tab stops where the ADR specifies one.
- [x] **Rewrite the grip onto `MenuPositioner`'s `anchor`.** Its deferral is built
      on a guard that does not exist: the comment at `:2326` claims floating-ui's
      `onClick` is guarded on `event.detail === 0`; the real guard is
      `if (eventOption === 'mousedown' && pointerType)` at
      `@base-ui/react/floating-ui-react/hooks/useClick.js:113`. `onMouseDown` also
      opens through `frame.request` (rAF, `:104`), so a press and release inside
      one frame bypasses the deferral entirely. The idiomatic fix **deletes code**:
      `MenuPositioner` takes `anchor` (`internals/useAnchorPositioning.d.ts:79`) and
      `packages/ui/src/Popover.tsx:23,45,64` already does this. Make the grip a
      plain `ToolbarButton` with pointer handlers and one `onClick`, render no
      `Menu.Trigger`, pass the grip ref as `anchor`. Three refs and the whole
      mousedown/click essay go with it.

Go through `$shadcn-first-ui` — every item here touches a control or a menu.
Behaviour tests hold each claim; the keyboard route and the accessible name are
both assertable without a browser.

Related: [ADR 0082](../../../docs/adr/0082-the-space-command-surface-is-bound-by-what-it-owes-not-where-it-sits.md),
[ADR 0073](../../../docs/adr/0073-a-card-rail-is-a-toolbar.md).

## Answer

**The rows are buttons and the drag is the shortcut.** A row spends the same
`onPlace` that `PrototypeCanvas`'s `onDrop` spends, so there is one completion
with two ways into it rather than a keyboard path beside the pointer one. A
native `<button>` rather than a `div` carrying `role`, `tabIndex` and a keydown
handler: activation on Enter and Space is the platform's, and the three
attributes it takes to reproduce it are three chances to reproduce it wrong. It
is drawn by `@project/ui`'s `Button` with one utility (`justify-start`) the
row's own sheet does not say and `Button` does.

**The switcher shares one token.** `SPACES_LABEL` is the visible word and the
first word of the `aria-label`, so the pair cannot come apart under an edit.
A hand-matched pair would have passed the same test today and failed silently
the first time either string moved.

**One toolbar, and the root is the surface element itself.** Wrapping the
clusters in a `Toolbar` *inside* the surface was the other way to do it and is
the wrong one: `command-dock.css` places the vertical column's rows with
`.dock-proto__surface[data-orientation='vertical'] > *`, so a layer between the
surface and its clusters moves every slot. The four clusters are
`ToolbarGroup`s, and the breadcrumb's two controls became `ToolbarButton`s —
they could not be while each cluster owned its own root, which is why they were
plain `Button`s and each took a tab stop of its own. The root takes
`orientation` from the edge, so the arrow keys follow the bar's shape.

**The grip's `Menu.Trigger` is gone.** The ticket's correction was right and was
verified against the installed package: `useClick.js:113` reads
`if (eventOption === 'mousedown' && pointerType) { ...; return; }`, which drops
the *pointer* click and lets the keyboard-synthesised one through — the opposite
of what the deleted comment claimed — and `onMouseDown` opens inside
`frame.request`, so a press and release within one frame reached the open with
`pressing` already false. The fix deletes: `pressing`, `wanted` and `dragged`
become one `pressSpent`, and both deferral essays go. What replaced them is a
plain `ToolbarButton` with the four pointer handlers, one `onClick`, and a
`keydown` that clears the ref — the same thing Base UI's own `useClick` does
with the pointer type it records, and for the same reason: a keyboard
activation arrives as a `click` with no press in front of it.

**`MenuPositioner`'s `anchor` behaved as the ticket claims, with one gap the
ticket did not name.** `anchor` is on `UseAnchorPositioningSharedParameters`
and `MenuPositionerProps` extends it, so the primitive takes it — but
`DropdownMenuContent` was not forwarding it: its `Pick` named only `align`,
`alignOffset`, `side` and `sideOffset`, where `PopoverContent` already forwards
`anchor`. Three lines in `packages/ui/src/components/dropdown-menu.tsx` close
that, and the default is unchanged, so no existing caller moves. With no trigger
registered the popup also has nothing to return focus to, so the grip is named
as the popup's `finalFocus`; without it a dismissal drops the reader on the
document body. Both are held by `dock-commands.test.tsx`.

**Two things left standing, deliberately.** The persistence report is still a
child of the surface element, which is now the toolbar root — so a standing
`Alert` sits inside `role="toolbar"`, which sits awkwardly beside ADR 0082's
"status is not a command". Taking it out means a positioned wrapper around the
Toolbar, which is a `command-dock.css` change and that file is `03`'s. And the
grip now draws through `Button`'s ghost variant, so it gains a hover fill it did
not have; every other geometry rule in `.dock-proto__grip` outranks the
utilities, as `.dock-proto__name` already does over `justify-center`.

**Evidence.** `pnpm verify`: static half green (toolchain, both typechecks,
`ui:catalog:check`, lint, anti-slop, format), `2 failed | 2211 passed | 2
skipped` — the two failures are `current-domain-vocabulary.test.ts` against the
`roadmap-analysis.md` at the repo root, pre-existing since `a1b07cd0`, and the
nine added here are `dock-commands.test.tsx`. `pnpm e2e`: `153 passed`.
`pnpm e2e:ladle`: `76 passed`. Both were run rather than judged inapplicable
because the change reaches `packages/ui`.
