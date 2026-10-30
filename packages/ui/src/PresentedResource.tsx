import type { ReactNode } from 'react';
import { titleName, UNRESOLVED_CONTENT, type ResourceContent } from '@project/core';
import { presentedContent } from './kinds/registry';
import { UnresolvedContent } from './UnresolvedContent';

export interface PresentedResourceProps {
  /**
   * The Resource's Title, whole. Presenting draws its **name** — the first line —
   * because the Title ladder belongs to the drawn Resource and nothing else
   * (ADR 0083), and a presented Resource is a different surface with a different
   * frame around it.
   */
  readonly title: string;
  /** The Resource's resolved content, its own or its Target's. */
  readonly content: ResourceContent;
  /**
   * Drawn in place of the content's own view, for content only the composing
   * application can draw: a Space Resource's Map, which needs the Space it
   * points at.
   */
  readonly children?: ReactNode;
}

/**
 * Renders a resource's title and its content for presenting, its content as
 * its kind's view half draws it: a Markdown Resource's **parsed**, through
 * `RenderedMarkdown`.
 */
export function PresentedResource({ title, content, children }: PresentedResourceProps) {
  const name = titleName(title);
  return (
    <article
      className={
        children === undefined
          ? 'resource resource--full'
          : 'resource resource--full resource--drawn'
      }
      data-testid="resource-content"
      data-content-kind={content.kind}
    >
      <h2 className="resource__title">{name}</h2>
      {children ?? <PresentedContent name={name} content={content} />}
    </article>
  );
}

/**
 * The content below a presented Resource's name, drawn by its kind's view half
 * (`kinds/registry.ts`). A presented image is never replaced, its own or a
 * Target's, so no view offers Replace. A Space Resource's view half draws
 * nothing here: the application draws its Map instead, through `children`. An
 * Ur Resource has no content (ADR 0113), so it draws its name alone. The
 * article carries the kind as `data-content-kind` so a stylesheet can address
 * each kind's frame.
 */
function PresentedContent({
  name,
  content,
}: {
  readonly name: string;
  readonly content: ResourceContent;
}) {
  return content.kind === UNRESOLVED_CONTENT.kind ? (
    <UnresolvedContent />
  ) : (
    presentedContent(name, content)
  );
}
