# The `@project/ui` variants carry two unenforced claims

Status: resolved

**Both claims were taken, and neither by this file.** `Separator` took the first
of the two ways out below — the vertical arm has a default height now, so
`align` really is only about alignment. The `DropdownMenuRadioGroup` generic was
settled during `07`'s adversarial review, which established by measurement that
the primitive *cannot* be fixed and recorded what it does instead. Detail under
[Answer](#answer) at the foot; the body is left as written, because the
reasoning it carries about the `04`/`03` pair is the part worth keeping.

Found by review over `4e3452fd~1..HEAD`, after ticket `03` landed. Neither is a
live defect — both are seams that type-check while promising something they do
not deliver, so they fail later and quietly. Recorded rather than fixed, because
fixing either is a foundation decision rather than a surface one.

## `Separator`'s `align="center"` silently drops the only height a vertical rule has

`packages/ui/src/components/separator.tsx`. The base string sets `w-px` and no
height; `data-[orientation=vertical]:self-stretch` is what gives a vertical
separator any extent at all. `align="center"` replaces that rule, so the caller
now owns the height — and nothing says so. The Dock's `Divider` passes `h-5` and
is fine. The next caller writing `<Separator orientation="vertical"
align="center" />` gets a zero-height, invisible rule and no diagnostic.

The doc comment sells `align` as a choice about alignment. It is also a transfer
of responsibility, and that half is undocumented.

Two ways out, both foundation calls: give the vertical arm a default height so
`align` really is only about alignment, or keep the transfer and make it
impossible to miss — `align: 'center'` requiring an explicit height in the type.

## `DropdownMenuRadioGroup<Value>` is generic over a value nothing ties the items to

`packages/ui/src/components/dropdown-menu.tsx`. The group is generic and claims
the value a caller gets back is the type it put in. `DropdownMenuRadioItem` is
**not** generic, and its `value` stays Base UI's `any`, so no item is held to
`Value`.

The concrete failure: add a `<DropdownMenuRadioItem value="none">` to the Dock's
Layout menu. `onValueChange` is handed `'none'` typed as a branded `LayoutId`,
the lookup against the Layout list misses, and the surface falls back to the
first Layout — a wrong Layout drawing, with no error anywhere.

**This is the part worth weighing.** Ticket `04` had written those call sites as
runtime lookups against the list the menu was drawn from, precisely so a value
outside the set could not be believed. Ticket `03` removed the lookups because
the seam was now typed. Each was right about its own ticket, and the pair
converts a visible `String(...)` launder into an invisible unchecked assertion —
the shape ADR 0062 exists to keep out, arrived at without anyone writing an
assertion.

`CardsDrawer` still has its `isKindFilter` guard. The three Dock call sites have
none.

The fix is to tie the items to the group's `Value`, which is a real design
problem: TypeScript cannot pair a generic parent with generic children across a
component boundary without threading the parameter through a context or asking
the caller to name it twice. Worth doing once, in the primitive, rather than
five times in consumers — which was `03`'s own argument for the generic.

## Answer

**`Separator`'s `align="center"` no longer drops the height.** The first of the
two ways out was taken: the `center` arm adds a plain `h-4` for the vertical
orientation only (`packages/ui/src/components/separator.tsx`), so `align` is a
choice about alignment and nothing else. Plain rather than variant-scoped, and
the comment beside it says why in both directions — `cn` is `twMerge`, which
resolves a caller's own `h-*` against a plain height but *not* against a
`data-[orientation=vertical]:` variant, that variant compiling to a class and an
attribute selector that would outrank the caller. The Dock's `Divider` still
passes `h-5` and still wins. The type was not tightened, because it no longer
has a transfer of responsibility to make impossible to miss.

**`DropdownMenuRadioGroup<Value>` is documented rather than enforced, and that
was measured rather than assumed.** Typing the children slot as
`ReactElement<DropdownMenuRadioItemProps<Value>>` was tried and still accepts a
mismatched item, because every JSX expression is `ReactElement<any, any>` and
the `any` defeats the check. A typed options API was rejected on the same
evidence: several of the Dock's groups render icons, indent markup or
interleaved labels, so an array API could not express them and would be an
export its own motivating consumers could not adopt. What was done instead: the
group's doc comment states what the generic buys and what it does not; the Dock
groups dealing in branded ids bound their item type by hand; and
`tools/typing-fixtures/must-fail/mismatched-menu-item.tsx` holds the rule
permanently — `value="none"` compiled clean before the binding and fails
`TS2322` after. The colour and slot groups were deliberately left unbound with
the reason written down, so nobody "fixes" them.

**The by-hand bindings have mostly since gone, and not by regression.**
`ChoiceMenu` (`b5857ada`, after `07` merged) renders a group *and* its items
from one type parameter, so a call site that adopts it writes the parameter once
and cannot mismatch an item at all — which is the fix this finding asked for,
arrived at from the other direction. The Diagram and Graph sets are `ChoiceMenu`
now and name nothing. What is left in `CommandDock.tsx` is three
`DropdownMenuRadioGroup` call sites — Graph colour, Open Spaces and the dock
slot — of which **one** still binds by hand: `const SpaceItem =
DropdownMenuRadioItem<UUID>`, whose own comment says it is the last. So read
this finding's concrete failure as the reason `ChoiceMenu` exists, not as a
description of five unguarded call sites.

Two names in the original text are pre-ADR 0085 and no longer resolve:
`CardsDrawer` is `ThingsDrawer`, and `10` replaced it with `ThingsPopover`,
whose `FilterToggle` is a `ToggleGroupItem<ThingsFilter>` rather than a menu
item.

Adding that fixture found a latent hole in the gate itself: `typing-fixtures.test.ts`'s
`TSC_DIAGNOSTIC` matched `\.ts`, and the next character of a `.tsx` fixture is
`x` rather than the `(` the pattern needed — so any `.tsx` fixture would have
been read as *unrejected*. It was the first one.

Full evidence in `adversarial-dock-review-2026-09-10.md`'s `## Answer`.
