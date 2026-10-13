# Sites outside `kinds/` that name a Resource kind

Read on 2026-10-12, when ticket 10 was filed; line numbers are that commit's. Issue 11 removed the Command Dock's Create sites (`CommandDockResources.tsx`, `command-dock-chrome.ts`, `dock-chrome.ts`'s Create routing and availability, and `InputFreeResourceKind`): each kind's app half now declares its Create.

Categories: **one-kind** = a feature that exists for that kind alone; **registry** = a dispatch among kinds that belongs in a registry; **C** = content command (Edit/Replace/author-space-view); **E** = creation; **F** = Space Resource selection; **display** = display state or glyph.

"G19 exemption" names the `KIND_FEATURE_FILES` entry in `eslint.config.js` that admits the site's import. "ESLint-blind" means the site names a kind without importing a kind module's export (a string literal of a `ContentAction` or display state), so neither the ESLint rule nor `kind-ids-in-modules.test.ts` sees it; it is only reached because its file is exempt for another import, or not at all.

## Kind module ids (`<kind>Kind.id`), counted by `ONE_KIND_FEATURES`

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/app/src/canvas-resource-authoring.ts:51 | `spaceKind.id`: collect Space Resource documents | space | F | canvas-resource-authoring.ts |
| packages/app/src/canvas-resource-authoring.ts:61 | `spaceKind.id`: Space document identity key | space | F | canvas-resource-authoring.ts |
| packages/app/src/canvas-resource-authoring.ts:83 | `spaceKind.id`: framing/selection completion guard | space | F | canvas-resource-authoring.ts |
| packages/app/src/canvas-resource-authoring.ts:303 | `markdownKind.id`: body completion guard | markdown | C | canvas-resource-authoring.ts |
| packages/app/src/components/CommandDockSpaces.tsx:459 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |
| packages/app/src/components/CommandDockSpaces.tsx:564 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |
| packages/app/src/image-replacement.ts:89 | `imageKind.id`: Replace guard | image | C | image-replacement.ts |
| packages/app/src/resource-rail-actions.tsx:90 | `referenceKind.id`: Create Reference glyph | reference | E (display of a creation) | resource-rail-actions.tsx |
| packages/app/src/resource-rail-actions.tsx:140 | `spaceKind.id`: Space Resource menu | space | one-kind | resource-rail-actions.tsx |
| packages/app/src/resource-rail-actions.tsx:251 | `spaceKind.id`: Space Resource Enter | space | one-kind | resource-rail-actions.tsx |
| packages/app/src/space-authoring.ts:119 | `imageKind.id`: new Image Resource document | image | E | space-authoring.ts |
| packages/app/src/space-authoring.ts:1247 | `imageKind.id`: Replace refuses another kind | image | C | space-authoring.ts |
| packages/app/src/space-authoring.ts:1326 | `referenceKind.id`: new Reference Resource | reference | E | space-authoring.ts |
| packages/app/src/space-resource-targets.ts:171 | `spaceKind.id`: Space Resources referencing a Meta entry | space | one-kind | space-resource-targets.ts |
| packages/persistence/src/space-resource-planning.ts:329 | `spaceKind.id`: new Space Resource document | space | E (lifecycle) | space-resource-planning.ts |
| packages/persistence/src/space-resource-planning.ts:589 | `spaceKind.id`: matching Space Resources | space | one-kind (lifecycle) | space-resource-planning.ts |
| packages/persistence/src/space-resource-planning.ts:642 | `spaceKind.id`: Space Resource for a Space | space | one-kind (lifecycle) | space-resource-planning.ts |
| src/persistence/sql-space-repository.ts:175 (x2) | `spaceKind.id`: selection is part of the snapshot boundary | space | F | sql-space-repository.ts |
| src/aggregate-directory/images.ts:145 | `imageKind.id`: stored image travels with its Resource | image | one-kind | src/aggregate-directory/images.ts |

`packages/app/src/resource-deletion.ts` no longer reaches a module id: Delete routes by `kindFlags(kind).ownsReferencedSpaces` (G02).

## Kind module types and values other than the id

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/core/src/index.ts:11-15 | `export *` of each kind module | all | package surface | core/src/index.ts |
| packages/core/src/resource-content.ts:7,12 | `ReferenceKindId` in `ContentVia` and unresolved content | reference | one-kind (content reached through a Reference) | resource-content.ts |
| packages/core/src/resource-content.ts:15 | `ContentAction` = `'edit-markdown' \| 'replace-image' \| 'author-space-view'` | markdown, image, space | C (the literals; ESLint-blind) | resource-content.ts (for the import above only) |
| packages/core/src/types.ts:47 | `imageNaturalSizeSchema` -> `ImageNaturalSize` | image | one-kind | types.ts |
| packages/ui/src/index.ts:17-19 | re-exports `beginEditing`, `beginReplacing`, `isSpaceOperations`, `spaceViewOf` | markdown, image, space | package surface | ui/src/index.ts |
| packages/ui/src/icons.tsx:263 | `ResourceBaseKind = Exclude<Resource['kind'], ReferenceKindId>` | reference | display (kinds a Reference badge sits on) | icons.tsx |
| packages/ui/src/resource-display.ts:6,27,34 | `OwnContent<MarkdownKindId \| ImageKindId>` | markdown, image | display state | resource-display.ts |
| packages/ui/src/resource-display.ts:26,33,43,48-49 | `'editing'` / `'replacing'` display states | markdown, image | display state (ESLint-blind) | resource-display.ts |
| packages/ui/src/CanvasResource.tsx:312-313 | `contentAction === 'author-space-view' && isSpaceOperations` | space | C / one-kind (portal) | CanvasResource.tsx |
| packages/ui/src/CanvasResource.tsx:351 | `isUrOperations`: Shape menu | ur | one-kind | CanvasResource.tsx |
| packages/ui/src/CanvasResource.tsx:378 | `UNRESOLVED_CONTENT.kind` | reference | display state | CanvasResource.tsx |
| packages/ui/src/CanvasResource.tsx:463,469 | `isImageOperations`: Replace label and glyph vs Edit (G12) | image | C | CanvasResource.tsx |
| packages/ui/src/PresentedResource.tsx:52 | `UNRESOLVED_CONTENT.kind` | reference | display state | PresentedResource.tsx |
| packages/react-flow-adapter/src/ResourceNode.tsx:333-334 | `display.shown === 'editing' \| 'replacing'` | markdown, image | display state (ESLint-blind) | ResourceNode.tsx (for line 335) |
| packages/react-flow-adapter/src/ResourceNode.tsx:335 | `isSpaceOperations(...).portal.editing` keeps the toolbar | space | one-kind | ResourceNode.tsx |
| packages/persistence/src/http-protocol.ts:760 | `isAcceptedImageUrl`: stored image URL | image | one-kind (image-URL rule) | http-protocol.ts |
| packages/persistence/src/images.ts:28,31 | `isStoredImageId`, `STORED_IMAGE_COLLECTION_PATH` | image | one-kind | persistence/src/images.ts |
| packages/persistence/src/space-resource-planning.ts:582 | `SpaceResourceDocument` | space | one-kind (lifecycle) | space-resource-planning.ts |
| packages/app/src/build-space-resource-rail.tsx:23 | `SpaceResourceDocument` | space | F | build-space-resource-rail.tsx |
| packages/app/src/canvas-resource-authoring.ts:39,48-49,77,409 | `SpaceResourceDocument` | space | F | canvas-resource-authoring.ts |
| packages/app/src/canvas-resource-authoring.ts:206-207 | `'edit-markdown' \| 'replace-image'` body caret | markdown, image | C (ESLint-blind) | canvas-resource-authoring.ts |
| packages/app/src/components/SpaceCanvas.tsx:866,1033 | `contentAction !== 'author-space-view'` portal gestures | space | C (ESLint-blind) | SpaceCanvas.tsx |
| packages/app/src/components/SpaceCanvas.tsx:1010,1655 | `spaceViewOf(...).view.framing` | space | F | SpaceCanvas.tsx |
| packages/app/src/components/SpaceCanvas.tsx:1367 | `isAcceptedImageUrl`: paste creates an Image Resource | image | E (image-URL rule) | SpaceCanvas.tsx |
| packages/app/src/embedded-open-space-resource.ts:214 | `spaceViewOf` | space | F | embedded-open-space-resource.ts |
| packages/app/src/embedded-open-space-resource.ts:219,291 | `contentAction === 'author-space-view'` | space | C (ESLint-blind) | embedded-open-space-resource.ts |
| packages/app/src/image-replacement.ts:113-114 | `isAcceptedImageUrl`, `IMAGE_URL_UNSUPPORTED` | image | C (image-URL rule) | image-replacement.ts |
| packages/app/src/space-authoring.ts:117 | `Extract<ResourceDocument, { kind: ImageKindId }>` | image | E | space-authoring.ts |
| packages/app/src/space-authoring.ts:364 | refusal `IMAGE_URL_UNSUPPORTED` | image | C/E (image-URL rule) | space-authoring.ts |
| packages/app/src/space-authoring.ts:1254,1297-1298 | `isAcceptedImageUrl` on Replace and Create | image | C, E (image-URL rule) | space-authoring.ts |
| packages/app/src/space-resource-context-commands.ts:42 | `SpaceResourceDocument` | space | F | space-resource-context-commands.ts |
| packages/app/src/space-resource-framing.ts:5 | `SpaceResourceDocument['content']['framing']` | space | F | space-resource-framing.ts |

## Sites now off the list

- `packages/app/src/canvas-resource-decoration.ts`: the Space-only context fields, `SpaceResourceDocument` among them, moved into `packages/app/src/kinds/space.ts` (G20), so the file imports no kind module's export.
- `packages/app/src/resource-deletion.ts`: routes by the lifetime flag (G02).

## What is not covered by any mechanism

The ESLint-blind literal sites above (`ContentAction` literals, `'editing'`/`'replacing'` display states) are reached by neither the ESLint ban nor `kind-ids-in-modules.test.ts`. Every one sits in a file already exempt for an import, so a new such literal in an exempt file, or in a non-exempt file, passes both.
