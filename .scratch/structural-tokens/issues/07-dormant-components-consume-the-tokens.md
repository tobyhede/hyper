# 07: Dormant components consume the tokens, or are removed

**What to build:** The two components that hold many arbitrary values and almost no consumers are resolved: `Select`, with a single consumer in the Graph HUD, and `PaletteColorPicker`, with none. Between them they hold about thirty-seven values, a quarter of the whole effort, for surfaces that are barely drawn.

Separated into its own ticket because the right answer may be deletion rather than migration. `Select` has repeatedly had no consumer and carries a design-system inventory entry for that reason; `PaletteColorPicker` has none now. Migrating a component that is about to be removed is wasted work, and removing one that is about to be needed is worse — so this ticket decides first and then acts, rather than assuming either.

Whichever way it goes, the outcome is the same for ticket 08: no arbitrary structural value survives in these files, because the files either consume the scale or are gone.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Whether each component is kept or removed is decided and the reason recorded
- [ ] A kept component states no structural arbitrary value
- [ ] A removed component leaves no consumer, and its design-system inventory entry goes with it
- [ ] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [ ] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
