import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { titleName } from '@project/core';
import { ResourceImage } from './ResourceImage';

interface ResourceContentTitle {
  /**
   * The Resource's Title, whole. Presenting draws its **name** — the first line —
   * because the Title ladder belongs to the Resource front and nothing else
   * (ADR 0083), and a presented Resource is a different surface with a different
   * frame around it.
   */
  title: string;
}

/** A presented Resource draws its Markdown, or an Image Resource's picture (ADR 0107). */
export type ResourceContentProps = ResourceContentTitle &
  ({ markdown: string; imageUrl?: never } | { imageUrl: string; markdown?: never });

interface RenderedMarkdownProps {
  readonly markdown: string;
  readonly className?: string;
}

/**
 * The one Markdown parser and sanitiser shared by every rendered Resource body.
 *
 * Kept separate from {@link ResourceContent} so an Open Resource can reuse the
 * presentation-mode rendering without also drawing presentation mode's title
 * and outer frame.
 */
export function RenderedMarkdown({ markdown, className }: RenderedMarkdownProps) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(markdown, { async: false })),
    [markdown],
  );

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Renders a resource's title and its Markdown content, **parsed**, for presenting.
 *
 * An Open Resource draws its body through {@link RenderedMarkdown} as well, and
 * editing swaps that body for `MarkdownSourceEditor`, the one place source is
 * shown. This module is the app's only Markdown parser; do not add a second,
 * or the rendered and presented forms of one Resource can diverge.
 *
 * **Sanitised before insertion.** A Resource body is untrusted input: it arrives
 * from a database over HTTP, and `POST /api/spaces` accepts a commit carrying
 * Resource bodies without checking Origin or Host, so a page in the author's
 * browser that can reach the host can write one. `marked` has no `sanitize`
 * option, so `<img src=x onerror=…>`, a `javascript:` href and
 * `<iframe src=javascript:>` would otherwise run in the app's origin. Do not
 * insert parsed Markdown without passing it through DOMPurify.
 */
export function ResourceContent(props: ResourceContentProps) {
  const name = titleName(props.title);
  return (
    <article className="resource resource--full" data-testid="resource-content">
      <h2 className="resource__title">{name}</h2>
      {props.imageUrl === undefined ? (
        <RenderedMarkdown className="resource__body" markdown={props.markdown} />
      ) : (
        <ResourceImage key={props.imageUrl} url={props.imageUrl} name={name} />
      )}
    </article>
  );
}
