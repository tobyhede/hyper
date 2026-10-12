import { contentAction, markdownKind, type MarkdownContent } from '@project/core';
import type { MarkdownResourceBodyEditor } from '../MarkdownResourceBody';
import type { ResourceDisplay } from '../resource-display';
import { MarkdownIcon } from '../icons';
import { MarkdownResourceBody, type MarkdownResourceBodyProps } from '../MarkdownResourceBody';
import { RenderedMarkdown } from '../RenderedMarkdown';
import { ResourceContentEditProvider } from '../resource-content-edit';
import type { CanvasArea, KindView } from './kind-view';

/** What a Markdown Resource offers beyond its Title. */
export interface MarkdownOperations {
  readonly kind: typeof markdownKind.id;
  /** Put a caret in this Resource's Markdown source. */
  readonly onBeginEdit?: () => void;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * An Open Markdown Resource's body. A click on an unselected Resource selects
 * it, as a click on any React Flow node does; editing its Markdown is the next
 * click, or the Edit command (ADR 0102). So the body's edit target is offered
 * only once the Resource is selected. Content that is leaving, or is a
 * Target's, is drawn at rest: no editor and no edit target.
 */
const markdownCanvas = (content: MarkdownContent, area: CanvasArea) => {
  const body: Mutable<Pick<MarkdownResourceBodyProps, 'onBeginEdit' | 'editor' | 'autoFocus'>> = {};
  if (area.authoring && area.onBeginEdit !== undefined && area.selected) {
    body.onBeginEdit = area.onBeginEdit;
  }
  if (area.authoring && area.display.shown === 'editing') {
    body.editor = area.display.editor;
    body.autoFocus = area.display.autoFocus;
  }
  return (
    <ResourceContentEditProvider value={area.setContentEdit}>
      <MarkdownResourceBody
        source={content.source}
        ariaLabel={`Markdown source of ${area.name}`}
        {...body}
      />
    </ResourceContentEditProvider>
  );
};

/**
 * The view half of the Markdown kind (ADR 0020, ADR 0128): what a Markdown
 * Resource is called and drawn as, and what it offers beyond the shared
 * Title. On a Map its content view is `MarkdownResourceBody`, and its content
 * action is Edit; presented, its source is rendered.
 */
export const markdownView: KindView<MarkdownOperations, MarkdownContent> = {
  name: 'Markdown Resource',
  listName: 'Markdown Resources',
  referenceName: 'Reference to a Markdown Resource',
  Glyph: MarkdownIcon,
  bareOperations: { kind: markdownKind.id },
  canvas: markdownCanvas,
  presented: (_name, content) => (
    <RenderedMarkdown className="resource__body" markdown={content.source} />
  ),
};

/**
 * Edit a Resource's Markdown body. Answers `display` itself unless it is Open
 * with the Resource's own Markdown, so a caret that lands before the Open
 * display draws nothing until it arrives.
 */
export function beginEditing<D extends ResourceDisplay>(
  display: D,
  editor: MarkdownResourceBodyEditor,
  autoFocus: boolean,
): D | Extract<ResourceDisplay, { readonly shown: 'editing' }> {
  if (display.shown !== 'open') return display;
  const content = display.content;
  if (contentAction(content) !== 'edit-markdown' || content.kind !== markdownKind.id)
    return display;
  return {
    shown: 'editing',
    content: { ...content, via: 'self' },
    editor,
    autoFocus,
  };
}
