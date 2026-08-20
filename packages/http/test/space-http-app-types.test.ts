import type { SpaceSnapshot } from '@project/core';
import type { SpaceHttpApp } from '@project/http';
import type {
  CommitRequestJson,
  HyperProblemStatus,
  HyperProblemType,
  LoadedSpaceJson,
} from '@project/persistence';
import type { hc, InferRequestType, InferResponseType } from 'hono/client';
import { expectTypeOf, it } from 'vitest';

type SpaceHttpClient = ReturnType<typeof hc<SpaceHttpApp>>;
type SpaceResource = SpaceHttpClient['api']['spaces'][':id'];
type ExpectedLoadedSpaceJson = {
  snapshot: SpaceSnapshot;
  revision: string;
  exportedRevision: string | null;
};

type PutInput = Parameters<SpaceResource['$put']>[0];

it('exposes concrete loaded-space JSON through the Hono RPC contract', () => {
  type LoadResponse = InferResponseType<SpaceResource['$get'], 200>;
  type ConflictResponse = InferResponseType<SpaceResource['$put'], 409>;

  expectTypeOf<LoadedSpaceJson>().toEqualTypeOf<ExpectedLoadedSpaceJson>();
  expectTypeOf<LoadResponse>().toEqualTypeOf<LoadedSpaceJson>();
  expectTypeOf<ConflictResponse>().toEqualTypeOf<LoadedSpaceJson>();
  expectTypeOf<PutInput['json']['expectedRevision']>().toEqualTypeOf<string>();
});

// Hono infers a json validator's *input* from its return type unless the wire
// type is supplied, which put the decoded `bigint` revision in the request
// contract — a value `JSON.stringify` throws on, so the contract demanded
// something no client could send.
it('asks the client for the revision in the form the wire carries', () => {
  type CommitBody = InferRequestType<SpaceResource['$put']>['json'];

  expectTypeOf<CommitBody>().toEqualTypeOf<CommitRequestJson>();
  expectTypeOf<CommitBody['expectedRevision']>().toEqualTypeOf<string>();
});

// `bodyLimit` is declared as a bare `MiddlewareHandler`, whose response type
// defaults to `Response`. Delegating to it erased the 413 from the contract
// while the hand-written 415 survived, so a client could not compile the
// oversized-commit branch at all.
it('declares every status the commit resource answers with', () => {
  expectTypeOf<InferResponseType<SpaceResource['$put'], 200>>().toEqualTypeOf<{
    revision: string;
  }>();
  type PayloadTooLarge = InferResponseType<SpaceResource['$put'], 413>;
  type UnsupportedMedia = InferResponseType<SpaceResource['$put'], 415>;
  expectTypeOf<PayloadTooLarge['type']>().toEqualTypeOf<HyperProblemType>();
  expectTypeOf<PayloadTooLarge['status']>().toEqualTypeOf<HyperProblemStatus>();
  expectTypeOf<PayloadTooLarge['detail']>().toEqualTypeOf<string>();
  expectTypeOf<UnsupportedMedia['type']>().toEqualTypeOf<HyperProblemType>();
  expectTypeOf<UnsupportedMedia['status']>().toEqualTypeOf<HyperProblemStatus>();
  expectTypeOf<UnsupportedMedia['detail']>().toEqualTypeOf<string>();
});
