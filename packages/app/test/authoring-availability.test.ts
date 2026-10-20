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
  replacingImage: false,
  presenting: false,
  editingResourceBody: false,
  editingResourceTitle: false,
  editingChromeTitle: false,
  spaceOnCanvas: true,
  editingEmbeddedMap: false,
  mounted: false,
};

const ALL_AVAILABLE: AuthoringAvailability = {
  resourcesView: true,
  chromeTitleEdit: true,
  entityEdits: true,
  deleteResource: true,
  present: true,
  addResource: true,
  createMap: true,
  authorOnCanvas: true,
  authorInEmbeddedMap: true,
  editResourceBody: true,
  connectOnCanvas: true,
  dragNodes: true,
  selectNodes: true,
  navigate: true,
  replaceSession: true,
  resourceActions: true,
  embeddedMapEdit: true,
};

describe('authoring availability', () => {
  it('withdraws other operations while replacing an image but keeps its editor mounted', () => {
    expect(authoringAvailability({ ...NOTHING_IN_PROGRESS, replacingImage: true })).toEqual(
      Object.fromEntries(
        Object.keys(ALL_AVAILABLE).map((key) => [
          key,
          key === 'editResourceBody' || key === 'embeddedMapEdit',
        ]),
      ),
    );
  });
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
        resourceActions: false,
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
        createMap: false,
        authorOnCanvas: false,
        resourceActions: false,
        authorInEmbeddedMap: false,
        editResourceBody: false,
        connectOnCanvas: false,
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
    [
      'a live chrome title edit',
      { editingChromeTitle: true },
      {
        ...ALL_AVAILABLE,
        entityEdits: false,
        deleteResource: false,
        present: false,
        addResource: false,
        createMap: false,
        authorOnCanvas: false,
        resourceActions: false,
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
        resourceActions: false,
        authorInEmbeddedMap: false,
        connectOnCanvas: false,
      },
    ],
    [
      'a live Resource edit inside an embedded Map',
      { editingEmbeddedMap: true },
      { ...ALL_AVAILABLE, authorOnCanvas: false, resourceActions: false },
    ],
  ])('withdraws what %s takes away', (_what, inProgress, expected) => {
    expect(authoringAvailability({ ...NOTHING_IN_PROGRESS, ...inProgress })).toStrictEqual(
      expected,
    );
  });

  describe('a mounted session (ADR 0130)', () => {
    /** The answers that read rather than Edit, the only ones a mounted session may offer. */
    const READS: readonly string[] = [
      'present',
      'selectNodes',
      'navigate',
      'replaceSession',
      'resourceActions',
    ];

    /** Every answer it gives that is not a read, whatever the answer is called. */
    const edits = (availability: AuthoringAvailability) =>
      Object.entries(availability).filter(([answer]) => !READS.includes(answer));

    it('offers selection, navigation, Present and the rail actions that hold Enter, and no Edit', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, mounted: true });
      expect(Object.fromEntries(edits(availability))).toStrictEqual(
        Object.fromEntries(edits(ALL_AVAILABLE).map(([answer]) => [answer, false])),
      );
      for (const read of READS) expect(availability).toHaveProperty(read, true);
    });

    it('offers no Edit whatever else is in progress', () => {
      for (const inProgress of [
        { editable: false },
        { presenting: true },
        { editingResourceTitle: true },
        { editingChromeTitle: true },
        { spaceOnCanvas: false },
        { editingEmbeddedMap: true },
        { replacingImage: true },
      ]) {
        const availability = authoringAvailability({
          ...NOTHING_IN_PROGRESS,
          ...inProgress,
          mounted: true,
        });
        for (const [answer, offered] of edits(availability))
          expect([answer, offered]).toEqual([answer, false]);
      }
    });

    it('withdraws the rail actions where an unmounted canvas would, so Enter is not offered off the canvas', () => {
      for (const inProgress of [{ presenting: true }, { spaceOnCanvas: false }]) {
        expect(
          authoringAvailability({ ...NOTHING_IN_PROGRESS, ...inProgress, mounted: true })
            .resourceActions,
        ).toBe(false);
      }
    });

    it('keeps Stop and navigation offered through a presentation', () => {
      expect(
        authoringAvailability({ ...NOTHING_IN_PROGRESS, presenting: true, mounted: true }),
      ).toMatchObject({ present: true, navigate: true, selectNodes: false });
    });
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

    it('withdraws canvas connection while presenting, with every other canvas authoring capability', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, presenting: true });

      expect(availability.connectOnCanvas).toBe(false);
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
