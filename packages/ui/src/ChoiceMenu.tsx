import { Children, forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Button } from './Button';
import { CommandName } from './CommandSurface';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './components/dropdown-menu';
import { ChevronDownIcon } from './icons';

/** One member of a set a {@link ChoiceMenu} offers, named as a reader reads it. */
export interface ChoiceMenuChoice<Id extends string> {
  readonly id: Id;
  readonly title: string;
  /** Drawn before the title on this row — a Graph's own colour, say. */
  readonly icon?: ReactNode;
}

/** Which side of its trigger a choice list opens on. */
export type ChoiceMenuSide = 'top' | 'right' | 'bottom' | 'left';

export interface ChoiceMenuProps<Id extends string> {
  /** What the set is, captioning the list: `Maps`, `Graphs in Collection 1`. */
  readonly label: string;
  /**
   * Whether the list draws `label` as its caption. Uncaptioned, `label` still
   * names the list to assistive technology — for a set whose trigger already
   * says what it is, as an Ur Resource's Shape control does.
   */
  readonly captioned?: boolean;
  readonly choices: readonly ChoiceMenuChoice<Id>[];
  /** The chosen member, or `null` where the caller has chosen none. */
  readonly chosen: Id | null;
  readonly onChoose: (id: Id) => void;
  /** The control this list hangs off, drawn by the caller. */
  readonly trigger: ReactNode;
  /**
   * Commands on the named resource, drawn below the set behind a rule.
   *
   * The one separator between the set and this content is this component's;
   * any further groups and separators within it are the caller's own —
   * `MapMenuActions` and `GraphMenuActions` draw several groups rather
   * than one, so this does not additionally wrap the whole of `children` in a
   * second enclosing group.
   */
  readonly children?: ReactNode;
  /** Controlled disclosure, for a surface that allows one open list at a time. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Required alongside `open`: a controlled Base UI root is told which control it belongs to. */
  readonly triggerId?: string;
  readonly side?: ChoiceMenuSide;
  readonly align?: 'start' | 'center' | 'end';
  readonly sideOffset?: number;
  /** The popup's own class, which is where its width is set. */
  readonly className?: string;
  /**
   * Whether closing this list takes the caret back to the control it hangs off.
   *
   * Answered **at close time** rather than read off a render, because the state
   * it depends on is what the reader just pressed. A menu ordinarily returns
   * focus to its trigger, and should: the command is over and the reader is
   * back where they were. A command that *moves* the caret on purpose — the
   * Dock's New Map, which continues in the new Map's name — is the
   * exception, and without this the restoration lands a frame after the editor
   * has focused itself, blurs it, and completes the rename nobody typed.
   *
   * Omitted, Base UI's own restoration stands.
   */
  readonly restoresFocusOnClose?: () => boolean;
}

/** What a {@link ChoiceMenu} and a {@link ChoiceSubmenu} draw alike: the set and its commands. */
type ChoiceListProps<Id extends string> = Pick<
  ChoiceMenuProps<Id>,
  'label' | 'captioned' | 'choices' | 'chosen' | 'onChoose' | 'children'
>;

/**
 * One of a named set, chosen from a list — the Command Dock's Map and Graph
 * clusters, and the Map and Graph an Open Space Resource selects.
 *
 * **What is shared is the list and what is not is the operation.** The set on
 * offer, which member is chosen and what choosing one does all arrive from the
 * caller, because they are nothing alike: the Dock's Map list moves the
 * canvas the reader is looking at, and a Space Resource's writes which Map that
 * Resource shows into the Resource. What is genuinely shared is how a bound
 * single choice is *drawn and operated* — a labelled radio group, one mark on
 * the member you are on, the menu's own roving focus, type-ahead and dismissal
 * — and that is what lives here rather than at each surface.
 *
 * The commands a surface carries alongside the set go in `children`, below a
 * rule. The Dock and Space Resource share their Map and Graph command rows;
 * the caller supplies which Space those commands author.
 *
 * **The generic binds the group and its items together.** Base UI types both
 * `value`s as `any`, so a group and an item written separately can disagree
 * about what an id is and hand `onValueChange` something the set never held
 * (`components/dropdown-menu.tsx`). Rendering both from one type parameter is
 * what closes that here: a caller names its id type once, on `choices`, and
 * cannot name the item's differently because it does not write the item.
 */
