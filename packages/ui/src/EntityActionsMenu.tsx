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
import { LinkActionsIcon } from './icons';
import { cn } from './lib/utils';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * What running a command answers, and therefore which word the item reports.
 *
 * Every command answers one of the two, and a command that cannot fail answers
 * `done` — there is no "said nothing" arm on purpose. A command that reported
 * nothing had its outcome invented for it, which is the whole defect this
 * exists to close: the label swapped to "Copied" on the press rather than on
 * the copy, so a clipboard write the browser refused still read as done.
 *
 * A promise is admitted because that refusal arrives *after* the press —
 * writing the clipboard is asynchronous — so an item that reported at the call
 * could only ever report on having been pressed.
 */
export type EntityActionOutcome = 'done' | 'failed';

/** How a trigger takes the treatment of the cluster it sits in. */
type TriggerRender = ComponentProps<typeof DropdownMenuTrigger>['render'];

/**
 * One command an entity offers: rename it, copy one of the addresses it can be
 * reached by, open it somewhere else.
 *
 * A command the entity does not have is simply absent from the list it is built
 * into — never present and disabled. That is the rule the Space Sidebar's link
 * commands already follow, and the reason is the same: a destination that does
 * not exist is not a thing to offer and refuse.
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
   * What the item's own label becomes once the command has run — "Copied".
   *
   * Once it **has run**, not once it has been pressed: the swap waits on what
   * `onSelect` answers, so a command that reports a failure never claims to
   * have succeeded first.
   */
  readonly confirmation?: string | undefined;
  /**
   * What the label becomes instead when the command answers `failed` — "Not
   * copied".
   *
   * The menu is where a failure has to be legible, not only in whatever
   * standing notice the application also renders: below the Sidebar's
   * breakpoint that surface is a Sheet drawn *over* the shell, so a report
   * pinned under the header is behind it and a reader on a phone never sees it.
   */
  readonly failure?: string | undefined;
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
  readonly onSelect: () => EntityActionOutcome | Promise<EntityActionOutcome>;
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
 * `w-80` rather than the `w-72` this started at: the leading icon column and
 * its gap take a little over 20px off the text, and at `w-72` the longest
 * destination sentence a Card or Graph produces — "Always opens <title> on its
 * own, wherever it is placed" — went from two lines to three. The extra 32px
 * buys that line back without the popup reaching across the Sidebar it opens
 * against.
 */
const MENU_WIDTH = 'w-80';

/** Which item is reporting, and the one word it is reporting in place of its label. */
interface ActionReport {
  readonly id: string;
  readonly word: string;
}

/** The word a finished command reports, or nothing when it has none to report. */
const reported = (action: EntityAction, outcome: EntityActionOutcome): string | undefined =>
  outcome === 'failed' ? action.failure : action.confirmation;

/** Whether an item has anything to say after the press, either way it goes. */
const reports = (action: EntityAction): boolean =>
  action.confirmation !== undefined || action.failure !== undefined;

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

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const fire = useCallback((action: EntityAction) => {
    const outcome = action.onSelect();
    if (!reports(action)) return;
    void Promise.resolve(outcome).then((answered) => {
      const word = reported(action, answered);
      window.clearTimeout(clearTimer.current);
      if (word === undefined) {
        setReport(null);
        return;
      }
      setReport({ id: action.id, word });
      clearTimer.current = window.setTimeout(() => setReport(null), 1600);
    });
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
   * The control the menu hangs off. A Sidebar row passes its
   * `SidebarMenuAction`, a Card rail its `CardRailAction`, so the trigger takes
   * the treatment of the cluster it sits in rather than importing a second one.
   */
  readonly render?: TriggerRender;
  /**
   * The glyph the trigger draws, because what reads as "the actions" depends on
   * what the trigger sits beside rather than on this component.
   *
   * A Sidebar row stands alone and passes `<EntityActionsIcon />`, the
   * conventional "more" glyph. A Card rail sits in a cluster where every other
   * control names its own command, and keeps `LinkActionsIcon` — which is the
   * default here for exactly one reason: the rail is the only caller that does
   * not pass this, so leaving the default alone is what leaves the rail alone.
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
  icon = <LinkActionsIcon />,
  className,
}: EntityActionsTriggerProps) {
  const { report, fire, announcement } = useConfirmation();
  const renderProp: Mutable<Pick<EntityActionsTriggerProps, 'render'>> = {};
  if (render !== undefined) renderProp.render = render;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
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
          <EntityActionItems groups={groups} report={report} fire={fire} as="menu" />
        </DropdownMenuContent>
      </DropdownMenu>
      {announcement}
    </>
  );
}

export interface EntityActionsProps {
  readonly groups: readonly EntityActionGroup[];
  /** The area that answers the right click — normally the entity's whole row. */
  readonly children: ReactNode;
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
 * become a box in the middle of a layout that was written without it — a
 * Sidebar row positions its own trailing action against the row, not against a
 * wrapper that appeared underneath it.
 */
export function EntityActions({ groups, children, className }: EntityActionsProps) {
  const { report, fire, announcement } = useConfirmation();
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger data-slot="entity-actions" className={cn('contents', className)}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className={MENU_WIDTH}>
          <EntityActionItems groups={groups} report={report} fire={fire} as="context-menu" />
        </ContextMenuContent>
      </ContextMenu>
      {announcement}
    </>
  );
}
