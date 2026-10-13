# Sites outside `kinds/` that name a Resource kind

Read on 2026-10-12, when ticket 10 was filed, and refreshed on 2026-10-13 after candidates B, C, D and F; line numbers are the latter's. Issue 11 removed the Command Dock's Create sites (`CommandDockResources.tsx`, `command-dock-chrome.ts`, `dock-chrome.ts`'s Create routing and availability, and `InputFreeResourceKind`): each kind's app half now declares its Create.

Categories: **one-kind** = a feature that exists for that kind alone; **registry** = a dispatch among kinds that belongs in a registry; **C** = content command (Edit/Replace/author-space-view); **E** = creation; **F** = Space Resource selection; **display** = display state or glyph.

"G19 exemption" names the `KIND_FEATURE_FILES` entry in `eslint.config.js` that admits the site's import. "ESLint-blind" means the site names a kind without importing a kind module's export (a string literal of a `ContentAction` or display state), so neither the ESLint rule nor `kind-ids-in-modules.test.ts` sees it; it is only reached because its file is exempt for another import, or not at all.

## Kind module ids (`<kind>Kind.id`), counted by `ONE_KIND_FEATURES`

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/app/src/canvas-resource-authoring.ts:309 | `markdownKind.id`: body completion guard | markdown | C | canvas-resource-authoring.ts |
| packages/app/src/components/CommandDockSpaces.tsx:459 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |
| packages/app/src/components/CommandDockSpaces.tsx:564 | `spaceKind.id`: Space glyph | space | display | CommandDockSpaces.tsx |
| packages/app/src/image-replacement.ts:89 | `imageKind.id`: Replace guard | image | C | image-replacement.ts |
| packages/app/src/resource-rail-actions.tsx:93 | `referenceKind.id`: Create Reference glyph | reference | E (display of a creation) | resource-rail-actions.tsx |
| packages/app/src/resource-rail-actions.tsx:143 | `spaceKind.id`: Space Resource menu | space | one-kind | resource-rail-actions.tsx |
| packages/app/src/resource-rail-actions.tsx:254 | `spaceKind.id`: Space Resource Enter | space | one-kind | resource-rail-actions.tsx |
| packages/app/src/space-authoring.ts:115 | `imageKind.id`: new Image Resource document | image | E | space-authoring.ts |
| packages/app/src/space-authoring.ts:1244 | `imageKind.id`: Replace refuses another kind | image | C | space-authoring.ts |
| packages/app/src/space-authoring.ts:1318 | `referenceKind.id`: new Reference Resource | reference | E | space-authoring.ts |
| packages/app/src/space-resource-targets.ts:171 | `spaceKind.id`: Space Resources referencing a Meta entry | space | one-kind | space-resource-targets.ts |
| packages/persistence/src/space-resource-planning.ts:333 | `spaceKind.id`: new Space Resource document | space | E (lifecycle) | space-resource-planning.ts |
| src/aggregate-directory/images.ts:145 | `imageKind.id`: stored image travels with its Resource | image | one-kind | src/aggregate-directory/images.ts |

`packages/app/src/resource-deletion.ts` no longer reaches a module id: Delete routes by `kindFlags(kind).ownsReferencedSpaces` (G02).

## Kind module types and values other than the id

| file:line | what it names | kind | category | G19 exemption |
|---|---|---|---|---|
| packages/core/src/index.ts:11-15 | `export *` of each kind module | all | package surface | core/src/index.ts |
| packages/core/src/resource-content.ts:7,12 | `ReferenceKindId` in `ContentVia` and unresolved content | reference | one-kind (content reached through a Reference) | resource-content.ts |
| packages/core/src/types.ts:47 | `imageNaturalSizeSchema` -> `ImageNaturalSize` | image | one-kind | types.ts |
| packages/ui/src/index.ts:17-19 | re-exports `beginEditing`, `beginReplacing`, `isSpaceOperations`, `spaceViewOf` | markdown, image, space | package surface | ui/src/index.ts |
| packages/ui/src/icons.tsx:263 | `ResourceBaseKind = Exclude<Resource['kind'], ReferenceKindId>` | reference | display (kinds a Reference badge sits on) | icons.tsx |
| packages/ui/src/CanvasResource.tsx:302 | `isSpaceOperations`: the Space rail and portal | space | one-kind (portal) | CanvasResource.tsx |
| packages/ui/src/CanvasResource.tsx:340 | `isUrOperations`: Shape menu | ur | one-kind | CanvasResource.tsx |
| packages/ui/src/CanvasResource.tsx:367 | `UNRESOLVED_CONTENT.kind` | reference | display state | CanvasResource.tsx |
| packages/ui/src/PresentedResource.tsx:52 | `UNRESOLVED_CONTENT.kind` | reference | display state | PresentedResource.tsx |
| packages/react-flow-adapter/src/ResourceNode.tsx:334 | `isSpaceOperations(...).portal.editing` keeps the toolbar | space | one-kind | ResourceNode.tsx |
| packages/persistence/src/http-protocol.ts:759 | `isAcceptedImageUrl`: stored image URL | image | one-kind (image-URL rule) | http-protocol.ts |
| packages/persistence/src/images.ts:28,31 | `isStoredImageId`, `STORED_IMAGE_COLLECTION_PATH` | image | one-kind | persistence/src/images.ts |
| packages/app/src/components/SpaceCanvas.tsx:1014,1659 | `spaceViewOf(...).view.framing` | space | one-kind (the Space kind's embedded Map) | SpaceCanvas.tsx |
| packages/app/src/components/SpaceCanvas.tsx:1371 | `isAcceptedImageUrl`: paste creates an Image Resource | image | E (image-URL rule) | SpaceCanvas.tsx |
| packages/app/src/embedded-open-space-resource.ts:214 | `spaceViewOf` | space | one-kind (the Space kind's embedded Map) | embedded-open-space-resource.ts |
| packages/app/src/image-replacement.ts:113-114 | `isAcceptedImageUrl`, `IMAGE_URL_UNSUPPORTED` | image | C (image-URL rule) | image-replacement.ts |
| packages/app/src/space-authoring.ts:113 | `Extract<ResourceDocument, { kind: ImageKindId }>` | image | E | space-authoring.ts |
| packages/app/src/space-authoring.ts:360 | refusal `IMAGE_URL_UNSUPPORTED` | image | C/E (image-URL rule) | space-authoring.ts |
| packages/app/src/space-authoring.ts:1251,1289-1290 | `isAcceptedImageUrl` on Replace and Create | image | C, E (image-URL rule) | space-authoring.ts |

## Sites now off the list

- `packages/app/src/canvas-resource-decoration.ts`: the Space-only context fields, `SpaceResourceDocument` among them, moved into `packages/app/src/kinds/space.ts` (G20), so the file imports no kind module's export.
- `packages/app/src/resource-deletion.ts`: routes by the lifetime flag (G02).
- Candidate C (2026-10-13): `ContentAction` and its literals, the `replacing` display state, `CanvasResource`'s Replace label and glyph, and the literal checks in `canvas-resource-authoring.ts`, `SpaceCanvas.tsx`, `embedded-open-space-resource.ts` and `ResourceNode.tsx`. `resource-display.ts` left the exemptions.

## What is not covered by any mechanism

Candidate C removed the ESLint-blind literal sites (`ContentAction` literals and the per-kind display states). A new string literal that stands for one kind, in an exempt file or a non-exempt one, still passes both mechanisms.
