# 03 — Colour… joins the Graph's command group

Status: ready-for-agent

**What to build:** Below the list of Graphs, the Graph menu's commands regroup so Colour… sits with the other commands on the Graph you are on instead of in a group of its own:

```
+ New Graph
────────────
Colour…
Rename
Copy link to Graph
────────────
Delete <Graph>
```

New Graph keeps its own group; Delete stays last. One separator goes, and the menu reads as "make one / this one / remove this one".

**Blocked by:** None (can start immediately).

Decided:
- **Colour stays a distinct command**, not merged into the chosen Graph's row. A chevron on the chosen row was considered and rejected: the rows are the shared `ChoiceMenu`'s radio items, which the Map list also draws and which has no colour; a chosen row that opens a submenu stops announcing itself as chosen; and it makes the same-looking rows do two different things.
- The Dock and an Open Space Resource share the Graph command rows, so both show the new order.

- [ ] The Graph menu's command groups read New Graph / Colour…, Rename, Copy link to Graph / Delete, wherever the Graph command rows are drawn
- [ ] Stories, Ladle behaviour tests and application e2e that address these rows by position or group follow the new order; `pnpm e2e` and `pnpm e2e:ladle` green
