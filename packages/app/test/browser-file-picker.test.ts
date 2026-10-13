// @vitest-environment jsdom

import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { pickFilesInBrowser } from '../src/browser-file-picker';

/** The picker's input while it is open. */
const openInput = (): HTMLInputElement => {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input is open.');
  return input;
};

describe("the browser's file picker", () => {
  it('opens an input offering the given types, kept out of the tab order and the accessibility tree', () => {
    let clicked = false;
    document.addEventListener('click', () => (clicked = true), { once: true });

    void pickFilesInBrowser(document, 'image/png,image/jpeg');

    const input = openInput();
    expect(input.accept).toBe('image/png,image/jpeg');
    expect(input.hidden).toBe(true);
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(clicked).toBe(true);
    input.dispatchEvent(new Event('cancel'));
  });

  it('answers the files chosen, and closes', async () => {
    const picking = pickFilesInBrowser(document, 'image/png');
    const input = openInput();
    const figure = new File([''], 'figure.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [figure] } });

    expect(await picking).toEqual([figure]);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('answers nothing when cancelled, and closes', async () => {
    const picking = pickFilesInBrowser(document, 'image/png');
    openInput().dispatchEvent(new Event('cancel'));

    expect(await picking).toEqual([]);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('closes a picker that never settled when the next one opens, answering it nothing', async () => {
    const stale = pickFilesInBrowser(document, 'image/png');
    void pickFilesInBrowser(document, 'image/jpeg');

    const open = document.querySelectorAll('input[type="file"]');
    expect([...open].map((input) => input instanceof HTMLInputElement && input.accept)).toEqual([
      'image/jpeg',
    ]);
    expect(await stale).toEqual([]);
    openInput().dispatchEvent(new Event('cancel'));
  });
});
