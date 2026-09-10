import { Children, forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Button } from './Button';
import { CommandName } from './CommandSurface';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
  /** What the set is, captioning the list: `Diagrams`, `Graphs in Collection 1`. */
  readonly label: ReactNode;
  readonly choices: readonly ChoiceMenuChoice<Id>[];
  /** The chosen member, or `null` where the caller has chosen none. */
  readonly chosen: Id | null;
  readonly onChoose: (id: Id) => void;
  /** The control this list hangs off, drawn by the caller. */
  readonly trigger: ReactNode;
  /** Commands on the named thing, drawn below the set behind a rule. */
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
}

/**
 * One of a named set, chosen from a list — the Command Dock's Diagram and Graph
 * clusters, and the Diagram and Graph an Open Space Thing selects.
 *
 * **What is shared is the list and what is not is the operation.** The set on
 * offer, which member is chosen and what choosing one does all arrive from the
 * caller, because they are nothing alike: the Dock's Diagram list moves the
 * canvas the reader is looking at, and a Space Thing's writes which Diagram that
 * Thing shows into the Thing. What is genuinely one thing is how a bound
 * single choice is *drawn and operated* — a labelled radio group, one mark on
 * the member you are on, the menu's own roving focus, type-ahead and dismissal
 * — and that is what lives here rather than at each surface.
 *
 * The commands a surface carries alongside the set go in `children`, below a
 * rule: New, Copy link and Delete on the Dock's clusters, and nothing at all on
 * a Space Thing, which selects a context and authors no Diagrams.
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
}: ChoiceMenuProps<Id>) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
      {trigger}
      <DropdownMenuContent align={align} side={side} sideOffset={sideOffset} className={className}>
        <DropdownMenuRadioGroup<Id | null>
          value={chosen}
          onValueChange={(next) => {
            // Base UI spells an empty controlled selection `null`, and no
            // surface here has a clear-selection action: a reader picks another
            // member or dismisses the list.
            if (next !== null) onChoose(next);
          }}
        >
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
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
            <DropdownMenuGroup>{children}</DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
 * a list behind this" everywhere it appears. The Dock's clusters take the bare
 * form, their name being a rename control of its own beside it; an Open Space
 * Thing takes the named form, having no rename and no room for two controls.
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
