import { useState } from 'react';
import { KeyboardShortcutsDialog } from '@project/ui';
import { keyBelongsElsewhere } from '../key-bindings';
import { useKeyAnswers } from '../key-dispatcher';
import { SHORTCUT_SHEET_DESCRIPTIONS, shortcutSections } from '../shortcut-sheet';

/**
 * The keyboard shortcuts sheet, opened by `?` wherever the Space takes keys and
 * listing the keys of the mode the reader is in. Opening it changes nothing in
 * the Space; the Dialog owns its focus and Escape, and every key pressed inside
 * it is the Dialog's (`keyBelongsElsewhere`).
 */
export function ShortcutSheet({ presenting }: { readonly presenting: boolean }) {
  const [open, setOpen] = useState(false);
  // In the capture phase, because Full View stops every key pressed in it from
  // going further, and the sheet lists Full View's keys too.
  useKeyAnswers(
    [
      {
        id: 'help.showShortcuts',
        answer: (event) => {
          if (keyBelongsElsewhere(event)) return false;
          setOpen(true);
          return true;
        },
      },
    ],
    'on-screen',
    'capture',
  );
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
