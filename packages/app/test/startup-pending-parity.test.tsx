import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
 * logo, one message and one background, and to the three values that decide
 * whether the handoff is visible: the mark's width, the column's gap and the
 * message's size. `index.html` names this file.
 */

// The arithmetic is on the path rather than through `new URL(…,
// import.meta.url)`: Vite rewrites that expression when the target is an asset
// it can serve, and under jsdom the rewritten one resolves to
// `http://localhost:3000/…`, which `readFileSync` rejects for its scheme. A
// template inside it is rewritten further, into a glob of every sibling.
const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVED_HTML = readFileSync(join(APP_ROOT, 'index.html'), 'utf8');

// The theme the build reads, in the order it reads it: `tailwind.css` imports
// Tailwind's own declarations and then overrides what it means to override, so a
// name the app declares wins over the default of the same name. The spacing step
// and the type scale are Tailwind's rather than the app's, and a utility class is
// only a name until one of the two declares what it resolves to.
const TAILWIND_DEFAULTS = createRequire(import.meta.url).resolve('tailwindcss/theme.css');
const THEME = [
  readFileSync(join(APP_ROOT, 'src/tailwind.css'), 'utf8'),
  readFileSync(TAILWIND_DEFAULTS, 'utf8'),
].join('\n');

const declaration = (name: string): RegExp => new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm');

/** A token as the theme declares it, so the static copy is compared against the theme. */
const themeToken = (name: string): string => {
  const declared = declaration(name).exec(THEME);
  const value = declared?.[1];
  if (value === undefined) throw new Error(`the theme declares no ${name}`);
  return value.trim();
};

const declaresToken = (name: string): boolean => declaration(name).test(THEME);

interface Length {
  readonly magnitude: number;
  readonly unit: string;
}

/** A CSS length as a comparable pair, so `1rem` and `1.0rem` compare equal. */
const asLength = (value: string): Length => {
  const parsed = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value.trim());
  const magnitude = parsed?.[1];
  const unit = parsed?.[2];
  if (magnitude === undefined || unit === undefined)
    throw new Error(`not a CSS length: ${JSON.stringify(value)}`);
  return { magnitude: Number(magnitude), unit: unit.toLowerCase() };
};

/**
 * The one utility on the element whose name matches, by the capture the pattern
 * takes from it.
 *
 * jsdom applies no Tailwind, so a utility on the drawn copy is only ever its own
 * name: a computed gap or font size is not available to read. The name is
 * resolved through the theme instead — which is what the build does with it — so
 * the two copies are still compared by the value each side draws rather than by
 * a correspondence written down here.
 */
const soleUtility = (element: Element, pattern: RegExp, what: string): string => {
  const matched = Array.from(element.classList).flatMap((name) => {
    const captured = pattern.exec(name)?.[1];
    return captured === undefined ? [] : [captured];
  });
  const [only] = matched;
  if (only === undefined || matched.length !== 1)
    throw new Error(`expected one ${what}, found ${matched.length}: ${element.className}`);
  return only;
};

/** What `gap-<steps>` resolves to: that many steps of the theme's spacing unit. */
const columnGap = (element: Element): Length => {
  const steps = Number(soleUtility(element, /^gap-(\d+(?:\.\d+)?)$/, 'column gap utility'));
  const step = asLength(themeToken('--spacing'));
  return { magnitude: step.magnitude * steps, unit: step.unit };
};

/**
 * What `text-<step>` resolves to.
 *
 * The colour utility is spelled the same way, so the type step is picked out as
 * the `text-` utility the theme declares a size for — `--text-sm` is a length
 * and `--text-muted-foreground` is nothing at all.
 */
const typeSize = (element: Element): Length => {
  const steps = Array.from(element.classList).flatMap((name) => {
    const step = /^text-(.+)$/.exec(name)?.[1];
    return step !== undefined && declaresToken(`--text-${step}`) ? [step] : [];
  });
  const [only] = steps;
  if (only === undefined || steps.length !== 1)
    throw new Error(`expected one type step, found ${steps.length}: ${element.className}`);
  return asLength(themeToken(`--text-${only}`));
};

/** The mark's declared width, refusing anything that would compare vacuously. */
const markWidth = (mark: Element | null | undefined): string => {
  const width = mark?.getAttribute('width') ?? '';
  if (!/^\d+$/.test(width)) throw new Error(`the mark declares no width: ${JSON.stringify(width)}`);
  return width;
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
    expect(markWidth(served)).toBe(markWidth(drawn));
  });

  it('space the column and size the message the same way', () => {
    render(<StartupPending />);

    const drawn = screen.getByRole('status');
    const served = staticCopy();

    expect(asLength(served.querySelector('div')?.style.gap ?? '')).toEqual(columnGap(drawn));
    expect(asLength(served.querySelector('p')?.style.fontSize ?? '')).toEqual(typeSize(drawn));
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
