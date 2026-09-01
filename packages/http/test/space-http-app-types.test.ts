import type { SpaceHttpApp } from '@project/http';
import type {
  CommitRequestJson,
  HyperProblemStatus,
  HyperProblemType,
  LoadedAggregateJson,
  LoadedSpaceJson,
} from '@project/persistence';
import type { hc, InferRequestType, InferResponseType } from 'hono/client';
import { expectTypeOf, it } from 'vitest';

type SpaceHttpClient = ReturnType<typeof hc<SpaceHttpApp>>;
type SpaceCollection = SpaceHttpClient['api']['spaces'];
type SpaceResource = SpaceCollection[':id'];
type AggregateResource = SpaceHttpClient['api']['aggregate'];

it('exposes lazy Space and complete aggregate reads through the inferred contract', () => {
  expectTypeOf<InferResponseType<SpaceResource['$get'], 200>>().toEqualTypeOf<LoadedSpaceJson>();
  expectTypeOf<
    InferResponseType<AggregateResource['$get'], 200>
  >().toEqualTypeOf<LoadedAggregateJson>();
});

it('asks the collection commit for exactly the JSON wire codec accepts', () => {
  type CommitBody = InferRequestType<SpaceCollection['$post']>['json'];

  expectTypeOf<CommitBody>().toEqualTypeOf<CommitRequestJson>();
  expectTypeOf<CommitBody['changes'][number]['spaceId']>().toEqualTypeOf<string>();
});

it('declares every middleware-produced commit status', () => {
  type PayloadTooLarge = InferResponseType<SpaceCollection['$post'], 413>;
  type UnsupportedMedia = InferResponseType<SpaceCollection['$post'], 415>;
  expectTypeOf<PayloadTooLarge['type']>().toEqualTypeOf<HyperProblemType>();
  expectTypeOf<PayloadTooLarge['status']>().toEqualTypeOf<HyperProblemStatus>();
  expectTypeOf<UnsupportedMedia['type']>().toEqualTypeOf<HyperProblemType>();
  expectTypeOf<UnsupportedMedia['status']>().toEqualTypeOf<HyperProblemStatus>();
});

it('keeps aggregate refusal identities and locations in the inferred 422 body', () => {
  type AggregateRefusal = Exclude<
    InferResponseType<SpaceCollection['$post'], 422>,
    { type: HyperProblemType }
  >;
  type MissingTarget = Extract<
    AggregateRefusal['errors'][number],
    { kind: 'space-card-target-missing' }
  >;

  expectTypeOf<MissingTarget['kind']>().toEqualTypeOf<'space-card-target-missing'>();
  expectTypeOf<MissingTarget['spaceId']>().toEqualTypeOf<string>();
  expectTypeOf<MissingTarget['cardId']>().toEqualTypeOf<string>();
  expectTypeOf<MissingTarget['targetSpaceId']>().toEqualTypeOf<string>();
});
