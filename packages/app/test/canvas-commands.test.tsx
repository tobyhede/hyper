import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  ABSENT,
  ADD_RESOURCE,
  AVAILABLE,
  bindCommand,
  keyAnswerOf,
  PRESENT_OFF_GRAPH,
  PRESENT_WHILE_EDITING,
  presentFromHereCommand,
  REMOVE_SELECTION,
  RENAME_RESOURCE,
  unavailable,
  type AuthoringOccurrence,
  type RemovalOccurrence,
} from '../src/canvas-commands';

const ON_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OFF_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

/** A press whose target is `target`, as the window sees it. */
const pressOn = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

const presenting = () => {
  const run = vi.fn();
  return { run, presentFrom: { canPresentFrom: (id: string) => id === ON_GRAPH, run } };
};

describe('Present from Here', () => {
  it('is available on the Active Graph while presenting may start, and presents from it', () => {
    const { run, presentFrom } = presenting();
    const command = presentFromHereCommand({ presentFrom, mayPresent: true });

    expect(command.availability(ON_GRAPH)).toEqual(AVAILABLE);
    command.run(ON_GRAPH);
    expect(run).toHaveBeenCalledWith(ON_GRAPH);
  });

  it('is unavailable off the Active Graph, saying so before any edit in progress', () => {
    const { presentFrom } = presenting();

    expect(
      presentFromHereCommand({ presentFrom, mayPresent: true }).availability(OFF_GRAPH),
    ).toEqual(unavailable(PRESENT_OFF_GRAPH));
    expect(
      presentFromHereCommand({ presentFrom, mayPresent: false }).availability(OFF_GRAPH),
    ).toEqual(unavailable(PRESENT_OFF_GRAPH));
  });

  it('is unavailable while an edit holds the keyboard', () => {
    const { presentFrom } = presenting();

    expect(
      presentFromHereCommand({ presentFrom, mayPresent: false }).availability(ON_GRAPH),
    ).toEqual(unavailable(PRESENT_WHILE_EDITING));
  });

  it('is absent where nothing presents from the canvas', () => {
    expect(
      presentFromHereCommand({ presentFrom: undefined, mayPresent: true }).availability(ON_GRAPH),
    ).toEqual(ABSENT);
  });

  it('binds to one Resource as a rail item runs it', () => {
    const { run, presentFrom } = presenting();
    const bound = bindCommand(presentFromHereCommand({ presentFrom, mayPresent: true }), ON_GRAPH);

    expect(bound.availability).toEqual(AVAILABLE);
    bound.run();
    expect(run).toHaveBeenCalledWith(ON_GRAPH);
  });
});

describe('a Canvas command’s key', () => {
  it('runs the command at its target only while it is available', () => {
    const { run, presentFrom } = presenting();
    const command = presentFromHereCommand({ presentFrom, mayPresent: true });

    expect(keyAnswerOf(command, () => OFF_GRAPH).answer(pressOn(document.body, 'p'))).toBe(false);
    expect(keyAnswerOf(command, () => undefined).answer(pressOn(document.body, 'p'))).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(keyAnswerOf(command, () => ON_GRAPH).answer(pressOn(document.body, 'p'))).toBe(true);
    expect(run).toHaveBeenCalledWith(ON_GRAPH);
  });

  it('leaves a selection command’s key to a surface that owns its keys', () => {
    const { run, presentFrom } = presenting();
    const field = document.createElement('input');

    const taken = keyAnswerOf(
      presentFromHereCommand({ presentFrom, mayPresent: true }),
      () => ON_GRAPH,
    ).answer(pressOn(field, 'p'));

    expect(taken).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('Remove from Map', () => {
  const occurrence = (overrides: Partial<RemovalOccurrence> = {}) => ({
    authorOnCanvas: true,
    bodyEditing: false,
    removeFromMap: vi.fn(),
    deleteSelectedEdge: vi.fn(),
    ...overrides,
  });

  it('removes a Resource from its Map, or deletes the selected Edge', () => {
    const map = occurrence();

    REMOVE_SELECTION.run({ occurrence: map, subject: { kind: 'resource', resourceId: ON_GRAPH } });
    REMOVE_SELECTION.run({ occurrence: map, subject: { kind: 'edge' } });

    expect(map.removeFromMap).toHaveBeenCalledWith(ON_GRAPH);
    expect(map.deleteSelectedEdge).toHaveBeenCalledOnce();
  });

  it('is absent while its Map may not be authored or a body is being edited', () => {
    const subject = { kind: 'resource', resourceId: ON_GRAPH } as const;

    expect(REMOVE_SELECTION.availability({ occurrence: occurrence(), subject })).toEqual(AVAILABLE);
    expect(
      REMOVE_SELECTION.availability({ occurrence: occurrence({ authorOnCanvas: false }), subject }),
    ).toEqual(ABSENT);
    expect(
      REMOVE_SELECTION.availability({ occurrence: occurrence({ bodyEditing: true }), subject }),
    ).toEqual(ABSENT);
  });

  it('leaves its key to any control, even one that owns no keys of its own', () => {
    const map = occurrence();
    const answer = keyAnswerOf(REMOVE_SELECTION, () => ({
      occurrence: map,
      subject: { kind: 'resource' as const, resourceId: ON_GRAPH },
    }));
    const toolbar = document.createElement('div');
    toolbar.className = 'nokey';
    const button = document.createElement('button');
    toolbar.append(button);

    expect(answer.answer(pressOn(button, 'Delete'))).toBe(false);
    expect(answer.answer(pressOn(toolbar, 'Delete'))).toBe(false);
    expect(map.removeFromMap).not.toHaveBeenCalled();
    expect(answer.answer(pressOn(document.body, 'Delete'))).toBe(true);
    expect(map.removeFromMap).toHaveBeenCalledWith(ON_GRAPH);
  });
});

describe('Add Resource and Rename', () => {
  const occurrence = (overrides: Partial<AuthoringOccurrence> = {}) => ({
    authorOnCanvas: true,
    bodyEditing: false,
    addResource: vi.fn(),
    beginTitleEditing: vi.fn(),
    ...overrides,
  });

  it('adds a Resource to the Map, and renames the Resource drawn as a node there', () => {
    const map = occurrence();

    ADD_RESOURCE.run(map);
    RENAME_RESOURCE.run({ occurrence: map, nodeId: 'node-a' });

    expect(map.addResource).toHaveBeenCalledOnce();
    expect(map.beginTitleEditing).toHaveBeenCalledWith('node-a');
  });

  it.each([
    ['authoring is withdrawn', { authorOnCanvas: false }],
    ['a body is being edited', { bodyEditing: true }],
  ])('is absent while %s', (_, overrides) => {
    const map = occurrence(overrides);

    expect(ADD_RESOURCE.availability(map)).toEqual(ABSENT);
    expect(RENAME_RESOURCE.availability({ occurrence: map, nodeId: 'node-a' })).toEqual(ABSENT);
    expect(ADD_RESOURCE.availability(occurrence())).toEqual(AVAILABLE);
  });

  it('leaves C to a field, a menu and a dialog, and takes it from a button', () => {
    const map = occurrence();
    const answer = keyAnswerOf(ADD_RESOURCE, () => map);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    for (const target of [document.createElement('input'), menu, dialog])
      expect(answer.answer(pressOn(target, 'c'))).toBe(false);
    expect(map.addResource).not.toHaveBeenCalled();
    expect(answer.answer(pressOn(document.createElement('button'), 'c'))).toBe(true);
    expect(map.addResource).toHaveBeenCalledOnce();
  });
});
