import type { Manifest } from '@project/core';

export type ReferenceErrorKind =
  | 'duplicate-card-id'
  | 'duplicate-path-id'
  | 'unresolved-edge-source'
  | 'unresolved-edge-target'
  | 'unresolved-path-step';

export interface ReferenceError {
  kind: ReferenceErrorKind;
  /** The id that failed to resolve or was duplicated. */
  ref: string;
  /** Human-readable description, useful for surfacing in the UI or CLI. */
  message: string;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/**
 * Check every cross-reference in the manifest resolves. Returns an empty array
 * when the graph is internally consistent.
 */
export function validateReferences(manifest: Manifest): ReferenceError[] {
  const errors: ReferenceError[] = [];

  const cardIds = new Set(manifest.cards.map((c) => c.id));

  for (const id of duplicates(manifest.cards.map((c) => c.id))) {
    errors.push({ kind: 'duplicate-card-id', ref: id, message: `Duplicate card id "${id}"` });
  }
  for (const id of duplicates(manifest.paths.map((p) => p.id))) {
    errors.push({ kind: 'duplicate-path-id', ref: id, message: `Duplicate path id "${id}"` });
  }

  for (const edge of manifest.edges) {
    if (!cardIds.has(edge.source)) {
      errors.push({
        kind: 'unresolved-edge-source',
        ref: edge.source,
        message: `Edge "${edge.id}" references missing source card "${edge.source}"`,
      });
    }
    if (!cardIds.has(edge.target)) {
      errors.push({
        kind: 'unresolved-edge-target',
        ref: edge.target,
        message: `Edge "${edge.id}" references missing target card "${edge.target}"`,
      });
    }
  }

  for (const path of manifest.paths) {
    path.steps.forEach((step, index) => {
      if (!cardIds.has(step.target)) {
        errors.push({
          kind: 'unresolved-path-step',
          ref: step.target,
          message: `Path "${path.id}" step ${index} references missing card "${step.target}"`,
        });
      }
    });
  }

  return errors;
}

export function isValidGraph(manifest: Manifest): boolean {
  return validateReferences(manifest).length === 0;
}
