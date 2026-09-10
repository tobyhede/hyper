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
  creatingCard: false,
  editingCardBody: false,
  editingCardTitle: false,
  cardIsOpen: false,
  editingChromeTitle: false,
  spaceOnCanvas: true,
  editingEmbeddedDiagram: false,
};

const ALL_AVAILABLE: AuthoringAvailability = {
  cardsView: true,
  chromeTitleEdit: true,
  entityEdits: true,
  deleteCard: true,
  present: true,
  addCard: true,
  createDiagram: true,
  authorOnCanvas: true,
  authorInEmbeddedDiagram: true,
  editCardBody: true,
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
        entityEdits: false,
        deleteCard: false,
        authorOnCanvas: false,
        authorInEmbeddedDiagram: false,
        editCardBody: false,
        connectOnCanvas: false,
        dragNodes: false,
      },
    ],
    [
      'a running presentation',
      { presenting: true },
      {
        ...ALL_AVAILABLE,
        cardsView: false,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteCard: false,
        addCard: false,
        createDiagram: false,
        authorOnCanvas: false,
        authorInEmbeddedDiagram: false,
        editCardBody: false,
        dragNodes: false,
        selectNodes: false,
      },
    ],
    [
      'an open creation pane',
      { creatingCard: true },
      {
        ...ALL_AVAILABLE,
        cardsView: false,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteCard: false,
        addCard: false,
        createDiagram: false,
        authorOnCanvas: false,
        authorInEmbeddedDiagram: false,
        connectOnCanvas: false,
      },
    ],
    [
      'a live Card content edit',
      { editingCardBody: true },
      {
        ...ALL_AVAILABLE,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteCard: false,
        present: false,
        addCard: false,
        createDiagram: false,
      },
    ],
    [
      'a live Card rename',
      { editingCardTitle: true },
      {
        ...ALL_AVAILABLE,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteCard: false,
        createDiagram: false,
      },
    ],
    ['an Open Card', { cardIsOpen: true }, { ...ALL_AVAILABLE, deleteCard: false }],
    [
      'a live chrome title edit',
      { editingChromeTitle: true },
      {
        ...ALL_AVAILABLE,
        entityEdits: false,
        deleteCard: false,
        present: false,
        addCard: false,
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
      'a live Card edit inside an embedded Diagram',
      { editingEmbeddedDiagram: true },
      { ...ALL_AVAILABLE, authorOnCanvas: false },
    ],
  ])('withdraws what %s takes away', (_what, inProgress, expected) => {
    expect(authoringAvailability({ ...NOTHING_IN_PROGRESS, ...inProgress })).toStrictEqual(
      expected,
    );
  });

  describe('the asymmetries', () => {
    it('offers Add Card during a live Card rename and withholds Add Diagram', () => {
      const availability = authoringAvailability({
        ...NOTHING_IN_PROGRESS,
        editingCardTitle: true,
      });

      expect(availability.addCard).toBe(true);
      expect(availability.createDiagram).toBe(false);
    });

    it('withholds only Delete Card while a Card is open', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, cardIsOpen: true });

      expect(availability.deleteCard).toBe(false);
      expect(availability.entityEdits).toBe(true);
      expect(availability.addCard).toBe(true);
    });

    it('keeps a connection reachable on the presented Card that authoring is withdrawn from', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, presenting: true });

      expect(availability.connectOnCanvas).toBe(true);
      expect(availability.authorOnCanvas).toBe(false);
    });

    it('withdraws the connection a modal pane covers, presented or not', () => {
      for (const presenting of [false, true]) {
        expect(
          authoringAvailability({ ...NOTHING_IN_PROGRESS, presenting, creatingCard: true })
            .connectOnCanvas,
        ).toBe(false);
      }
    });

    it('keeps a live content editor through a modal pane that withdraws canvas authoring', () => {
      const availability = authoringAvailability({ ...NOTHING_IN_PROGRESS, creatingCard: true });

      expect(availability.editCardBody).toBe(true);
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
        { creatingCard: true },
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
