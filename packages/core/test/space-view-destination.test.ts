import { describe, expect, it } from 'vitest';
import {
  FLOW_SPACE_VIEW_ID,
  encodeCompactUuid,
  resolveSpaceViewDestination,
  spaceViewDestinationPath,
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
} from '../src';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const snapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
  },
  cards: [],
});

describe('Space View destinations', () => {
  it('formats the one route shape for either Space View variant', () => {
    expect(spaceViewDestinationPath(SPACE_ID, LAYOUT_ID)).toBe(
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}`,
    );
  });

  it('resolves a Computed View without exposing its variant in the route', () => {
    expect(
      resolveSpaceViewDestination(
        snapshot,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
      ),
    ).toEqual({ kind: 'resolved', spaceId: SPACE_ID, spaceViewId: FLOW_SPACE_VIEW_ID });
  });

  it('resolves a Layout through the same route shape', () => {
    expect(
      resolveSpaceViewDestination(
        snapshot,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}`,
      ),
    ).toEqual({ kind: 'resolved', spaceId: SPACE_ID, spaceViewId: LAYOUT_ID });
  });

  it('rejects a malformed identity as malformed', () => {
    expect(
      resolveSpaceViewDestination(
        snapshot,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/not-a-compact-uuid`,
      ),
    ).toEqual({ kind: 'malformed' });
  });

  it('leaves an unknown Space View unresolved', () => {
    const missing = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
    expect(
      resolveSpaceViewDestination(
        snapshot,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(missing)}`,
      ),
    ).toEqual({ kind: 'unresolved' });
  });

  it('leaves a destination for another Space unresolved', () => {
    const otherSpace = uuidSchema.parse('00000000-0000-4000-8000-000000000098');
    expect(
      resolveSpaceViewDestination(
        snapshot,
        `/spaces/${encodeCompactUuid(otherSpace)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
      ),
    ).toEqual({ kind: 'unresolved' });
  });

  it('treats a Computed View and Layout identity collision as a broken invariant', () => {
    const collision: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        layouts: snapshot.document.layouts?.map((layout) => ({
          ...layout,
          id: FLOW_SPACE_VIEW_ID,
        })),
      },
    };

    expect(() =>
      resolveSpaceViewDestination(
        collision,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
      ),
    ).toThrow(/collision/);
  });
});
