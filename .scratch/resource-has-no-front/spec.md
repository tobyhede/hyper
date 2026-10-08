# The Resource has no front

Status: ready-for-agent

## Problem

"Front" is the card prototype's word. Nothing in the domain has a back, and the word now names two different things, neither of which needs it:

- In `CONTEXT.md`, "Resource front" means a Resource as drawn on a Map. The model already names that axis: **Closed** draws the Title, **Open** draws the content (ADR 0064), at an authored **size** independent of Open (ADR 0122), with **Edit** in place where the content is the Resource's own (ADR 0064, ADR 0070).
- In code, `CanvasResourceFront` (`@project/ui`) means the operations a kind offers.

The second meaning is written three times: in decoration (`packages/app/src/canvas-resource-decoration.ts`, four memoised patch passes), in the flat `ResourceNodeData` (`packages/react-flow-adapter/src/projection.ts`, kind operations as optional fields beside the shared ones), and in `kindFrontOf` (`packages/react-flow-adapter/src/ResourceNode.tsx`), which re-discriminates the flat bag into the union. `kindFrontOf` is a pass-through. Open/Close sits on every arm of the union although it is not a kind's operation, and the `preview` arm names a creation ghost that is not a Resource kind. The `space` arm's `selection` is set by no production path.

## Decisions (grilled 2026-10-08)

1. Retire "front" from the vocabulary. `CONTEXT.md` describes a Resource drawn on a Map as Closed (its Title) or Open (its content); front, back, face and card go into _Avoid_. No "Resource view" term is added: Open already names it, and "view" is taken by the Space Resource.
2. A short ADR, "The Resource has no front", refines ADR 0051 and records the rejected option of keeping "front" as a loose metaphor, with its cost: about twenty ADRs keep the word as history.
3. Renames: `CanvasResourceFront` → `KindOperations`, `CanvasResource`'s `front` prop → `kindOperations`, `FrontDisplay` → `CanvasResourceDisplay`, locals and helpers to match. Story `Front` → `Closed`. Parity claims `canvas-resource-front-draws-only-its-title-lines` → `closed-resource-draws-only-its-title-lines` and `image-resource-closed-front-draws-title-and-kind` → `closed-image-resource-draws-title-and-kind`.
4. The rename is a tracked codemod for identifiers, story ids, parity ids and CSS. Prose comments are rewritten by hand in their own commit.
5. The vocabulary guard scans identifier shapes everywhere (PascalCase and camelCase compounds, kebab-case, screaming constant) and the phrases `Resource front`, `Closed front`, `Open front`. The bare English word and `frontmatter` stay legal.
6. Open/Close leaves `KindOperations` and becomes a shared `CanvasResource` prop beside `onBeginTitleEdit`. Node data's `onEditResource` is renamed `onOpenChange` in its own commit.
7. The `preview` arm is deleted; `NewResourcePreview` passes `{ kind: 'markdown' }`.
8. The dead `selection` arm and `ResourceNodeData.spaceSelection` are deleted. `SpaceResourceSelectors` stays: the Space Resource rail uses it.
9. `ResourceNodeData` becomes a union over kind whose arm carries that kind's `kindOperations` whole, so `data.kind` and `kindOperations.kind` cannot disagree. Shared fields stay flat; `contentAction` stays, as a fact about the content.
10. Decoration keeps the shared pass and one memoised pass per kind. Each per-kind decorator returns its kind's operations (and a `display` where it changes it) and switches on `kind`. `kindFrontOf` and the flat per-kind fields are deleted. `ResourceNode` keeps React Flow geometry (handles, resize, tilt) and passes the operations through.

## Delivery

- PR one: tickets 01–02.
- PR two: tickets 03–04.
- Candidate 3 of the architecture review (the root canvas drawn from its Map surface) is grilled after both merge.

## Verification

Behaviour-preserving: for both PRs the diff under `packages/app/e2e/`, `packages/app/ladle-e2e/` and `test/e2e/` is limited to renamed ids and story slugs, and `CI passed` is green.

## Constraints

- ADR 0070: the `display` (`closed | open | presented`, then `editing | replacing`) and `resolveResourceContent`'s `via` are unchanged.
- React Flow specifics stay in `react-flow-adapter`; `ui` depends on `core` only.
- `CanvasResource` changes go through `shadcn-first-ui` and `pnpm ui:catalog:check`.
- Renames never share a commit with structural change (`docs/agents/workflow.md`, "Renames").
