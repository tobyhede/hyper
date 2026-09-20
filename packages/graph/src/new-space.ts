import { SPACE_FILE_VERSION, type Resource, type SpaceFile, type UUID } from '@project/core';
import { serializeResourceFile, type ResourceFile } from './resource-file';

/**
 * A new Space: one Resource in one complete default Map (ADRs 0018 and 0080).
 *
 * The default when there is nothing else to open — not the fixture, which is a
 * purpose-shaped test bed, and not an empty canvas, which offers no gesture a
 * way in and reads as a failure state. One resource is the smallest resource that is
 * already a space rather than a promise of one.
 *
 * Returned as the **on-disk shape** — a space file and its resource files — rather
 * than as a `Space`. That is what a writer emits and what `loadSpace` takes, so
 * a minted space goes down exactly the path an authored one does, with no second
 * graph into the domain (ADR 0010).
 */
export interface NewSpace {
  readonly file: SpaceFile;
  readonly resourceFiles: readonly ResourceFile[];
}

/** The first neutral Resource title; later creation continues the same sequence. */
const FIRST_RESOURCE_TITLE = 'Resource 1';

/** The Space title an unnamed new Space takes until an Edit renames it. */
const NEW_SPACE_TITLE = 'New space';

/** Inputs to the one normal-Space initializer used by every provisioning path. */
export interface InitializeSpaceOptions {
  /** Names the **Space**; its first Resource takes the neutral `Resource 1` instead. */
  readonly title: string;
  /**
   * The composition-owned identity source. A complete new Space needs four:
   * the Space, its first Resource, its default Map and that Map's Graph.
   */
  readonly newId: () => UUID;
}

/**
 * Initialize a normal authored Space through the same on-disk intake as every
 * other Space.
 *
 * A normal Space begins complete: one Markdown Resource in its default authored
 * Map, with one empty Active Graph. Meta bootstrap, ordinary startup and
 * Space Resource creation share this shape.
 *
 * The supplied title names the **Space** and nothing else. Its first Resource takes
 * the same neutral `Resource 1` {@link newSpace} mints, because the two are separate
 * resources from the moment they exist: creating a Space Resource seeds the Resource, the
 * Space and that first Resource from one typed title, and titling the content after
 * the Space it lives in only reads as deliberate until the first rename makes
 * the pair disagree.
 */
export function initializeSpace({ title, newId }: InitializeSpaceOptions): NewSpace {
  const spaceId = newId();
  const resourceId = newId();
  const mapId = newId();
  const graphId = newId();
  const resource: Resource = {
    id: resourceId,
    title: FIRST_RESOURCE_TITLE,
    kind: 'markdown',
    body: '',
  };

  return {
    file: {
      version: SPACE_FILE_VERSION,
      id: spaceId,
      title,
      maps: [
        {
          id: mapId,
          title: 'Map 1',
          kind: 'positioned',
          positions: { [resourceId]: { x: 0, y: 0, open: false } },
          graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
          activeGraph: graphId,
        },
      ],
      defaultMap: mapId,
    },
    resourceFiles: [{ path: `resources/${resource.id}.md`, text: serializeResourceFile(resource) }],
  };
}

/**
 * The default new Space: `Resource 1` in `New space`.
 *
 * It takes `newId` for the same reason {@link initializeSpace} does (ADR 0016)
 * — the four identities it mints are the caller's to control — and because
 * closing over the ambient generator is what made `defaultContentAggregate`
 * transcribe this function rather than call it. It calls it now, so the
 * starting state has one definition rather than two that agree by inspection.
 */
export function newSpace(newId: () => UUID): NewSpace {
  return initializeSpace({ title: NEW_SPACE_TITLE, newId });
}
