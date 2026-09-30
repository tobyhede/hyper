import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Graph, type Map as SpaceMap, type Resource } from '@project/core';
import { deletionReach, type DeletionReach } from '@project/graph';
import { DeleteConfirmation } from '../src/components/DeleteConfirmation';
import { resourceDeletionWords } from '../src/resource-deletion';

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const NOTHING: DeletionReach = { maps: [], graphs: [] };

const ask = (resource: Resource, reach: DeletionReach = NOTHING) =>
  render(
    <DeleteConfirmation
      {...resourceDeletionWords(resource, reach)}
      deleting={false}
      onConfirm={() => undefined}
      onDismiss={() => undefined}
    />,
  );

describe('the question Delete from Space asks', () => {
  it('names the Resource, says what deleting does, and answers with Delete', () => {
    ask({ id: id('000000000001'), title: 'Auth', kind: 'markdown', body: '' });

    const question = screen.getByRole('alertdialog', { name: 'Delete Auth From Space?' });
    expect(question).toHaveTextContent('Permanently deletes the Resource from the Space.');
    expect(within(question).getByRole('button', { name: 'Delete' })).toBeVisible();
    expect(within(question).getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('names a Resource whose Title spans several lines by its first line and an ellipsis', () => {
    ask({
      id: id('000000000002'),
      title: 'Resource Title\nThat\nSpans\nLines',
      kind: 'markdown',
      body: '',
    });

    expect(
      screen.getByRole('alertdialog', { name: 'Delete Resource Title… From Space?' }),
    ).toBeVisible();
  });

  describe('what the deletion reaches', () => {
    const subject: Resource = { id: id('000000000010'), title: 'Auth', kind: 'markdown', body: '' };
    const other = id('000000000011');
    const graph = (suffix: string, title: string, touching: boolean): Graph => ({
      id: id(suffix),
      title,
      edges: touching ? [{ from: subject.id, to: other }] : [],
    });
    const spaceMap = (suffix: string, title: string, graphs: Graph[], places = true): SpaceMap => {
      const positions: SpaceMap['positions'] = { [other]: { x: 300, y: 0, open: false } };
      if (places) positions[subject.id] = { x: 0, y: 0, open: false };
      return { id: id(suffix), title, kind: 'positioned', positions, graphs };
    };

    it('lists every Map that places it and the Graph holding its Edge, named with its Map', () => {
      ask(
        subject,
        deletionReach(
          [
            spaceMap('000000000020', 'Overview', [graph('000000000030', 'Main', true)]),
            spaceMap('000000000021', 'Detail\nSecond line', [graph('000000000031', 'Main', false)]),
            spaceMap('000000000022', 'Elsewhere', [graph('000000000032', 'Other', false)], false),
          ],
          subject.id,
        ),
      );

      const question = screen.getByRole('alertdialog', { name: 'Delete Auth From Space?' });
      const maps = within(question).getByRole('list', { name: 'Removed from Maps' });
      expect(
        within(maps)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Overview', 'Detail…']);
      const graphs = within(question).getByRole('list', { name: 'Edges deleted from Graphs' });
      expect(
        within(graphs)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Main in Overview']);
    });

    it('names a Graph alone when only one Map is listed', () => {
      ask(
        subject,
        deletionReach(
          [spaceMap('000000000020', 'Overview', [graph('000000000030', 'Main', true)])],
          subject.id,
        ),
      );

      const graphs = screen.getByRole('list', { name: 'Edges deleted from Graphs' });
      expect(
        within(graphs)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Main']);
    });

    it('lists nothing for a Resource no Map places and no Edge touches', () => {
      ask(
        subject,
        deletionReach(
          [spaceMap('000000000020', 'Overview', [graph('000000000030', 'Main', false)], false)],
          subject.id,
        ),
      );

      expect(screen.getByRole('alertdialog')).toBeVisible();
      expect(screen.queryByRole('list')).toBeNull();
    });

    it('keeps a Space Resource’s cascade sentence beside the lists', () => {
      const spaceResource: Resource = {
        id: subject.id,
        title: 'Nested',
        kind: 'space',
        spaceId: id('000000000040'),
        map: id('000000000041'),
        graph: id('000000000042'),
      };
      ask(
        spaceResource,
        deletionReach(
          [spaceMap('000000000020', 'Overview', [graph('000000000030', 'Main', true)])],
          subject.id,
        ),
      );

      const question = screen.getByRole('alertdialog');
      expect(question).toHaveTextContent('that Space is deleted with it');
      expect(within(question).getByRole('list', { name: 'Removed from Maps' })).toBeVisible();
    });
  });
});
