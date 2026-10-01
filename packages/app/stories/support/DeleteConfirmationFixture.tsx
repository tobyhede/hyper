import { useEffect, useState } from 'react';
import type { Resource } from '@project/core';
import { deletionReach, graphColorsByGraphId } from '@project/graph';
import { Button } from '@project/ui';
import { ArmedDeleteConfirmation } from '#components/DeleteConfirmation';
import {
  createDeleteConfirmation,
  type DeleteConfirmation,
  type DeleteQuestionWords,
} from '#src/delete-confirmation';
import { edgeDeletionWords } from '#src/edge-authoring';
import { graphDeletionWords } from '#src/graph-authoring-commands';
import { mapDeletionWords } from '#src/map-authoring-commands';
import { resourceDeletionWords } from '#src/resource-deletion';
import { commandDockSnapshot, commandDockSpace } from './spaces';

/**
 * Every question the delete confirmation asks, each worded by the production
 * command that arms it over the Command Dock's Space, and each armed with the
 * command's name so the story can ask it again.
 */

const [collectionOne] = commandDockSpace.maps;
if (collectionOne === undefined) throw new Error('The Command Dock Space owns no Map');
const [long] = collectionOne.graphs;
if (long === undefined) throw new Error('Collection 1 owns no Graph');
const [firstEdge] = long.edges;
if (firstEdge === undefined) throw new Error('Long holds no Edge');

const resourceTitled = (title: string): Resource => {
  const resource = commandDockSpace.resources.find((candidate) => candidate.title === title);
  if (resource === undefined) throw new Error(`The Command Dock Space holds no ${title}`);
  return resource;
};

const resourceWords = (title: string): DeleteQuestionWords => {
  const resource = resourceTitled(title);
  return resourceDeletionWords(
    resource,
    deletionReach(commandDockSpace.maps, resource.id),
    graphColorsByGraphId(commandDockSpace),
  );
};

/** Each question, by the name of the command that asks it. */
export const DELETE_QUESTIONS = {
  map: { command: 'Delete Collection 1', words: mapDeletionWords(collectionOne) },
  graph: { command: 'Delete Long', words: graphDeletionWords(long, collectionOne) },
  edge: {
    command: 'Delete Edge',
    words: edgeDeletionWords(commandDockSnapshot, collectionOne.id, [
      { graphId: long.id, edge: firstEdge },
    ]),
  },
  resource: { command: 'Delete Opening from Space', words: resourceWords('Opening') },
  spaceResource: {
    command: 'Delete Design system from Space',
    words: resourceWords('Design system'),
  },
} as const satisfies Record<string, { command: string; words: DeleteQuestionWords }>;

export type DeleteQuestionKind = keyof typeof DELETE_QUESTIONS;

/** The Command Dock's Space is never replaced here, so no question is discarded by one. */
const UNREPLACED = {
  getState: () => ({ replacementEpoch: 0 }),
  subscribe: () => () => undefined,
};

/** Ask one question. Delete runs nothing: the story owns no Space for it to change. */
const ask = (deleteConfirmation: DeleteConfirmation, words: DeleteQuestionWords): void => {
  deleteConfirmation.arm({ ...words, run: () => undefined, focusFallback: null });
};

/**
 * The production confirmation standing over one question, asked as the story
 * opens and again from the command's own control.
 */
export function DeleteConfirmationFixture({ kind }: { readonly kind: DeleteQuestionKind }) {
  const [deleteConfirmation] = useState(() => createDeleteConfirmation({ authoring: UNREPLACED }));
  const { command, words } = DELETE_QUESTIONS[kind];
  useEffect(() => ask(deleteConfirmation, words), [deleteConfirmation, words]);
  return (
    <div className="p-6">
      <Button variant="destructive" onClick={() => ask(deleteConfirmation, words)}>
        {command}
      </Button>
      <ArmedDeleteConfirmation deleteConfirmation={deleteConfirmation} />
    </div>
  );
}
