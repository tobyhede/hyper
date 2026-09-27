import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { titleName } from '@project/core';
import { ResourceImage } from './ResourceImage';

/**
 * What a Resource's content area draws: a Markdown document, or an Image
 * Resource's picture in the same place. The Open front and the presented
 * Resource both draw one.
 */
export type ResourceContentBody =
  | { readonly kind: 'markdown'; readonly source: string }
  | { readonly kind: 'image'; readonly url: string };

export interface ResourceContentProps {
  /**
   * The Resource's Title, whole. Presenting draws its **name** — the first line —
   * because the Title ladder belongs to the Resource front and nothing else
   * (ADR 0083), and a presented Resource is a different surface with a different
   * frame around it.
   */
  readonly title: string;
  readonly content: ResourceContentBody;
}

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
 * Renders a resource's title and its content, Markdown **parsed**, for presenting.
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
export function ResourceContent({ title, content }: ResourceContentProps) {
  const name = titleName(title);
  return (
    <article className="resource resource--full" data-testid="resource-content">
      <h2 className="resource__title">{name}</h2>
      {content.kind === 'markdown' ? (
        <RenderedMarkdown className="resource__body" markdown={content.source} />
      ) : (
        <ResourceImage key={content.url} url={content.url} name={name} />
      )}
    </article>
  );
}
