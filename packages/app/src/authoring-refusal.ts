import type { AuthoringRefusal } from './space-authoring';

const unreachable = (value: never): never => {
  throw new Error(`Unknown Authoring refusal: ${JSON.stringify(value)}`);
};

/** Application-owned copy for a stable Authoring refusal identity. */
export const describeAuthoringRefusal = (refusal: AuthoringRefusal): string => {
  switch (refusal.code) {
    case 'placement-pending':
      return 'This view has not finished placing its Cards, so there is nowhere to write yet.';
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
      return `Retarget or delete the Aliases of this Card first: ${refusal.aliasTitles.join(', ')}.`;
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

type AuthoringRefusalCode = AuthoringRefusal['code'];

type AuthoringRefusalErrors<Field extends string> = {
  readonly fields: Partial<Readonly<Record<Field, string>>>;
  readonly form?: string;
};

const presentRefusal = <Field extends string>(
  refusal: AuthoringRefusal,
  placements: Readonly<Record<AuthoringRefusalCode, Field | null>>,
): AuthoringRefusalErrors<Field> => {
  const message = describeAuthoringRefusal(refusal);
  const field = placements[refusal.code];
  if (field === null) return { fields: {}, form: message };
  const fields: Partial<Record<Field, string>> = {};
  fields[field] = message;
  return { fields };
};

const form = null;

const markdownCardPlacements = {
  'placement-pending': form,
  'layout-not-found': form,
  'layout-required': form,
  'card-not-found': form,
  'card-kind-immutable': form,
  'card-title-required': 'title',
  'alias-target-not-found': form,
  'alias-target-must-own-content': form,
  'card-already-in-layout': form,
  'card-not-in-layout': form,
  'card-has-aliases': form,
  'graph-title-required': form,
  'layout-must-keep-graph': form,
  'graph-not-owned': form,
  'edge-not-found': form,
  'edge-card-outside-layout': form,
  'edge-already-exists': form,
  'layout-active-graph-required': form,
} as const satisfies Readonly<Record<AuthoringRefusalCode, 'title' | null>>;

const aliasCardPlacements = {
  'placement-pending': form,
  'layout-not-found': form,
  'layout-required': form,
  'card-not-found': form,
  'card-kind-immutable': form,
  'card-title-required': 'title',
  'alias-target-not-found': 'target',
  'alias-target-must-own-content': 'target',
  'card-already-in-layout': form,
  'card-not-in-layout': form,
  'card-has-aliases': form,
  'graph-title-required': form,
  'layout-must-keep-graph': form,
  'graph-not-owned': form,
  'edge-not-found': form,
  'edge-card-outside-layout': form,
  'edge-already-exists': form,
  'layout-active-graph-required': form,
} as const satisfies Readonly<Record<AuthoringRefusalCode, 'title' | 'target' | null>>;

const newAliasPlacements = {
  'placement-pending': form,
  'layout-not-found': form,
  'layout-required': form,
  'card-not-found': form,
  'card-kind-immutable': form,
  'card-title-required': 'title',
  'alias-target-not-found': 'target',
  'alias-target-must-own-content': 'target',
  'card-already-in-layout': form,
  'card-not-in-layout': form,
  'card-has-aliases': form,
  'graph-title-required': form,
  'layout-must-keep-graph': form,
  'graph-not-owned': form,
  'edge-not-found': form,
  'edge-card-outside-layout': form,
  'edge-already-exists': form,
  'layout-active-graph-required': form,
} as const satisfies Readonly<Record<AuthoringRefusalCode, 'title' | 'target' | null>>;

export type MarkdownCardRefusalErrors = AuthoringRefusalErrors<'title'>;
export type AliasCardRefusalErrors = AuthoringRefusalErrors<'title' | 'target'>;
export type NewAliasRefusalErrors = AuthoringRefusalErrors<'title' | 'target'>;

/** Error placement for a Markdown Card editor, which owns only Title. */
export const presentMarkdownCardRefusal = (refusal: AuthoringRefusal): MarkdownCardRefusalErrors =>
  presentRefusal(refusal, markdownCardPlacements);

/** Error placement for an Alias editor, which owns Title and Target. */
export const presentAliasCardRefusal = (refusal: AuthoringRefusal): AliasCardRefusalErrors =>
  presentRefusal(refusal, aliasCardPlacements);

/** Error placement for Alias creation, which owns Title and Target. */
export const presentNewAliasRefusal = (refusal: AuthoringRefusal): NewAliasRefusalErrors =>
  presentRefusal(refusal, newAliasPlacements);
