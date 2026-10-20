import { createHash } from 'node:crypto';

/**
 * The headers the static build for Mounting travels with (ADR 0130), as a
 * Cloudflare `_headers` file.
 *
 * The HTTP host sends no application-wide Content Security Policy, so there is
 * none to copy: this is an explicit one, under `/*` so every path carries it,
 * a deep product URL answered by the single-page fallback included. It admits
 * the application's own origin for each kind of fetch and adds only what
 * Mounting and the page need: `connect-src` for the two GitHub hosts a GitHub
 * source reads, `img-src blob:` for a stored image drawn from an object URL
 * over mounted bytes, `img-src https: data:` because an Image Resource may
 * name an external picture (ADR 0106), `style-src 'unsafe-inline'` because
 * React Flow and the startup view position by inline style, and in
 * `script-src` the hash of each inline script the page carries, which is
 * `index.html`'s startup-failure guard.
 *
 * No rule sets `Cache-Control`. A rule for the hashed `/assets/*` names would
 * also reach a missing one, which the single-page fallback answers with
 * `index.html` and 200, and `_headers` cannot match on status: the page would
 * be cached for that asset's URL for as long as the rule said. Cloudflare's
 * default revalidates each asset by its ETag instead.
 */
export interface HeaderRule {
  /** A Cloudflare `_headers` path: exact, or a prefix ending in `*`. */
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
}

const GITHUB_HOSTS = ['https://api.github.com', 'https://raw.githubusercontent.com'];

const sha256 = (source: string): string =>
  `'sha256-${createHash('sha256').update(source).digest('base64')}'`;

const contentSecurityPolicy = (inlineScripts: readonly string[]): string =>
  [
    "default-src 'self'",
    ['script-src', "'self'", ...inlineScripts.map(sha256)].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    ['connect-src', "'self'", ...GITHUB_HOSTS].join(' '),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

/** Every header rule of the build, given the inline scripts of its page. */
export const mountHeaderRules = (inlineScripts: readonly string[]): readonly HeaderRule[] => [
  {
    path: '/*',
    headers: {
      'Content-Security-Policy': contentSecurityPolicy(inlineScripts),
      'X-Content-Type-Options': 'nosniff',
    },
  },
];

/** The `_headers` file for the build, given the inline scripts of its page. */
export const mountHeaders = (inlineScripts: readonly string[]): string =>
  mountHeaderRules(inlineScripts)
    .map(({ path, headers }) =>
      [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join('\n'),
    )
    .join('\n')
    .concat('\n');

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

/** The source of every `<script>` written into a page, not loaded by `src`. */
export const inlineScriptSources = (html: string): string[] =>
  [...html.matchAll(SCRIPT)].flatMap(([, attributes = '', source = '']) =>
    /\bsrc\s*=/.test(attributes) ? [] : [source],
  );
