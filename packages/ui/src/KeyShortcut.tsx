import { Kbd, KbdGroup } from './components/kbd';

/** A keyboard shortcut as the control performing it announces it and a reader is shown it. */
export interface KeyShortcut {
  /** The `aria-keyshortcuts` value of the control performing it. */
  readonly aria: string;
  /** Each press that performs it, each the keys held together, named as a reader names them. */
  readonly presses: readonly (readonly string[])[];
}

/**
 * The presses of one shortcut, each drawn as its keys together. Presentation
 * only: the control performing the shortcut announces it with `aria-keyshortcuts`.
 */
export function KeyShortcutKeys({ shortcut }: { readonly shortcut: KeyShortcut }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shortcut.presses.map((press) => (
        <KbdGroup key={press.join('+')}>
          {press.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  );
}
