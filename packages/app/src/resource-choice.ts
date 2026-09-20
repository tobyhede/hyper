import type { Resource } from '@project/core';
import type { ResourceChoice } from '@project/ui';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { EdgeEligibility } from './space-authoring';

/**
 * One Resource as an Edge picker offers it: its identity, and why it cannot be taken.
 *
 * The **one** place an eligibility answer becomes a row. Keyboard connection and
 * endpoint editing each ask a different proposal of the same query and then need
 * the identical translation, and it was written out twice — so a refused Resource
 * could have been dropped from one list and disabled in the other without
 * anything failing.
 *
 * A refused Resource keeps its place, disabled, with its reason on the row. Filtering
 * it out leaves an author searching for a Resource the list simply does not show.
 */
export const resourceChoiceOf = (
  resource: Resource,
  eligibility: EdgeEligibility,
): ResourceChoice =>
  eligibility.kind === 'refused'
    ? {
        id: resource.id,
        title: resource.title,
        kind: resource.kind,
        refusal: describeAuthoringRefusal(eligibility.refusal),
      }
    : { id: resource.id, title: resource.title, kind: resource.kind };
