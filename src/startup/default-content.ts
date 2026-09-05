import type { SpaceSnapshot, UUID } from '@project/core';
import { newSpace, parseCardFile } from '@project/graph';
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
 * `newSpace` is *called* rather than transcribed: writing the same two titles
 * out again made a second definition of the starting state, so renaming the
 * seed Card moved every other provisioning path and left a freshly initialized
 * repository behind. All this adds is the on-disk-to-stored translation, which
 * is a shape difference and not a content decision.
 *
 * It mints ordinary authored state: nothing here is protected, repaired or
 * added again once a repository is initialized.
 */
export const defaultContentAggregate = (newId: () => UUID): AggregateInput => {
  const minted = newSpace(newId);
  const cards = minted.cardFiles.map((file) => {
    const parsed = parseCardFile(file);
    if (!parsed.ok) throw new Error(parsed.errors.map(({ message }) => message).join('\n'));
    const { id, ...document } = parsed.card;
    return { id, document };
  });
  const { id, ...document } = minted.file;
  const meta: SpaceSnapshot = { id, document, cards };
  return { metaSpaceId: meta.id, spaces: [meta] };
};
