import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './components/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/dropdown-menu';
import { EntityActionsIcon } from './icons';
import { cn } from './lib/utils';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * What running a command answers, and therefore which word the item reports.
 *
 * Every command answers one of the two, and a command that cannot fail answers
 * `done` — there is no "said nothing" arm on purpose. A command that reported
 * nothing would have its outcome invented for it: the label would swap to
 * "Copied" on the press rather than on the copy, so a clipboard write the
 * browser refused would still read as done.
 *
 * A promise is admitted because that refusal arrives *after* the press —
 * writing the clipboard is asynchronous — so an item that reported at the call
 * could only ever report on having been pressed.
 */
export type EntityActionOutcome = 'done' | 'failed';

/**
 * The words an item reports with, one for each way its command can go.
 *
 * **Both or neither**, which is why this is one field rather than two optional
 * ones. What the item shows is the word for whichever outcome the command
 * answered, and holding the menu open to show it is decided *before* the answer
 * arrives — so an item that named only one word could be held open over the
 * outcome it had nothing to say about, and sit there under its unchanged label
 * with no report to show and no timer to take one away. Pairing them means the
 * menu is held open exactly when there is a word coming, either way it goes.
 *
 * Keyed by the outcome itself so the two cannot drift apart: `done` is what the
 * label becomes once the command **has run** — "Copied", and once it has run
 * rather than once it has been pressed, since the swap waits on what `onSelect`
 * answers. `failed` is what it becomes instead when the command answers that it
 * did not, "Not copied".
 *
 * The menu is where a failure has to be legible when the reader is not looking
 * at the standing notice the application renders. The Command Dock covers
 * nothing, so its own menus pass no words and report through that notice. The
 * Resource rail passes them: it is a menu on the canvas, over the Resources, and
 * a reader whose eyes are on the Resource they pressed is not looking at the
 * shell's corner.
 */
export type EntityActionReport = Readonly<Record<EntityActionOutcome, string>>;

/** How a trigger takes the treatment of the cluster it sits in. */
type TriggerRender = ComponentProps<typeof DropdownMenuTrigger>['render'];

/**
 * One command an entity offers: rename it, copy one of the addresses it can be
 * reached by, open it somewhere else.
 *
 * A command the entity does not have is simply absent from the list it is built
 * into — never present and disabled. The reason is about destinations rather
 * than about any one surface: an address that does not exist is not an option to
 * offer and refuse. A command that exists and is *out of reach now* is the
 * other case, and that one is drawn present and unavailable.
 */
export interface EntityAction {
  /** Stable within one menu; what React keys the item on. */
  readonly id: string;
  readonly label: string;
  /**
   * One sentence saying where the command lands, so the difference between two
   * addresses is legible to a reader who does not know the domain model.
   */
  readonly description?: string | undefined;
  /**
   * The words this item reports its outcome with, or absent for a command that
   * says nothing and simply closes the menu.
   */
  readonly report?: EntityActionReport | undefined;
  /**
   * The glyph drawn in the item's leading column — `<CopyIcon />` for an
   * address, `<EditIcon />` for a rename.
   *
   * Optional, and the column it sits in belongs to the **menu** rather than to
   * the item: as soon as one command in a menu carries an icon, every other
   * command reserves the same width, so a group of labels stays a column
   * instead of stepping in and out as commands are withheld.
   */
  readonly icon?: ReactNode;
  /**
   * `destructive` for a command that removes something, drawn in the
   * primitive's own destructive item treatment rather than a local one — both
   * `DropdownMenuItem` and `ContextMenuItem` already carry that variant, so the
   * two paths get the same red by construction.
   */
  readonly variant?: 'default' | 'destructive' | undefined;
  /**
   * Present and unavailable, for a command that exists on this kind of entity
   * and can never run on *this* one.
   *
   * The rule above this interface is that an address which does not exist is
   * not offered at all — so this is deliberately narrow. Create Reference is the
   * case it was added for: ADR 0070 forbids a Reference Resource of a Reference Resource, and a Reference Resource
   * is otherwise a regular Resource, so withholding the row would make one Resource's
   * menu shorter than every other's for a reason the reader cannot see. The
   * greyed row is where the product says that referencing terminates.
   *
   * The primitive owns what unavailable *means* — both `DropdownMenuItem` and
   * `ContextMenuItem` are Base UI `Menu.Item`s, which suppress activation for
   * pointer and keyboard alike and keep the item in the accessibility tree.
   */
  readonly disabled?: boolean | undefined;
  /**
   * Handed the element the menu was opened from, so a command that opens its
   * own surface has something to anchor it to once the menu closes. `null`
   * without a menu or once that element has gone. A context menu without
   * `render` hands its `display: contents` wrapper, which has no box.
   */
  readonly onSelect: (
    opener: HTMLElement | null,
  ) => EntityActionOutcome | Promise<EntityActionOutcome>;
}

