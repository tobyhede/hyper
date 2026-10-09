import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from './Button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './components/empty';
import { Skeleton } from './components/skeleton';
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
 * never scaled past its natural size; a skeleton in the picture's place until it
 * loads; or — when the picture will not load — the failed-image state naming
 * the URL.
 *
 * How the load went is a fact about this mount, not the Space, so a caller that
 * changes the URL keys this on it to try again.
 */
export function ResourceImage({ url, name, onReplace }: ResourceImageProps) {
  const [load, setLoad] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const picture = useRef<HTMLImageElement>(null);
  // A picture the browser already holds is complete as it mounts, but its load
  // event still arrives after the first paint; read it before that paint so no
  // skeleton flashes (`ResourceImage.test.tsx`, "draws no skeleton for a picture
  // the browser already has").
  useLayoutEffect(() => {
    const image = picture.current;
    if (!image?.complete) return;
    setLoad(image.naturalWidth > 0 ? 'loaded' : 'failed');
  }, []);
  if (load === 'failed') {
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
        ref={picture}
        className="resource-image__picture"
        data-loading={load === 'loading' ? '' : undefined}
        src={url}
        alt={name}
        draggable={false}
        onLoad={() => setLoad('loaded')}
        onError={() => setLoad('failed')}
      />
      {load === 'loading' && (
        <Skeleton role="status" aria-label="Loading image" className="resource-image__skeleton" />
      )}
    </div>
  );
}