export function ChoiceMenu<Id extends string>({
  label,
  captioned = true,
  choices,
  chosen,
  onChoose,
  trigger,
  children,
  open,
  onOpenChange,
  triggerId,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
  className = 'w-72',
  restoresFocusOnClose,
}: ChoiceMenuProps<Id>) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
      {trigger}
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={className}
        finalFocus={restoresFocusOnClose}
      >
        <ChoiceList<Id>
          label={label}
          captioned={captioned}
          choices={choices}
          chosen={chosen}
          onChoose={onChoose}
        >
          {children}
        </ChoiceList>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ChoiceSubmenuProps<Id extends string> extends ChoiceListProps<Id> {
  /** The row this list hangs off, a {@link ChoiceMenuSubmenuTrigger}. */
  readonly trigger: ReactNode;
  /** The popup's own class, which is where its width is set. */
  readonly className?: string;
}

/**
 * The list a {@link ChoiceMenu} draws, as a submenu of the menu it sits in
 * rather than as a menu of its own — a Resource's Shape, chosen from its
 * Actions menu (ADR 0120). It takes no placement or focus props: a submenu
 * opens beside its row and closes with the menu it belongs to.
 */
export function ChoiceSubmenu<Id extends string>({
  trigger,
  className = 'w-72',
  ...list
}: ChoiceSubmenuProps<Id>) {
  return (
    <DropdownMenuSub>
      {trigger}
      <DropdownMenuSubContent className={className}>
        <ChoiceList<Id> {...list} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** The labelled radio group of the set, and the caller's commands below a rule. */
function ChoiceList<Id extends string>({
  label,
  captioned = true,
  choices,
  chosen,
  onChoose,
  children,
}: ChoiceListProps<Id>) {
  return (
    <>
      <DropdownMenuRadioGroup<Id | null>
        aria-label={captioned ? undefined : label}
        value={chosen}
        onValueChange={(next) => {
          // Base UI spells an empty controlled selection `null`, and no
          // surface here has a clear-selection action: a reader picks another
          // member or dismisses the list.
          if (next !== null) onChoose(next);
        }}
      >
        {captioned && <DropdownMenuLabel>{label}</DropdownMenuLabel>}
        {choices.map((choice) => (
          <DropdownMenuRadioItem<Id | null>
            key={choice.id}
            value={choice.id}
            closeOnClick
            className="gap-2"
          >
            {choice.icon}
            {choice.title}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {Children.toArray(children).length > 0 && (
        <>
          <DropdownMenuSeparator />
          {children}
        </>
      )}
    </>
  );
}

export type ChoiceMenuTriggerProps = Omit<
  ComponentProps<typeof DropdownMenuTrigger>,
  'children' | 'className'
> & {
  readonly className?: string;
  /** Drawn at the leading edge, before any name. */
  readonly icon?: ReactNode;
  /** What is chosen, drawn as much of it as fits. Absent where the control is a bare chevron. */
  readonly name?: ReactNode;
};

/**
 * The control a {@link ChoiceMenu} hangs off: a chevron, and optionally the
 * name of what is chosen in front of it.
 *
 * One component for both shapes the product draws, so a chevron means "there is
 * a list behind this" everywhere it appears. The Dock's identity clusters and
 * an Open Space Resource both take the named form — the name discloses, and
 * Rename (where there is one) is a command in the list. The bare form remains
 * for a disclosure that is only a chevron.
 *
 * `render` is what decides the box: the Dock hands it a `ToolbarButton`, since
 * a Dock cluster is inside the Dock's one toolbar, and a surface that is not a
 * toolbar leaves the default `Button` to draw it. Either way the treatment is
 * the shared quiet button's, including the open-state fill every disclosure in
 * the product takes from `aria-expanded`.
 */
export const ChoiceMenuTrigger = forwardRef<HTMLButtonElement, ChoiceMenuTriggerProps>(
  function ChoiceMenuTrigger({ className, icon, name, render, ...props }, ref) {
    return (
      <DropdownMenuTrigger
        ref={ref}
        className={className}
        render={render ?? <Button variant="ghost" size="compact" />}
        {...props}
      >
        {icon}
        {name !== undefined && <CommandName>{name}</CommandName>}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
    );
  },
);

export type ChoiceMenuSubmenuTriggerProps = ComponentProps<typeof DropdownMenuSubTrigger>;

/**
 * The row a {@link ChoiceSubmenu} hangs off: a menu row naming the set,
 * trailed by the submenu chevron. It opens the list on hover, on a press, on
 * Enter, on Space and on ArrowRight, as Base UI's submenu trigger does.
 */
export function ChoiceMenuSubmenuTrigger(props: ChoiceMenuSubmenuTriggerProps) {
  return <DropdownMenuSubTrigger {...props} />;
}
