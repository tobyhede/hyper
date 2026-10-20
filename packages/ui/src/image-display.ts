import { createContext, useContext } from 'react';

/**
 * Where a picture is drawn from, given the URL its Image Resource owns.
 *
 * One resolver for a whole application, supplied at composition (ADR 0130).
 * A host that serves `/images/<id>` itself draws every URL as authored; a
 * mounted aggregate, which has no host behind it, draws a stored image from an
 * object URL over the bytes it read. The URL the Resource owns never changes,
 * so the failed-image state still names it.
 */
export type ImageDisplay = (url: string) => string;

/** Every URL drawn as authored: the resolver of a host that serves its stored images. */
export const displayImageAsAuthored: ImageDisplay = (url) => url;

const ImageDisplayContext = createContext<ImageDisplay>(displayImageAsAuthored);

export const ImageDisplayProvider = ImageDisplayContext.Provider;

/** The resolver the application supplied, or {@link displayImageAsAuthored} outside one. */
export const useImageDisplay = (): ImageDisplay => useContext(ImageDisplayContext);
