import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { uuidSchema, type SpaceFile } from '@project/core';
import { loadSpace } from '@project/graph';
import { createApp } from '#app/App';
import { snapshotFromSpace } from '#app/snapshot';

const cardId = uuidSchema.parse('a53c4e9b-2d71-4af0-8c62-1e5b7d9034f8');
const graphId = uuidSchema.parse('b64d5fa0-3e82-4b01-9d73-2f6c8ea14509');
const layoutId = uuidSchema.parse('c75e60b1-4f93-4c12-ae84-307d9fb2561a');
const spaceId = uuidSchema.parse('d86f71c2-50a4-4d23-bf95-418ea0c3672b');

const spaceFile: SpaceFile = {
  version: 1,
  id: spaceId,
  title: 'Title editing lifecycle',
  layouts: [
    {
      id: layoutId,
      kind: 'positioned',
      title: 'Title editing',
      positions: { [cardId]: { x: 0, y: 0 } },
      graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
      activeGraph: graphId,
    },
  ],
  defaultView: layoutId,
};
const imported = loadSpace(spaceFile, [
  {
    path: 'cards/strategies.md',
    text: `---\nid: ${cardId}\ntitle: Strategies\ndescription: Available only when the Card is opened\n---\n\n# Strategies`,
  },
]);
if (!imported.ok) {
  throw new Error(imported.errors.map(({ message }) => message).join('; '));
}
const { space } = imported;

const snapshot = snapshotFromSpace(space);
const loaded = { snapshot, revision: 0n, exportedRevision: null } as const;
const backend = new MemorySpaceBackend([loaded]);

/**
 * The complete application composition over an isolated in-memory copy of the
 * catalogue fixture. SpaceCanvas owns the title draft and CardTitleEditor owns
 * Enter/Escape; the story supplies no parallel editing lifecycle.
 */
const TitleEditingApplication = createApp({
  space,
  spaceSession: openSpaceSession(backend, loaded),
});

export function TitleEditingDemo() {
  return (
    <div style={{ height: 620 }}>
      <TitleEditingApplication />
    </div>
  );
}
