import { useId } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/dialog';
import { KeyShortcutKeys, type KeyShortcut } from './KeyShortcut';

/** One shortcut in the sheet: what it does, and the presses that do it. */
export interface KeyboardShortcutEntry {
  readonly description: string;
  readonly shortcut: KeyShortcut;
}

/** The shortcuts answered in one place, under the name of that place. */
export interface KeyboardShortcutSection {
  readonly title: string;
  readonly shortcuts: readonly KeyboardShortcutEntry[];
}

export interface KeyboardShortcutsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** What the keys listed are answered in, said under the title. */
  readonly description: string;
  readonly sections: readonly KeyboardShortcutSection[];
}

/**
 * The keyboard shortcuts sheet: a modal list of the keys answered where the
 * reader is, grouped by where each is answered. The caller chooses the
 * sections; the Dialog owns focus, Escape and dismissal.
 */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  description,
  sections,
}: KeyboardShortcutsDialogProps) {
  const id = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nokey max-h-[calc(100%-2rem)] grid-rows-[auto_1fr] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4">
          {sections.map((section, index) => (
            <section key={section.title} aria-labelledby={`${id}-${index}`}>
              <h3 id={`${id}-${index}`} className="mb-2 text-xs font-medium text-muted-foreground">
                {section.title}
              </h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
                {section.shortcuts.map((entry) => (
                  <div key={entry.description} className="contents">
                    <dt>{entry.description}</dt>
                    <dd className="justify-self-end">
                      <KeyShortcutKeys shortcut={entry.shortcut} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
