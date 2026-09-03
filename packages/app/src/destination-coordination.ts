import type { CardId, GraphId, SpaceSnapshot } from '@project/core';
import { resolveProductDestinationInSnapshot, type ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import { destinationOpening, type DestinationOpening } from './destination-opening';
import { openingGraphId, type NavigationAddress } from './navigation';
import type { CanvasRendererId, ResolveRenderer } from './renderer';

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
  readonly resolveRenderer: ResolveRenderer;
  readonly address: NavigationAddress;
  /**
   * The Card the location addresses, which is `app`'s and not Navigation's
   * (ADR 0081): it is read from a URL and never written back, so it belongs to
   * the position the browser is showing without belonging to the address that
   * decides push from replace.
   */
  readonly addressedCardId: CardId | null;
  /** The address the browser was last synced to. */
  readonly synced: NavigationAddress;
}

/**
 * The complete position a browser location shows: the address, plus the Card
 * the location addresses within it.
 */
export interface AddressedPosition {
  readonly selectedRenderer: CanvasRendererId;
  readonly activeGraphId: GraphId | null;
  readonly presentingCardId: CardId | null;
  readonly addressedCardId: CardId | null;
}

const sameAddress = (one: NavigationAddress, other: NavigationAddress): boolean =>
  one.selectedRenderer === other.selectedRenderer &&
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
  one.selectedRenderer === other.selectedRenderer &&
  one.activeGraphId === other.activeGraphId &&
  one.presentingCardId === other.presentingCardId &&
  one.addressedCardId === other.addressedCardId;

/**
 * The position an opening puts the application in, decided the way
 * `installDestinationOpening` decides it.
 *
 * A location that names no Graph does not leave the Active Graph unknown: it
 * opens whatever its renderer opens on, which is Navigation's own
 * {@link openingGraphId} rather than a second answer written here.
 */
function openingPosition(
  space: Space,
  resolveRenderer: ResolveRenderer,
  opening: DestinationOpening,
): AddressedPosition {
  return {
    selectedRenderer: opening.selection,
    activeGraphId: opening.graphId ?? openingGraphId(resolveRenderer(space, opening.selection)),
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
 * the Space View omits, a location this Space's own resolver refuses. The Card
 * still decides {@link samePosition}, which is how a restored Card location is
 * recognised as already open.
 *
 * Two rules decide whether the URL names the Active Graph. It must, when the
 * renderer would open on some other Graph — a Space View URL that reopens a
 * different Graph does not name this position at all. It also keeps naming one
 * the location already named in this same Space View: leaving a presentation
 * returns to the Graph the presentation URL spelled out, and widening it to the
 * bare Space View would throw away specificity the reader is holding. That
 * second rule is the surviving half of `adoptedRendererDestination` — do not
 * widen a URL that already names something inside this Space View.
 */
function positionDestination(
  space: Space,
  resolveRenderer: ResolveRenderer,
  position: AddressedPosition,
  opening: DestinationOpening | null,
): ProductDestination {
  const spaceId = space.id;
  const { selectedRenderer, activeGraphId, presentingCardId } = position;
  if (presentingCardId !== null && activeGraphId !== null) {
    return {
      kind: 'presentation',
      spaceId,
      spaceViewId: selectedRenderer,
      graphId: activeGraphId,
      cardId: presentingCardId,
    };
  }
  const namesGraph =
    opening !== null && opening.selection === selectedRenderer && opening.graphId !== null;
  if (
    activeGraphId !== null &&
    (namesGraph || activeGraphId !== openingGraphId(resolveRenderer(space, selectedRenderer)))
  ) {
    return {
      kind: 'space-view-graph',
      spaceId,
      spaceViewId: selectedRenderer,
      graphId: activeGraphId,
    };
  }
  return { kind: 'space-view', spaceId, spaceViewId: selectedRenderer };
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
  resolveRenderer,
  address,
  addressedCardId,
  synced,
}: DestinationSyncInput): DestinationSync {
  const restoration = destinationRestoration(space, snapshot, pathname);
  const opening = restoration.kind === 'opening' ? restoration.opening : null;
  const position: AddressedPosition = { ...address, addressedCardId };
  if (
    opening !== null &&
    samePosition(openingPosition(space, resolveRenderer, opening), position)
  ) {
    return { kind: 'none' };
  }
  const destination = positionDestination(space, resolveRenderer, position, opening);
  if (!sameAddress(address, synced)) return { kind: 'push', destination };
  if (restoration.kind === 'ignored') return { kind: 'none' };
  return { kind: 'replace', destination };
}
