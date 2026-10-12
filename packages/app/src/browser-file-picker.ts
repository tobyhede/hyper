import type { PickFiles } from './kind-creation';

/**
 * The browser's own file picker, as {@link PickFiles}: a file input kept out
 * of the layout, the tab order and the accessibility tree, attached for as long
 * as the picker is open and clicked inside the press that asked for it.
 *
 * Settles on the choice, or on `cancel` with nothing. A browser that fires no
 * `cancel` leaves the answer pending, which is the same nothing.
 */
export const pickFilesInBrowser =
  (document: Document): PickFiles =>
  (accept) =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.hidden = true;
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      const settle = (files: readonly File[]): void => {
        input.remove();
        resolve(files);
      };
      input.addEventListener('change', () => settle([...(input.files ?? [])]), { once: true });
      input.addEventListener('cancel', () => settle([]), { once: true });
      document.body.append(input);
      input.click();
    });
