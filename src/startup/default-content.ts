import type { SpaceSnapshot, UUID } from '@project/core';
import { initializeSpace, parseCardFile } from '@project/graph';
import type { AggregateInput } from '../persistence/space-repository';

/**
 * The aggregate a repository is initialized from — ADR 0077's **Default
 * Content**, which is a release-fixture label rather than a domain entity.
 *
 * This is the seam and not yet the content. `.scratch/v1-release/issues/16`
 * owns the canonical generator — the concise examples of the V1 Card kinds ADR
 * 0077 describes, shared with the CLI hard reset — and replaces the body of
 * this one function when it lands. Until then a repository starts from the
 * ordinary new Space (ADR 0018), named as Meta so that first initialization
 * already goes through the one lifecycle operation rather than through a
 * second Space-creation path.
 *
 * It mints ordinary authored state: nothing here is protected, repaired or
 * added again once a repository is initialized.
 */
export const defaultContentAggregate = (newId: () => UUID): AggregateInput => {
  const minted = initializeSpace({ title: 'Card 1', newId });
  const cards = minted.cardFiles.map((file) => {
    const parsed = parseCardFile(file);
    if (!parsed.ok) throw new Error(parsed.errors.map(({ message }) => message).join('\n'));
    const { id, ...document } = parsed.card;
    return { id, document };
  });
  const { id, ...document } = minted.file;
  const meta: SpaceSnapshot = { id, document: { ...document, title: 'New space' }, cards };
  return { metaSpaceId: meta.id, spaces: [meta] };
};
