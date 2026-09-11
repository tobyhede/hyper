import type { Thing } from '@project/core';
import type { ThingChoice } from '@project/ui';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { EdgeEligibility } from './space-authoring';

/**
 * One Thing as an Edge picker offers it: its identity, and why it cannot be taken.
 *
 * The **one** place an eligibility answer becomes a row. Keyboard connection and
 * endpoint editing each ask a different proposal of the same query and then need
 * the identical translation, and it was written out twice — so a refused Thing
 * could have been dropped from one list and disabled in the other without
 * anything failing.
 *
 * A refused Thing keeps its place, disabled, with its reason on the row. Filtering
 * it out leaves an author searching for a Thing the list simply does not show.
 */
export const thingChoiceOf = (thing: Thing, eligibility: EdgeEligibility): ThingChoice =>
  eligibility.kind === 'refused'
    ? {
        id: thing.id,
        title: thing.title,
        kind: thing.kind,
        refusal: describeAuthoringRefusal(eligibility.refusal),
      }
    : { id: thing.id, title: thing.title, kind: thing.kind };
