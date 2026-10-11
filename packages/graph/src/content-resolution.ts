import {
  contentTarget,
  mayBeTarget,
  referenceKind,
  spaceKind,
  markdownKind,
  imageKind,
  urKind,
  type ContentVia,
  type ResourceContent,
  type ResourceDocument,
  type UUID,
} from '@project/core';

/** No content: a Resource that is missing, or shows a Target it cannot reach. */
const UNRESOLVED: ResourceContent = { kind: 'unresolved', via: referenceKind.id };

function ownedContent(resource: ResourceDocument, via: ContentVia): ResourceContent {
  switch (resource.kind) {
    case referenceKind.id:
      return UNRESOLVED;
    case markdownKind.id:
      return markdownKind.resolveContent(resource.content, via);
    case imageKind.id:
      return imageKind.resolveContent(resource.content, via);
    case spaceKind.id:
      return spaceKind.resolveContent(resource.content, via);
    case urKind.id:
      return urKind.resolveContent(resource.content, via);
  }
}

/** Resolve content with at most one Target lookup, including refused dangling states. */
export function resolveDocumentContent(
  document: ResourceDocument | undefined,
  documentOf: (id: UUID) => ResourceDocument | undefined,
): ResourceContent {
  if (document === undefined) return UNRESOLVED;
  const targetId = contentTarget(document);
  if (targetId === undefined) return ownedContent(document, 'self');
  const target = documentOf(targetId);
  if (target === undefined || !mayBeTarget(target.kind)) return UNRESOLVED;
  return ownedContent(target, referenceKind.id);
}
