import type { Card } from '@project/core';
import type { CardChoice } from '@project/ui';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { EdgeEligibility } from './space-authoring';

/**
 * One Card as an Edge picker offers it: its identity, and why it cannot be taken.
 *
 * The **one** place an eligibility answer becomes a row. Keyboard connection and
 * endpoint editing each ask a different proposal of the same query and then need
 * the identical translation, and it was written out twice — so a refused Card
 * could have been dropped from one list and disabled in the other without
 * anything failing.
 *
 * A refused Card keeps its place, disabled, with its reason on the row. Filtering
 * it out leaves an author searching for a Card the list simply does not show.
 */
export const cardChoiceOf = (card: Card, eligibility: EdgeEligibility): CardChoice =>
  eligibility.kind === 'refused'
    ? {
        id: card.id,
        title: card.title,
        kind: card.kind,
        refusal: describeAuthoringRefusal(eligibility.refusal),
      }
    : { id: card.id, title: card.title, kind: card.kind };