/**
 * Commands drawn together, ruled off from the next group.
 *
 * Groups rather than a separator marker in one flat list: a separator is a fact
 * about two neighbours, so a list that carries its own gets to be wrong — a
 * leading rule, a trailing one, two in a row where the command between them was
 * withheld. Here an empty group draws nothing, and its rule goes with it.
 */
export type EntityActionGroup = readonly EntityAction[];

/**
 * How wide either menu draws, so the two are the same menu in both senses.
 *
 * `w-80`: the leading icon column and its gap take a little over 20px off the
 * text, and the longest destination sentence a Resource or Graph produces —
 * "Always opens <title> on its own, wherever it is placed" — needs this width
 * to stay on two lines, while the popup still fits inside the canvas it opens
 * over.
 */
const MENU_WIDTH = 'w-80';

/** Which item is reporting, and the one word it is reporting in place of its label. */
interface ActionReport {
  readonly id: string;
  readonly word: string;
}

/** Whether an item has anything to say after the press, either way it goes. */
const reports = (action: EntityAction): boolean => action.report !== undefined;

/**
 * What an item shows in place of its label once its command has answered, and
 * the announcement that goes with it.
 *
 * **Once it has answered.** The command is what reports, not the press: the
 * outcome is awaited, so a clipboard write the browser refuses swaps the label
 * to the failure word rather than to "Copied".
 *
 * The announcement is the whole reason this is not just local state in the
 * item: the label swap is a visual report with no focus change, so a screen
 * reader is told nothing by it. A polite live region outside the menu carries
 * the same word — and it sits outside for two reasons. The popup it would
 * otherwise live in is unmounted moments later, and an unmounted region
 * announces nothing; and outside is not hidden, because Base UI's `markOthers`
 * keeps every `[aria-live]` element and its ancestors out of the set a modal
 * popup hides, exactly so a region like this one still announces. The dropdown
 * path is not modal at all (`MenuPopup` passes `modal: isContextMenu`), and
 * `test/EntityActionsMenu.test.tsx` pins the modal context-menu path, which is
 * the demanding one of the two.
 */
function useConfirmation() {
  const [report, setReport] = useState<ActionReport | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  /**
   * Which press the one `report` and the one timer currently belong to.
   *
   * A reporting item is held open (`closeOnClick` is false), so a second
   * command can be pressed while the first is still in flight. If both
   * overwrote the pair on arrival, the slow one would land last and win: a copy
   * the author had given up on would take the confirmation off the row they had
   * just pressed, clear its timer, and announce itself a second time.
   *
   * The counter makes the **last press** win rather than the last answer: a
   * settlement whose press has been overtaken has nothing to say about a
   * confirmation asked for after it.
   */
  const press = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(clearTimer.current);
      // Unmounting is the last press, and bumping the counter is what makes it
      // one. The line above clears the timer that is pending *now*; a command
      // still in flight would otherwise land behind this cleanup, set state on
      // a component that has gone, and arm a fresh 1600ms timeout with no
      // surviving path to clear it. A menu unmounting mid-clipboard-write is
      // ordinary — a Space switch, say.
      press.current += 1;
    },
    [],
  );

  const fire = useCallback((action: EntityAction, opener: HTMLElement | null) => {
    // Read once, up front: an item that names its words has one for every
    // outcome, so past this line there is always a word to show and the menu
    // the press held open is never held over nothing.
    const words = action.report;
    const pressed = (press.current += 1);
    const confirm = (answered: EntityActionOutcome) => {
      // Two ways there is no confirmation left to make: the author has pressed
      // something since — or unmounted the menu, which counts as pressing
      // something since — and an item that names no words has nothing to swap
      // its label for either way it goes.
      if (pressed !== press.current || words === undefined) return;
      window.clearTimeout(clearTimer.current);
      setReport({ id: action.id, word: words[answered] });
      clearTimer.current = window.setTimeout(() => setReport(null), 1600);
    };
    /*
     * The call sits *inside* the async body rather than in front of it, which
     * is what makes the two ways a command can go wrong one way here. An
     * `async` body still runs synchronously to its first `await`, so `onSelect`
     * is called on this click — but a command that throws before it ever
     * returns a promise rejects instead of throwing out of a React event
     * handler, which no error boundary catches. A command that runs an Edit
     * is one: `complete` throws outright for a Space that has stopped loading.
     */
    void (async () => {
      try {
        confirm(await action.onSelect(opener));
      } catch (failure) {
        /*
         * A command that threw is a command that failed, and is reported as
         * one — but a throw is a broken contract rather than an answered
         * outcome, and an item naming no words has nothing to show for it
         * either way. So it is recorded here as well: otherwise the promise
         * goes unconsumed on the wordless path, and a refused command becomes
         * an unhandled rejection the author presses to no effect and no
         * message anywhere.
         */
        console.error('An entity action failed', failure);
        confirm('failed');
      }
    })();
  }, []);

  return {
    report,
    fire,
    announcement: (
      <span aria-live="polite" className="sr-only">
        {report?.word ?? ''}
      </span>
    ),
  };
}

