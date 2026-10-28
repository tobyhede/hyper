import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { bindingOf, pressesBinding, type CommandId } from './key-bindings';

/**
 * The command a registration answers, and what it does with a press of its key.
 *
 * The key is the command's binding (`bindingOf`), which the dispatcher reads on
 * every press, so the answer names the command and never its key.
 *
 * `answer` decides whether the press is the command's to take — its guard, its
 * target, its availability — runs it if so, and says whether it did. Only a
 * press some answer took has its default prevented, so a key whose command
 * cannot run here is left to the browser and to whatever else would have had it.
 */
export interface KeyAnswer {
  readonly id: CommandId;
  readonly answer: (event: KeyboardEvent) => boolean;
}

/**
 * Where a Space is, as its keys see it, most covering first.
 *
 * - `off-screen`: the Space is open but another is on screen. It answers nothing.
 * - `presenting`: the Stage covers the canvas.
 * - `full-view`: Full View covers the canvas.
 * - `canvas`: nothing covers it.
 */
export type KeyContext = 'off-screen' | 'presenting' | 'full-view' | 'canvas';

/** A context a surface puts its Space in while it covers it. */
export type CoveringContext = Exclude<KeyContext, 'canvas'>;

/** Where a registration's commands are answered. */
export type AnswersIn = 'canvas' | 'presenting' | 'on-screen';

const COVERING_ORDER: readonly CoveringContext[] = ['off-screen', 'presenting', 'full-view'];

const answersInContext = (answersIn: AnswersIn, context: KeyContext): boolean =>
  answersIn === 'on-screen' ? context !== 'off-screen' : answersIn === context;

/**
 * The one place a Space listens for keys (ADR 0138).
 *
 * Commands never add a listener: their owners register what they answer, and
 * the dispatcher reads each press once and offers it to the registrations in
 * the order they were made, stopping at the first answer that takes it.
 *
 * The dispatcher, not each command, decides whether a registration is answered
 * at all: each registration says where it is answered, and the surfaces that
 * cover a Space say when they do (`cover`). A command added to the canvas is
 * therefore silent off screen, while presenting and under Full View without
 * checking any of them.
 *
 * Two phases, because two kinds of key need them. A command answered in the
 * bubble phase is withheld by any surface that stops the press on its way up,
 * as a Resource's editor and the canvas toolbar do. One answered in the
 * capture phase reaches the window before anything below can stop it, which
 * `?` needs, because Full View stops every key pressed in it.
 */
export interface KeyDispatcher {
  /**
   * Answer the commands `answers` reads, in `answersIn`, in `phase`, until the
   * returned function is called. Read on every press, so a registration
   * follows its owner's latest state without being made again.
   */
  readonly register: (
    answers: () => readonly KeyAnswer[],
    answersIn: AnswersIn,
    phase?: 'bubble' | 'capture',
  ) => () => void;
  /** Put the Space in `context` until the returned function is called. */
  readonly cover: (context: CoveringContext) => () => void;
}

interface Registration {
  readonly answers: () => readonly KeyAnswer[];
  readonly answersIn: AnswersIn;
}

/** A dispatcher listening on `target` while anything is registered with it. */
export function createKeyDispatcher(target: EventTarget): KeyDispatcher {
  const registrations = { bubble: new Set<Registration>(), capture: new Set<Registration>() };
  // A list rather than a set: two surfaces may cover a Space the same way, and
  // the context lasts until the last of them uncovers it.
  const covering: CoveringContext[] = [];
  const context = (): KeyContext =>
    COVERING_ORDER.find((each) => covering.includes(each)) ?? 'canvas';
  // Named, so a test listing the window's key listeners can tell this one apart.
  const listenerOf = (phase: 'bubble' | 'capture') =>
    function dispatchKey(event: Event): void {
      if (!(event instanceof KeyboardEvent)) return;
      const now = context();
      for (const { answers, answersIn } of [...registrations[phase]]) {
        if (!answersInContext(answersIn, now)) continue;
        for (const { id, answer } of answers()) {
          if (!pressesBinding(bindingOf(id), event) || !answer(event)) continue;
          event.preventDefault();
          return;
        }
      }
    };
  const listeners = { bubble: listenerOf('bubble'), capture: listenerOf('capture') };
  return {
    register: (answers, answersIn, phase = 'bubble') => {
      const registered = registrations[phase];
      if (registered.size === 0)
        target.addEventListener('keydown', listeners[phase], phase === 'capture');
      // A fresh entry per registration, so the same reader registered twice
      // is two registrations and each removal takes only its own.
      const entry: Registration = { answers: () => answers(), answersIn };
      registered.add(entry);
      return () => {
        if (!registered.delete(entry) || registered.size > 0) return;
        target.removeEventListener('keydown', listeners[phase], phase === 'capture');
      };
    },
    cover: (covered) => {
      covering.push(covered);
      let uncovered = false;
      return () => {
        if (uncovered) return;
        uncovered = true;
        covering.splice(covering.indexOf(covered), 1);
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

const useKeyDispatcher = (): KeyDispatcher =>
  useContext(KeyDispatcherContext) ?? unscopedDispatcher();

/**
 * Answer `answers` with the Space's dispatcher, in `answersIn`, while the
 * calling component is mounted. The array is read when a key is pressed, so it
 * may be rebuilt every render without registering again.
 */
export function useKeyAnswers(
  answers: readonly KeyAnswer[],
  answersIn: AnswersIn,
  phase: 'bubble' | 'capture' = 'bubble',
): void {
  const dispatcher = useKeyDispatcher();
  const latest = useRef(answers);
  useLayoutEffect(() => {
    latest.current = answers;
  }, [answers]);
  useLayoutEffect(
    () => dispatcher.register(() => latest.current, answersIn, phase),
    [dispatcher, answersIn, phase],
  );
}

/** Put the Space in `context` while `covers` holds and the calling component is mounted. */
export function useKeyCover(context: CoveringContext, covers: boolean): void {
  const dispatcher = useKeyDispatcher();
  useLayoutEffect(
    () => (covers ? dispatcher.cover(context) : undefined),
    [dispatcher, context, covers],
  );
}
