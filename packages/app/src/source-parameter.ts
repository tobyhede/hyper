/**
 * The `source` query parameter, which names a mounted page's GitHub location
 * (ADR 0130).
 *
 * Product URLs are unchanged by it: the browser location keeps it on every
 * product path it writes, with the rest of the current query and the hash, and
 * no destination resolver reads it, since they resolve the pathname alone
 * (`packages/app/test/browser-location.test.ts`, "the mounted source in the
 * address").
 */
const SOURCE_PARAMETER = 'source';

const nameOf = (pair: string): string => {
  const equals = pair.indexOf('=');
  return equals === -1 ? pair : pair.slice(0, equals);
};

/**
 * The `source` parameter of an absolute URL, or `null` when it has none.
 *
 * Read by hand rather than through `searchParams`, which decodes a `+` as a
 * space: a ref may hold a `+`, and a hand-typed link writes it bare.
 */
export const sourceParameter = (href: string): string | null => {
  for (const pair of new URL(href).search.slice(1).split('&')) {
    if (nameOf(pair) !== SOURCE_PARAMETER) continue;
    const equals = pair.indexOf('=');
    const value = equals === -1 ? '' : pair.slice(equals + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      // A stray `%` is read as written, as `searchParams` reads it.
      return value;
    }
  }
  return null;
};

/**
 * A GitHub location's `:`, `/` and `@` are legal in a query (RFC 3986), so they
 * are left as they are, and a shared link reads as the location it names.
 */
const READABLE = /%(?:3A|2F|40)/g;

const sourcePair = (source: string): string =>
  `${SOURCE_PARAMETER}=${encodeURIComponent(source).replace(READABLE, (escaped) => decodeURIComponent(escaped))}`;

/** `path` with `source` after it, or `path` alone when there is no source. */
export const withSource = (path: string, source: string | null): string =>
  source === null ? path : `${path}?${sourcePair(source)}`;

/**
 * `path` with the query and hash of the absolute URL `href` carried after it,
 * its `source` set to `source`, or left out when that is `null`.
 *
 * Every other query parameter is kept as it was written, in its place, and a
 * `source` the query already has keeps its place with its new value.
 */
export const carriedAddress = (path: string, href: string, source: string | null): string => {
  const { search, hash } = new URL(href);
  const pairs: string[] = [];
  let placed = false;
  for (const pair of search.slice(1).split('&')) {
    if (pair === '') continue;
    if (nameOf(pair) !== SOURCE_PARAMETER) pairs.push(pair);
    else if (source !== null && !placed) {
      pairs.push(sourcePair(source));
      placed = true;
    }
  }
  if (source !== null && !placed) pairs.push(sourcePair(source));
  return `${path}${pairs.length === 0 ? '' : `?${pairs.join('&')}`}${hash}`;
};
