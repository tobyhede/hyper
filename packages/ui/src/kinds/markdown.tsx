import { authorsContent, isOwnContent, markdownKind, type MarkdownContent } from '@project/core';
import type { MarkdownResourceBodyEditor } from '../MarkdownResourceBody';
import type { ResourceDisplay } from '../resource-display';
import { EditIcon, MarkdownIcon } from '../icons';
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

/** A Markdown Resource's running edit: the editor of its source, and whether it takes focus when drawn. */
export interface MarkdownEdit {
  readonly editor: MarkdownResourceBodyEditor;
  readonly autoFocus: boolean;
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
  const display = area.display;
  const body: Mutable<Pick<MarkdownResourceBodyProps, 'onBeginEdit' | 'editor' | 'autoFocus'>> = {};
  if (area.authoring && area.onBeginEdit !== undefined && area.selected) {
    body.onBeginEdit = area.onBeginEdit;
  }
  if (area.authoring && display.shown === 'editing' && display.kind === markdownKind.id) {
    body.editor = display.edit.editor;
    body.autoFocus = display.edit.autoFocus;
  }
  return (
    <ResourceContentEditProvider value={area.setContentEdit}>
      <MarkdownResourceBody
        source={content.source}
        ariaLabel={`Markdown source of ${area.name}`}
        drawnName={area.name}
        {...body}
      />
    </ResourceContentEditProvider>
  );
};

/**
 * The view half of the Markdown kind (ADR 0020): what a Markdown
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
  contentCommand: { label: (name) => `Edit Resource ${name}`, Icon: EditIcon },
  canvas: markdownCanvas,
  presented: (name, content) => (
    <RenderedMarkdown className="resource__body" markdown={content.source} drawnName={name} />
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
): D | Extract<ResourceDisplay, { readonly kind: typeof markdownKind.id }> {
  if (display.shown !== 'open') return display;
  const content = display.content;
  if (!isOwnContent(content) || !authorsContent(content) || content.kind !== markdownKind.id)
    return display;
  return {
    shown: 'editing',
    kind: markdownKind.id,
    content,
    edit: { editor, autoFocus },
  };
}
