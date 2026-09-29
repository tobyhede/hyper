import { forwardRef } from 'react';
import { Input } from './components/input';

export interface ImageFilePickerProps {
  /**
   * The media types offered to the picker, as its `accept` attribute. A
   * convenience only: a file the picker lets through anyway still meets
   * whatever refusal the caller's store answers.
   */
  readonly accept: string;
  /** The files chosen. A cancelled picker fires no `change`, so it answers nothing. */
  readonly onChoose: (files: readonly File[]) => void;
  readonly 'data-testid'?: string;
}

/**
 * The browser's own file picker for an image, opened by calling `click()` on
 * the element the ref reaches from a visible control. No component in
 * `@project/ui` or the registry chooses a file, and a picker is not something
 * to hand-roll, so this is the project's `Input` kept out of the layout, the
 * tab order and the accessibility tree.
 */
export const ImageFilePicker = forwardRef<HTMLInputElement, ImageFilePickerProps>(
  ({ accept, onChoose, 'data-testid': testId }, ref) => (
    <Input
      ref={ref}
      type="file"
      accept={accept}
      hidden
      tabIndex={-1}
      aria-hidden
      data-testid={testId}
      onChange={(event) => {
        const files = [...(event.currentTarget.files ?? [])];
        // Cleared so choosing the same file again is still a change.
        event.currentTarget.value = '';
        if (files.length > 0) onChoose(files);
      }}
    />
  ),
);
ImageFilePicker.displayName = 'ImageFilePicker';
