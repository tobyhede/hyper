/**
 * Whether a Map identity menu should restore focus to its trigger on close.
 *
 * New Map continues in the new Map's name after the menu closes. Base UI
 * would otherwise return focus to the disclosure trigger a frame later, blurring
 * the editor that opened on purpose. The application records that landing through
 * a caller-supplied flag rather than the menu-local caret flag, because the
 * continuation spends after the close decision is made.
 */
export function identityMenuRestoresFocusOnClose(
  caretMovedDuringCommand: () => boolean,
  identityRestoresFocusOnClose: () => boolean,
): () => boolean {
  return () => {
    if (caretMovedDuringCommand()) return false;
    return identityRestoresFocusOnClose();
  };
}
