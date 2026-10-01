import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Graph, type Map as SpaceMap, type Resource } from '@project/core';
import { deletionReach, type DeletionReach } from '@project/graph';
import { DeleteConfirmation } from '../src/components/DeleteConfirmation';
import { resourceDeletionWords } from '../src/resource-deletion';

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const NOTHING: DeletionReach = { maps: [], graphs: [] };

const ask = (
  resource: Resource,
  reach: DeletionReach = NOTHING,
  colorByGraphId: Readonly<Record<string, string>> = {},
) =>
  render(
    <DeleteConfirmation
      {...resourceDeletionWords(resource, reach, colorByGraphId)}
      deleting={false}
      onConfirm={() => undefined}
      onDismiss={() => undefined}
    />,
  );

describe('the question Delete from Space asks', () => {
  it('names the Resource, says what deleting does, and answers with Delete', () => {
    ask({ id: id('000000000001'), title: 'Auth', kind: 'markdown', body: '' });

    const question = screen.getByRole('alertdialog', { name: 'Delete Auth From Space?' });
    expect(question).toHaveTextContent(
      'Permanently deletes the Resource from the Space and all Maps and Graphs.',
    );
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

    /** The reach as drawn: each Map's title, and the titles of the Graphs listed under it. */
    const drawnReach = (question: HTMLElement) => {
      const tree = within(question).getByRole('list', { name: 'Maps and Graphs' });
      return Array.from(tree.querySelectorAll(':scope > li'), (item) => {
        const graphs = item.querySelector('ul');
        return {
          map: item.firstElementChild?.textContent,
          graphs:
            graphs === null
              ? []
              : Array.from(graphs.querySelectorAll('li'), (graph) => graph.textContent),
        };
      });
    };

    it('names each Map that places it, with the Graphs holding its Edges beneath', () => {
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
      expect(drawnReach(question)).toEqual([
        { map: 'Overview', graphs: ['Main'] },
        { map: 'Detail…', graphs: [] },
      ]);
      const owned = within(question).getByRole('list', { name: 'Overview' });
      expect(within(owned).getByRole('listitem')).toHaveTextContent('Main');
    });

    it('marks each Graph in its colour and head shape', () => {
      const main: Graph = { ...graph('000000000030', 'Main', true), headShape: 'diamond' };
      ask(subject, deletionReach([spaceMap('000000000020', 'Overview', [main])], subject.id), {
        [main.id]: '#123456',
      });

      const mark = within(screen.getByRole('list', { name: 'Overview' }))
        .getByRole('listitem')
        .querySelector('[data-slot="graph-legend-mark"]');
      expect(mark).toHaveAttribute('data-head-shape', 'diamond');
      expect(mark?.querySelector('[data-slot="graph-legend-mark-line"]')).toHaveAttribute(
        'stroke',
        '#123456',
      );
    });

    it('draws no reach for a Resource no Map places and no Edge touches', () => {
      ask(
        subject,
        deletionReach(
          [spaceMap('000000000020', 'Overview', [graph('000000000030', 'Main', false)], false)],
          subject.id,
        ),
      );

      expect(screen.getByRole('alertdialog')).toBeVisible();
      expect(screen.queryByRole('region', { name: 'What the deletion reaches' })).toBeNull();
      expect(screen.queryByRole('list')).toBeNull();
    });

    it('opens on Cancel, with the reach a focusable region of its own', async () => {
      ask(
        subject,
        deletionReach(
          [spaceMap('000000000020', 'Overview', [graph('000000000030', 'Main', true)])],
          subject.id,
        ),
      );

      const question = screen.getByRole('alertdialog');
      await waitFor(() =>
        expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
      );
      expect(
        within(question).getByRole('region', { name: 'What the deletion reaches' }),
      ).toHaveAttribute('tabindex', '0');
    });

    it('keeps a Space Resource’s cascade sentence beside the reach', () => {
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
      expect(within(question).getByRole('list', { name: 'Maps and Graphs' })).toBeVisible();
    });
  });
});
