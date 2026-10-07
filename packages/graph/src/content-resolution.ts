import type { ContentVia, ResourceContent, ResourceDocument, UUID } from '@project/core';

/** A Resource that owns its content: every kind but a Reference Resource. */
type ContentOwner = Exclude<ResourceDocument, { kind: 'reference' }>;

function ownedContent(resource: ContentOwner, via: ContentVia): ResourceContent {
  switch (resource.kind) {
    case 'markdown':
      return { kind: 'markdown', source: resource.body, via };
    case 'image':
      return { kind: 'image', url: resource.url, via };
    case 'space':
      return {
        kind: 'space',
        view: {
          spaceId: resource.spaceId,
          map: resource.map,
          graph: resource.graph,
          framing: resource.framing,
        },
        via,
      };
    case 'ur':
      return { kind: 'ur', via };
  }
}

/** Resolve content with at most one Target lookup, including refused dangling states. */
export function resolveDocumentContent(
  document: ResourceDocument | undefined,
  documentOf: (id: UUID) => ResourceDocument | undefined,
): ResourceContent {
  if (document === undefined) return { kind: 'unresolved', via: 'reference' };
  if (document.kind !== 'reference') return ownedContent(document, 'self');
  const target = documentOf(document.target);
  if (target === undefined || target.kind === 'reference') {
    return { kind: 'unresolved', via: 'reference' };
  }
  return ownedContent(target, 'reference');
}
