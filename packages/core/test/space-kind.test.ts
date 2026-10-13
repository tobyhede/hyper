import { describe, expect, it } from 'vitest';
import {
  frameSpaceView,
  lifetimeSpaceReferences,
  selectSpaceView,
  spaceReferences,
  spaceSelection,
  spaceSelectionProblem,
  type ResourceDocument,
} from '../src/kinds/registry';
import { EMPTY_MARKDOWN } from '../src/kinds/markdown';
import { referenceKind } from '../src/kinds/reference';
import { spaceKind, type SpaceSelectionTarget } from '../src/kinds/space';
import { uuidSchema } from '../src/schema';

const uuid = (n: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`);

const TARGET_SPACE = uuid(1);
const MAP = uuid(2);
const GRAPH = uuid(3);
const OTHER_MAP = uuid(4);
const OTHER_GRAPH = uuid(5);
const ABSENT = uuid(0x99);

const selecting = (mapId: typeof MAP, graphId: typeof GRAPH) => ({
  spaceId: TARGET_SPACE,
  map: mapId,
  graph: graphId,
});

/** A target Space with `MAP` owning `GRAPH`, and `OTHER_MAP` owning `OTHER_GRAPH`. */
const TARGET: SpaceSelectionTarget = {
  mapGraphIds: (mapId) =>
    mapId === MAP ? [GRAPH] : mapId === OTHER_MAP ? [OTHER_GRAPH] : undefined,
  hasGraph: (graphId) => graphId === GRAPH || graphId === OTHER_GRAPH,
};

const SPACE_RESOURCE: ResourceDocument = {
  title: 'Inner',
  kind: spaceKind.id,
  content: selecting(MAP, GRAPH),
};
const MARKDOWN: ResourceDocument = { title: 'Notes', kind: 'markdown', content: EMPTY_MARKDOWN };
const REFERENCE: ResourceDocument = {
  title: 'Recap',
  kind: referenceKind.id,
  content: { target: uuid(6) },
};

describe("the Space kind's own check of its selection", () => {
  it('accepts a Map of the target and a Graph that Map owns', () => {
    expect(
      spaceSelectionProblem({ ...SPACE_RESOURCE, content: selecting(MAP, GRAPH) }, TARGET),
    ).toBeUndefined();
  });

  it('refuses a missing Map first, though its Graph is missing too', () => {
    expect(
      spaceSelectionProblem({ ...SPACE_RESOURCE, content: selecting(ABSENT, ABSENT) }, TARGET),
    ).toEqual({
      kind: 'space-resource-map-missing',
      mapId: ABSENT,
    });
  });

  it('refuses a Graph the target does not have before asking whether the Map owns it', () => {
    expect(
      spaceSelectionProblem({ ...SPACE_RESOURCE, content: selecting(MAP, ABSENT) }, TARGET),
    ).toEqual({
      kind: 'space-resource-graph-missing',
      graphId: ABSENT,
    });
  });

  it("refuses a Graph of the target that is another Map's", () => {
    expect(
      spaceSelectionProblem({ ...SPACE_RESOURCE, content: selecting(MAP, OTHER_GRAPH) }, TARGET),
    ).toEqual({
      kind: 'space-resource-graph-outside-map',
      mapId: MAP,
      graphId: OTHER_GRAPH,
    });
  });
});

describe("a Resource's Space references", () => {
  it('are its target Space for a Space Resource', () => {
    expect(spaceReferences(SPACE_RESOURCE)).toEqual([TARGET_SPACE]);
  });

  it.each([MARKDOWN, REFERENCE])('are none for a $kind Resource', (document) => {
    expect(spaceReferences(document)).toEqual([]);
  });

  it("hold the target Space's lifetime for a Space Resource, whose kind owns what it references", () => {
    expect(spaceKind.flags.ownsReferencedSpaces).toBe(true);
    expect(lifetimeSpaceReferences(SPACE_RESOURCE)).toEqual([TARGET_SPACE]);
  });

  it.each([MARKDOWN, REFERENCE])('hold no lifetime for a $kind Resource', (document) => {
    expect(lifetimeSpaceReferences(document)).toEqual([]);
  });
});

describe("a Resource's selection problem, by its kind's own check", () => {
  it("answers the Space kind's check for a Space Resource", () => {
    expect(
      spaceSelectionProblem({ ...SPACE_RESOURCE, content: selecting(OTHER_MAP, GRAPH) }, TARGET),
    ).toEqual({ kind: 'space-resource-graph-outside-map', mapId: OTHER_MAP, graphId: GRAPH });
    expect(spaceSelectionProblem(SPACE_RESOURCE, TARGET)).toBeUndefined();
  });

  it.each([MARKDOWN, REFERENCE])('answers nothing for a $kind Resource', (document) => {
    expect(spaceSelectionProblem(document, TARGET)).toBeUndefined();
  });
});

describe("a Resource's view of another Space, through its kind's own selection", () => {
  const FRAMING = { centreX: 10, centreY: 20, zoom: 2 };
  const FRAMED: ResourceDocument = {
    ...SPACE_RESOURCE,
    content: { ...selecting(MAP, GRAPH), framing: FRAMING },
  };

  it('reads the Space, Map, Graph and framing a Space Resource shows', () => {
    expect(spaceSelection(FRAMED)).toEqual({ ...selecting(MAP, GRAPH), framing: FRAMING });
    expect(spaceSelection(SPACE_RESOURCE)).toEqual({
      ...selecting(MAP, GRAPH),
      framing: undefined,
    });
  });

  it('keeps the framing when only the Graph changes, since it frames the same Map', () => {
    expect(selectSpaceView(FRAMED, { map: MAP, graph: OTHER_GRAPH })).toEqual({
      ...FRAMED,
      content: { ...selecting(MAP, OTHER_GRAPH), framing: FRAMING },
    });
  });

  it("drops the framing when the Map changes, since it was the old Map's", () => {
    expect(selectSpaceView(FRAMED, { map: OTHER_MAP, graph: OTHER_GRAPH })).toEqual({
      ...FRAMED,
      content: selecting(OTHER_MAP, OTHER_GRAPH),
    });
  });

  it('frames a Space Resource as given', () => {
    expect(frameSpaceView(SPACE_RESOURCE, FRAMING)).toEqual(FRAMED);
  });

  it.each([MARKDOWN, REFERENCE])(
    'shows no view of another Space for a $kind Resource',
    (document) => {
      expect(spaceSelection(document)).toBeUndefined();
      expect(selectSpaceView(document, { map: MAP, graph: GRAPH })).toBeUndefined();
      expect(frameSpaceView(document, FRAMING)).toBeUndefined();
    },
  );
});
