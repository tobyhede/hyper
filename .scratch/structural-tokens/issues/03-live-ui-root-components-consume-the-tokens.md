# 03: Live `@project/ui` root components consume the tokens

**What to build:** The two live root components of the shared UI package — `Command` and `Popover` — draw their geometry from the scale instead of stating it inline. Together they are the largest concentration of arbitrary values in the package (`Command` alone holds 27), and both are on screen constantly: `Command` backs the Dock's menus, the Things popover and the shell notice, and `Popover` backs the Dock, the selected-Edge controls and the Graph HUD.

After this ticket a token change reaches every menu and popover in the product, not just its buttons.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `Command` and `Popover` state no structural arbitrary value
- [ ] Every menu, popover and command list in the product follows a token change
- [ ] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [ ] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
