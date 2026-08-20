import { expectTypeOf, it } from 'vitest';
import type { GraphId } from '@project/core';
import type { SpaceCanvasProps } from '../src/components/SpaceCanvas';

/**
 * `activeGraphId` carries Navigation's branded `GraphId` all the way to
 * `useEdgeAuthoring`, which requires it (`edge-authoring-react.tsx`'s
 * `activeGraphId: GraphId | null`). The prop type is the seam that should
 * carry that brand — widening it to a plain `string` here only pushes the
 * unchecked cast inside the component.
 *
 * These assertions are a runtime no-op: `expectTypeOf` compiles to nothing and
 * `pnpm test` will pass this file whatever the props type says. The root
 * `pnpm typecheck` is what enforces it, as with `OpenCard-types.test.tsx`.
 */

it('carries the branded GraphId through, not a plain string', () => {
  expectTypeOf<SpaceCanvasProps['activeGraphId']>().toEqualTypeOf<GraphId | null>();

  // @ts-expect-error A plain string has not crossed the UUID validation seam.
  const activeGraphId: SpaceCanvasProps['activeGraphId'] = 'graph';
  void activeGraphId;
});
