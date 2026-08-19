import type { AuthoringRefusal } from './space-authoring';

const unreachable = (value: never): never => {
  throw new Error(`Unknown Authoring refusal: ${JSON.stringify(value)}`);
};

/** Application-owned copy for a stable Authoring refusal identity. */
export const describeAuthoringRefusal = (refusal: AuthoringRefusal): string => {
  switch (refusal.code) {
    case 'arrangement-pending':
      return 'This view has not finished arranging, so there is nowhere to write yet.';
    case 'layout-not-found':
      return 'This Layout is no longer part of the Space.';
    case 'layout-required':
      if (refusal.operation === 'added-card-to-layout')
        return 'Select a Layout to add an existing Card to it.';
      if (refusal.operation === 'removed-card-from-layout')
        return 'Select a Layout to remove a Card from it.';
      if (
        refusal.operation === 'renamed-graph' ||
        refusal.operation === 'recolored-graph' ||
        refusal.operation === 'deleted-graph'
      )
        return 'Select a Layout to manage its Graphs.';
      return 'Select a Layout to edit its Edges.';
    case 'card-not-found':
      return 'This Card is no longer part of the Space.';
    case 'card-kind-immutable':
      return 'A Card keeps the kind it was created with.';
    case 'card-title-required':
      return 'A Card title is required.';
    case 'alias-target-not-found':
      return 'That Target is no longer part of the Space.';
    case 'alias-target-must-own-content':
      return 'An Alias must target a Card that owns its content.';
    case 'card-already-in-layout':
      return 'This Card is already in this Layout.';
    case 'card-not-in-layout':
      return 'This Card is not in this Layout.';
    case 'card-has-aliases':
      return `Retarget or delete the Aliases of this Card first: ${refusal.aliases.map((alias) => alias.title).join(', ')}.`;
    case 'graph-title-required':
      return 'A Graph title is required.';
    case 'layout-must-keep-graph':
      return 'A Layout keeps at least one Graph.';
    case 'graph-not-owned':
      return 'That Graph is not one this Layout owns.';
    case 'edge-not-found':
      return 'That Edge is no longer in this Graph.';
    case 'edge-card-outside-layout':
      return 'An Edge can only join Cards in this Layout.';
    case 'edge-already-exists':
      return 'These Cards are already connected in this Graph.';
    case 'layout-active-graph-required':
      return 'This Layout has no active Graph for the connection to join.';
    default:
      return unreachable(refusal);
  }
};
