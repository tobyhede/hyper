/**
 * The `source` query parameter, which names a mounted page's GitHub location
 * (ADR 0130).
 *
 * Product URLs are unchanged by it: the browser location writes it after
 * every product path it writes, and no destination resolver reads it, since
 * they resolve the pathname alone (`packages/app/test/browser-location.test.ts`,
 * "the mounted source in the address").
 */
const SOURCE_PARAMETER = 'source';

/**
 * The `source` parameter of an absolute URL, or `null` when it has none.
 *
 * Read by hand rather than through `searchParams`, which decodes a `+` as a
 * space: a ref may hold a `+`, and a hand-typed link writes it bare.
 */
export const sourceParameter = (href: string): string | null => {
  for (const pair of new URL(href).search.slice(1).split('&')) {
    const equals = pair.indexOf('=');
    if ((equals === -1 ? pair : pair.slice(0, equals)) !== SOURCE_PARAMETER) continue;
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

/** `path` with `source` after it, or `path` alone when there is no source. */
export const withSource = (path: string, source: string | null): string =>
  source === null
    ? path
    : `${path}?${SOURCE_PARAMETER}=${encodeURIComponent(source).replace(READABLE, (escaped) => decodeURIComponent(escaped))}`;
