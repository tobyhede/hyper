import { describe, expect, it } from 'vitest';
import type { DispatchReport } from '../src/key-dispatcher';
import { describeTarget, pressLabel, pressVerdict, type PressEntry } from '../src/press-log';

const entry = (reports: readonly DispatchReport[]): PressEntry => ({
  sequence: 1,
  press: 'P',
  landedOn: 'the page',
  reports,
  prevented: false,
});

describe('the press log', () => {
  it('names a press as a person would', () => {
    expect(pressLabel(new KeyboardEvent('keydown', { key: 'p' }))).toBe('P');
    expect(pressLabel(new KeyboardEvent('keydown', { key: ' ' }))).toBe('Space');
    expect(pressLabel(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))).toBe(
      'Shift+Enter',
    );
    expect(pressLabel(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe('Meta+Z');
  });

  it('says which command ran', () => {
    expect(
      pressVerdict(
        entry([
          {
            phase: 'bubble',
            context: 'canvas',
            attempts: [{ id: 'canvas.presentFromHere', outcome: { ran: true } }],
          },
        ]),
      ),
    ).toBe('Ran canvas.presentFromHere.');
  });

  it('says why each command bound to the press left it alone', () => {
    expect(
      pressVerdict(
        entry([
          {
            phase: 'bubble',
            context: 'canvas',
            attempts: [
              {
                id: 'canvas.presentFromHere',
                outcome: { ran: false, why: 'Nothing is selected.' },
              },
            ],
          },
        ]),
      ),
    ).toBe('canvas.presentFromHere: Nothing is selected.');
  });

  it('tells a press no command is bound to from one stopped before the dispatcher', () => {
    expect(pressVerdict(entry([{ phase: 'bubble', context: 'canvas', attempts: [] }]))).toBe(
      'No command is bound to P in canvas.',
    );
    expect(pressVerdict(entry([{ phase: 'capture', context: 'canvas', attempts: [] }]))).toBe(
      'Stopped before the canvas keys: the page kept it.',
    );
    expect(
      pressVerdict({
        ...entry([{ phase: 'capture', context: 'canvas', attempts: [] }]),
        prevented: true,
      }),
    ).toBe('Answered outside the dispatcher, by the page or a surface around it.');
    expect(pressVerdict(entry([{ phase: 'bubble', context: 'off-screen', attempts: [] }]))).toBe(
      'No Space on screen read it.',
    );
  });

  it('describes what a press landed on', () => {
    const node = document.createElement('div');
    node.className = 'react-flow__node';
    node.setAttribute('aria-label', 'Searchable encryption');
    const button = document.createElement('button');
    button.textContent = 'Present';
    node.append(button);

    expect(describeTarget(node)).toBe('Resource "Searchable encryption"');
    expect(describeTarget(button)).toBe('inside Resource "Searchable encryption"');
    expect(describeTarget(document.body)).toBe('the page');
  });
});
