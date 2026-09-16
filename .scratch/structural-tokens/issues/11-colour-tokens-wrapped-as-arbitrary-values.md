# 11: Colour tokens written as arbitrary values

**What to build:** A class that wraps a theme colour token in Tailwind's arbitrary-value syntax is written as the named utility instead.

Fourteen sites across the UI package write a colour this way:

```
text-[var(--foreground)]         ->  text-foreground
text-[var(--muted-foreground)]   ->  text-muted-foreground
text-[var(--accent)]             ->  text-accent
border-[var(--border)]           ->  border-border
border-[var(--accent)]           ->  border-accent
bg-[var(--card)]                 ->  bg-card
```

Each token on the left already has a named utility, because `@theme inline` emits one for every `--color-*` entry. The arbitrary form does the same work in more characters, and `tailwind-merge` treats it as a separate class group, so a named utility does not evict an arbitrary one that means the same thing.

**This is a separate axis from the structural-tokens effort.** That effort covers radius, type size, border width and shadow — geometry. This is colour, and the tokens already exist and already resolve, so there is nothing to define and nothing to reconcile. It is a substitution with no delta.

**It does interact with ticket 08.** That ticket's scan reports a structural arbitrary value by matching shapes like `text-[…]` and `border-[…]`. A colour wrapper matches those shapes too. So either this ticket lands first and the scan needs no carve-out, or the scan carves colour wrappers out and the carve-out outlives its reason. Landing this first is the cheaper of the two.

**Blocked by:** None (can start immediately). Shares no file with tickets 01 to 10 that they have not finished with, except the root components tickets 03 and 07 also edit — so run it after those two, or expect a small merge.

**Status:** resolved

- [x] No class in the repository wraps a `--color-*` token in arbitrary-value syntax
- [x] Each substitution is exact: no colour changes
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## What was found

Thirteen lines across five files, not fourteen sites in the UI package alone: `Command.tsx` (5 lines), `Select.tsx` (4), `ThingKindIcon.tsx` (2), `Popover.tsx` (1), and one in `packages/app/stories/review/create-thing-permutations.stories.tsx` — a story, outside the package the ticket named. Every one is a live `className`; none is a comment. Two tokens beyond the six the ticket listed are in the same shape and were substituted with them: `bg-[var(--secondary)]` -> `bg-secondary`, at `CommandInput`, `CommandItem`'s selected row, `SelectTrigger` and `SelectItem`'s highlighted row.

Two `-[var(--…)]` classes survive on purpose. `max-h-[var(--available-height)]` and `min-w-[var(--anchor-width)]` in `Select.tsx` are Base UI's own positioner-published variables, not theme colours, and there is no named utility for either. A scan written for ticket 08 has to leave them, which is one more reason for that scan to match colour-token names rather than the bracket shape.

## The eviction risk, checked rather than assumed

A substitution that turns `text-[var(--foreground)]` into `text-foreground` puts it on a collision course with the `text-chrome-*` step standing beside it in the same class list — if `tailwind-merge` grouped both under `font-size`, the type size would silently lose. Checked directly against the repo's own `extendTailwindMerge` configuration before editing: `twMerge('text-chrome-sm text-foreground')` keeps both, as does `twMerge('border border-border')`, because the chrome scale is registered into `font-size` and `border-w` while the named colour utilities fall to `text-color`, `border-color` and `bg-color`. Two colours in one list do collapse to the last — `twMerge('text-foreground text-accent')` is `text-accent` — which is the eviction this ticket exists to restore and no site here relies on the old non-eviction.
