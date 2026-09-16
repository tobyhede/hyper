# 05: App and adapter surfaces consume the tokens

**What to build:** The composed surfaces outside the shared UI package draw their geometry from the scale: the selected-Edge controls, the Graph HUD and the presenting chrome, about twenty arbitrary values between them.

These are the surfaces where chrome meets the canvas, so this is the batch most likely to turn up a value that is deliberately not a chrome value — a control sized against a Thing or against an Edge rather than against a menu. A value like that stays its own named token and the reason is recorded, exactly as ticket 01 provides for.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** resolved

- [x] The selected-Edge controls, the Graph HUD and the presenting chrome state no structural arbitrary value
- [x] Any value that is deliberately not on the chrome scale is a named token carrying its reason
- [x] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [x] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## What changed

**`packages/app/src/components/SelectedEdgeControls.tsx`**: `RAISED_SURFACE`'s `rounded-[6px]` → `rounded-chrome-md`; `GROUPED_COMMAND`'s `text-[0.75rem]` → `text-chrome-xs`; the deletion-refusal `FieldError`'s own `text-[0.75rem]` → `text-chrome-xs`. That is the exact ×2 `text-[0.75rem]` this ticket's substitution table names. `RAISED_SURFACE`'s `shadow-[0_6px_20px_rgb(0_0_0/45%)]` is untouched, per the ticket's own instruction — it is ticket 10's.

**`packages/react-flow-adapter/src/GraphHud.tsx`**: the panel's `rounded-[8px]` → `rounded-chrome-lg` (the step ticket 01 added for this surface); the Graph key heading's `text-[10px]` → `text-chrome-2xs`; the legend row's `text-[12px]` → `text-chrome-xs`; the colour swatch's `rounded-[2px]` → `rounded-chrome-2xs`.

**`packages/app/src/components/PresentingChrome.tsx`**: no structural arbitrary value found in scope. Checked every bracketed arbitrary value in the file (`grep -nE '\[[^]]*px[^]]*\]|\[[^]]*rem[^]]*\]'`); the only hit is `max-w-[16rem]` on a move button, which is spacing (`max-w`) and out of scope by the ticket's own rule. No edit made to this file.

**`packages/ui/src/lib/utils.ts`**: untouched, as instructed. `rounded-chrome-md`, `rounded-chrome-2xs`, `rounded-chrome-lg`, `text-chrome-2xs` and `text-chrome-xs` were already registered in `extendTailwindMerge`'s `classGroups` by ticket 02 (`rounded` and `font-size` groups) — verified by reading the file before editing. No new utility name needed adding.

## Not on the chrome scale — none found

This ticket's own open question — a value here might be sized against a Thing or an Edge rather than against a menu — did not turn up an instance. Every substituted value is either a panel/card corner (`RAISED_SURFACE`, the HUD panel), a compact control/legend type size, or a decorative marker corner (the Graph key's colour swatch and the tooltip-style deletion refusal) — the same categories ticket 01 already scoped as chrome. Nothing here is sized to match a Thing's or an Edge's own geometry.

## Spacing and other values left alone (not this ticket's scope)

`GraphHud.tsx` keeps `w-[214px]`, `px-[10px]`, `py-[9px]`, `gap-[6px]` (×2), `gap-[7px]`, `gap-[8px]`, `h-[3px]`, `w-[14px]` and `tracking-[0.12em]` exactly as they were — all spacing or letter-spacing, no scale exists for either and none is invented. `SelectedEdgeControls.tsx` keeps `max-w-[15rem]`, `px-[0.5rem]`, `py-[0.25rem]` and `min-w-[16rem]` (`PopoverContent`) exactly as they were, for the same reason. `PresentingChrome.tsx`'s `max-w-[16rem]` is likewise untouched.

## Stale comments

None found. No comment near an edited line named the specific pixel or rem value being changed (`GraphHud.tsx`'s nearby comment about `shadow-lg` replacing a hardcoded black shadow does not mention radius or type-size values, and its own claim was left as-is since this ticket did not touch that shadow).

## Reconciliation this ticket exercises (recorded in ticket 01, applied here)

All six substitutions are same-value renamings with no pixel delta: `rounded-[6px]`→`rounded-chrome-md` (6px), `rounded-[8px]`→`rounded-chrome-lg` (8px), `rounded-[2px]`→`rounded-chrome-2xs` (2px), `text-[10px]`→`text-chrome-2xs` (10px), `text-[12px]`→`text-chrome-xs` (12px = 0.75rem, exact), and the two `text-[0.75rem]`→`text-chrome-xs` sites (12px, exact). Nothing in this ticket's scope hit the one merge ticket 01 recorded (`text-chrome-sm`, the 13px/0.85rem collapse).

## Verification

`pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` results are reported in the PR/report accompanying this commit.
