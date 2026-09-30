/**
 * The canvas itself, where the caret rests when an Edit leaves it no subject
 * to land on: programmatically focusable and never a tab stop
 * (`SpaceCanvas`'s `tabIndex={-1}`).
 */
export const canvasElement = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('.react-flow');
