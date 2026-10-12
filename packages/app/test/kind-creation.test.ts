import { describe, expect, it, vi } from 'vitest';
import { KIND_IDS, type EmptyCreatableKindId } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import { dockCreates, type CreateConditions, type DockCreate } from '../src/kind-creation';
import { KIND_CREATIONS, type KindCreationContext } from '../src/kinds/registry';

/** Commands that record what a Create ran, picking `chosen` when a picker is opened. */
const recording = (
  facts: { readonly creatingSpaceResource?: boolean; readonly chosen?: readonly File[] } = {},
) => {
  const ran: string[] = [];
  const commands: KindCreationContext = {
    createResource: (kind: EmptyCreatableKindId) => ran.push(`resource:${kind}`),
    createSpaceResource: () => ran.push('space-resource'),
    creatingSpaceResource: facts.creatingSpaceResource ?? false,
    createImagesFromFiles: (files) => ran.push(`images:${files.map(({ name }) => name).join()}`),
    pickImages: () => {
      ran.push('pick');
      return Promise.resolve(facts.chosen ?? []);
    },
  };
  return { ran, commands };
};

const creates = (
  commands: KindCreationContext,
  addResource = true,
  later: {
    readonly current?: () => CreateConditions<KindCreationContext> | null;
    readonly reportBreak?: ObserverErrorReporter;
  } = {},
): readonly DockCreate[] =>
  dockCreates(
    KIND_CREATIONS,
    { context: commands, addResource },
    {
      current: later.current ?? (() => ({ context: commands, addResource })),
      reportBreak:
        later.reportBreak ??
        ((failure) => {
          throw failure;
        }),
    },
  );

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
    expect(ran).toEqual(['pick']);

    await vi.waitFor(() => expect(ran).toEqual(['pick', 'images:figure.png']));
  });

  it('create the chosen images with the commands as they stand when the picker answers', async () => {
    const figure = new File([''], 'figure.png', { type: 'image/png' });
    const atPress = recording({ chosen: [figure] });
    const now = recording();

    createOf(
      creates(atPress.commands, true, {
        current: () => ({ context: now.commands, addResource: true }),
      }),
      'image',
    ).create();

    await vi.waitFor(() => expect(now.ran).toEqual(['images:figure.png']));
    expect(atPress.ran).toEqual(['pick']);
  });

  it('create nothing from a picker that answers once Add Resource is withheld, or the Dock has gone', async () => {
    const figure = new File([''], 'figure.png', { type: 'image/png' });
    for (const current of [
      (commands: KindCreationContext) => ({ context: commands, addResource: false }),
      () => null,
    ]) {
      const { ran, commands } = recording({ chosen: [figure] });
      createOf(creates(commands, true, { current: () => current(commands) }), 'image').create();
      await Promise.resolve();
      await Promise.resolve();
      expect(ran).toEqual(['pick']);
    }
  });

  it('report a Create that breaks after its press, rather than leaving it unhandled', async () => {
    const broken = new Error('creating broke');
    const { commands } = recording({ chosen: [new File([''], 'figure.png')] });
    const reportBreak = vi.fn();

    createOf(
      creates(
        {
          ...commands,
          createImagesFromFiles: () => {
            throw broken;
          },
        },
        true,
        { reportBreak },
      ),
      'image',
    ).create();

    await vi.waitFor(() => expect(reportBreak).toHaveBeenCalledWith(broken));
  });
});
