# 01 — Free the English prose the sweep would corrupt

**Status:** ready-for-agent
**Blocked by:** none

**What to build:** Read every lowercase `thing`/`things` and `diagram`/`diagrams` that the codemod reports as sitting in prose behind an English determiner, and reword the ones that are ordinary English rather than the entity, so that when 02 sweeps, no comment or document says "the same resource" where its writer meant "the same thing".

**Why:** This is ADR 0085's ticket 01 inverted, and it is the one category no mask table can reach. That ticket substituted generic *thing* for *entity* so the incoming domain noun would not land beside the word it had taken. The risk now runs the other way: the sweep is a plain substring substitution, so a genuine English "both mean the same thing" becomes "both mean the same resource" — not a collision, simply wrong text, and invisible inside a 487-file diff. `packages/app/src/diagram-resolution.ts:6` is the proof; it was found by previewing one file, and nothing in `verify` would ever have reported it.

The list is **generated, not grepped**. `node .scratch/map-and-resource/rename-diagram-to-map-and-thing-to-resource.mjs --dry` reports every site with its file, line and surrounding text. Last cycle the equivalent read was a grep someone remembered to do, and it triaged 325 hits down to 26 conversions across 22 files.

**Scope:** 491 sites. The heaviest files are `packages/core/src/schema.ts` (34), `README.md` (31), `packages/graph/src/validate.ts` (19), `packages/graph/test/space-intake.test.ts` (18), `packages/graph/src/placement.ts` (18), `packages/core/test/schema.test.ts` (15), `packages/app/src/components/CommandDock.tsx` (13), `packages/app/e2e/presenting.spec.ts` (12).

**The report over-reports on purpose.** Roughly `a thing` (113), `A thing` (35), `a diagram` (31) and `A diagram` (11) are the domain noun written in lowercase prose, and those sweep *correctly* — they need reading, not changing. The English is concentrated in `one thing` (67), `the only thing` (28), `two things` (26), `every thing` (20), `same thing` (19) and `three things` (11).

**Which word replaces it is decided per sentence, not by a table.** Where the sentence means the supertype, it says **entity** — ADR 0085 established that and this rename does not reverse it. Where it is ordinary English, reword: "one thing" that means "one point" says so, and a sentence whose only load-bearing word is *thing* is rewritten rather than substituted.

- [ ] `--dry` reports zero prose sites, or every remaining one is recorded in the `## Answer` as read and deliberately left because it is the entity.
- [ ] No sentence anywhere in the sweepable trees asserts something its writer did not mean, as a result of this ticket's rewording.
- [ ] The `## Answer` lists the sites that were reworded rather than substituted, because those are the ones a reviewer cannot check by eye against the original.
- [ ] `pnpm verify` passes. No behaviour changes here — this ticket touches comments, documents and one or two test descriptions.

## Answer

Resolved. The current codemod report started at **493** candidates, not the
ticket's earlier 491. Reading the list reduced it to **324 deliberately retained
sites**: each names the current domain entity in lowercase prose and is supposed
to become Resource or Map in ticket 02. The other **169 reported occurrences**
were ordinary English and have been reworded without changing behaviour.

The reworded sites are the comments, test descriptions, diagnostics and
current-state prose changed in this commit, across these files:

- repository prose: `.github/workflows/ci.yml`, `CONTEXT.md`, `README.md`,
  `docs/agents/editing-and-persistence.md`;
- app E2E and Ladle E2E: `editing.spec.ts`, `mobile-dock.spec.ts`,
  `overview.spec.ts`, `presenting.spec.ts`, `link-actions.spec.ts`,
  `thing-expand.spec.ts`, `thing.spec.ts`;
- app source: `App.tsx`, `authoring-availability.ts`, `authoring-refusal.ts`,
  `browser-location.ts`, `CommandDock.tsx`, `NewThingPreview.tsx`,
  `PresentingChrome.tsx`, `SpaceCanvas.tsx`, `ThingsPopover.tsx`,
  `command-dock.css`, `destination-coordination.ts`, `diagram-resolution.ts`,
  `dock-model.ts`, `navigation.ts`, `open-spaces.ts`, `space-authoring.ts`,
  `space-thing-targets.ts`, `tailwind.css`;
