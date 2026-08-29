/**
 * THROWAWAY UX REVIEW SURFACE — not a production component and not an ADR proof.
 *
 * Decided so far:
 *   - Rail controls are consistent in treatment — same box, same 22px icon
 *     button, same trailing cluster — without being the same set per kind.
 *   - A Space Card has no Edit control. Authoring the embedded Space is done by
 *     working in it, so Edit is implicit in the layout rather than a command on
 *     the band.
 *   - A Space Card's rail carries Select Space View, Select Graph and Enter,
 *     all as icon buttons. The two selectors open dropdowns; the rail itself
 *     draws no words.
 *
 * Still open: whether the rail's action cluster is a plain group of buttons, as
 * today, or a real `role="toolbar"` with roving tabindex. The roving container
 * below is hand-rolled *for this story only* — Base UI ships `Toolbar`
 * (Root/Group/Button/Link/Separator) and production would compose that through
 * `@project/ui`; `app` may not import Base UI directly.
 *
 * Delete this surface once the decision is made.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Story } from '@ladle/react';
import { COLLAPSED_CARD_SIZE, DEFAULT_OPEN_SIZE } from '@project/core';
import {
  AbandonEditIcon,
  Button,
  CanvasCard,
  CloseCardIcon,
  CommitEditIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EditIcon,
  GraphIcon,
  MarkdownIcon,
  OpenCardIcon,
} from '@project/ui';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import '../support/inventory.css';
import './space-card-rail.css';

export default { title: 'Review/Space Card Rail' };

const GRAPH_COLOR = '#ffc53d';
const MARKDOWN_SOURCE =
  'Presenting walks the Active Graph. A fork offers every outgoing Edge at once.';
const SPACE_VIEWS = ['Architecture layout', 'Flow', 'Grid'] as const;
const GRAPHS = ['Main thread', 'Decision fork'] as const;

/** The two Card kinds this surface compares. `space` is not a domain kind yet. */
type PrototypeKind = 'markdown' | 'space';
type CardState = 'rest' | 'selected';
/** Whether a rail's action cluster is a plain group or a real toolbar. */
type RailSemantics = 'group' | 'toolbar';

/**
 * The custom properties the prototype publishes to the shipped Card stylesheet.
 *
 * Declared as the intersection the object is actually built as, rather than
 * asserted after the fact — `CSSProperties` does not type CSS custom
 * properties, and the fact is true by construction (ADR 0062).
 */
interface CardSizeStyle extends CSSProperties {
  readonly '--card-width': string;
  readonly '--card-height': string;
}

interface PrototypeCardStyle extends CardSizeStyle {
  readonly '--canvas-card-graph': string;
}

const sizeVars = (open: boolean): CardSizeStyle => {
  const size = open ? DEFAULT_OPEN_SIZE : COLLAPSED_CARD_SIZE;
  return { '--card-width': `${size.width}px`, '--card-height': `${size.height}px` };
};

/**
 * Three glyphs the shipped icon module does not offer at the rail's 14px.
 *
 * `SpaceViewGlyph` is the same Lucide `panels-top-left` the Sidebar's
 * `LayoutIcon` draws, redrawn here only because that export fixes its size at
 * 16 and the rail's other glyphs are 14 — production would give `LayoutIcon` a
 * `size` prop rather than keep this. `EnterSpaceGlyph` is Lucide `log-in`: an
 * arrow going *into* a container, deliberately unlike the Open control's
 * `maximize-2`, because entering the Space and expanding the Card in place are
 * two different destinations and must not share a symbol. `SpaceKindGlyph` is
 * Lucide `square-square` — a Card with a canvas inside it — and it has to
 * differ from `SpaceViewGlyph`, or the kind at the rail's leading edge and the
 * Space View selector at its trailing edge draw the same mark.
 */
const glyphProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const SpaceKindGlyph = () => (
  <svg {...glyphProps}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

const SpaceViewGlyph = () => (
  <svg {...glyphProps}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
);

const EnterSpaceGlyph = () => (
  <svg {...glyphProps}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" x2="3" y1="12" y2="12" />
  </svg>
);

/**
 * A `role="toolbar"` with roving tabindex: one tab stop, arrows between items,
 * and an unavailable item that keeps both its slot and its place in the arrow
 * order. `semantics: 'group'` is what the rail draws today — a plain div whose
 * every button is its own tab stop, and whose disabled button leaves the
 * keyboard order entirely.
 */
function RailActions({
  semantics,
  label,
  children,
}: {
  readonly semantics: RailSemantics;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const items = (): readonly HTMLElement[] =>
    Array.from(root.current?.querySelectorAll<HTMLElement>('[data-rail-item]') ?? []);

  useLayoutEffect(() => {
    if (semantics !== 'toolbar') return;
    const list = items();
    const index = Math.min(active, Math.max(list.length - 1, 0));
    list.forEach((item, position) => {
      item.tabIndex = position === index ? 0 : -1;
    });
  });

  if (semantics === 'group') {
    return (
      <div className="canvas-card__actions" data-rail-semantics="group">
        {children}
      </div>
    );
  }

  return (
    <div
      ref={root}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      className="canvas-card__actions"
      data-rail-semantics="toolbar"
      onKeyDown={(event) => {
        const list = items();
        if (list.length === 0) return;
        const current = list.findIndex((item) => item === document.activeElement);
        const next =
          event.key === 'ArrowRight'
            ? (current + 1 + list.length) % list.length
            : event.key === 'ArrowLeft'
              ? (current - 1 + list.length) % list.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? list.length - 1
                  : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        setActive(next);
        list[next]?.focus();
      }}
    >
      {children}
    </div>
  );
}

/**
 * What a rail control carries beyond its own props: the roving container's
 * marker, and whichever of the two ways of being unavailable its semantics use.
 */
interface RailActionAttributes {
  'data-rail-item'?: 'true';
  'aria-disabled'?: boolean;
  'aria-keyshortcuts'?: string;
  disabled?: boolean;
}

/**
 * One rail control. `unavailable` is deliberately not the `disabled` attribute
 * in the toolbar variant: ADR 0064 wants the Close control to keep its slot and
 * say it is unavailable, and a `<button disabled>` says that to the eye only —
 * it is gone from the keyboard entirely.
 */
function RailAction({
  label,
  semantics,
  unavailable = false,
  keyshortcuts,
  onClick,
  children,
}: {
  readonly label: string;
  readonly semantics: RailSemantics;
  readonly unavailable?: boolean;
  readonly keyshortcuts?: string;
  readonly onClick?: () => void;
  readonly children: ReactNode;
}) {
  /**
   * A toolbar item is marked for the roving container and made unavailable with
   * `aria-disabled`, which leaves it focusable; a plain group control uses the
   * `disabled` attribute, which does not. That is the difference section 3 is
   * asking about, so the two sets are built here rather than merged.
   */
  const attributes: RailActionAttributes = {};
  if (keyshortcuts !== undefined) attributes['aria-keyshortcuts'] = keyshortcuts;
  if (semantics === 'toolbar') {
    attributes['data-rail-item'] = 'true';
    attributes['aria-disabled'] = unavailable;
  } else {
    attributes.disabled = unavailable;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="card__rail-action nodrag nopan"
      aria-label={label}
      {...attributes}
      onClick={() => {
        if (unavailable) return;
        onClick?.();
      }}
    >
      {children}
    </Button>
  );
}

/**
 * A rail control that chooses one of a list.
 *
 * The same 22px icon button as every other rail control — the current value is
 * named by the control's accessible name and marked in the menu, never drawn on
 * the band, so the rail stays wordless. `DropdownMenu` rather than `Select`
 * because a Select's trigger exists to display its value and this one shows a
 * glyph.
 */
function RailSelect({
  label,
  semantics,
  value,
  options,
  onValueChange,
  children,
}: {
  readonly label: string;
  readonly semantics: RailSemantics;
  readonly value: string;
  readonly options: readonly string[];
  readonly onValueChange: (value: string) => void;
  readonly children: ReactNode;
}) {
  const triggerAttributes: Pick<RailActionAttributes, 'data-rail-item'> = {};
  if (semantics === 'toolbar') triggerAttributes['data-rail-item'] = 'true';

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        // `nokey`: React Flow subscribes its delete key on `document`, and a
        // portalled popup sits outside the canvas's own guard.
        className="card__rail-action nodrag nopan nokey"
        aria-label={`${label}: ${value}`}
        title={`${label}: ${value}`}
        {...triggerAttributes}
        render={<Button variant="ghost" size="icon" />}
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-[11rem]">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(String(next))}>
          {options.map((option) => (
            // A Base UI radio item keeps its menu open by default, which suits
            // a set of toggles. Choosing a Space View is one choice and done,
            // so this one closes behind itself.
            <DropdownMenuRadioItem key={option} value={option} closeOnClick>
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PrototypeCardProps {
  readonly kind: PrototypeKind;
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly state: CardState;
  readonly semantics: RailSemantics;
  /** A content edit is running. Only a Markdown Card has one. */
  readonly editing?: boolean;
  readonly onEditingChange?: (editing: boolean) => void;
}

/**
 * One prototype Card of either kind, drawn with the shipped Card and rail CSS.
 *
 * A Markdown Card's rail carries Edit and Open/Close, and swaps Edit for Save
 * and Cancel while an edit runs. A Space Card's rail carries Select Space View,
 * Select Graph, Enter and Open/Close — every one of them the same icon button,
 * and no Edit, because the embedded Space is authored by working in it.
 */
function PrototypeCard({
  kind,
  title,
  open,
  onOpenChange,
  state,
  semantics,
  editing = false,
  onEditingChange,
}: PrototypeCardProps) {
  const [spaceView, setSpaceView] = useState<string>(SPACE_VIEWS[0]);
  const [graph, setGraph] = useState<string>(GRAPHS[0]);
  const style: PrototypeCardStyle = {
    ...sizeVars(open),
    '--canvas-card-graph': GRAPH_COLOR,
  };
  const kindName = kind === 'space' ? 'Space Card' : 'Markdown Card';

  return (
    <div
      className="canvas-card space-rail__card"
      data-testid="card"
      data-kind={kind}
      data-state={state}
      data-expanded={open}
      data-content-editing={editing}
      role="article"
      aria-label={title}
      style={style}
    >
      <div className="card-rail canvas-card__rail" style={{ background: GRAPH_COLOR }}>
        <span className="card-rail__kind" role="img" aria-label={kindName} title={kindName}>
          {kind === 'space' ? <SpaceKindGlyph /> : <MarkdownIcon />}
        </span>
        <RailActions semantics={semantics} label={`Card ${title}`}>
          {kind === 'space' && (
            <>
              <RailSelect
                label="Space View"
                semantics={semantics}
                value={spaceView}
                options={SPACE_VIEWS}
                onValueChange={setSpaceView}
              >
                <SpaceViewGlyph />
              </RailSelect>
              <RailSelect
                label="Graph"
                semantics={semantics}
                value={graph}
                options={GRAPHS}
                onValueChange={setGraph}
              >
                <GraphIcon size={14} />
              </RailSelect>
              <RailAction label={`Enter Space ${title}`} semantics={semantics}>
                <EnterSpaceGlyph />
              </RailAction>
            </>
          )}
          {kind === 'markdown' &&
            (editing ? (
              <>
                <RailAction
                  label={`Save Card ${title}`}
                  semantics={semantics}
                  keyshortcuts="Meta+Enter Control+Enter"
                  onClick={() => onEditingChange?.(false)}
                >
                  <CommitEditIcon data-icon="inline-start" />
                </RailAction>
                <RailAction
                  label={`Cancel editing Card ${title}`}
                  semantics={semantics}
                  keyshortcuts="Escape"
                  onClick={() => onEditingChange?.(false)}
                >
                  <AbandonEditIcon data-icon="inline-start" />
                </RailAction>
              </>
            ) : (
              <RailAction
                label={`Edit Card ${title}`}
                semantics={semantics}
                onClick={() => {
                  if (!open) onOpenChange(true);
                  onEditingChange?.(true);
                }}
              >
                <EditIcon data-icon="inline-start" />
              </RailAction>
            ))}
          <RailAction
            label={`${open ? 'Close' : 'Open'} Card ${title}`}
            semantics={semantics}
            unavailable={editing}
            onClick={() => onOpenChange(!open)}
          >
            {open ? (
              <CloseCardIcon data-icon="inline-start" />
            ) : (
              <OpenCardIcon data-icon="inline-start" />
            )}
          </RailAction>
        </RailActions>
      </div>
      {open && (
        <div className="canvas-card__content space-rail__content" data-presence="present">
          {kind === 'space' ? (
            <div className="space-rail__embedded" aria-label="Embedded Space View">
              <span className="space-rail__embedded-note">
                Research Space · {spaceView} · {graph}
              </span>
            </div>
          ) : (
            <div className="space-rail__markdown">
              {editing ? (
                <pre className="space-rail__source">{MARKDOWN_SOURCE}</pre>
              ) : (
                <p className="space-rail__prose">{MARKDOWN_SOURCE}</p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="canvas-card__body">
        <h2 className="canvas-card__title">{title}</h2>
      </div>
    </div>
  );
}

/** The Open Markdown Card, drawn by the shipped component, as the reference. */
function MarkdownReference({ state }: { readonly state: CardState }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-rail__card" style={sizeVars(open)}>
      <CanvasCard
        title="Traversal"
        graphColor={GRAPH_COLOR}
        state={state}
        front={{
          kind: 'markdown',
          open,
          source: MARKDOWN_SOURCE,
          onOpenChange: (next) => {
            setOpen(next);
            return 'completed';
          },
          onBeginEdit: () => undefined,
        }}
      />
    </div>
  );
}

function Stateful({
  initialOpen = true,
  children,
}: {
  readonly initialOpen?: boolean;
  readonly children: (control: {
    readonly open: boolean;
    readonly setOpen: (open: boolean) => void;
    readonly editing: boolean;
    readonly setEditing: (editing: boolean) => void;
  }) => ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [editing, setEditing] = useState(false);
  return <>{children({ open, setOpen, editing, setEditing })}</>;
}

/**
 * What a keyboard actually reaches inside one specimen, in tab order.
 *
 * The group-versus-toolbar choice is invisible by construction: the two draw
 * the same pixels and differ only in what Tab does. So the surface measures it
 * rather than asking anyone to take it on trust — this reads the live DOM for
 * elements a Tab can land on, which is exactly what roving tabindex changes and
 * exactly what a `disabled` attribute removes.
 *
 * A `MutationObserver` rather than a re-measure on every render: the roving
 * container writes `tabindex` in a layout effect of its own, and the thing being
 * measured is that write. Watching the DOM sees it whatever caused it, and keeps
 * the measurement a subscription to an external system rather than state
 * derived inside an effect.
 */
const tabStopName = (element: HTMLElement): string => {
  const label = element.getAttribute('aria-label');
  if (label !== null && label !== '') return label;
  const text = element.textContent.trim();
  return text === '' ? '(unnamed)' : text;
};

const tabStopsWithin = (container: HTMLElement): readonly string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]'))
    .filter((element) => !element.hasAttribute('disabled') && element.tabIndex >= 0)
    .map(tabStopName);

const sameStops = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((name, index) => name === right[index]);

function useTabStops(root: RefObject<HTMLElement | null>): readonly string[] {
  const [stops, setStops] = useState<readonly string[]>([]);

  useEffect(() => {
    const container = root.current;
    if (container === null) return;
    const publish = (): void => {
      const next = tabStopsWithin(container);
      setStops((current) => (sameStops(current, next) ? current : next));
    };
    const observer = new MutationObserver(publish);
    observer.observe(container, { subtree: true, childList: true, attributes: true });
    // The first reading, after the roving container's own layout effect has run.
    const first = requestAnimationFrame(publish);
    return () => {
      cancelAnimationFrame(first);
      observer.disconnect();
    };
  }, [root]);

  return stops;
}

/** One specimen, with what a keyboard reaches inside it written underneath. */
function Measured({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const stops = useTabStops(root);

  return (
    <Specimen label={label}>
      <div ref={root}>{children}</div>
      <dl className="space-rail__stops inv-mono">
        <dt>tab stops</dt>
        <dd data-count={stops.length}>{stops.length}</dd>
        <dt>order</dt>
        <dd>{stops.length === 0 ? '—' : stops.join('  →  ')}</dd>
      </dl>
    </Specimen>
  );
}

function SpaceSpecimen({
  label,
  initialOpen,
  semantics = 'toolbar',
  title = 'Research Space',
}: {
  readonly label: string;
  readonly initialOpen: boolean;
  readonly semantics?: RailSemantics;
  readonly title?: string;
}) {
  return (
    <Measured label={label}>
      <Stateful initialOpen={initialOpen}>
        {({ open, setOpen }) => (
          <PrototypeCard
            kind="space"
            title={title}
            open={open}
            onOpenChange={setOpen}
            state="selected"
            semantics={semantics}
          />
        )}
      </Stateful>
    </Measured>
  );
}

function MarkdownSpecimen({
  label,
  initialOpen,
  semantics = 'toolbar',
  title = 'Traversal',
}: {
  readonly label: string;
  readonly initialOpen: boolean;
  readonly semantics?: RailSemantics;
  readonly title?: string;
}) {
  return (
    <Measured label={label}>
      <Stateful initialOpen={initialOpen}>
        {({ open, setOpen, editing, setEditing }) => (
          <PrototypeCard
            kind="markdown"
            title={title}
            open={open}
            onOpenChange={setOpen}
            state="selected"
            semantics={semantics}
            editing={editing}
            onEditingChange={setEditing}
          />
        )}
      </Stateful>
    </Measured>
  );
}

export const RailComposition: Story = () => (
  <div className="inv inv-sheet">
    <CatalogueSection
      title="1 · The Space Card rail"
      note="Cards are drawn Selected so their rails are up; a resting Card on the canvas hides them until hover. Every rail control is the same 22px icon button. A Space Card carries Select Space View, Select Graph, Enter and Open/Close — four glyphs, no words on the band. Space View and Graph open dropdowns; their current value is the control's accessible name and the marked item in the menu. Enter draws Lucide log-in — an arrow into a container — deliberately unlike Open's maximize-2, because entering the Space and expanding the Card in place are different destinations."
    >
      <div className="inv-row space-rail__row">
        <Measured label="markdown · open · shipped">
          <MarkdownReference state="selected" />
        </Measured>
        <SpaceSpecimen label="space · open" initialOpen />
      </div>
      <div className="inv-row space-rail__row">
        <MarkdownSpecimen label="markdown · closed" initialOpen={false} />
        <SpaceSpecimen label="space · closed" initialOpen={false} />
      </div>
    </CatalogueSection>

    <CatalogueSection
      title="2 · The selectors"
      note="Open either dropdown. Each is a radio group over the Space's own Space Views or Graphs, marking the current one. Two things to check: whether a glyph with no visible value is enough to find the selector by, and whether the band is the right place for a choice that belongs to the Card rather than to the containing Graph the band is coloured by."
    >
      <div className="inv-row space-rail__row">
        <SpaceSpecimen label="space · open · try both menus" initialOpen title="Selectors" />
      </div>
    </CatalogueSection>

    <CatalogueSection
      title="3 · Group or toolbar"
      note="The one remaining choice, and it draws no pixels — the two variants are identical to look at and differ only in what the keyboard does, which is why each specimen prints what a Tab actually reaches inside it. The Space pair: a plain group costs four tab stops per Card, a toolbar costs one and the arrows move between the four. The Markdown pair: press Edit on each and watch the order. The group's becomes Save → Cancel, so Close has left the keyboard entirely although it is still drawn — ADR 0064's promise that it keeps its slot holds for the eye only. The meter counts tab stops, so it cannot show the other half: in the toolbar variant that unavailable Close is still there under the arrow keys."
    >
      <div className="inv-row space-rail__row">
        <SpaceSpecimen
          label="space · plain group · today"
          initialOpen
          semantics="group"
          title="Group"
        />
        <SpaceSpecimen label="space · role=toolbar · roving" initialOpen title="Toolbar" />
      </div>
      <div className="inv-row space-rail__row">
        <MarkdownSpecimen
          label="markdown · plain group · press Edit"
          initialOpen
          semantics="group"
          title="Group"
        />
        <MarkdownSpecimen
          label="markdown · role=toolbar · press Edit"
          initialOpen
          title="Toolbar"
        />
      </div>
    </CatalogueSection>
  </div>
);
