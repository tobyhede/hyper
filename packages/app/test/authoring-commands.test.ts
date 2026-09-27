import { describe, expect, it, vi } from 'vitest';
import { offered, renameDraftAnswer } from '../src/authoring-commands';
import { COMMAND_BROKE, COMMAND_DISCARDED } from '../src/command-outcomes';

/**
 * How a surface spends a capability: one field, the press or `null`, so
 * what it draws unavailable and what it invokes are one answer.
 */
describe('offered', () => {
  it('builds the press from the capability’s own invocation while it is available', () => {
    const invoke = vi.fn(() => 'invoked');

    const press = offered({ available: true, invoke }, (own) => () => own());

    expect(press?.()).toBe('invoked');
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('offers nothing, and builds no press, while the capability is unavailable', () => {
    const build = vi.fn(() => () => undefined);

    expect(offered({ available: false, invoke: () => undefined }, build)).toBeNull();
    expect(build).not.toHaveBeenCalled();
  });
});

/**
 * What an inline rename editor does with an outcome: only a refusal holds the
 * draft open, with the report's sentence.
 */
describe('renameDraftAnswer', () => {
  it('holds a refused draft open with the report’s message', () => {
    expect(
      renameDraftAnswer({
        kind: 'refused',
        report: { title: 'Map unchanged', message: 'A Map title is required.' },
      }),
    ).toBe('A Map title is required.');
  });

  it('closes the editor on every other answer', () => {
    for (const outcome of [
      { kind: 'completed' },
      { kind: 'unchanged' },
      { kind: 'unavailable' },
      COMMAND_BROKE,
      COMMAND_DISCARDED,
    ] as const) {
      expect(renameDraftAnswer(outcome)).toBeNull();
    }
  });
});
