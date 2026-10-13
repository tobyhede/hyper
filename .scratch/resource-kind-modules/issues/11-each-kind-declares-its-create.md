# 11 — Each kind's app half declares its Create

Status: resolved

**Why:** issue 10's candidate E. The Command Dock knew every kind it created: `RESOURCE_KINDS` listed them, `DockCreation` typed a press per kind, the Dock clicked its own file picker for an Image Resource, `dock-chrome.ts` routed a Space Resource's press and availability by `spaceKind.id`, and `InputFreeResourceKind` in `space-authoring.ts` listed the kinds a press creates empty. A new kind edited all of them, and a kind with a gate of its own was not caught at compile time.

**Decided (Toby, 2026-10-12):**

1. Scope: the Dock's Create and the `created-resource` completion behind it. Keyboard add, paste and drop stay as they are.
2. The core declares no creation mode. A mode from a closed set (empty, from-files, lifecycle, from-target) was decided in the first round and dropped in the second: the Dock would still have switched on it. Whether a kind starts empty is already its module's `newContent`.
3. The Dock draws an opaque list. Each entry carries the kind, for its name and glyph only, whether it may run, and the press.
4. Each kind's app half owns its Create and can only narrow Add Resource's answer. The registry applies that answer once, and the control and its press read the same answer.
5. The file picker is injected beside the other image sources, so it leaves the Dock. A Create calls it inside the press, before any `await`.
6. The in-flight window of Create Space Resource is the Space kind's rule, so `AuthoringAvailability.createSpaceResource` and its `creatingSpaceResource` fact go.
7. One order: the core registry is markdown, space, image, ur, reference, and it orders the Dock's Creates and the Resources list's filters.
8. Recorded here, with no ADR: this finishes part of ADR 0128.

**Acceptance:**

- The Dock and `dock-chrome.ts` name no kind.
- `InputFreeResourceKind` is gone.
- The kinds a press may create empty are derived from the core modules.
- The counted sites and the import ban's exemptions shrink by the sites this removes.

## Answer

Built.

**Core.**
- `defineKind` keeps `newContent` in a module's type when the module declares it (`StartsEmpty`).
- `EmptyCreatableKindId` is derived from that, over the registered modules.
- `newResourceDocument` takes only such a kind and always answers, so the `created-resource` completion no longer throws.
- `startsEmpty` answers the same question at runtime.

**App.**
- `packages/app/src/kind-creation.ts` declares `KindCreation<Context>` (`create`, and optionally `withheld`) and `dockCreates`, which applies Add Resource's answer once. Each kind declares the context its Create reads in its own app half, and the registry intersects them as `KindCreationContext`, as it does the decoration contexts.
- Each kind's app half exports its Create: `markdownCreation`, `spaceCreation`, `imageCreation` and `urCreation`.
- `kinds/registry.ts` lists them in a record over every kind, where Reference is `null` because it is created from its Target. So a new kind does not compile until it says how it is created.
- `KIND_CREATIONS` takes the registry's order.
- `ImageSources.pick` is the browser picker for images (`browser-file-picker.ts`), and the composition exposes it as `pickImages`. A browser that fires no `cancel` leaves a picker open; the next picker closes it and answers it nothing, so at most one input is attached. It is hand-rolled outside React, recorded in `interactiveDeviations`.
- A Create that continues after its press (Create Image's picker answering) reads the Dock's conditions as they stand then, and does nothing once Create is withheld or the Dock has gone; a Create that rejects is reported as a break.
- Replace image opens the same picker, through `ImageReplacements.pick` and the replacer's `pick`, so there is one file picker.

**Removed:**

- `RESOURCE_KINDS`, `DockResourceKind`, `DockCreation`, `InputFreeResourceKind` and its exhaustive-list test;
- `@project/ui`'s `ImageFilePicker`, which the Dock and Replace image each mounted;
- `AuthoringAvailability.createSpaceResource` and the `creatingSpaceResource` fact through `App.tsx`, `use-map-surface.ts`, `map-surface-policy.ts` and `EmbeddedMapAuthoring.tsx`;
- eight counted lines in `ONE_KIND_FEATURES`;
- three `KIND_FEATURE_FILES` exemptions.

**Still counted:** Image drop and paste, through `resource-placement.ts`, and the Create Reference glyph. These are outside this scope.
