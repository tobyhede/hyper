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
  editingThingBody: false,
  editingThingTitle: false,
  thingIsOpen: false,
  editingChromeTitle: false,
  spaceOnCanvas: true,
  editingEmbeddedDiagram: false,
  creatingSpaceThing: false,
};

const ALL_AVAILABLE: AuthoringAvailability = {
  thingsView: true,
  chromeTitleEdit: true,
  entityEdits: true,
  deleteThing: true,
  present: true,
  addThing: true,
  createSpaceThing: true,
  createDiagram: true,
  authorOnCanvas: true,
  authorInEmbeddedDiagram: true,
  editThingBody: true,
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
        createDiagram: false,
        entityEdits: false,
        deleteThing: false,
        authorOnCanvas: false,
        authorInEmbeddedDiagram: false,
        editThingBody: false,
        connectOnCanvas: false,
        dragNodes: false,
      },
    ],
    [
      'a running presentation',
      { presenting: true },
      {
        ...ALL_AVAILABLE,
        thingsView: false,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteThing: false,
        addThing: false,
        createSpaceThing: false,
        createDiagram: false,
        authorOnCanvas: false,
        authorInEmbeddedDiagram: false,
        editThingBody: false,
        dragNodes: false,
        selectNodes: false,
      },
    ],
    [
      'a live Thing content edit',
      { editingThingBody: true },
      {
        ...ALL_AVAILABLE,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteThing: false,
        present: false,
        addThing: false,
        createSpaceThing: false,
        createDiagram: false,
      },
    ],
    [
      'a live Thing rename',
      { editingThingTitle: true },
      {
        ...ALL_AVAILABLE,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteThing: false,
        createDiagram: false,
      },
    ],
    ['an Open Thing', { thingIsOpen: true }, { ...ALL_AVAILABLE, deleteThing: false }],
    [
      'a live chrome title edit',
      { editingChromeTitle: true },
      {
        ...ALL_AVAILABLE,
        entityEdits: false,
        deleteThing: false,
        present: false,
        addThing: false,
        createSpaceThing: false,
        createDiagram: false,
        authorOnCanvas: false,
        authorInEmbeddedDiagram: false,
        connectOnCanvas: false,
      },
    ],
    [
      'a Space that is open but not the one on the canvas',
      { spaceOnCanvas: false },
      {
        ...ALL_AVAILABLE,
        authorOnCanvas: false,
        authorInEmbeddedDiagram: false,
        connectOnCanvas: false,
      },
    ],
    [
      'a live Thing edit inside an embedded Diagram',
      { editingEmbeddedDiagram: true },
      { ...ALL_AVAILABLE, authorOnCanvas: false },
    ],
    [
      'a Space Thing creation in flight',
      { creatingSpaceThing: true },
      { ...ALL_AVAILABLE, createSpaceThing: false },
    ],
  ])('withdraws what %s takes away', (_what, inProgress, expected) => {
    expect(authoringAvailability({ ...NOTHING_IN_PROGRESS, ...inProgress })).toStrictEqual(
      expected,
    );
  });

  describe('the asymmetries', () => {
    it('offers Add Thing during a live Thing rename and withholds Add Diagram', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        editingThingTitle: true,
      });

      expect(availability.addThing).toBe(true);
      expect(availability.createDiagram).toBe(false);
    });

    it('withholds only Create Space Thing while its coordinated Edit is in flight', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        creatingSpaceThing: true,
      });

      expect(availability.createSpaceThing).toBe(false);
      expect(availability.addThing).toBe(true);
    });

    it('withholds only Delete Thing while a Thing is open', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, thingIsOpen: true });

      expect(availability.deleteThing).toBe(false);
      expect(availability.entityEdits).toBe(true);
      expect(availability.addThing).toBe(true);
    });

    it('keeps a connection reachable on the presented Thing that authoring is withdrawn from', () => {
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

      expect(availability.editThingBody).toBe(true);
      expect(availability.authorOnCanvas).toBe(false);
    });

    it('leaves an embedded Diagram authorable while withdrawing the canvas around it', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        editingEmbeddedDiagram: true,
      });

      expect(availability.authorOnCanvas).toBe(false);
      expect(availability.authorInEmbeddedDiagram).toBe(true);
    });

    it('withdraws an embedded Diagram for every reason that is not its own edit', () => {
      for (const inProgress of [
        { editable: false },
        { presenting: true },
        { editingChromeTitle: true },
        { spaceOnCanvas: false },
      ]) {
        expect(
          authoringAvailability({ ...NOTHING_IN_PROGRESS, ...inProgress }).authorInEmbeddedDiagram,
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
