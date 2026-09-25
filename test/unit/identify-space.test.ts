import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, it } from 'vitest';
import { describeSchemaFailure, identifySpace } from '../../src/aggregate-directory';

const RESOURCE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const SECOND_RESOURCE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const GRAPH_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');

/**
 * A counter rather than a constant or a spy on the ambient generator (ADR 0016):
 * a constant collides the moment more than one id is minted, and `randomUUID` is
 * an unseedable CSPRNG, so controlling it means owning it.
 */
const countingIds = (): (() => UUID) => {
  let next = 0;
  return () => {
    next += 1;
    return uuidSchema.parse(`00000000-0000-4000-8000-${next.toString().padStart(12, '0')}`);
  };
};

describe('identifySpace', () => {
  /*
   * Two id-less maps, because minting under one owner reads the same whether
   * the pass walks maps or flattens them, and only a second owner tells those
   * apart. A graph is reached only through the map that owns it (ADR 0040),
   * so both ids are minted in the same pass.
   */
  it('mints every identity the input leaves out and keeps every explicit one', () => {
    const input: ImportSpace = {
      document: {
        version: 1,
        title: 'Partly identified',
        maps: [
          {
            title: 'Minted map',
            kind: 'positioned',
            positions: {
              [RESOURCE_ID]: { x: 4, y: 8, open: false },
              [SECOND_RESOURCE_ID]: { x: 12, y: 16, open: false },
            },
            graphs: [
              { title: 'Minted graph', edges: [{ from: RESOURCE_ID, to: SECOND_RESOURCE_ID }] },
            ],
          },
          {
            title: 'Second minted map',
            kind: 'positioned',
            positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: GRAPH_ID, title: 'Explicit graph', edges: [] }],
          },
        ],
      },
      resources: [
        { id: RESOURCE_ID, document: { title: 'First', kind: 'markdown', body: 'One' } },
        { id: SECOND_RESOURCE_ID, document: { title: 'Second', kind: 'markdown', body: 'Two' } },
        { document: { title: 'Minted', kind: 'markdown', body: 'Three' } },
      ],
    };

    const snapshot = identifySpace(input, countingIds());

    const [map, second] = snapshot.document.maps ?? [];
    if (map === undefined || second === undefined) throw new Error('Structure was not kept');
    const minted = snapshot.resources.find(
      ({ id }) => id !== RESOURCE_ID && id !== SECOND_RESOURCE_ID,
    )?.id;
    const mintedGraph = map.graphs[0]?.id;
    if (minted === undefined || mintedGraph === undefined) throw new Error('Nothing was minted');

    // The explicit ids survive exactly; the minted ones are distinct UUIDs.
    expect(second.graphs[0]?.id).toBe(GRAPH_ID);
    expect(map.graphs[0]?.edges).toEqual([{ from: RESOURCE_ID, to: SECOND_RESOURCE_ID }]);
    const identities = [snapshot.id, minted, mintedGraph, map.id, second.id];
    for (const id of identities) expect(uuidSchema.safeParse(id).success).toBe(true);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it('takes the Space id it is given over the one the document declares nothing about', () => {
    const snapshot = identifySpace(
      { document: { version: 1, title: 'Directory named' }, resources: [] },
      countingIds(),
      SPACE_ID,
    );

    expect(snapshot.id).toBe(SPACE_ID);
  });

  /*
   * The two ids a Space can be named by must agree, and nothing here chooses
   * between them — which is exactly the rule `read-aggregate` states for a
   * directory name against its `space.json`.
   *
   * Enforced only in that one caller, the invariant would sit outside the
   * function that depends on it: a third argument overriding `input.id` without
   * a word, from a second caller that skipped the check, would store a Space
   * under an id its own document does not spell — with no refusal anywhere to
   * say so.
   */
  it('refuses a Space id that disagrees with the one the document declares', () => {
    const identify = (): SpaceSnapshot =>
      identifySpace(
        { id: RESOURCE_ID, document: { version: 1, title: 'Disagreeing' }, resources: [] },
        countingIds(),
        SPACE_ID,
      );

    expect(identify).toThrow(RESOURCE_ID);
    expect(identify).toThrow(SPACE_ID);
  });

  it('mints a fresh Space id per call for input that omits one', () => {
    const input: ImportSpace = { document: { version: 1, title: 'Anonymous' }, resources: [] };
    const newId = countingIds();

    expect(identifySpace(input, newId).id).not.toBe(identifySpace(input, newId).id);
  });
});

describe('describeSchemaFailure', () => {
  /*
   * Zod serializes its whole issue array into `Error.message`, which the CLI
   * prints as a sentence. This is the same summary `decodeSnapshot` gives on the
   * wire — first three paths and reasons, then a count — and the two owe each
   * other that behaviour, so neither moves alone.
   */
  it('summarizes the first three failing paths and counts the rest', () => {
    const message = describeSchemaFailure(
      [
        { path: ['id'], message: 'Invalid uuid' },
        { path: ['document', 'title'], message: 'Required' },
        { path: ['resources', 0, 'id'], message: 'Invalid uuid' },
        { path: ['resources', 1, 'id'], message: 'Invalid uuid' },
      ],
      'identified space',
    );

    expect(message).toBe(
      'identified space is invalid: id invalid uuid; document.title required; resources.0.id invalid uuid (and 1 more)',
    );
  });

  it('names the root rather than an empty path, and counts nothing extra at three', () => {
    expect(
      describeSchemaFailure([{ path: [], message: 'Expected object' }], 'aggregate file'),
    ).toBe('aggregate file is invalid: space expected object');
  });
});
