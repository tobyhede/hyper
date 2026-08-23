import type { Locator } from '@playwright/test';

export const PRIMARY_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Read the browser selection CodeMirror exposes, preserving source line breaks and spaces. */
export const markdownSource = (editor: Locator): Promise<string> =>
  editor.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const source = selection?.toString() ?? '';
    selection?.removeAllRanges();
    return source;
  });
