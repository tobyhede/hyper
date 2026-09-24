# 02 — An Edge may carry a Title

Status: resolved

**What to build:** An optional, one-line, never-minted `title` on an Edge, and an authored `titleHidden: true` beside it, through the domain: `graphEdgeSchema`, the aggregate and fixtures rolled forward in one change (the repo is the only source of state), intake, persistence on both SQL stores and the memory adapters, and a `titled-edge` (or similarly named) Edit that sets or clears it, and an Edit that hides or shows it.

**Why:** Authors need to annotate an Edge; at a fork, a Title is what tells the presenter's choices apart.

- [ ] An ADR records that an Edge's Title is optional and absent by default, one line, never minted, and that an Edge's identity stays `(from, to)` within its Graph — drawing an existing Edge again still changes nothing.
- [ ] `CONTEXT.md`'s Edge entry says an Edge may carry a Title, and its Selected Edge entry no longer says the controls "reconnect".
- [ ] The schema refuses a Title containing a line break; there is no length cap; a draft is trimmed.
- [ ] Setting a Title to empty clears it and `titleHidden` with it; the Edit is `unchanged` when the Title does not change.
- [ ] `titleHidden` is present only as `true`, and the schema refuses it on an Edge without a `title`. The ADR records why this per-Edge presentation flag is admitted while per-Edge style is out: the Title is the Edge's own content, so whether it shows at rest is the Edge's.
- [ ] Delete-then-draw does not carry a Title over (decided — reconnect is dropped). The ADR also records that a redrawn Edge is appended, so it moves to the last choice at a fork; fork order is deferred to `08`.

Spec: `.scratch/edge-title/spec.md`.

## Answer

Built as `.scratch/edge-title/spec.md` specifies, recorded in ADR 0104.

- **Schema** (`packages/core/src/schema.ts`): `graphEdgeSchema` gains `title` (non-empty, one line, no cap; a line break is refused with `EDGE_TITLE_ONE_LINE = 'edge-title-one-line'` on the issue's `params`) and `titleHidden: z.literal(true)`, refused without a `title`. The schema is now `.strict()`. `GraphEdge` gains both as optional fields. No tracked document carried an undeclared Edge key.
- **Intake**: unchanged. Two Edges with the same endpoints and different Titles are still `duplicate-graph-edge`, and `GraphRenderEdge` does not carry the Title (that is `05`'s job).
- **Space Authoring**: `titled-edge {graphId, edge, title}`, `hid-edge-title {graphId, edge}` and `showed-edge-title {graphId, edge}` run through the Graph-scoped arm and are added to `MapRequiredOperation`. Each finds the Edge by `(from, to)` and reads only the stored Edge. Two new refusals, `edge-title-one-line` and `edge-title-required`, are worded in `describeAuthoringRefusal` and entered in the endpoint-placement record. `reconnected-edge` now builds the moved Edge from the stored one, so it keeps `title`/`titleHidden` in place. None of the three kinds is embedded.
- **Persistence**: no migration and no version bump. One defect was found and fixed. The aggregate exporter's `canonicalGraphs` rebuilt each Edge as `{ from, to }`, which dropped both keys on export. It now uses `canonicalEdge`, which writes them in a fixed key order. The export/import round trip test found this.
- **Tests**: core schema cases; intake duplicate and keep-whole cases; 26 Space Authoring cases (set, rename, trim, clear dropping `titleHidden`, unchanged, one-line refusal including a trailing break, stale Title, index kept, `edge-not-found`, `graph-not-owned`, hide, show, hide-untitled, reconnect keeps the Title, a titled survivor of Remove from Map, redrawing a titled Edge). The repository contract gains a titled hidden Edge through initialize, commit, load and `loadAggregate`, run against memory here and against PostgreSQL and SQLite in their integration suites. The aggregate round trip preserves both fields.
- **Records**: ADR 0104 is indexed. `CONTEXT.md`'s Edge entry now covers the Title and hiding it, with _label_ avoided. The Selected Edge entry no longer says "reconnect". `docs/agents/authoring-refusal-cascade.md` has the three rows and now counts 26 codes.

`pnpm verify` (2026-09-24, on the final tree) exited 0: every static check passed, and `test:coverage` reported 240 test files and 3145 tests passing, 13 skipped. An earlier run on the same tree hit four 5-second timeouts in UI tests (`space-resource-embedded-map`, `dock-commands`, `resource-authoring`) while parallel worktrees were loading the machine. Those three files passed when run alone, and the rerun was clean. `e2e` and `e2e:ladle` were not run: this ticket draws nothing, and parallel worktrees share their fixed ports.
