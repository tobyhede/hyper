import type { SpaceSnapshot } from '@project/core';
import type { SpaceHttpApp } from '@project/http';
import type { LoadedSpaceJson } from '@project/persistence';
import type { hc, InferResponseType } from 'hono/client';
import { expectTypeOf, it } from 'vitest';

type SpaceHttpClient = ReturnType<typeof hc<SpaceHttpApp>>;
type ExpectedLoadedSpaceJson = {
  snapshot: SpaceSnapshot;
  revision: string;
  exportedRevision: string | null;
};

it('exposes concrete loaded-space JSON through the Hono RPC contract', () => {
  type LoadResponse = InferResponseType<SpaceHttpClient['api']['spaces'][':id']['$get'], 200>;
  type ConflictResponse = InferResponseType<SpaceHttpClient['api']['spaces'][':id']['$put'], 409>;

  expectTypeOf<LoadedSpaceJson>().toEqualTypeOf<ExpectedLoadedSpaceJson>();
  expectTypeOf<LoadResponse>().toEqualTypeOf<LoadedSpaceJson>();
  expectTypeOf<ConflictResponse>().toEqualTypeOf<LoadedSpaceJson>();
});
