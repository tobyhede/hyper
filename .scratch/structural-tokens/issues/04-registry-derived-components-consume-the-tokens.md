# 04: Registry-derived components consume the tokens

**What to build:** The generated shadcn-derived components in the UI package's `components` directory draw their geometry from the scale: the toggle group, input group, combobox, tooltip, dropdown menu, drawer and breadcrumb.

These carry roughly sixteen arbitrary values between them, most in ones and twos. The batch is separated from ticket 03 because these files are regenerable from the registry and a future regeneration will reintroduce upstream's own spellings — so this ticket also records, for the next person to run the generator, that the substitution is part of landing a regenerated component rather than a one-time cleanup.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Each named component states no structural arbitrary value
- [ ] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [ ] The regeneration consequence is recorded where the next person to regenerate will find it
- [ ] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
