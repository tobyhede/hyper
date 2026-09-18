import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { commitRequestRefusal } from '../src/commit-decision';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  things: [],
};

/*
 * The refusals a store answers before it reads anything. The duplicate and
 * identity-mismatch cases are also held against every implementation by
 * `test/support/repository-contract.ts`; the empty case cannot be, because
 * `SpaceCommit` is a non-empty tuple and no repository's `commit` can be handed
 * one without an assertion this repository does not allow (ADR 0062). It is
 * reached here instead, which is why the guard takes a plain change list.
 */
describe('commitRequestRefusal', () => {
  it('refuses an empty change set', () => {
    expect(commitRequestRefusal({ changes: [] })).toEqual({
      kind: 'rejected',
      code: 'invalid-commit',
      message: 'A commit requires at least one change',
    });
  });

  it('refuses one Space named twice', () => {
    expect(
      commitRequestRefusal({
        changes: [
          { kind: 'delete', spaceId: SPACE_ID, expectedRevision: 1n },
          { kind: 'delete', spaceId: SPACE_ID, expectedRevision: 1n },
        ],
      }),
    ).toMatchObject({ kind: 'rejected', message: `Space ${SPACE_ID} is named more than once` });
  });

  it('refuses a change whose snapshot names another Space', () => {
    expect(
      commitRequestRefusal({
        changes: [{ kind: 'update', spaceId: OTHER_ID, snapshot, expectedRevision: 1n }],
      }),
    ).toMatchObject({
      kind: 'rejected',
      message: `Change Space id ${OTHER_ID} does not match its snapshot`,
    });
  });

  it('passes a well-formed change set', () => {
    expect(
      commitRequestRefusal({
        changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot, expectedRevision: 1n }],
      }),
    ).toBeUndefined();
  });
});
