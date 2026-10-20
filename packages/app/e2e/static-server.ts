import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

/**
 * A static file server for the mount build (ADR 0130), standing in for
 * Cloudflare's static assets in `playwright.mount.config.ts`: it serves the
 * build's files, answers every other path with `index.html` as
 * `not_found_handling: "single-page-application"` does, and sends the
 * headers the build's own `_headers` file names, so the end-to-end run is
 * held to the Content Security Policy the deployment sends.
 *
 * Run as `tsx static-server.ts <directory> <port>`.
 */

const [directoryArgument, portArgument] = process.argv.slice(2);
if (directoryArgument === undefined || portArgument === undefined) {
  throw new Error('Usage: static-server.ts <directory> <port>');
}
const directory = path.resolve(directoryArgument);
const port = Number(portArgument);

const MEDIA_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.map', 'application/json'],
  ['.json', 'application/json'],
  ['.webmanifest', 'application/manifest+json'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

interface HeaderRule {
  readonly path: string;
  readonly headers: [string, string][];
}

/** Cloudflare's `_headers` format: a path line, then its indented `Name: value` lines. */
const parseHeaders = (source: string): HeaderRule[] => {
  const rules: HeaderRule[] = [];
  for (const line of source.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: [] });
      continue;
    }
    const separator = line.indexOf(':');
    const rule = rules.at(-1);
    if (separator === -1 || rule === undefined) throw new Error(`Unreadable _headers line ${line}`);
    rule.headers.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
  }
  return rules;
};

const matches = (pattern: string, pathname: string): boolean =>
  pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pattern === pathname;

const rules = parseHeaders(await readFile(path.join(directory, '_headers'), 'utf8'));

/** The build's file at `pathname`, or `undefined` for the single-page fallback, a malformed escape among them. */
const fileAt = async (pathname: string): Promise<string | undefined> => {
  try {
    const file = path.join(directory, path.normalize(decodeURIComponent(pathname)));
    if (!file.startsWith(`${directory}${path.sep}`)) return undefined;
    return (await stat(file)).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
};

createServer((request, response) => {
  void (async () => {
    const pathname = new URL(request.url ?? '/', 'http://static.invalid').pathname;
    const file = (await fileAt(pathname)) ?? path.join(directory, 'index.html');
    for (const rule of rules) {
      if (!matches(rule.path, pathname)) continue;
      for (const [name, value] of rule.headers) response.setHeader(name, value);
    }
    response.setHeader(
      'Content-Type',
      MEDIA_TYPES.get(path.extname(file)) ?? 'application/octet-stream',
    );
    response.end(await readFile(file));
  })().catch(() => {
    response.statusCode = 500;
    response.end();
  });
}).listen(port, '127.0.0.1');
