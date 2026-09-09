# The `@project/ui` variants carry two unenforced claims

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
