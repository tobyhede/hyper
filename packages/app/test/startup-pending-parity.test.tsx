import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StartupPending } from '../src/components/StartupPending';

/**
 * The startup view exists twice: once in `index.html`, drawn before any script
 * runs, and once as `StartupPending`, drawn until startup resolution settles.
 * Nothing composes the two — the static copy cannot import a component, which
 * is the whole reason it is written out — so this is what holds them to one
 * logo, one message and one background. `index.html` names this file.
 */

// The arithmetic is on the path rather than through `new URL(…,
// import.meta.url)`: Vite rewrites that expression when the target is an asset
// it can serve, and under jsdom the rewritten one resolves to
// `http://localhost:3000/…`, which `readFileSync` rejects for its scheme. A
// template inside it is rewritten further, into a glob of every sibling.
const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVED_HTML = readFileSync(join(APP_ROOT, 'index.html'), 'utf8');
const THEME = readFileSync(join(APP_ROOT, 'src/tailwind.css'), 'utf8');

/** A colour token as `tailwind.css` declares it, so the static copy is compared against the theme. */
const themeToken = (name: string): string => {
  const declaration = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(THEME);
  const value = declaration?.[1];
  if (value === undefined) throw new Error(`tailwind.css declares no ${name}`);
  return value.trim();
};

/** Both sides through one CSS parser, so `#e5dbc7` and `rgb(229, 219, 199)` compare equal. */
const asColor = (value: string): string => {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
};

/** What the browser draws inside `#root` before the bundle arrives. */
const staticCopy = (): HTMLElement => {
  const parsed = new DOMParser().parseFromString(SERVED_HTML, 'text/html');
  const root = parsed.getElementById('root');
  if (root === null) throw new Error('index.html declares no #root');
  return root;
};

const collapseSpace = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();

describe('the two copies of the startup view', () => {
  it('draw the same logo, decoratively', () => {
    render(<StartupPending />);

    const drawn = screen.getByRole('status').querySelector('img');
    const served = staticCopy().querySelector('img');

    expect(drawn?.getAttribute('src')).toBe('/infinity-cube-logo.svg');
    expect(served?.getAttribute('src')).toBe(drawn?.getAttribute('src'));
    expect(drawn?.getAttribute('alt')).toBe('');
    expect(served?.getAttribute('alt')).toBe('');
  });

  it('carry the same message and nothing else', () => {
    render(<StartupPending />);

    const message = collapseSpace(screen.getByRole('status').textContent);

    expect(message).toBe('Starting…');
    expect(collapseSpace(staticCopy().textContent)).toBe(message);
  });

  it('stand the static copy on the background the theme gives the application', () => {
    const panel = staticCopy().querySelector('div');

    expect(asColor(panel?.style.backgroundColor ?? '')).toBe(asColor(themeToken('--background')));
  });

  it('write the static message in the colour the busy label takes from the theme', () => {
    const message = staticCopy().querySelector('p');

    expect(asColor(message?.style.color ?? '')).toBe(asColor(themeToken('--muted-foreground')));
  });
});
