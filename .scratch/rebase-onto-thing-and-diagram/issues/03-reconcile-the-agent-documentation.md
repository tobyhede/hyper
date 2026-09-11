# 03: Reconcile the agent documentation against the landed surface

**What to build:** `AGENTS.md` and the two scoped agent documents this branch touched describe one repository again. An agent reading them finds the shared command surface, the choice menu and the Things Popover described in the vocabulary the code now uses, alongside everything main learned while the branch was away.

Three paragraphs are at issue — the package summary for `@project/ui`, the rendering note on placement, and the standing description of the Space's command surface. Each is a single long line rewritten wholesale on both sides, so there is no merge to perform: ticket 02 takes main's text, and this ticket writes the branch's contribution back into it.

That contribution is the part main has never seen: the neutral panel that both the Dock and a Thing's hover toolbar mount, the choice menu that the Dock's two clusters and an Open Space Thing's two choices all draw, and the list surface that replaced the drawer. Main's own additions — the retirement of the sidebar-era primitives, the removal of the graph-layout engine and the ADR that followed it — stay as main wrote them.

This is the ticket where the four things the rename scripts deliberately left alone come to rest, if ticket 02 has not already settled them. The scripts do not touch `AGENTS.md`'s entry for the sweep, and they do not touch the prose describing the content-alias the sweep deleted.

Documentation only. No browser suite can observe it, and running one is pure cost.

**Blocked by:** 02 — Rebase onto `origin/main` and absorb the upstream residuals.

**Status:** resolved

- [ ] The three paragraphs name the command surface, the choice menu and the Popover, and are written in the current vocabulary throughout.
- [ ] Nothing main added while the branch was away is lost in the rewrite. Name what was preserved.
- [ ] No paragraph describes a component, a primitive or a stylesheet that the tree no longer contains.
- [ ] The vocabulary guard passes over the documents. It reads prose for the retired shapes as well as code, and these three paragraphs are exactly where a rewrite reintroduces one.
- [ ] `pnpm verify` is green. `pnpm e2e` and `pnpm e2e:ladle` are not run, and the pull request says so and says why.

---

## What the reconciliation found

**Only two of the three paragraphs owed anything.** After ticket 02, `AGENTS.md` and `docs/agents/rendering.md` were byte-identical to `origin/main` and `docs/agents/ui.md` differed by exactly one line — the Space command surface bullet, which auto-merged as the branch wrote it. A word-level diff of that bullet from the replayed base to main is empty: **main did not touch it while the branch was away**, so the branch's rewrite of it loses nothing and this ticket had nothing to write back there.

- **The `@project/ui` package summary** gained the shared command surface (`CommandSurface`/`CommandToolbar`, `command-surface.css`, mounted by both the Dock and `ThingRailActions`, with `test/unit/command-surface-sharing.test.ts` holding the ownership) and the choice menu (`ChoiceMenu`, drawn by the Dock's two clusters and an Open Space Thing's two choices, each supplying its own operation because that is the half that is not shared). Main's `Select` sentence was replaced rather than appended to: it claimed two consumers and one of them is a `ChoiceMenu` now.
- **The rendering note on placement** now names the Things list on the Dock rather than the Things drawer.

**What main added and this rewrite preserved.** Every sentence of main's that the branch did not invalidate stands untouched: the `Sidebar` retirement and the seven modules `08` took, `open-space-status.ts` outliving the strip, the "do not restore `AddThingControl`" rule, the elkjs removal and ADR 0086 in the `react-flow-adapter` bullet and the three rendering bullets, and `layout-resolution.ts` → `diagram-resolution.ts` in the `app` bullet. The only main sentence removed is the `Select` one, and only because this branch made it false.

**The four spellings the scripts left alone were checked, not assumed.** All were settled by ticket 02 taking main's text. The domain-initial callback bindings survive only as the vocabulary guard's own fixture strings; the `CardContent as CardSection` prose survives only in ADR 0085's record of it; the product URL segment is `/diagrams/`; the guard block passes. **`AGENTS.md` carries no ADR 0085 entry because main carries none** — the sweep's own entry is not in main's Decided section, and inventing one here would be this branch deciding something for main.

**Nothing named in the three paragraphs is absent from the tree.** `CommandSurface`, `CommandToolbar`, `command-surface.css`, `ChoiceMenu`, `ThingRailActions`, `ThingsPopover`, `command-surface-sharing.test.ts`, the registry `Drawer` and `AppShell`'s `insetEnd` all exist; the last two are named as still standing, with the reason `08` did not take them.

### Verification

`pnpm verify` green — the toolchain assertion, both typechecks, `ui:catalog:check`, both lint passes, `format:check` and `test:coverage` (197 files, 2470 passed). The vocabulary guard reads prose as well as code and is what would report a retired shape reintroduced by a rewrite, which is exactly what these two paragraphs are.

`pnpm e2e` and `pnpm e2e:ladle` were **not** run. This change reaches no application or test code — two Markdown documents — so no browser can observe it and running one is pure cost. The pull request says so.
