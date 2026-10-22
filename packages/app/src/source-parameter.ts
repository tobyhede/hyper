/**
 * The `source` query parameter, which names a mounted page's GitHub location
 * (ADR 0130).
 *
 * Product URLs are unchanged by it: the browser location keeps it on every
 * product path it writes, with the rest of the current query, and
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

/** What {@link carriedAddress} does with the current location's `source`. */
export type SourceCarry =
  /** Every `source` pair is carried as it was written. */
  | 'keep'
  /** No `source` pair is carried. */
  | 'drop'
  /** The first `source` pair's place is taken by this location, and the rest are dropped. */
  | { readonly set: string };

/**
 * `path` with the query of the absolute URL `href` carried after it, its
 * `source` treated as `source` says.
 *
 * Every pair other than a `source` one is carried as it was written and in its
 * place, empty ones included; the query is left off only when no pair is left.
 * The hash is not carried: it names something on the page it was written on.
 */
export const carriedAddress = (path: string, href: string, source: SourceCarry): string => {
  const pairs: string[] = [];
  let placed = false;
  const query = new URL(href).search;
  for (const pair of query === '' ? [] : query.slice(1).split('&')) {
    if (nameOf(pair) !== SOURCE_PARAMETER || source === 'keep') pairs.push(pair);
    else if (source !== 'drop' && !placed) {
      pairs.push(sourcePair(source.set));
      placed = true;
    }
  }
  if (source !== 'keep' && source !== 'drop' && !placed) pairs.push(sourcePair(source.set));
  const carried = pairs.join('&');
  return carried === '' ? path : `${path}?${carried}`;
};
