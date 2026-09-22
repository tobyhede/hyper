# 01 — Retire the settled review stories

Status: resolved

**What was done:** every story under `packages/app/stories/review/` was read against the production code it described. Four of the five had outlived their reason and were deleted; one stays.

| Story | Verdict | Where its reasoning lives now |
| --- | --- | --- |
| `Review/Link Actions` (`link-actions-prototype.stories.tsx`) | Deleted. Its premise — "`ResourceNode` still does not pass `entityActions` through" — is false: `canvas-resource-decoration.ts` supplies them and the rail menu ships. Its three `link-actions.spec.ts` tests now press the stable `Components/Resource` → `RailActions` story, built from the same production `spaceEntityActions`, and the right-click test carries the new `canvas-resource-actions-menu` claim that `parity-claims.ts` had promised "when the rail's story sheet leaves `stories/review`". The application evidence is `editing.spec.ts`'s right-click menu test. | `.scratch/link-ux/issues/01`, `02` |
| `Review/Create Resource` (`create-resource-permutations.stories.tsx` + `create-resource-peer-row.css`) | Deleted. Self-described as settled (Option B, packed onto one row) and kept only as a record. | `.scratch/command-dock/issues/16-create-thing-is-three-peers.md`, ADR 0089, claims `command-dock-creates-each-kind-in-one-press` and `command-dock-packs-resources-onto-one-row` |
| `Review/Resource Icons` (`resource-icons.stories.tsx` + `resource-icons.css`) | Deleted. Built, and partly out of date: the sheet recommends a frame for Space, but `SpaceIcon` is now a cube and `SpaceResourceIcon` shares it. It asked to be deleted "once the ADR carries the reasoning"; no ADR does, and the per-glyph reasons that survive are in the doc comments in `packages/ui/src/icons.tsx`. | `packages/ui/src/icons.tsx`; the open gap below |
| `Review/Resource Resize Close Snap` (`resource-resize-close-snap.stories.tsx`) | Deleted. Ticket `card-resizing/04` is resolved, and the stable `Components/Resource` → `ResizeControl` story runs the same production `snapResourceSizeToClose` under the `resize-preview-snaps-to-closed-rect` claim. | `.scratch/card-resizing/issues/04-snap-resize-to-close.md`, ADR 0066 |
| `Review/Selected Edge On Canvas` | Kept. `AuthorableEdge` has no stable story, and this one is still the only place its controls are drawn on a real canvas at the viewport's zoom. | — |

Two exports that only the deleted stories needed are no longer exported: `ResourcesTrigger` (`CommandDock.tsx`) and `RESOURCE_CLOSE_SNAP_DISTANCE` (`resource.ts`). `story-template.tsx` no longer names `multiple-spaces.stories.tsx` or `space.stories.tsx`, which are both gone, or the Sidebar. `.scratch/review-follow-up.md` was deleted too: it was a follow-up on lines of the Link Actions story that no longer existed.

## Open gap carried from the icons sheet

`ResourceKindIcon` takes `referenceOf` and `ReferenceIcon` puts the badge over that base, but no call site passes `referenceOf`. The Target's kind is not on `CanvasResourceFront`, so every Reference Resource glyph still uses the Markdown base, even when its Target is a Space Resource. The fix would change the front's shape, and it is not scheduled.
