import type { UUID } from '@project/core';
import {
  AggregateDirectoryError,
  createSpaceHost,
  describeAggregateRefusal,
  MemorySpaceRepository,
  readAggregateFrom,
  type AggregateSource,
  type SpaceHostApplication,
} from '@project/aggregate';
import { HttpSpaceBackend } from '@project/http';
import { encodeProblemDetails, imagePath, type StoredImage } from '@project/persistence';
import type { ImageDisplay } from '@project/ui';

/**
 * Mounting (ADR 0130): an Aggregate directory's files, read by the reader the
 * CLI uses and established in a store inside the page, which then answers the
 * application's own HTTP API to it.
 *
 * This is the one composition in which the browser parses an aggregate and
 * reaches the aggregate lifecycle, both of which `editing-and-persistence.md`
 * otherwise keeps on the server. Nothing behind the backend it returns learns
 * it is in a page: the backend is the ordinary `HttpSpaceBackend`, and every
 * request it sends is answered by the Space host's own HTTP application over
 * an ordinary memory repository.
 */

/** What to mount: an Aggregate directory's source, and what the mount is composed with. */
export interface AggregateMount {
  /** Where the directory is read from, named in diagnostics as the CLI names the path it was given. */
  readonly source: AggregateSource;
  /** The identity source for anything the directory leaves out (ADR 0109). */
  readonly newId: () => UUID;
  /** Make an object URL over a picture's bytes: `URL.createObjectURL` in a page. */
  readonly createObjectUrl: (image: Blob) => string;
}

/** A mounted aggregate: what `createSpaceStartup` takes, and the Meta Space the root opens. */
export interface MountedAggregate {
  readonly metaSpaceId: UUID;
  /** The ordinary HTTP backend, whose requests the in-page application answers. */
  readonly backend: HttpSpaceBackend;
  /** Draws a stored image the directory carries from an object URL over its bytes. */
  readonly displayImage: ImageDisplay;
}

/**
 * Why the files did not mount, in the two outcomes `pnpm hyper run` reports:
 * files the reader could not read as an aggregate, or an aggregate Import's
 * intake refused. `diagnostics` are the CLI's own lines for each.
 */
export interface MountRefusal {
  readonly kind: 'unreadable' | 'aggregate-refused';
  readonly diagnostics: readonly string[];
}

export type MountResult =
  | { readonly ok: true; readonly mounted: MountedAggregate }
  | { readonly ok: false; readonly refusal: MountRefusal };

/** A refusal in the sentence the CLI's `describeRunRefusal` writes for the same outcome. */
export const describeMountRefusal = (refusal: MountRefusal, name: string): string => {
  switch (refusal.kind) {
    case 'unreadable':
      return `${name} is not an Aggregate directory:\n${refusal.diagnostics.join('\n')}`;
    case 'aggregate-refused':
      return `Aggregate validation failed:\n${refusal.diagnostics.join('\n')}`;
  }
};

/**
 * The origin the in-page requests are addressed to. `.invalid` is reserved
 * (RFC 6761), so nothing addressed there could ever reach a network.
 */
const IN_PAGE_ORIGIN = 'https://mounted.invalid';

/**
 * A mounted aggregate is read-only (ADR 0130), so the in-page application
 * answers every request that is not a read with `forbidden`, before the Space
 * host sees it: a Space commit and an image upload alike, and nothing is
 * stored.
 *
 * Refused here rather than in the repository, because the repository has to
 * accept the one write a read makes: the working-space loader establishes a
 * stored mapless Space's first Map on its first load (ADR 0079), and refusing
 * that would leave such a Space unopenable. That write stays inside the page.
 */
const refuseWrite = (): Response =>
  new Response(
    JSON.stringify(
      encodeProblemDetails('forbidden', 'This aggregate is mounted read-only; nothing is stored.'),
    ),
    {
      status: 403,
      headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
    },
  );

/**
 * `answer`, unless the signal aborts first: then a rejection carrying its
 * reason as the cause. The abort listener is removed once either settles, so
 * a signal shared across requests holds none for a request that has ended.
 */
const untilAborted = async <T>(answer: Promise<T>, signal: AbortSignal): Promise<T> => {
  const { promise: aborted, reject } = Promise.withResolvers<never>();
  const abort = (): void => {
    reject(new Error('The request was aborted.', { cause: signal.reason }));
  };
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  try {
    return await Promise.race([answer, aborted]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
};

/**
 * The Space host's HTTP application, answering in the page, refusing every
 * write.
 *
 * The caller's signal ends its wait rather than travelling on the request:
 * nothing in the host reads a request's signal, and a signal from another
 * realm than `Request` is refused outright (jsdom's, under Node's `Request`).
 */
const inPageFetch =
  (host: SpaceHostApplication): typeof globalThis.fetch =>
  async (input, init) => {
    const { signal, ...sent } = init ?? {};
    const request = new Request(input, sent);
    if (request.method !== 'GET' && request.method !== 'HEAD') return refuseWrite();
    const answer = Promise.resolve(host.fetch(request));
    return await (signal == null ? answer : untilAborted(answer, signal));
  };

/**
 * Where each stored image the directory carries is drawn from: an object URL
 * over its bytes, made the first time it is drawn and kept for the page's
 * life. Any other URL is drawn as authored, so a stored image the directory
 * carries no bytes for draws as a picture that will not load (ADR 0106).
 */
const objectUrlDisplay = (
  images: readonly StoredImage[],
  createObjectUrl: (image: Blob) => string,
): ImageDisplay => {
  const stored = new Map(images.map((image) => [imagePath(image.id), image]));
  const made = new Map<string, string>();
  return (url) => {
    const image = stored.get(url);
    if (image === undefined) return url;
    let objectUrl = made.get(url);
    if (objectUrl === undefined) {
      objectUrl = createObjectUrl(new Blob([image.bytes], { type: image.mediaType }));
      made.set(url, objectUrl);
    }
    return objectUrl;
  };
};

/**
 * Read an Aggregate directory from its source and establish a fresh in-page
 * store from it through the aggregate lifecycle, answering what browser
 * startup takes, or why the directory did not mount.
 *
 * Images first, as Import stores them (ADR 0118), so every stored image the
 * aggregate shows is there the moment the aggregate is.
 */
export const mountAggregate = async ({
  source,
  newId,
  createObjectUrl,
}: AggregateMount): Promise<MountResult> => {
  let contents;
  try {
    contents = await readAggregateFrom(source, newId);
  } catch (error) {
    if (!(error instanceof AggregateDirectoryError)) throw error;
    return { ok: false, refusal: { kind: 'unreadable', diagnostics: error.diagnostics } };
  }

  const repository = new MemorySpaceRepository();
  for (const image of contents.images) await repository.storeImage(image);
  const initialized = await repository.initializeAggregate({
    metaSpaceId: contents.metaSpaceId,
    spaces: contents.spaces,
  });
  if (initialized.kind === 'aggregate-refused') {
    return {
      ok: false,
      refusal: {
        kind: 'aggregate-refused',
        diagnostics: describeAggregateRefusal(initialized.errors, contents.spaces),
      },
    };
  }
  if (initialized.kind !== 'initialized') {
    throw new Error(`A fresh in-page store answered ${initialized.kind} to its first aggregate.`);
  }

  const host = createSpaceHost(repository, newId);
  return {
    ok: true,
    mounted: {
      metaSpaceId: contents.metaSpaceId,
      backend: new HttpSpaceBackend(IN_PAGE_ORIGIN, { fetch: inPageFetch(host) }),
      displayImage: objectUrlDisplay(contents.images, createObjectUrl),
    },
  };
};
