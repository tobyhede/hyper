import type { UUID } from '@project/core';
import {
  AggregateDirectoryError,
  createSpaceHost,
  describeAggregateRefusal,
  MemorySpaceRepository,
  readAggregateFrom,
  type AggregateReadRefusal,
  type AggregateSource,
  type SpaceHostApplication,
} from '@project/aggregate';
import { HttpSpaceBackend } from '@project/http';
import { IMAGE_COLLECTION_PATH, isImageId } from '@project/persistence';
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
 *
 * Every Edit is committed to that repository and lives as long as the page
 * (ADR 0131): nothing is kept in browser storage and nothing is written back
 * to GitHub, so a reload mounts the talk as it was committed.
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
  /** Draws each image the in-page store holds from an object URL over its bytes. */
  readonly displayImage: ImageDisplay;
}

/**
 * Why the files did not mount, in the two outcomes `pnpm cube run` reports,
 * worded by `describeAggregateReadRefusal` as the CLI words them.
 */
export type MountRefusal = AggregateReadRefusal;

export type MountResult =
  | { readonly ok: true; readonly mounted: MountedAggregate }
  | { readonly ok: false; readonly refusal: MountRefusal };

/**
 * The origin the in-page requests are addressed to. `.invalid` is reserved
 * (RFC 6761), so nothing addressed there could ever reach a network.
 */
const IN_PAGE_ORIGIN = 'https://mounted.invalid';

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
 * The Space host's HTTP application, answering in the page.
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
    const answer = Promise.resolve(host.fetch(request));
    return await (signal == null ? answer : untilAborted(answer, signal));
  };

/**
 * Where each stored image the in-page store holds is drawn from: an object URL
 * over the store's own bytes, made the first time it is drawn and kept for the
 * page's life, as a stored image is (ADR 0106). Any other URL is drawn as
 * authored, so a stored image the store holds no bytes for draws as a picture
 * that will not load.
 */
const objectUrlDisplay = (
  repository: MemorySpaceRepository,
  createObjectUrl: (image: Blob) => string,
): ImageDisplay => {
  const prefix = `${IMAGE_COLLECTION_PATH}/`;
  const made = new Map<string, string>();
  return (url) => {
    const id = url.startsWith(prefix) ? url.slice(prefix.length) : '';
    const image = isImageId(id) ? repository.heldImage(id) : undefined;
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
      displayImage: objectUrlDisplay(repository, createObjectUrl),
    },
  };
};
