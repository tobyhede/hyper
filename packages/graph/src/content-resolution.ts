import {
  urKind,
  type ContentVia,
  type ResourceContent,
  type ResourceDocument,
  type UUID,
} from '@project/core';

/** A Resource that owns its content: every kind but a Reference Resource. */
type ContentOwner = Exclude<ResourceDocument, { kind: 'reference' }>;

function ownedContent(resource: ContentOwner, via: ContentVia): ResourceContent {
  switch (resource.kind) {
    case 'markdown':
      return { kind: 'markdown', source: resource.content.source, via };
    case 'image':
      return { kind: 'image', url: resource.content.url, via };
    case 'space':
      return {
        kind: 'space',
        view: {
          spaceId: resource.content.spaceId,
          map: resource.content.map,
          graph: resource.content.graph,
          framing: resource.content.framing,
        },
        via,
      };
    case urKind.id:
      return urKind.resolveContent(resource.content, via);
  }
}

/** Resolve content with at most one Target lookup, including refused dangling states. */
export function resolveDocumentContent(
  document: ResourceDocument | undefined,
  documentOf: (id: UUID) => ResourceDocument | undefined,
): ResourceContent {
  if (document === undefined) return { kind: 'unresolved', via: 'reference' };
  if (document.kind !== 'reference') return ownedContent(document, 'self');
  const target = documentOf(document.content.target);
  if (target === undefined || target.kind === 'reference') {
    return { kind: 'unresolved', via: 'reference' };
  }
  return ownedContent(target, 'reference');
}
