import type { Locator } from '@playwright/test';

export const PRIMARY_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * Read the source CodeMirror is showing, preserving line breaks and leading spaces.
 *
 * Reading it needs a selection, because the rendered lines are separate elements and
 * `textContent` runs them together — so this takes one and puts back whatever was
 * there. Without that restore the read is destructive: it runs on a focused editor,
 * mid-test, and the next `Mod-z` or `Mod-a` then acts on a caret the test never set.
 *
 * It reads what is *rendered*, and CodeMirror renders only the lines in view. A
 * document taller than the pane would answer truncated, so this refuses rather than
 * quietly returning a prefix that reads like a persistence bug at the call site.
 */
export const markdownSource = (editor: Locator): Promise<string> =>
  editor.evaluate((element) => {
    const scroller = element.closest('.cm-scroller');
    if (scroller !== null && scroller.scrollHeight > scroller.clientHeight + 1) {
      throw new Error(
        'markdownSource() reads only the lines CodeMirror has rendered, and this document ' +
          'is taller than its viewport. Assert on a shorter source, or read the document ' +
          'through the editor state instead.',
      );
    }

    const selection = window.getSelection();
    const previous = Array.from({ length: selection?.rangeCount ?? 0 }, (_unused, index) =>
      selection?.getRangeAt(index),
    );

    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const source = selection?.toString() ?? '';

    selection?.removeAllRanges();
    for (const restored of previous) {
      if (restored !== undefined) selection?.addRange(restored);
    }
    return source;
  });
