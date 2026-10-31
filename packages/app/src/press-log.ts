import type { DispatchReport, KeyTrace } from './key-dispatcher';

/**
 * The press log: a development overlay listing each key pressed, what it
 * landed on and what the dispatchers did with it, so a key that does nothing
 * says why. It exists only in a dev server started with `VITE_KEY_LOG=1`; a
 * build without that variable carries none of it.
 */
export const pressLogEnabled = import.meta.env.DEV && import.meta.env.VITE_KEY_LOG === '1';

const traceListeners = new Set<KeyTrace>();

/** The trace every Space's dispatcher reports to while the press log is on. */
export const pressLogTrace: KeyTrace | undefined = pressLogEnabled
  ? (event, report) => {
      for (const listener of traceListeners) listener(event, report);
    }
  : undefined;

/** Hear every dispatcher's report until the returned function is called. */
export function onPressReport(listener: KeyTrace): () => void {
  traceListeners.add(listener);
  return () => traceListeners.delete(listener);
}

/** One press, as the log shows it. */
export interface PressEntry {
  readonly sequence: number;
  readonly press: string;
  readonly landedOn: string;
  readonly reports: readonly DispatchReport[];
  /** Whether anything prevented the press's default, a dispatcher or a handler of its own. */
  readonly prevented: boolean;
}

/** Whether a press is only a modifier going down, which the log leaves out. */
export const isModifierOnly = (event: KeyboardEvent): boolean => event.getModifierState(event.key);

/** A one-character key as a person would name it; the space bar is the one with no glyph. */
const characterName = (character: string): string => character.trim().toUpperCase() || 'Space';

/** A press as a person would name it: `Shift+P`, `Ctrl+Enter`, `Space`. */
export function pressLabel(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? characterName(event.key) : event.key;
  return [
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.metaKey ? 'Meta' : null,
    event.shiftKey ? 'Shift' : null,
    key,
  ]
    .filter((part) => part !== null)
    .join('+');
}

const nameOf = (element: Element): string | null => {
  const label = element.getAttribute('aria-label') ?? element.textContent;
  const trimmed = label.replace(/\s+/gu, ' ').trim();
  if (trimmed === '') return null;
  return trimmed.length > 32 ? `${trimmed.slice(0, 31)}…` : trimmed;
};

/** What a press landed on, in words: a Resource, a control, or the page. */
export function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element) || target === document.body) return 'the page';
  const node = target.closest('.react-flow__node');
  if (node !== null) {
    const name = nameOf(node.querySelector('.canvas-resource__title') ?? node) ?? '?';
    return node === target ? `Resource "${name}"` : `inside Resource "${name}"`;
  }
  if (target.classList.contains('react-flow__pane') || target.closest('.react-flow') === target)
    return 'the canvas';
  const role = target.getAttribute('role');
  const name = nameOf(target);
  const kind = role ?? target.tagName.toLowerCase();
  return name === null ? kind : `${kind} "${name}"`;
}

/** Whether the log's line for an entry reads as a key that worked. */
export const ran = (entry: PressEntry): boolean =>
  entry.reports.some((report) => report.attempts.some((attempt) => attempt.outcome.ran));

/** What came of a press, in one sentence. */
export function pressVerdict(entry: PressEntry): string {
  const onScreen = entry.reports.filter((report) => report.context !== 'off-screen');
  if (onScreen.length === 0) return 'No Space on screen read it.';
  const attempts = onScreen.flatMap((report) => report.attempts);
  const taken = attempts.find((attempt) => attempt.outcome.ran);
  if (taken !== undefined) return `Ran ${taken.id}.`;
  // A key some component answers itself never reaches the keymap's commands.
  const elsewhere = entry.prevented
    ? ` Answered outside the dispatcher, by ${entry.landedOn} or a surface around it.`
    : '';
  const declined = attempts.flatMap((attempt) =>
    attempt.outcome.ran ? [] : [`${attempt.id}: ${attempt.outcome.why}`],
  );
  if (declined.length > 0) return `${declined.join(' ')}${elsewhere}`;
  const reachedBubble = onScreen.some((report) => report.phase === 'bubble');
  const context = onScreen[0]?.context ?? 'canvas';
  if (!reachedBubble)
    return entry.prevented
      ? elsewhere.trim()
      : `Stopped before the ${context} keys: ${entry.landedOn} kept it.`;
  return `No command is bound to ${entry.press} in ${context}.${elsewhere}`;
}

/** The log as text, newest first, for pasting into a conversation. */
export const pressLogText = (entries: readonly PressEntry[]): string =>
  entries.map((entry) => `${entry.press} on ${entry.landedOn}: ${pressVerdict(entry)}`).join('\n');
