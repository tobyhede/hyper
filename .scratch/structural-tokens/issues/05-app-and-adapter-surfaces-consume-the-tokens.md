# 05: App and adapter surfaces consume the tokens

**What to build:** The composed surfaces outside the shared UI package draw their geometry from the scale: the selected-Edge controls, the Graph HUD and the presenting chrome, about twenty arbitrary values between them.

These are the surfaces where chrome meets the canvas, so this is the batch most likely to turn up a value that is deliberately not a chrome value — a control sized against a Thing or against an Edge rather than against a menu. A value like that stays its own named token and the reason is recorded, exactly as ticket 01 provides for.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] The selected-Edge controls, the Graph HUD and the presenting chrome state no structural arbitrary value
- [ ] Any value that is deliberately not on the chrome scale is a named token carrying its reason
- [ ] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [ ] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
