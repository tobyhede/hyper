import { describe, expect, it } from 'vitest';
import {
  authoringAvailability,
  type AuthoringAvailability,
  type AuthoringInProgress,
} from '../src/authoring-availability';

/**
 * Nothing in progress and a placement to author on — the state in which every
 * operation is available. Each case below turns exactly one fact against it, so
 * a row's `false` answers are the operations that one fact withdraws and
 * nothing else.
 */
const NOTHING_IN_PROGRESS: AuthoringInProgress = {
  editable: true,
  presenting: false,
  editingResourceBody: false,
  editingResourceTitle: false,
  resourceIsOpen: false,
  editingChromeTitle: false,
  spaceOnCanvas: true,
  editingEmbeddedMap: false,
  creatingSpaceResource: false,
};

const ALL_AVAILABLE: AuthoringAvailability = {
  resourcesView: true,
  chromeTitleEdit: true,
  entityEdits: true,
  deleteResource: true,
  present: true,
  addResource: true,
  createSpaceResource: true,
  createMap: true,
  authorOnCanvas: true,
  authorInEmbeddedMap: true,
  editResourceBody: true,
  connectOnCanvas: true,
  dragNodes: true,
  selectNodes: true,
};

describe('authoring availability', () => {
  it('offers every operation when nothing is in progress', () => {
    expect(authoringAvailability(NOTHING_IN_PROGRESS)).toStrictEqual(ALL_AVAILABLE);
  });

  it.each<readonly [string, Partial<AuthoringInProgress>, AuthoringAvailability]>([
    [
      'a placement that has not resolved',
      { editable: false },
      {
        ...ALL_AVAILABLE,
        chromeTitleEdit: false,
        createMap: false,
        entityEdits: false,
        deleteResource: false,
        authorOnCanvas: false,
        authorInEmbeddedMap: false,
        editResourceBody: false,
        connectOnCanvas: false,
        dragNodes: false,
      },
    ],
    [
      'a running presentation',
      { presenting: true },
      {
        ...ALL_AVAILABLE,
        resourcesView: false,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteResource: false,
        addResource: false,
        createSpaceResource: false,
        createMap: false,
        authorOnCanvas: false,
        authorInEmbeddedMap: false,
        editResourceBody: false,
        dragNodes: false,
        selectNodes: false,
      },
    ],
    [
      'a live Resource content edit',
      { editingResourceBody: true },
      {
        ...ALL_AVAILABLE,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteResource: false,
        present: false,
        addResource: false,
        createSpaceResource: false,
        createMap: false,
      },
    ],
    [
      'a live Resource rename',
      { editingResourceTitle: true },
      {
        ...ALL_AVAILABLE,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteResource: false,
        createMap: false,
      },
    ],
    ['an Open Resource', { resourceIsOpen: true }, { ...ALL_AVAILABLE, deleteResource: false }],
    [
      'a live chrome title edit',
      { editingChromeTitle: true },
      {
        ...ALL_AVAILABLE,
        entityEdits: false,
        deleteResource: false,
        present: false,
        addResource: false,
        createSpaceResource: false,
        createMap: false,
        authorOnCanvas: false,
        authorInEmbeddedMap: false,
        connectOnCanvas: false,
      },
    ],
    [
      'a Space that is open but not the one on the canvas',
      { spaceOnCanvas: false },
      {
        ...ALL_AVAILABLE,
        authorOnCanvas: false,
        authorInEmbeddedMap: false,
        connectOnCanvas: false,
      },
    ],
    [
      'a live Resource edit inside an embedded Map',
      { editingEmbeddedMap: true },
      { ...ALL_AVAILABLE, authorOnCanvas: false },
    ],
    [
      'a Space Resource creation in flight',
      { creatingSpaceResource: true },
      { ...ALL_AVAILABLE, createSpaceResource: false },
    ],
  ])('withdraws what %s takes away', (_what, inProgress, expected) => {
    expect(authoringAvailability({ ...NOTHING_IN_PROGRESS, ...inProgress })).toStrictEqual(
      expected,
    );
  });

  describe('the asymmetries', () => {
    it('offers Add Resource during a live Resource rename and withholds Add Map', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        editingResourceTitle: true,
      });

      expect(availability.addResource).toBe(true);
      expect(availability.createMap).toBe(false);
    });

    it('withholds only Create Space Resource while its coordinated Edit is in flight', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        creatingSpaceResource: true,
      });

      expect(availability.createSpaceResource).toBe(false);
      expect(availability.addResource).toBe(true);
    });

    it('withholds only Delete Resource while a Resource is open', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, resourceIsOpen: true });

      expect(availability.deleteResource).toBe(false);
      expect(availability.entityEdits).toBe(true);
      expect(availability.addResource).toBe(true);
    });

    it('keeps a connection reachable on the presented Resource that authoring is withdrawn from', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, presenting: true });

      expect(availability.connectOnCanvas).toBe(true);
      expect(availability.authorOnCanvas).toBe(false);
    });

    it('withdraws the connection a live chrome rename covers, presented or not', () => {
      for (const presenting of [false, true]) {
        expect(
          authoringAvailability({ ...NOTHING_IN_PROGRESS, presenting, editingChromeTitle: true })
            .connectOnCanvas,
        ).toBe(false);
      }
    });

    it('keeps a live content editor through a chrome rename that withdraws canvas authoring', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        editingChromeTitle: true,
      });

      expect(availability.editResourceBody).toBe(true);
      expect(availability.authorOnCanvas).toBe(false);
    });

    it('leaves an embedded Map authorable while withdrawing the canvas around it', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        editingEmbeddedMap: true,
      });

      expect(availability.authorOnCanvas).toBe(false);
      expect(availability.authorInEmbeddedMap).toBe(true);
    });

    it('withdraws an embedded Map for every reason that is not its own edit', () => {
      for (const inProgress of [
        { editable: false },
        { presenting: true },
        { editingChromeTitle: true },
        { spaceOnCanvas: false },
      ]) {
        expect(
          authoringAvailability({ ...NOTHING_IN_PROGRESS, ...inProgress }).authorInEmbeddedMap,
        ).toBe(false);
      }
    });

    it('keeps a chrome title edit going once it has begun, and offers no second start', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        editingChromeTitle: true,
      });

      expect(availability.chromeTitleEdit).toBe(true);
      expect(availability.entityEdits).toBe(false);
    });
  });
});
