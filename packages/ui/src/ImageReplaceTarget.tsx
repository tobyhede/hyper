import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './components/empty';
import { FieldError } from './components/field';
import { InputGroup, InputGroupInput } from './components/input-group';
import { ImageFilePicker } from './ImageFilePicker';
import { usePublishResourceContentEdit, type ResourceContentEdit } from './resource-content-edit';
import { ImageIcon } from './icons';
import './resource-image.css';

/** What a replacement brought: a URL entered in the field, or a file chosen or dropped. */
export type ImageReplacement =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'files'; readonly files: readonly File[] };

/**
 * What a running image replacement is ended by. Its presence *is* the running
 * replacement, as `MarkdownResourceBodyEditor`'s is a running body edit.
 */
export interface ImageReplaceEditor {
  /** The media types offered to the file picker, as its `accept` attribute. */
  readonly accept: string;
  /**
   * Replace the image. Answers the sentence to show in the target when the
   * replacement is refused, or `null` once it is over.
   */
  readonly onReplace: (replacement: ImageReplacement) => Promise<string | null>;
  /** Withdraw the target: after a replacement that is over, and on Cancel or Escape. */
  readonly onEnd: () => void;
}

export interface ImageReplaceTargetProps {
  /** The Resource's name, which names the target. */
  readonly name: string;
  readonly editor: ImageReplaceEditor;
}

/**
 * An Image Resource's content while its image is being replaced: shadcn's
 * outline `Empty` with an Upload button at its centre and a URL field beneath
 * it (the registry's `empty-outline` and `empty-input-group` examples).
 *
 * A Resource at the Closed Size has a content area far shorter than that
 * layout, so in a short room the target draws compactly
 * — Upload and the URL field on one row and the refusal beneath them — and
 * scrolls within the room rather than being clipped by the Resource.
 */
export function ImageReplaceTarget({ name, editor }: ImageReplaceTargetProps) {
  const [url, setUrl] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * A replacement is waiting on its answer. The target cannot be ended
   * meanwhile — not by Escape, not by Cancel — because a refusal answered after
   * it had gone would be said nowhere.
   */
  const [busy, setBusy] = useState(false);
  const busyNow = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refusalId = useId();
  const picker = useRef<HTMLInputElement | null>(null);
  const upload = useRef<HTMLButtonElement | null>(null);
  // The caret starts on Upload, as a body edit's starts in its editor. Not
  // scrolled into view: the canvas, not the page, decides what is shown.
  useEffect(() => {
    upload.current?.focus({ preventScroll: true });
  }, []);
  /**
   * Cancel, published to the surrounding Resource to draw in place of Replace.
   * Built once and reading the current editor through a ref, so the Resource is
   * not re-rendered by every new editor identity.
   */
  const endLatest = useRef(editor.onEnd);
  useLayoutEffect(() => {
    endLatest.current = editor.onEnd;
  });
  /** Escape and Cancel: withdraw the target, unless a replacement is waiting on its answer. */
  const end = useCallback((): void => {
    if (!busyNow.current) endLatest.current();
  }, []);
  const publish = usePublishResourceContentEdit();
  const exits = useMemo<ResourceContentEdit>(() => ({ onCancel: end, busy }), [end, busy]);
  useLayoutEffect(() => {
    if (publish === null) return undefined;
    publish(exits);
    return () => publish(null);
  }, [exits, publish]);
  const replace = async (replacement: ImageReplacement): Promise<void> => {
    if (busyNow.current) return;
    busyNow.current = true;
    setBusy(true);
    setRefusal(null);
    let answer: string | null;
    try {
      answer = await editor.onReplace(replacement);
    } finally {
      busyNow.current = false;
      setBusy(false);
    }
    // A target that has gone was ended by something else, whose caret an
    // `onEnd` now would take away.
    if (!mounted.current) return;
    if (answer === null) editor.onEnd();
    else setRefusal(answer);
  };
  return (
    // The room is what the compact layout below the full one is measured
    // against (`resource-image.css`), since a size query cannot read the box it
    // restyles.
    <div className="resource-image-replace-room">
      <Empty
        role="group"
        aria-label={`Replace image of ${name}`}
        aria-busy={busy}
        aria-disabled={busy}
        // `nodrag nopan`: a press or a text selection in the target is not a
        // drag of the Resource or a pan of the canvas it is drawn on.
        className="resource-image-replace nodrag nopan border border-dashed"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          end();
        }}
        // The drop is hand-rolled: no registry component accepts a dropped file
        // (`interactiveDeviations` in `design-system-inventory.ts`). Both events
        // stop here so a canvas drawn around the target does not take the file
        // as well.
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = busyNow.current ? 'none' : 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const files = Array.from(event.dataTransfer.files);
          if (files.length > 0) void replace({ kind: 'files', files });
        }}
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon size={16} />
          </EmptyMedia>
          <EmptyTitle>Replace image</EmptyTitle>
          <EmptyDescription>Upload a picture, drop one here, or enter its URL.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* Withheld while busy without leaving the tab order: a natively
            disabled control that holds focus drops it to the document, where
            neither typing nor Escape reaches the target when the answer is a
            refusal. So the Upload button keeps focus through Base UI's
            `focusableWhenDisabled`, and the field is read-only rather than
            disabled; `busyNow` refuses a second replacement meanwhile. */}
          <Button
            ref={upload}
            size="compact"
            disabled={busy}
            focusableWhenDisabled
            onClick={() => picker.current?.click()}
          >
            Upload
          </Button>
          <ImageFilePicker
            ref={picker}
            accept={editor.accept}
            data-testid="replace-image-file"
            onChoose={(files) => {
              if (files.length > 0) void replace({ kind: 'files', files });
            }}
          />
          <form
            className="w-full"
            onSubmit={(event) => {
              event.preventDefault();
              void replace({ kind: 'url', url });
            }}
          >
            <InputGroup>
              <InputGroupInput
                readOnly={busy}
                aria-disabled={busy}
                className="aria-disabled:opacity-50"
                aria-label="Image URL"
                aria-invalid={refusal !== null}
                aria-describedby={refusal === null ? undefined : refusalId}
                type="text"
                inputMode="url"
                placeholder="https://"
                value={url}
                onChange={(event) => setUrl(event.currentTarget.value)}
              />
            </InputGroup>
          </form>
          {refusal !== null && <FieldError id={refusalId}>{refusal}</FieldError>}
        </EmptyContent>
      </Empty>
    </div>
  );
}
