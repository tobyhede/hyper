import { PICKED_IMAGE_TYPES, type ImageSources } from './image-creation';

/** The open picker in each document, settled with nothing when the next one opens. */
const openPickers = new WeakMap<Document, (files: readonly File[]) => void>();

/**
 * The browser's own file picker: a file input kept out of the layout, the tab
 * order and the accessibility tree, attached for as long as the picker is open
 * and clicked inside the press that asked for it. Answers the files chosen.
 *
 * Settles on the choice, or on `cancel` with nothing. A browser that fires no
 * `cancel` leaves a picker open until the next one opens, which closes it and
 * answers it nothing, so at most one input is ever attached.
 *
 * Hand-rolled outside React (`interactiveDeviations` in
 * `design-system-inventory.ts`): the press that opens it may be made where no
 * component of its own is drawn.
 */
export const pickFilesInBrowser = (document: Document, accept: string): Promise<readonly File[]> =>
  new Promise((resolve) => {
    openPickers.get(document)?.([]);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    const settle = (files: readonly File[]): void => {
      if (openPickers.get(document) === settle) openPickers.delete(document);
      input.remove();
      resolve(files);
    };
    openPickers.set(document, settle);
    input.addEventListener('change', () => settle([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => settle([]), { once: true });
    document.body.append(input);
    input.click();
  });

/**
 * The one image picker: Create Image Resource and Replace image both open it,
 * offering the formats the host stores.
 */
export const pickImagesInBrowser: ImageSources['pick'] = () =>
  pickFilesInBrowser(document, PICKED_IMAGE_TYPES);
