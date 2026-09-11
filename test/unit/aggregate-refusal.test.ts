import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { SpaceAggregateError } from '@project/graph';
import { describe, expect, it } from 'vitest';
import { describeAggregateRefusal } from '../../src/cli/aggregate-refusal';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const TARGET_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const THING_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const DIAGRAM_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const GRAPH_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  things: [],
};

const location = { spaceId: SPACE_ID, thingId: THING_ID, targetSpaceId: TARGET_SPACE_ID } as const;

const describeOne = (error: SpaceAggregateError, spaces: readonly SpaceSnapshot[] = [snapshot]) => {
  const [described] = describeAggregateRefusal([error], spaces);
  if (described === undefined) throw new Error('Nothing was described');
  return described;
};

/**
 * Every arm names the entities it is about. That is the whole job: the CLI's
 * audience is holding a directory, so an id is what they can search for, and a
 * refusal that prints only its `kind` sends them looking through every file.
 */
describe('describeAggregateRefusal', () => {
  it('resolves a snapshot position back to the Space it names, and keeps the intake prose', () => {
    expect(
      describeOne({
        kind: 'invalid-space-snapshot',
        snapshotIndex: 0,
        errors: [
          { kind: 'duplicate-graph-id', ref: GRAPH_ID, message: `Duplicate graph id ${GRAPH_ID}` },
        ],
      }),
    ).toBe(`Space ${SPACE_ID} did not load:\n  Duplicate graph id ${GRAPH_ID}`);
  });

  /*
   * The position is an artifact of how intake walked the collection. Where it
   * cannot be resolved it is printed rather than hidden, so the message still
   * has a subject the reader can act on even when it is a poor one.
   */
  it('prints an unresolvable position rather than losing the subject', () => {
    expect(
      describeOne({ kind: 'invalid-space-snapshot', snapshotIndex: 4, errors: [] }, []),
    ).toContain('the space at position 4');
  });

  it('names every colliding identity', () => {
    expect(
      describeOne({
        kind: 'duplicate-space-id',
        spaceId: SPACE_ID,
        snapshotIndexes: [0, 1],
      }),
    ).toBe(`Space ${SPACE_ID} is declared 2 times`);
    expect(
      describeOne({
        kind: 'duplicate-thing-id',
        thingId: THING_ID,
        spaceIds: [SPACE_ID, TARGET_SPACE_ID],
      }),
    ).toBe(`Thing ${THING_ID} is claimed by more than one Space: ${SPACE_ID}, ${TARGET_SPACE_ID}`);
  });

  it('names the Meta Space a directory declares but does not contain', () => {
    expect(describeOne({ kind: 'meta-space-missing', metaSpaceId: SPACE_ID })).toContain(SPACE_ID);
  });

  it('names an ordinary Space nothing points at', () => {
    expect(describeOne({ kind: 'ordinary-space-unreferenced', spaceId: SPACE_ID })).toBe(
      `Space ${SPACE_ID} is not the Meta Space and no Space Thing points at it`,
    );
  });

  it.each([
    { kind: 'space-thing-target-missing' as const, expected: 'does not contain' },
    { kind: 'space-thing-reference-cycle' as const, expected: 'closes a reference cycle' },
  ])('names the Space Thing and its target for $kind', ({ kind, expected }) => {
    const described = describeOne({ kind, ...location });

    expect(described).toContain(`Space Thing ${THING_ID} in Space ${SPACE_ID}`);
    expect(described).toContain(TARGET_SPACE_ID);
    expect(described).toContain(expected);
  });

  it('tells a missing selection apart from one the target has but the Diagram does not own', () => {
    expect(
      describeOne({ kind: 'space-thing-diagram-missing', ...location, diagramId: DIAGRAM_ID }),
    ).toBe(
      `Space Thing ${THING_ID} in Space ${SPACE_ID} selects Diagram ${DIAGRAM_ID}, which Space ${TARGET_SPACE_ID} does not have`,
    );
    expect(
      describeOne({ kind: 'space-thing-graph-missing', ...location, graphId: GRAPH_ID }),
    ).toContain(`selects Graph ${GRAPH_ID}, which Space ${TARGET_SPACE_ID} does not have`);
    expect(
      describeOne({
        kind: 'space-thing-graph-outside-diagram',
        ...location,
        diagramId: DIAGRAM_ID,
        graphId: GRAPH_ID,
      }),
    ).toContain(
      `selects Graph ${GRAPH_ID}, which Space ${TARGET_SPACE_ID} has but Diagram ${DIAGRAM_ID} does not own`,
    );
  });

  it('describes every error it is given, in order', () => {
    expect(
      describeAggregateRefusal(
        [
          { kind: 'ordinary-space-unreferenced', spaceId: TARGET_SPACE_ID },
          { kind: 'meta-space-missing', metaSpaceId: SPACE_ID },
        ],
        [snapshot],
      ),
    ).toHaveLength(2);
  });
});