/** A group's key: what it holds, since a group has no identity beyond that. */
const groupKey = (group: EntityActionGroup): string => group.map((action) => action.id).join('+');

/**
 * The one item list, rendered under whichever root opened it.
 *
 * Base UI's context menu shares every part but Root and Trigger with its plain
 * Menu, so the same list can be built from either family's `Item` and
 * `Separator` — which is what makes "the icon and the right click open the
 * identical menu" a fact about the code rather than two lists kept in step by
 * hand.
 */
function EntityActionItems({
  groups,
  report,
  fire,
  as,
}: {
  readonly groups: readonly EntityActionGroup[];
  readonly report: ActionReport | null;
  readonly fire: (action: EntityAction) => void;
  readonly as: 'menu' | 'context-menu';
}) {
  const Item = as === 'context-menu' ? ContextMenuItem : DropdownMenuItem;
  const Separator = as === 'context-menu' ? ContextMenuSeparator : DropdownMenuSeparator;
  const drawn = groups.filter((group) => group.length > 0);
  // One decision for the whole menu, not per item: a menu with any icon in it
  // reserves the column on every item, so the labels of the commands that have
  // no glyph line up with the ones that do rather than sitting 22px to their
  // left.
  const iconColumn = drawn.some((group) => group.some((action) => action.icon !== undefined));
  return (
    <>
      {drawn.map((group, index) => (
        <MenuGroup key={groupKey(group)}>
          {index > 0 && <Separator />}
          {group.map((action) => (
            <Item
              key={action.id}
              // Held open only while there is a swap to see — either way the
              // command goes, since a failure has still less business being
              // reported behind a menu that has gone. A command that reports
              // nothing closes the menu the way every menu item does.
              closeOnClick={!reports(action)}
              variant={action.variant ?? 'default'}
              disabled={action.disabled ?? false}
              // `items-start`, because an item is two lines whenever it carries
              // a destination sentence and the primitive's own `items-center`
              // would then hang the glyph between them. The column below is
              // `h-5` — the `text-sm` line box — so the glyph centres on the
              // label's line whether or not a second line follows it.
              className="items-start"
              onClick={() => fire(action)}
            >
              {/* `w-4` fixed rather than content-sized, so an item with no
                  glyph still spends the column and the labels stay a column. */}
              {iconColumn && (
                <span
                  aria-hidden="true"
                  className="flex h-5 w-4 shrink-0 items-center justify-center"
                >
                  {action.icon}
                </span>
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{action.id === report?.id ? report.word : action.label}</span>
                {action.description !== undefined && (
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                )}
              </span>
            </Item>
          ))}
        </MenuGroup>
      ))}
    </>
  );
}

/**
 * A keyed grouping wrapper that draws nothing.
 *
 * Not Base UI's `Menu.Group`: that one is for a labelled group and would put a
 * `role="group"` around commands whose only relationship is that no rule
 * separates them. The rule is the whole grouping here, so this stays a fragment
 * and exists only because a bare `<>` cannot take a key from a loop.
 */
function MenuGroup({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}

export interface EntityActionsTriggerProps {
  readonly groups: readonly EntityActionGroup[];
  /** Names the control for assistive technology — "Golden path actions". */
  readonly label: string;
  /**
   * The control the menu hangs off. A Resource rail passes its `ResourceRailAction`,
   * so the trigger takes the treatment of the cluster it sits in rather than
   * importing a second one.
   */
  readonly render?: TriggerRender;
  /**
   * The glyph the trigger draws, because what reads as "the actions" depends on
   * what the trigger sits beside rather than on this component.
   *
   * Defaults to `<EntityActionsIcon />`, the conventional "more" glyph, because
   * the menu holds rename, copy, reference and delete commands — not one kind of
   * action the trigger could name on its own.
   */
  readonly icon?: ReactNode;
  readonly className?: string;
}

/**
 * The always-reachable path to an entity's actions: a control that opens the
 * menu on a press, on Enter, on Space and on ArrowDown, as any menu button does.
 *
 * It is a real tab stop and does not depend on hover, which is what makes the
 * right-click path beside it an accelerator rather than the only way in — every
 * command here is reachable without a pointer.
 */
export function EntityActionsTrigger({
  groups,
  label,
  render,
  icon = <EntityActionsIcon />,
  className,
}: EntityActionsTriggerProps) {
  const { report, fire, announcement } = useConfirmation();
  const opener = useRef<HTMLButtonElement>(null);
  const renderProp: Mutable<Pick<EntityActionsTriggerProps, 'render'>> = {};
  if (render !== undefined) renderProp.render = render;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={opener}
          {...renderProp}
          aria-label={label}
          className={className}
          data-slot="entity-actions-trigger"
        >
          {icon}
        </DropdownMenuTrigger>
        {/* `align="end"` keeps the popup under the trailing icon rather than
            running off the edge that icon already sits against. The width
            overrides `DropdownMenuContent`'s `w-(--anchor-width)`, which would
            otherwise size this menu to the icon that opened it. */}
        <DropdownMenuContent align="end" className={MENU_WIDTH}>
          <EntityActionItems
            groups={groups}
            report={report}
            fire={(action) => fire(action, opener.current)}
            as="menu"
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {announcement}
    </>
  );
}

export interface EntityActionsProps {
  readonly groups: readonly EntityActionGroup[];
  /** The area that answers the right click — normally the entity's whole row. */
  readonly children?: ReactNode;
  /** Reuse the entity element when its parent/sibling geometry must be preserved. */
  readonly render?: ComponentProps<typeof ContextMenuTrigger>['render'];
  readonly className?: string;
}

/**
 * The accelerator path: a right click (or a long press on a coarse pointer)
 * anywhere on the entity, opening the same menu the trailing icon does.
 *
 * Deliberately an enhancement and not a surface of its own. Base UI's own
 * guidance for `ContextMenu` is that nothing may be reachable only through it,
 * and the way this set keeps that promise is that the list it draws is
 * `EntityActionItems` — the same list `EntityActionsTrigger` draws.
 *
 * `display: contents` by default, because what this wraps is somebody else's
 * row. The trigger has to be an element to carry the handler, but it must not
 * become a box in the middle of a layout that was written without it — a row
 * positions its own trailing action against the row, not against a wrapper that
 * appeared underneath it. A geometry-sensitive entity instead supplies `render`
 * to compose the trigger onto its existing element; `contents` would still
 * change direct-child and sibling selectors.
 */
export function EntityActions({ groups, children, className, render }: EntityActionsProps) {
  const { report, fire, announcement } = useConfirmation();
  const opener = useRef<HTMLDivElement>(null);
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          ref={opener}
          data-slot="entity-actions"
          render={render}
          className={cn(render === undefined && 'contents', className)}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className={MENU_WIDTH}>
          <EntityActionItems
            groups={groups}
            report={report}
            fire={(action) => fire(action, opener.current)}
            as="context-menu"
          />
        </ContextMenuContent>
      </ContextMenu>
      {announcement}
    </>
  );
}
