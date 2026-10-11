# 08 — Route the remaining per-kind branches through the kind modules

Status: resolved

**Why:** tickets 02 to 06 asked for each kind's rules to live in its module and be named nowhere else. The code outside `kinds/` instead tests a kind through its module's id (`case referenceKind.id:`, `resource.kind === spaceKind.id`, `[urKind.id]: …` tables). The id is no longer quoted, so `test/unit/kind-ids-in-modules.test.ts` passes, but the rule still lives at the call site and adding a kind still means editing every one of them. The code review of #359 and #360 found this.

**What to build:** move each branch into the module it belongs to, as a flag, a declared operation or a view-half entry, so a call site asks the registry rather than switching on a kind. The sites outside `kinds/` that test a kind through its id when this was filed:

- core and graph: `packages/core/src/resource-content.ts`, `packages/graph/src/content-resolution.ts`, `packages/graph/src/resource-file.ts`
- persistence and hosts: `packages/persistence/src/space-resource-planning.ts`, `src/aggregate-directory/images.ts`, `src/aggregate-directory/write-space-directory.ts`, `src/persistence/sql-space-repository.ts`
- ui and adapter: `packages/ui/src/CanvasResource.tsx`, `PresentedResource.tsx`, `ResourceKindIcon.tsx`, `icons.tsx`, `resource-display.ts`, `packages/react-flow-adapter/src/ResourceNode.tsx`, `projection.ts`
- app: `canvas-resource-authoring.ts`, `components/CommandDockResources.tsx`, `components/ResourcesPopover.tsx`, `dock-chrome.ts`, `entity-actions.tsx`, `image-replacement.ts`, `resource-deletion.ts`, `resource-rail-actions.tsx`, `space-authoring.ts`, `space-resource-targets.ts`

Some branches are genuinely about one kind (Image replacement acts only on an Image Resource) and may stay as a typed narrowing; each such site is read and kept deliberately, not swept.

**Tighten the scan:** once the branches are gone, extend `kind-ids-in-modules.test.ts` to fail on `<kind>Kind.id` used as a branch or table key outside `kinds/`, with a counted allowance for the narrowings kept above, as `NOT_THE_KIND` counts `'space'`.

**Depends on:** 07.

**Acceptance:** adding a kind needs no edit outside its own `kinds/` modules and the registry, bar the narrowings this ticket lists as kept; the tightened scan holds it.

## Answer

Built. A choice among kinds now goes through each package's registry, the one place each kind is listed:

- **core** (`packages/core/src/kinds/registry.ts`): every kind is a `defineKind` module declaring, beside its flags, how its content resolves, the Resources and Spaces it references, its own selection check, its Export form, its file codec (Markdown's sidecar is its codec, not a branch in `resource-file.ts`) and the content it starts with empty. The registry is typed over every kind, so a rule over a kinded value calls its own kind's module with no cast and no switch. `resolveContent`, `contentFacts`, `canonicalResource`, `encodeFileContent`, `decodeFileContent`, `sidecarNames`, `newResourceDocument` and `DEFAULT_KIND` replace the switches in `content-resolution.ts` (deleted), `resource-content.ts`, `resource-file.ts`, `write-space-directory.ts`, `new-space.ts` and `space-authoring.ts`.
- **ui** (`packages/ui/src/kinds/registry.ts`): each view half declares its names, glyph, bare operations and its content views on a Map and presented. `ResourceKindIcon`, `icons.tsx`, `CanvasResource`'s content area, `PresentedResource` and the adapter's `bareKindData` read them. `beginEditing`, `beginReplacing` and `spaceViewOf` moved into their kinds' view halves.
- **app** (`packages/app/src/kinds/`): each kind's canvas decoration is its app half, and `useKindDecoratedNodes` is the one place they are listed. The Resources list, deletion, the Create cluster's availability, Create Reference's terminal state and the target addresses read the core rules and the view registry.

What is left outside `kinds/` is a feature one kind offers on its own content: the Space Resource lifecycle, Image Create and Replace, Create Reference, a Markdown body's completion, and the closed union `content` is typed by. `test/unit/kind-ids-in-modules.test.ts` now counts every `<kind>Kind.id` outside `kinds/` by file, with the reason beside each, so a new dispatch written with module ids fails until it is routed or counted.