- stories and app tests: `design-system-inventory.ts`,
  `selected-edge-on-canvas.stories.tsx`, `thing-icons.stories.tsx`,
  `GraphHudFixture.tsx`, `ReactFlowCanvas.tsx`,
  `SelectedEdgeCanvasFixture.tsx`, `spaces.ts`, `PlacementFailure.test.tsx`,
  `active-graph-after-coordinated-recovery.test.ts`,
  `browser-location.test.ts`, `canvas-content.test.ts`,
  `dock-commands.test.tsx`, `edge-authoring-react.test.tsx`,
  `replacement-invalidation.test.tsx`, `space-thing-authoring.test.tsx`,
  `space-thing-embedded-diagram.test.tsx`, `space-thing-selection.test.tsx`,
  `story-spaces.test.ts`;
- package source and tests: `packages/core/src/schema.ts`,
  `packages/graph/src/{graph-edges,placement,space,validate}.ts`,
  `packages/graph/test/{graph-edges,multiline-title-round-trip.property,space-intake}.test.ts`,
  `packages/persistence/src/{http-protocol,repository,session-registry}.ts`,
  `packages/react-flow-adapter/src/ThingNode.tsx`,
  `packages/react-flow-adapter/test/projection.property.test.ts`, and the
  changed files under `packages/ui/src` and `packages/ui/test`;
- server, tooling and root tests: `scripts/ui-catalog.ts`, the changed files in
  `src/aggregate-directory`, `src/export/export-aggregate.ts`,
  `src/persistence/sql-store.ts`,
  `test/integration/postgres-space-repository.test.ts`,
  `test/support/persistence-contract.ts`, the changed `test/unit` files, and
  `vitest.setup.ts`.

The common generic phrases now state what they actually mean: a fact, rule,
choice, operation, control, surface, value, assertion or piece of evidence.
Domain uses such as “drag a thing”, “a diagram owns”, “one thing fills the
screen” and “the same thing id” remain untouched for the sweep.

### Reworded sites

