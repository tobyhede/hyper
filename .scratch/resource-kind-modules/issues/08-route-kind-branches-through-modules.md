# 08 — Route the remaining per-kind branches through the kind modules

Status: ready-for-agent

**Why:** tickets 02 to 06 asked for each kind's rules to live in its module and be named nowhere else. The code outside `kinds/` instead tests a kind through its module's id (`case referenceKind.id:`, `resource.kind === spaceKind.id`, `[urKind.id]: …` tables). The id is no longer quoted, so `test/unit/kind-ids-in-modules.test.ts` passes, but the rule still lives at the call site and adding a kind still means editing every one of them. The code review of #359 and #360 found this; `/mnt/project-files/reviews/359-360-code-review.md` has the findings.

**What to build:** move each branch into the module it belongs to, as a flag, a declared operation or a view-half entry, so a call site asks the registry rather than switching on a kind. The sites outside `kinds/` that test a kind through its id when this was filed:

- core and graph: `packages/core/src/resource-content.ts`, `packages/graph/src/content-resolution.ts`, `packages/graph/src/resource-file.ts`
- persistence and hosts: `packages/persistence/src/space-resource-planning.ts`, `src/aggregate-directory/images.ts`, `src/aggregate-directory/write-space-directory.ts`, `src/persistence/sql-space-repository.ts`
- ui and adapter: `packages/ui/src/CanvasResource.tsx`, `PresentedResource.tsx`, `ResourceKindIcon.tsx`, `icons.tsx`, `resource-display.ts`, `packages/react-flow-adapter/src/ResourceNode.tsx`, `projection.ts`
- app: `canvas-resource-authoring.ts`, `components/CommandDockResources.tsx`, `components/ResourcesPopover.tsx`, `dock-chrome.ts`, `entity-actions.tsx`, `image-replacement.ts`, `resource-deletion.ts`, `resource-rail-actions.tsx`, `space-authoring.ts`, `space-resource-targets.ts`

Some branches are genuinely about one kind (Image replacement acts only on an Image Resource) and may stay as a typed narrowing; each such site is read and kept deliberately, not swept.

**Tighten the scan:** once the branches are gone, extend `kind-ids-in-modules.test.ts` to fail on `<kind>Kind.id` used as a branch or table key outside `kinds/`, with a counted allowance for the narrowings kept above, as `NOT_THE_KIND` counts `'space'`.

**Depends on:** 07.

**Acceptance:** adding a kind needs no edit outside its own `kinds/` modules and the registry, bar the narrowings this ticket lists as kept; the tightened scan holds it.
