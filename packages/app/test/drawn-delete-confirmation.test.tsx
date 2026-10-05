import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { newUuid, spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { embeddedNodeId } from '../src/embedded-map';
import { createOpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';
import { mountSettled } from './settled-mount';
import { unusedImageSources } from './image-sources';

/**
 * A drawn Map asks through its own Space's delete confirmation (ADR 0112), and
 * that Space may also be listed and mounted hidden. The question is presented
 * once, by the Space on the canvas.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const INTAKE = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const STORAGE = uuidSchema.parse('00000000-0000-4000-8000-000000000026');

const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    maps: [
      {
        id: TARGET_MAP_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: {
          [INTAKE]: { x: 0, y: 0, open: false },
          [STORAGE]: { x: 264, y: 0, open: false },
        },
        graphs: [
          { id: TARGET_GRAPH_ID, title: 'Overview', edges: [{ from: INTAKE, to: STORAGE }] },
        ],
      },
    ],
    defaultMap: TARGET_MAP_ID,
  },
  resources: [
    { id: INTAKE, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: STORAGE, document: { title: 'Storage', kind: 'markdown', body: '' } },
  ],
});

const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    maps: [
      {
        id: HOME_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [SPACE_RESOURCE_ID]: {
            x: 0,
            y: 0,
            open: true,
            openSize: { width: 700, height: 500 },
          },
        },
        graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultMap: HOME_MAP_ID,
  },
  resources: [
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [META_TO_HOME_ID]: { x: 0, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 300, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultMap: META_MAP_ID,
  },
  resources: [
    {
      id: META_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        map: HOME_MAP_ID,
        graph: HOME_GRAPH_ID,
      },
    },
    {
      id: META_TO_TARGET_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

/** The node the showing Space draws for `id`, ignoring every hidden Space's canvas. */
const nodeById = (id: string): HTMLElement => {
  const found = [...document.querySelectorAll(`.react-flow__node[data-id="${id}"]`)].find(
    (node) => node.closest('[hidden]') === null,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no node is drawn for ${id}`);
  return found;
};

const railOf = (node: HTMLElement): HTMLElement => {
  const id = node.dataset['id'];
  const query = (): Element | null =>
    id === undefined ? null : document.querySelector(`[data-resource-rail-for="${id}"]`);
  if (query() === null) fireEvent.click(node);
  const rail = query();
  if (!(rail instanceof HTMLElement))
    throw new Error(`no toolbar is drawn for ${id ?? 'the node'}`);
  return rail;
};

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

it('asks once when the drawn Space is also listed and hidden', async () => {
  const backend = new MemorySpaceBackend(
    META_ID,
    [meta, home, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
  );
  const spaces = createOpenSpaces({
    images: unusedImageSources,
    backend,
    metaSpaceId: META_ID,
    metaSpaceTitle: meta.document.title,
    newId: newUuid,
    history: recordingHistory(),
  });
  const initial = await spaces.open(HOME_ID);
  await mountSettled(<OpenSpacesApplication spaces={spaces} initial={initial} />);
  await act(async () => {
    await spaces.enter(TARGET_ID, TARGET_MAP_ID, TARGET_GRAPH_ID);
    await spaces.switchTo(HOME_ID);
  });
  expect(spaces.getState().entries.map((entry) => entry.id)).toContain(TARGET_ID);
  expect(spaces.getState().activeSpaceId).toBe(HOME_ID);

  const showing = nodeById(SPACE_RESOURCE_ID).closest('.react-flow');
  if (!(showing instanceof HTMLElement)) throw new Error('no canvas is showing');
  await waitFor(() =>
    expect(
      showing.querySelector(
        `.react-flow__node[data-id="${embeddedNodeId(SPACE_RESOURCE_ID, INTAKE)}"]`,
      ),
    ).not.toBeNull(),
  );
  fireEvent.click(
    within(railOf(nodeById(SPACE_RESOURCE_ID))).getByRole('button', { name: /^Edit Resource/ }),
  );
  fireEvent.click(await within(showing).findByLabelText('Edge from Intake to Storage in Overview'));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Edge Intake → Storage' }));

  const questions = (): readonly Element[] => [
    ...document.querySelectorAll('[role="alertdialog"]'),
  ];
  await waitFor(() => expect(questions().length).toBeGreaterThan(0));
  expect(questions().map((question) => question.getAttribute('aria-labelledby'))).toHaveLength(1);
  await screen.findByRole('alertdialog', { name: 'Delete Edge Intake → Storage?' });
});
