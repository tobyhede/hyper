import { expectTypeOf, it } from 'vitest';
import type { ResourceNodeData, ResourceTitleEditor } from '../src/projection';

/**
 * The inline title editor is one value carrying both operations that end it,
 * not a boolean beside two independently optional callbacks.
 *
 * Split, the editing state could be asked for with either operation missing,
 * and `ResourceNode` had to invent total functions to satisfy `CanvasResourceProps` —
 * an absent completion answered `null`, which `CanvasResource` reads as *accepted*,
 * so the editor closed on a rename that never happened. Pairing them is what
 * makes that state unrepresentable rather than merely unreached.
 *
 * These assertions are a runtime no-op: `expectTypeOf` compiles to nothing and
 * `pnpm test` passes this file whatever the type says. `pnpm typecheck` is what
 * enforces it, as with `SpaceCanvas-types.test.tsx`.
 */

const editor = (value: ResourceTitleEditor) => value;

it('cannot ask for a title editor without what ends it', () => {
  expectTypeOf<ResourceNodeData['titleEditor']>().toEqualTypeOf<ResourceTitleEditor | undefined>();

  // @ts-expect-error An editor with no cancel leaves Escape with nothing to do.
  editor({ onComplete: () => null });

  // @ts-expect-error An editor with no completion answers every rename as accepted.
  editor({ onCancel: () => undefined });
});

it('keeps no separate flag that could be raised over a missing operation', () => {
  expectTypeOf<'editingTitle'>().not.toExtend<keyof ResourceNodeData>();
  // architecture-review/21 deleted these two: presence of `onEditResource`
  // and `onBeginTitleEditing` is now the whole capability.
  expectTypeOf<'titleEditingEnabled'>().not.toExtend<keyof ResourceNodeData>();
  expectTypeOf<'resourceEditingEnabled'>().not.toExtend<keyof ResourceNodeData>();
});