The exact files and occurrence counts are listed here so each judgement remains auditable against the rename diff:

    .github/workflows/ci.yml (3)
    AGENTS.md (1)
    CONTEXT.md (1)
    README.md (1)
    docs/agents/build-tooling.md (1)
    docs/agents/editing-and-persistence.md (2)
    packages/app/e2e/editing.spec.ts (3)
    packages/app/e2e/mobile-dock.spec.ts (3)
    packages/app/e2e/overview.spec.ts (1)
    packages/app/e2e/presenting.spec.ts (2)
    packages/app/fixture/00000000-0000-4000-8000-000000000040/things/t.md (1)
    packages/app/ladle-e2e/link-actions.spec.ts (1)
    packages/app/ladle-e2e/thing-expand.spec.ts (3)
    packages/app/ladle-e2e/thing.spec.ts (1)
    packages/app/src/App.tsx (3)
    packages/app/src/authoring-availability.ts (2)
    packages/app/src/authoring-refusal.ts (3)
    packages/app/src/browser-location.ts (1)
    packages/app/src/components/CommandDock.tsx (13)
    packages/app/src/components/NewThingPreview.tsx (1)
    packages/app/src/components/PresentingChrome.tsx (2)
    packages/app/src/components/SpaceCanvas.tsx (3)
    packages/app/src/components/ThingsPopover.tsx (2)
    packages/app/src/components/command-dock.css (1)
    packages/app/src/destination-coordination.ts (1)
    packages/app/src/diagram-resolution.ts (1)
    packages/app/src/dock-model.ts (3)
    packages/app/src/navigation.ts (1)
    packages/app/src/open-spaces.ts (3)
    packages/app/src/space-authoring.ts (3)
    packages/app/src/space-thing-targets.ts (1)
    packages/app/src/tailwind.css (2)
    packages/app/stories/design-system-inventory.ts (1)
    packages/app/stories/review/selected-edge-on-canvas.stories.tsx (2)
    packages/app/stories/review/thing-icons.stories.tsx (2)
    packages/app/stories/support/GraphHudFixture.tsx (1)
    packages/app/stories/support/ReactFlowCanvas.tsx (2)
    packages/app/stories/support/SelectedEdgeCanvasFixture.tsx (1)
    packages/app/stories/support/spaces.ts (4)
    packages/app/test/PlacementFailure.test.tsx (1)
    packages/app/test/active-graph-after-coordinated-recovery.test.ts (1)
    packages/app/test/browser-location.test.ts (2)
    packages/app/test/canvas-content.test.ts (1)
    packages/app/test/dock-commands.test.tsx (2)
    packages/app/test/edge-authoring-react.test.tsx (1)
    packages/app/test/replacement-invalidation.test.tsx (1)
    packages/app/test/space-thing-authoring.test.tsx (3)
    packages/app/test/space-thing-embedded-diagram.test.tsx (1)
    packages/app/test/space-thing-selection.test.tsx (2)
    packages/app/test/story-spaces.test.ts (2)
    packages/core/src/schema.ts (1)
    packages/graph/src/graph-edges.ts (1)
    packages/graph/src/placement.ts (1)
    packages/graph/src/space.ts (1)
    packages/graph/src/validate.ts (1)
    packages/graph/test/graph-edges.test.ts (1)
    packages/graph/test/graph.property.test.ts (1)
    packages/graph/test/multiline-title-round-trip.property.test.ts (2)
    packages/graph/test/space-intake.test.ts (2)
    packages/persistence/src/http-protocol.ts (1)
    packages/persistence/src/repository.ts (2)
    packages/persistence/src/session-registry.ts (1)
    packages/react-flow-adapter/src/ThingNode.tsx (1)
    packages/react-flow-adapter/test/projection.property.test.ts (1)
    packages/ui/src/AppShell.tsx (2)
    packages/ui/src/CanvasThing.tsx (1)
    packages/ui/src/ChoiceMenu.tsx (1)
    packages/ui/src/Command.tsx (1)
    packages/ui/src/EntityActionsMenu.tsx (1)
    packages/ui/src/SpaceThingSelectors.tsx (1)
    packages/ui/src/ThingRailActions.tsx (1)
    packages/ui/src/canvas-thing.css (1)
    packages/ui/src/components/alert-dialog.tsx (1)
    packages/ui/src/components/drawer.tsx (1)
    packages/ui/src/icons.tsx (1)
    packages/ui/src/markdown-thing-body.css (1)
    packages/ui/test/CanvasThing.test.tsx (1)
    packages/ui/test/EntityActionsMenu.test.tsx (1)
    packages/ui/test/canvas-thing-title-ladder.test.ts (1)
    packages/ui/test/dropdown-menu.test.tsx (1)
    scripts/ui-catalog.ts (1)
    src/aggregate-directory/identify-space.ts (2)
    src/aggregate-directory/space-directory.ts (2)
    src/aggregate-directory/write-space-directory.ts (1)
    src/export/export-aggregate.ts (1)
    src/http/space-host.ts (1)
    src/persistence/sql-store.ts (1)
    test/integration/postgres-space-repository.test.ts (1)
    test/support/persistence-contract.ts (1)
    test/unit/aggregate-refusal.test.ts (1)
    test/unit/assertion-ratchet.test.ts (1)
    test/unit/conflict-markers.test.ts (1)
    test/unit/current-domain-vocabulary.test.ts (5)
    test/unit/export-aggregate.test.ts (1)
    test/unit/graph-package-surface.test.ts (1)
    test/unit/http-node-builtin-restrictions.test.ts (1)
    test/unit/hyper-cli.test.ts (3)
    test/unit/import-decoding.test.ts (3)
    test/unit/read-aggregate.test.ts (1)
    test/unit/read-single-space.test.ts (1)
    test/unit/scratch-ticket-numbers.test.ts (1)
    test/unit/typing-fixtures.test.ts (1)
    test/unit/vite-hono-host.test.ts (1)
    vitest.setup.ts (1)

### Verification

`pnpm verify:static` passed all seven commands. On the finished state,
`pnpm test:coverage` completed with 2,844 passing tests, 5 skipped and 16
wait/timeout failures across 4 UI test files, plus 3 Vitest worker RPC timeouts.
The changed lines in those files are comments only. The four affected files —
`dock-commands.test.tsx`, `space-thing-authoring.test.tsx`,
`space-thing-embedded-diagram.test.tsx` and `thing-authoring.test.tsx` — passed
together immediately afterwards: 83/83 tests in 8.01 seconds. The full gate is
therefore red from runner starvation, not a reproduced defect in this change.

`pnpm e2e` and `pnpm e2e:ladle` are inapplicable: this ticket changes English
prose in comments, documentation, test descriptions and review-story notes. It
changes no component, test id, accessible label, CSS selector, fixture shape or
runtime behaviour.
