import { uuidSchema } from '@project/core';
import { Application } from '#components/Application';
import { storyOpening, storySpaces } from './application';
import {
  authoredSnapshot,
  commandDockSnapshot,
  deepDiveSnapshot,
  designSystemSnapshot,
  edgeToolbarSnapshot,
  metaSnapshot,
  platformSnapshot,
  spaceResourceDocument,
  traversalSnapshot,
} from './spaces';

/**
 * `'refused'` opens with a hide already refused on the untitled Edge, through
 * the production operation: no gesture can ask it, since the eye is disabled
 * there, but a toolbar drawn from a since-changed Space can.
 */
export type EdgeToolbarScenario = 'default' | 'refused';

/** The Meta Resource that references the fixture Space. */
const EDGES_REFERENCE = uuidSchema.parse('00000000-0000-4000-8000-00000000020e');

/** Open the Edge fixture Space through the real session owner. */
export async function openEdgeToolbarStory(scenario: EdgeToolbarScenario) {
  const meta = {
    ...metaSnapshot,
    resources: [
      ...metaSnapshot.resources,
      { id: EDGES_REFERENCE, document: spaceResourceDocument('Edges', edgeToolbarSnapshot) },
    ],
  };
  const spaces = storySpaces(meta.id, [
    meta,
    platformSnapshot,
    designSystemSnapshot,
    commandDockSnapshot,
    authoredSnapshot,
    traversalSnapshot,
    deepDiveSnapshot,
    edgeToolbarSnapshot,
  ]);
  const opened = await spaces.open(edgeToolbarSnapshot.id);
  if (scenario === 'refused') {
    const stored = edgeToolbarSnapshot.document;
    const map = stored.maps?.find((candidate) => candidate.id === stored.defaultMap);
    const graph =
      map?.graphs.find((candidate) => candidate.id === map.activeGraph) ?? map?.graphs[0];
    const untitled = graph?.edges.find((edge) => edge.title === undefined);
    if (graph === undefined || untitled === undefined) {
      throw new Error('The Edge fixture holds no untitled Active Graph Edge.');
    }
    // Asked once the Edges are drawn: opening the Map resets the selection,
    // which clears any toolbar refusal made under it.
    const ask = () =>
      opened.app.edgeAuthoring.setTitleHidden({ graphId: graph.id, edge: untitled }, true);
    const observer = new MutationObserver(() => {
      if (document.querySelector('.react-flow__edge[tabindex]') === null) return;
      observer.disconnect();
      ask();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  return storyOpening(spaces, opened);
}

/** Fixture setup only; Application owns startup, commands and rendering. */
export function EdgeToolbarFixture({
  scenario = 'default',
}: {
  readonly scenario?: EdgeToolbarScenario;
}) {
  return <Application resolve={() => openEdgeToolbarStory(scenario)} />;
}
