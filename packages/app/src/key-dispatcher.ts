import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { pressesBinding, type KeyBinding } from './key-bindings';

/**
 * One binding a registration answers, and what it does with a press of it.
 *
 * `answer` decides whether the press is the command's to take — its guard, its
 * target, its availability — runs it if so, and says whether it did. Only a
 * press some answer took has its default prevented, so a key whose command
 * cannot run here is left to the browser and to whatever else would have had it.
 */
export interface KeyAnswer {
  readonly binding: KeyBinding;
  readonly answer: (event: KeyboardEvent) => boolean;
}

/**
 * The one place a Space listens for keys (ADR 0138).
 *
 * Commands never add a listener: their owners register what they answer, and
 * the dispatcher reads each press once and offers it to the registrations in
 * the order they were made, stopping at the first answer that takes it.
 *
 * Two phases, because two kinds of key need them. A command answered in the
 * bubble phase is withheld by any surface that stops the press on its way up,
 * as a Resource's editor and the canvas toolbar do. One answered in the
 * capture phase reaches the window before anything below can stop it, which
 * `?` needs, because Full View stops every key pressed in it.
 */
export interface KeyDispatcher {
  /**
   * Answer the bindings `answers` reads, in `phase`, until the returned
   * function is called. Read on every press, so a registration follows its
   * owner's latest state without being made again.
   */
  readonly register: (
    answers: () => readonly KeyAnswer[],
    phase?: 'bubble' | 'capture',
  ) => () => void;
}

/** A dispatcher listening on `target` while anything is registered with it. */
export function createKeyDispatcher(target: EventTarget): KeyDispatcher {
  const registrations = {
    bubble: new Set<() => readonly KeyAnswer[]>(),
    capture: new Set<() => readonly KeyAnswer[]>(),
  };
  const listenerOf = (phase: 'bubble' | 'capture') => (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    for (const answers of [...registrations[phase]]) {
      for (const { binding, answer } of answers()) {
        if (!pressesBinding(binding, event) || !answer(event)) continue;
        event.preventDefault();
        return;
      }
    }
  };
  const listeners = { bubble: listenerOf('bubble'), capture: listenerOf('capture') };
  return {
    register: (answers, phase = 'bubble') => {
      const registered = registrations[phase];
      if (registered.size === 0)
        target.addEventListener('keydown', listeners[phase], phase === 'capture');
      // A fresh function per registration, so the same reader registered twice
      // is two registrations and each removal takes only its own.
      const entry = () => answers();
      registered.add(entry);
      return () => {
        if (!registered.delete(entry) || registered.size > 0) return;
        target.removeEventListener('keydown', listeners[phase], phase === 'capture');
      };
    },
  };
}

let windowDispatcher: KeyDispatcher | null = null;

/**
 * The dispatcher a key answer outside any Space registers with — a story, or a
 * canvas mounted on its own in a test. `App` provides each Space its own.
 */
const unscopedDispatcher = (): KeyDispatcher => {
  windowDispatcher ??= createKeyDispatcher(window);
  return windowDispatcher;
};

export const KeyDispatcherContext = createContext<KeyDispatcher | null>(null);

/**
 * Answer `answers` with the Space's dispatcher while the calling component is
 * mounted. The array is read when a key is pressed, so it may be rebuilt every
 * render without registering again.
 */
export function useKeyAnswers(
  answers: readonly KeyAnswer[],
  phase: 'bubble' | 'capture' = 'bubble',
): void {
  const dispatcher = useContext(KeyDispatcherContext) ?? unscopedDispatcher();
  const latest = useRef(answers);
  useLayoutEffect(() => {
    latest.current = answers;
  }, [answers]);
  useLayoutEffect(() => dispatcher.register(() => latest.current, phase), [dispatcher, phase]);
}
