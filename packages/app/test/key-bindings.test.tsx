import { describe, expect, it } from 'vitest';
import {
  CANVAS_KEYS,
  keyBelongsElsewhere,
  PRESENTING_KEYS,
  pressesBinding,
  type KeyBinding,
} from '../src/key-bindings';

const ALL_BINDINGS: readonly (readonly [string, KeyBinding])[] = [
  ...Object.entries(CANVAS_KEYS),
  ...Object.entries(PRESENTING_KEYS),
];

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...init });
  let seen: KeyboardEvent | undefined;
  const listener = (each: Event) => {
    if (each instanceof KeyboardEvent) seen = each;
  };
  window.addEventListener('keydown', listener);
  target.dispatchEvent(event);
  window.removeEventListener('keydown', listener);
  if (seen === undefined) throw new Error('the press never reached the window');
  return seen;
};

const mounted = (html: string): Element => {
  document.body.innerHTML = html;
  const focused = document.querySelector('[data-target]');
  if (focused === null) throw new Error('the fixture names no target');
  return focused;
};

describe('the binding table', () => {
  it.each(ALL_BINDINGS)('answers an unmodified press of each key for %s', (_name, binding) => {
    for (const key of binding.keys) expect(pressesBinding(binding, press(key))).toBe(true);
  });

  it('answers a letter in either case, so Caps Lock is not a modifier', () => {
    expect(pressesBinding(CANVAS_KEYS.addResource, press('C'))).toBe(true);
  });

  it.each(['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat'] as const)(
    'leaves a plain binding alone under %s',
    (flag) => {
      for (const [, binding] of ALL_BINDINGS.filter(([, each]) => each.press === 'plain')) {
        expect(pressesBinding(binding, press(binding.keys[0] ?? '', { [flag]: true }))).toBe(false);
      }
    },
  );

  it('takes a held or shifted press for a binding that accepts any', () => {
    expect(pressesBinding(PRESENTING_KEYS.advance, press('ArrowRight', { repeat: true }))).toBe(
      true,
    );
    expect(
      pressesBinding(PRESENTING_KEYS.exitPresenting, press('Escape', { shiftKey: true })),
    ).toBe(true);
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
    'leaves every binding alone under %s, so Alt+Left stays Back',
    (flag) => {
      for (const [, binding] of ALL_BINDINGS) {
        expect(pressesBinding(binding, press(binding.keys[0] ?? '', { [flag]: true }))).toBe(false);
      }
    },
  );

  it('announces a non-empty shortcut and description for every binding', () => {
    for (const [, binding] of ALL_BINDINGS) {
      expect(binding.ariaKeyShortcuts).not.toBe('');
      expect(binding.description).not.toBe('');
    }
  });
});

describe('where a press belongs elsewhere', () => {
  it.each([
    ['a text field', '<input data-target />'],
    ['a search field', '<input type="search" data-target />'],
    ['a number field', '<input type="number" data-target />'],
    ['a select', '<select data-target><option>x</option></select>'],
    ['an editable region named by an empty value', '<p contenteditable="" data-target>x</p>'],
    ['a plain-text editable region', '<p contenteditable="plaintext-only" data-target>x</p>'],
    [
      'a popover, which is a dialog',
      '<div role="dialog" class="nokey"><button data-target>x</button></div>',
    ],
    ['a text area', '<textarea data-target></textarea>'],
    ['an editable region', '<div contenteditable="true"><p data-target>x</p></div>'],
    ['a menu', '<div role="menu"><div role="menuitem" data-target>x</div></div>'],
    ['a listbox', '<div role="listbox"><div role="option" data-target>x</div></div>'],
    ['a dialog', '<div role="dialog"><button data-target>x</button></div>'],
    ['an alert dialog', '<div role="alertdialog"><span data-target>x</span></div>'],
  ])('keeps every key inside %s', (_name, html) => {
    const target = mounted(html);
    expect(keyBelongsElsewhere(press('c', {}, target))).toBe(true);
    expect(keyBelongsElsewhere(press('ArrowRight', {}, target))).toBe(true);
  });

  it('leaves a focused button its own Space and Enter and nothing else', () => {
    const target = mounted('<button data-target><span>Present</span></button>');
    expect(keyBelongsElsewhere(press(' ', {}, target))).toBe(true);
    expect(keyBelongsElsewhere(press('Enter', {}, target))).toBe(true);
    expect(keyBelongsElsewhere(press('c', {}, target))).toBe(false);
    expect(keyBelongsElsewhere(press('ArrowRight', {}, target))).toBe(false);
  });

  it.each([
    ['a checkbox', '<input type="checkbox" data-target />'],
    ['a radio', '<input type="radio" data-target />'],
    ['a range', '<input type="range" data-target />'],
  ])('leaves %s its own Space and Enter and nothing else', (_name, html) => {
    const target = mounted(html);
    expect(keyBelongsElsewhere(press(' ', {}, target))).toBe(true);
    expect(keyBelongsElsewhere(press('c', {}, target))).toBe(false);
    expect(keyBelongsElsewhere(press('Escape', {}, target))).toBe(false);
  });

  it('answers a key inside the Command Dock, which is marked for React Flow alone', () => {
    const target = mounted('<div class="nokey"><button data-target>Present</button></div>');
    expect(keyBelongsElsewhere(press('c', {}, target))).toBe(false);
  });

  it('keeps every key in an editable region switched on, not one switched off', () => {
    const target = mounted('<div contenteditable="false"><span data-target>x</span></div>');
    expect(keyBelongsElsewhere(press('c', {}, target))).toBe(false);
  });

  it('defers Space to a composed control through its nearest interactive ancestor', () => {
    const target = mounted('<div role="button"><span data-target>x</span></div>');
    expect(keyBelongsElsewhere(press(' ', {}, target))).toBe(true);
  });

  it('leaves a press on the page itself to the application', () => {
    document.body.innerHTML = '';
    expect(keyBelongsElsewhere(press(' '))).toBe(false);
    expect(keyBelongsElsewhere(press('c'))).toBe(false);
  });
});
