import type { PickFiles } from './kind-creation';

/** Marks the input a picker opened, so the next picker can close it. */
const PICKER_ATTRIBUTE = 'data-file-picker';

/**
 * The browser's own file picker, as {@link PickFiles}: a file input kept out
 * of the layout, the tab order and the accessibility tree, attached for as long
 * as the picker is open and clicked inside the press that asked for it. It is
 * the one picker: Create Image Resource and Replace image both open it.
 *
 * Settles on the choice, or on `cancel` with nothing. A browser that fires no
 * `cancel` leaves the answer pending; the next picker closes that input, so at
 * most one is ever attached.
 */
export const pickFilesInBrowser =
  (document: Document): PickFiles =>
  (accept) =>
    new Promise((resolve) => {
      for (const stale of document.querySelectorAll(`input[${PICKER_ATTRIBUTE}]`)) stale.remove();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.hidden = true;
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      input.setAttribute(PICKER_ATTRIBUTE, '');
      const settle = (files: readonly File[]): void => {
        input.remove();
        resolve(files);
      };
      input.addEventListener('change', () => settle([...(input.files ?? [])]), { once: true });
      input.addEventListener('cancel', () => settle([]), { once: true });
      document.body.append(input);
      input.click();
    });
