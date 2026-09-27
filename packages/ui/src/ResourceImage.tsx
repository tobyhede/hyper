import { useState } from 'react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './components/empty';
import { ImageIcon } from './icons';
import './resource-image.css';

export interface ResourceImageProps {
  /** The image URL the Image Resource owns. */
  readonly url: string;
  /** The Resource's name, which is the image's text alternative. */
  readonly name: string;
}

/**
 * An Image Resource's content: its picture, contained in the room it is given and
 * never scaled past its natural size, or — when the picture will not load — the
 * failed-image state naming the URL.
 *
 * A failed load is a fact about this mount, not the Space, so a caller that
 * changes the URL keys this on it to try again.
 */
export function ResourceImage({ url, name }: ResourceImageProps) {
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
