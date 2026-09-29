import { useState } from 'react';
import { Button } from './Button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './components/empty';
import { ImageIcon } from './icons';
import './resource-image.css';

export interface ResourceImageProps {
  /** The image URL the Image Resource owns. */
  readonly url: string;
  /** The Resource's name, which is the image's text alternative. */
  readonly name: string;
  /**
   * Begin replacing the image, offered by the failed-image state. Absent where
   * the image cannot be replaced — a read-only or presented Resource.
   */
  readonly onReplace?: (() => void) | undefined;
}

/**
 * An Image Resource's content: its picture, contained in the room it is given and
 * never scaled past its natural size, or — when the picture will not load — the
 * failed-image state naming the URL.
 *
 * A failed load is a fact about this mount, not the Space, so a caller that
 * changes the URL keys this on it to try again.
 */
export function ResourceImage({ url, name, onReplace }: ResourceImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <Empty className="resource-image resource-image--failed" data-testid="resource-image-failed">
        <EmptyHeader>
          <EmptyMedia>
            <ImageIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>Image did not load</EmptyTitle>
          <EmptyDescription className="resource-image__url">{url}</EmptyDescription>
        </EmptyHeader>
        {onReplace !== undefined && (
          <EmptyContent>
            {/* `nodrag nopan` and the stopped press keep a press here off the
                canvas the Resource is drawn on. */}
            <Button
              size="compact"
              className="nodrag nopan"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onReplace();
              }}
            >
              Replace image
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }
  return (
    <div className="resource-image">
      <img
        className="resource-image__picture"
        src={url}
        alt={name}
        draggable={false}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
