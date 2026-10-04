import type { ResourceId, MapPosition } from '@project/core';
import type { ResourcePlacementCommands } from './resource-placement';
import type { Edge, NodeChange } from '@xyflow/react';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { GraphAppearance } from '@project/ui';
import type { EmbeddedPublicationSnapshot } from './embedded-open-space-resource';
import type { OpenSpace } from './open-spaces';
import type { MapSurface } from './map-surface';
import type { CanvasResourceAuthoring } from './canvas-resource-authoring';
import type { EdgeAuthoringSurface } from './edge-authoring-react';
import type { AuthoringAvailability } from './authoring-availability';

/**
 * The live publication an embedding writes: the discovery snapshot plus the
 * authoring operations the host canvas spends.
 */
export interface EmbeddedPublication extends EmbeddedPublicationSnapshot {
  readonly clipboardFailure: DrawnClipboardFailure | null;
  readonly entry: OpenSpace;
  readonly placement: ResourcePlacementCommands;
  readonly toAuthored: (point: MapPosition) => MapPosition;
  readonly surface: MapSurface;
  readonly edgeSurface: EdgeAuthoringSurface;
  readonly availability: AuthoringAvailability;
  readonly openResource: CanvasResourceAuthoring['openResource'];
  readonly beginTitleEditing: CanvasResourceAuthoring['beginTitleEditing'];
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly origin: { readonly x: number; readonly y: number };
  readonly edges: readonly Edge[];
  readonly changeNodes: (changes: NodeChange<ResourceFlowNode>[]) => void;
  readonly removeResource: (id: string) => string | null;
  readonly mayConnectResources: (from: ResourceId, to: ResourceId) => boolean;
  /** How a connection between this embedding's Resources is previewed: as the Graph it joins. */
  readonly connectionAppearance: () => GraphAppearance;
}

/** A failed address copy drawn by an occurrence, named in the containing shell. */
export interface DrawnClipboardFailure {
  readonly occurrence: string;
  readonly title: string;
  readonly message: string;
  readonly dismiss: () => void;
}
