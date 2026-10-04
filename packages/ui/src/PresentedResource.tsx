import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { titleName, type ResourceContent } from '@project/core';
import { ResourceImage } from './ResourceImage';
import { UnresolvedContent } from './UnresolvedContent';

export interface PresentedResourceProps {
  /**
   * The Resource's Title, whole. Presenting draws its **name** — the first line —
   * because the Title ladder belongs to the Resource front and nothing else
   * (ADR 0083), and a presented Resource is a different surface with a different
   * frame around it.
   */
  readonly title: string;
  /** The Resource's resolved content, its own or its Target's. */
  readonly content: ResourceContent;
}

interface RenderedMarkdownProps {
  readonly markdown: string;
  readonly className?: string;
}

/**
 * The one Markdown parser and sanitiser shared by every rendered Resource body.
 *
 * Kept separate from {@link PresentedResource} so an Open Resource can reuse the
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
export function PresentedResource({ title, content }: PresentedResourceProps) {
  const name = titleName(title);
  return (
    <article
      className="resource resource--full"
      data-testid="resource-content"
      data-content-kind={content.kind}
    >
      <h2 className="resource__title">{name}</h2>
      <PresentedContent name={name} content={content} />
    </article>
  );
}

/**
 * The content below a presented Resource's name, one arm per content kind.
 *
 * A presented image is never replaced, its own or a Target's, so no arm offers
 * Replace. A Space Resource draws its name alone: what presenting one should
 * draw is `resource-content/07`'s open question. An Ur Resource has no
 * content (ADR 0113), so it draws its name alone. The article carries the
 * kind as `data-content-kind` so a stylesheet can address each kind's frame.
 */
function PresentedContent({
  name,
  content,
}: {
  readonly name: string;
  readonly content: ResourceContent;
}) {
  switch (content.kind) {
    case 'markdown':
      return <RenderedMarkdown className="resource__body" markdown={content.source} />;
    case 'image':
      return <ResourceImage key={content.url} url={content.url} name={name} />;
    case 'space':
    case 'ur':
      return null;
    case 'unresolved':
      return <UnresolvedContent />;
  }
}
