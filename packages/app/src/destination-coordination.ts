import type { CardId, SpaceSnapshot } from '@project/core';
import { resolveProductDestinationInSnapshot, type ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import { destinationOpening, type DestinationOpening } from './destination-opening';
import { resolveLayout } from './layout-resolution';
import { openingGraphId, type NavigationAddress } from './navigation';

export type DestinationRestoration =
  | { readonly kind: 'opening'; readonly opening: DestinationOpening }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ignored' };

/** Resolve one browser location into the complete application opening it names. */
export function destinationRestoration(
  space: Space,
  snapshot: SpaceSnapshot,
  pathname: string,
): DestinationRestoration {
  const resolution = resolveProductDestinationInSnapshot(snapshot, pathname);
  if (resolution.kind === 'unresolved') return { kind: 'not-found' };
  if (resolution.kind !== 'resolved') return { kind: 'ignored' };
  return { kind: 'opening', opening: destinationOpening(space, resolution.destination) };
}

/**
 * What the browser should do about the position the application is at.
 *
 * Three outcomes, and the third is the new one (ADR 0081): before this, every
 * path either pushed or replaced, because each of the five sites that decided
 * knew only that the field it had passed differed. Comparing the position
 * against the location makes "the browser is already showing this" sayable, and
 * that is what lets `popstate` move Navigation without the move pushing an entry
 * over the one the browser just navigated to.
 */
export type DestinationSync =
  | { readonly kind: 'none' }
  | { readonly kind: 'push'; readonly destination: ProductDestination }
  | { readonly kind: 'replace'; readonly destination: ProductDestination };

/**
 * Everything one sync decision is taken from. Pure: no `window`, no History
 * API, and no state of its own — the caller holds the address it last synced to
 * and passes it back in.
 */
export interface DestinationSyncInput {
  readonly space: Space;
  readonly snapshot: SpaceSnapshot;
  /** The browser location as it stands now, read by the caller. */
  readonly pathname: string;
  /** The position the application is at now. */
  readonly position: AddressedPosition;
  /**
   * The address the browser was last synced to. An address and not a position,
   * because only the address decides push from replace — a caller holding a
   * whole position passes it and the extra field is simply not read.
   */
  readonly synced: NavigationAddress;
}

/**
 * The complete position a browser location shows: the address, plus the Card
 * the location addresses within it.
 *
 * It **extends** the address rather than restating its three fields, and the
 * Card arrives inside it rather than beside it. Both were separate once and
 * both cost the same thing: a caller could hand `destinationSync` an address
 * already carrying a Card and a second Card argument that disagreed with it,
 * and structural typing had nothing to say — the spread that built the position
 * silently preferred the loose one while the `synced` comparison had seen the
 * other. One value cannot disagree with itself.
 *
 * The addressed Card is `app`'s and not Navigation's (ADR 0081): it is read
 * from a URL and never written back, so it belongs to the position the browser
 * is showing without belonging to the address that decides push from replace.
 */
export interface AddressedPosition extends NavigationAddress {
  readonly addressedCardId: CardId | null;
}

const sameAddress = (one: NavigationAddress, other: NavigationAddress): boolean =>
  one.selectedLayoutId === other.selectedLayoutId &&
  one.activeGraphId === other.activeGraphId &&
  one.presentingCardId === other.presentingCardId;

/**
 * Whether two positions are the same one.
 *
 * Exported because App holds the position it last decided about and must not
 * decide about it twice — which is what keeps mount, and StrictMode's second
 * invocation of the same effect, from writing history at all.
 */
export const samePosition = (one: AddressedPosition, other: AddressedPosition): boolean =>
  sameAddress(one, other) && one.addressedCardId === other.addressedCardId;

/**
 * The position an opening puts the application in, decided the way
 * `installDestinationOpening` decides it.
 *
 * A location that names no Graph does not leave the Active Graph unknown: it
 * opens whatever its Layout opens on, which is Navigation's own
 * {@link openingGraphId} rather than a second answer written here.
 */
function openingPosition(space: Space, opening: DestinationOpening): AddressedPosition {
  return {
    selectedLayoutId: opening.selection,
    activeGraphId: opening.graphId ?? openingGraphId(resolveLayout(space, opening.selection)),
    presentingCardId: opening.presentationCardId,
    addressedCardId: opening.cardId,
  };
}

/**
 * The destination that names a position, no more specifically than it has to.
 *
 * Three kinds are writable and a Card destination is not one of them, in either
 * spelling. A Card address is something the application *arrives at* — read off
 * a location and held in `addressedCardId` until a choice clears it — and never
 * something it moves to, so writing one would answer a URL no operation asked
 * for: the canonical spelling silently narrowed into its contextual form, the
 * Active Graph dropped out of the address it names nothing of, and, for a Card
 * the Layout omits, a location this Space's own resolver refuses. The Card
 * still decides {@link samePosition}, which is how a restored Card location is
 * recognised as already open.
 *
 * Two rules decide whether the URL names the Active Graph. It must, when the
 * Layout would open on some other Graph — a Layout URL that reopens a
 * different Graph does not name this position at all. It also keeps naming one
 * the location already named in this same Layout: leaving a presentation
 * returns to the Graph the presentation URL spelled out, and widening it to the
 * bare Layout would throw away specificity the reader is holding. That
 * second rule is the surviving half of `adoptedLayoutDestination` — do not
 * widen a URL that already names something inside this Layout.
 */
function positionDestination(
  space: Space,
  position: AddressedPosition,
  opening: DestinationOpening | null,
): ProductDestination {
  const spaceId = space.id;
  const { selectedLayoutId, activeGraphId, presentingCardId } = position;
  if (presentingCardId !== null && activeGraphId !== null) {
    return {
      kind: 'presentation',
      spaceId,
      layoutId: selectedLayoutId,
      graphId: activeGraphId,
      cardId: presentingCardId,
    };
  }
  const namesGraph =
    opening !== null && opening.selection === selectedLayoutId && opening.graphId !== null;
  if (
    activeGraphId !== null &&
    (namesGraph || activeGraphId !== openingGraphId(resolveLayout(space, selectedLayoutId)))
  ) {
    return {
      kind: 'layout-graph',
      spaceId,
      layoutId: selectedLayoutId,
      graphId: activeGraphId,
    };
  }
  return { kind: 'layout', spaceId, layoutId: selectedLayoutId };
}

/**
 * Decide what the browser should do about the position the application is at.
 *
 * The order is the rule, read top to bottom: a location that already opens this
 * exact position needs nothing; an address that has moved earns a history entry;
 * an address that has not, over a location that is narrower or stale, is
 * corrected in place. A location outside product addressing is left alone —
 * the application did not write it, it names no position to be wrong about, and
 * rewriting it on arrival would take an entry the reader never asked for.
 */
export function destinationSync({
  space,
  snapshot,
  pathname,
  position,
  synced,
}: DestinationSyncInput): DestinationSync {
  const restoration = destinationRestoration(space, snapshot, pathname);
  const opening = restoration.kind === 'opening' ? restoration.opening : null;
  if (opening !== null && samePosition(openingPosition(space, opening), position)) {
    return { kind: 'none' };
  }
  const destination = positionDestination(space, position, opening);
  if (!sameAddress(position, synced)) return { kind: 'push', destination };
  if (restoration.kind === 'ignored') return { kind: 'none' };
  return { kind: 'replace', destination };
}
