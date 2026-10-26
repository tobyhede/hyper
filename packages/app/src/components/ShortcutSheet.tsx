import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyboardShortcutsDialog } from '@project/ui';
import { HELP_KEYS, keyBelongsElsewhere, pressesBinding } from '../key-bindings';
import { SHORTCUT_SHEET_DESCRIPTIONS, shortcutSections } from '../shortcut-sheet';

/**
 * The keyboard shortcuts sheet, opened by `?` wherever the Space takes keys and
 * listing the keys of the mode the reader is in. Opening it changes nothing in
 * the Space; the Dialog owns its focus and Escape, and every key pressed inside
 * it is the Dialog's (`keyBelongsElsewhere`).
 */
export function ShortcutSheet({
  active,
  presenting,
}: {
  /** Whether this Space is the one receiving keys. */
  readonly active: boolean;
  readonly presenting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listening = useRef(active);
  useLayoutEffect(() => {
    listening.current = active;
  }, [active]);
  useEffect(() => {
    const show = (event: KeyboardEvent): void => {
      if (!listening.current || !pressesBinding(HELP_KEYS.showShortcuts, event)) return;
      if (keyBelongsElsewhere(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', show);
    return () => window.removeEventListener('keydown', show);
  }, []);
  const mode = presenting ? 'presenting' : 'authoring';
  return (
    <KeyboardShortcutsDialog
      open={open}
      onOpenChange={setOpen}
      description={SHORTCUT_SHEET_DESCRIPTIONS[mode]}
      sections={shortcutSections(mode)}
    />
  );
}
