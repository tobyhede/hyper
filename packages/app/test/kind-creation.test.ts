import { describe, expect, it } from 'vitest';
import { KIND_IDS, type EmptyCreatableKindId } from '@project/core';
import { PICKED_IMAGE_TYPES } from '../src/image-creation';
import { dockCreates, type CreationCommands, type DockCreate } from '../src/kind-creation';
import { KIND_CREATIONS } from '../src/kinds/registry';

/** Commands that record what a Create ran, picking `chosen` when a picker is opened. */
const recording = (
  facts: { readonly creatingSpaceResource?: boolean; readonly chosen?: readonly File[] } = {},
) => {
  const ran: string[] = [];
  const commands: CreationCommands = {
    createResource: (kind: EmptyCreatableKindId) => ran.push(`resource:${kind}`),
    createSpaceResource: () => ran.push('space-resource'),
    creatingSpaceResource: facts.creatingSpaceResource ?? false,
    createImagesFromFiles: (files) => ran.push(`images:${files.map(({ name }) => name).join()}`),
    pickFiles: (accept) => {
      ran.push(`pick:${accept}`);
      return Promise.resolve(facts.chosen ?? []);
    },
  };
  return { ran, commands };
};

const creates = (commands: CreationCommands, addResource = true): readonly DockCreate[] =>
  dockCreates(KIND_CREATIONS, commands, addResource);

const createOf = (all: readonly DockCreate[], kind: string): DockCreate => {
  const found = all.find((create) => create.kind === kind);
  if (found === undefined) throw new Error(`No Create for ${kind}`);
  return found;
};

describe('the Creates the Command Dock draws', () => {
  it('follow the kind registry’s order, leaving out the kind created from its Target', () => {
    const drawn = creates(recording().commands).map(({ kind }) => kind);

    expect(drawn).toEqual(KIND_IDS.filter((kind) => drawn.includes(kind)));
    expect(drawn).toEqual(['markdown', 'space', 'image', 'ur']);
  });

  it('are each withheld while Add Resource is, and a withheld press runs nothing', () => {
    const { ran, commands } = recording();
    const withheld = creates(commands, false);

    expect(withheld.every(({ disabled }) => disabled)).toBe(true);
    for (const create of withheld) create.create();
    expect(ran).toEqual([]);
  });

  it('withhold only Create Space Resource while its coordinated Edit is in flight', () => {
    const { ran, commands } = recording({ creatingSpaceResource: true });
    const drawn = creates(commands);

    expect(drawn.filter(({ disabled }) => disabled).map(({ kind }) => kind)).toEqual(['space']);
    createOf(drawn, 'space').create();
    expect(ran).toEqual([]);
  });

  it('create a Resource that starts empty for each kind whose module declares how it starts', () => {
    const { ran, commands } = recording();
    const drawn = creates(commands);

    for (const kind of ['markdown', 'ur']) createOf(drawn, kind).create();

    expect(ran).toEqual(['resource:markdown', 'resource:ur']);
  });

  it('run the Space Resource lifecycle for a Space Resource', () => {
    const { ran, commands } = recording();
    createOf(creates(commands), 'space').create();

    expect(ran).toEqual(['space-resource']);
  });

  it('open the picker within the press for an Image Resource, and create from what it chose', async () => {
    const figure = new File([''], 'figure.png', { type: 'image/png' });
    const { ran, commands } = recording({ chosen: [figure] });

    createOf(creates(commands), 'image').create();
    // Within the press, before any await: a browser opens a picker only then.
    expect(ran).toEqual([`pick:${PICKED_IMAGE_TYPES}`]);

    await Promise.resolve();
    expect(ran).toEqual([`pick:${PICKED_IMAGE_TYPES}`, 'images:figure.png']);
  });
});
