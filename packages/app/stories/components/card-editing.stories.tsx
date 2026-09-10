import { useRef, useState, type CSSProperties } from 'react';
import type { Story } from '@ladle/react';
import { titleName } from '@project/core';
import { Button, CanvasCard, type CanvasCardFront } from '@project/ui';
import { cardSizeVars } from '#src/card';

export default { title: 'Components/Card/Editing' };

/**
 * The Card's own title editor, entirely private to this component: begins from
 * the Title's native control, keeps a refused draft local with a field-local
 * error, completes and exits on Enter, cancels on Escape, and returns focus to
 * the Card around it.
 */
function TitleEditingCard({
  initiallyOpen,
  initialTitle,
}: {
  readonly initiallyOpen: boolean;
  readonly initialTitle: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  const group = useRef<HTMLDivElement>(null);
  const front: CanvasCardFront = open
    ? {
        kind: 'markdown',
        source: '## Open Card body',
        open: true,
        onOpenChange: changeOpen,
      }
    : {
        kind: 'markdown',
        source: '## Open Card body',
        open: false,
        onOpenChange: changeOpen,
      };

  return (
    <div style={open ? openFrame : cardSizeVars}>
      <div
        role="group"
        // The Card's **name**, which is the Title's first line: everything that
        // refers to a Card rather than drawing its front shows that and nothing
        // else (ADR 0083). The ladder belongs to the Card front alone.
        aria-label={`${titleName(title)} on the canvas`}
        tabIndex={-1}
        ref={group}
        data-testid="card-group"
      >
        <CanvasCard
          front={front}
          title={title}
          graphColor="#ffc53d"
          {...(editing
            ? {
                state: 'editing' as const,
                onCompleteTitleEdit: (draft: string) => {
                  if (draft.trim().length === 0) return 'A Card title is required.';
                  setTitle(draft);
                  setEditing(false);
                  return null;
                },
                onCancelTitleEdit: () => setEditing(false),
                onReturnFocus: () => group.current?.focus(),
              }
            : {
                state: 'rest' as const,
                onBeginTitleEdit: () => setEditing(true),
              })}
        />
      </div>
    </div>
  );
}

/**
 * A third specimen, and the one the heading nesting is proved on.
 *
 * The two above it are titled on one line, which is the Title Hyper has always
 * had and the shape the in-place geometry of this editor is a promise about.
 * That shape cannot tell ADR 0083's two arrangements apart: `Edit Title <name>`
 * and the heading's own name are then the same string, so a control that had
 * swallowed the heading, and an implementation that drew the name and dropped
 * every line after it, both read as correct. A ladder is what separates them.
 *
 * Named differently from the others on purpose — the Card's name is its first
 * line, so `Auth` is what every control on this specimen is named after, and a
 * lookup cannot cross specimens by accident.
 */
const ladderTitle = 'Auth\nhow tokens are minted\ndraft, 2026';

/** The Title opens its editor with the value selected, keeps a refused draft field-local, and completes on Enter or cancels on Escape — for a Closed, an Open and a laddered Card. */
export const Title: Story = () => (
  <div className="flex flex-wrap items-start gap-8 p-8">
    <section aria-label="Closed Card title editing" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Closed</p>
      <TitleEditingCard initiallyOpen={false} initialTitle="Draft entry" />
    </section>
    <section aria-label="Open Card title editing" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Open</p>
      <TitleEditingCard initiallyOpen initialTitle="Draft entry" />
    </section>
    <section aria-label="Laddered Card title editing" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Title Lines</p>
      <TitleEditingCard initiallyOpen={false} initialTitle={ladderTitle} />
    </section>
  </div>
);

type CardFrameStyle = CSSProperties & {
  readonly '--card-width': string;
  readonly '--card-height': string;
};

const openFrame: CardFrameStyle = {
  '--card-width': '480px',
  '--card-height': '360px',
  width: '480px',
  height: '360px',
};

const markdown = `## Placement is authored

A **Diagram** owns explicit Card rects. A strategy only computes placement.`;

type Mode = 'rendered' | 'focused' | 'unfocused';

/** An open Markdown Card begins editing from its rendered body or rail, keeps blur inert, and ends through Save, Cancel, Escape or Mod-Enter. */
export const Markdown: Story = () => {
  const [source, setSource] = useState(markdown);
  const [mode, setMode] = useState<Mode>('rendered');
  const [open, setOpen] = useState(true);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  const editing = mode !== 'rendered';
  const front: CanvasCardFront = editing
    ? {
        kind: 'markdown',
        source,
        open: true,
        autoFocusEditor: mode === 'focused',
        editor: {
          onComplete: (next) => {
            setSource(next);
            return 'completed';
          },
          onEnd: () => setMode('rendered'),
        },
        onOpenChange: changeOpen,
        onBeginEdit: () => setMode('focused'),
      }
    : open
      ? {
          kind: 'markdown',
          source,
          open: true,
          onOpenChange: changeOpen,
          onBeginEdit: () => setMode('focused'),
        }
      : {
          kind: 'markdown',
          source,
          open: false,
          onOpenChange: changeOpen,
          onBeginEdit: () => setMode('focused'),
        };

  return (
    <div className="flex flex-col items-start gap-3 p-8">
      <div className="flex gap-2" aria-label="Markdown editing state">
        <Button type="button" variant="ghost" onClick={() => setMode('rendered')}>
          Rendered
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('focused')}>
          Focused edit
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('unfocused')}>
          Unfocused edit
        </Button>
      </div>
      <div style={openFrame}>
        <CanvasCard front={front} state="rest" title="Strategies" graphColor="#ffc53d" />
      </div>
    </div>
  );
};
