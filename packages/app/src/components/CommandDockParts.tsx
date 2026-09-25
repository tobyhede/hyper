/**
 * The pieces more than one Command Dock cluster draws: the rule between
 * clusters, the identity surface the Space, Map and Graph names share, and the
 * trigger a set discloses from.
 */
import { useContext, useEffect, useRef, type ReactNode } from 'react';
import {
  ChevronDownIcon,
  ChoiceMenuTrigger,
  CommandName,
  DropdownMenuItem,
  EditIcon,
  InlineTitleEditor,
  Separator,
  ToolbarButton,
} from '@project/ui';
import {
  DockRenamingContext,
  IdentityCaretContext,
  identityDisclosureName,
  useDockDisclosure,
  type DockIdentity,
  type IdentityDisclosure,
} from './command-dock-shared';

export function Divider({ orientation }: { readonly orientation: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      orientation={orientation}
      align="center"
      className={orientation === 'horizontal' ? 'my-1' : 'mx-1 h-5'}
    />
  );
}

/**
 * The name an identity trigger carries.
 *
 * Always drawn, in every orientation. A narrow dock that collapsed these to
 * icons was compared here and lost: the dock stacks on a side edge, so a row
 * is `[name] [v]` and there is room for the words — and the disclosure hangs
 * off that row, so a row that has shrunk to a glyph has nothing to hang from.
 *
 * **Every name here is ink, the Graph's included.** Carrying the Graph's
 * colour on the name as well as the glyph was tried and reverted: the palette
 * is pastel because it is drawn as a stroke on sand, and the same values set
 * as text on white chrome are too light to read as a name — and a name is the
 * resource on this surface that most has to. The glyph beside it carries the
 * colour instead, where a shape rather than a legibility budget is what has to
 * survive.
 */
function IdentityLabel({ children }: { readonly children: ReactNode }) {
  return <CommandName>{children}</CommandName>;
}

/**
 * The Space, Map or Graph cluster: one named disclosure, and Rename in it.
 *
 * The name and the chevron are the named `ChoiceMenuTrigger` an Open Space
 * Resource already uses. Pressing either opens this identity's list. Rename is a
 * row in that list; choosing it closes the menu and continues in
 * `InlineTitleEditor` — the same header editor these identities already used,
 * so Enter, Escape, blur and a refused draft stay as they were. The Edit
 * itself does not change; only how it is begun does
 * (`.scratch/command-dock/issues/26-identity-clusters-disclose-from-the-name.md`).
 *
 * Switching stays reachable while a chrome title edit is withdrawn. Only the
 * Rename row becomes unavailable — the trigger is how the list is reached.
 */
export function IdentitySurface({
  icon,
  kind,
  title,
  testId,
  triggerTitle,
  onRename,
  children,
}: {
  readonly icon: ReactNode;
  readonly kind: DockIdentity;
  readonly title: string;
  /**
   * What a behaviour test addresses this identity by.
   *
   * The three identities are one component drawn three times, so an accessible
   * name is the only distinction between them — and a test that reached for
   * the title in the disclosure would have to know the title to find the
   * control that names it, which is the assertion inverted. The id names the
   * slot; the text in it is what is under test.
   */
  readonly testId: string;
  readonly triggerTitle: string;
  /**
   * `null` while this name's rename is unavailable — never because the product
   * has no such Edit. All three identities have one, so every `null` here is a
   * withdrawal the application has made and will lift (see
   * {@link DockSpace.onRename}).
   */
  readonly onRename: ((title: string) => string | null) | null;
  readonly children: (disclosure: IdentityDisclosure) => ReactNode;
}) {
  /**
   * **Whether this name is the one being renamed is the bar's answer, not this
   * component's.**
   *
   * It was `useState(false)` here, once per identity, and the three of them
   * reported into one boolean the App reads as "a chrome rename is running".
   * Two editors could stand at once — a blank draft is refused and
   * `InlineTitleEditor` holds a refused draft open, so pressing a second name
   * left the first one live — and the first cleanup to run then told the App no
   * rename was live at all, handing Create Resource, Present and the canvas's own
   * title editing back underneath an editor still on screen.
   *
   * One slot under the whole bar makes that unrepresentable rather than
   * guarded: at most one name can be the renaming one, so the flag has one
   * writer, and the two endings no gesture can see coming — the reader moving
   * to another Map, and ADR 0042's replacement — are the slot's own and are
   * answered once in {@link CommandDock} instead of three times here.
   */
  const { renaming, onRenaming } = useContext(DockRenamingContext);
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  const editing = renaming === kind;

  /**
   * **Where the caret goes when the editor closes.**
   *
   * The editor replaces this control rather than expanding inside it, so ending
   * a rename unmounts the element holding the caret and it falls to
   * `document.body` unless something puts it back. The name *is* the disclosure
   * trigger, so the ref lives on that trigger and the editor's own three exits
   * spend it.
   *
   * The endings the slot answers for the bar must not — the reader moved to
   * another Map from this list, and pulling the caret onto the name they
   * just moved away from is taking focus, not returning it.
   */
  const nameRef = useRef<HTMLButtonElement>(null);
  /**
   * A ref rather than state, because it decides nothing that is rendered — it
   * is a note from the press to the commit that follows it, and holding it in
   * state would set state from inside the effect that reads it.
   */
  const returningFocus = useRef(false);
  /**
   * Whether the command that closed this list left the caret alone.
   *
   * Rename continues in the editor, and New Map continues in the new
   * Map's name. Base UI's ordinary restoration would then land on the
   * trigger a frame later — blurring an editor whose blur completes.
   */
  const caretMovedRef = useRef(false);
  // Only the identity holding the slot draws an editor, so only it can reach
  // these — clearing the slot is releasing this component's own rename rather
  // than ending someone else's.
  const endRename = (): void => {
    onRenaming(null);
  };
  /**
   * The two endings that owe the caret a home, and only those.
   *
   * Enter and Escape end the rename from inside the editor's own key handler,
   * so the caret is on an element about to unmount and falls to
   * `document.body` unless this puts it back. A blur completion is the reader
   * having already put the caret where they want it — pulling it onto the name
   * they just left is taking focus, not returning it.
   */
  const endRenameReturningFocus = (): void => {
    returningFocus.current = true;
    endRename();
  };
  useEffect(() => {
    if (editing || !returningFocus.current) return;
    returningFocus.current = false;
    nameRef.current?.focus();
  }, [editing]);

  /**
   * New Map continues by pressing a control the visible name is not.
   *
   * The name is the disclosure: a click on it opens the list. The application's
   * continuation still has to begin the editor the way a reader who chose
   * Rename does, without flashing that list, so the press lands on this
   * always-mounted address instead (`continuation.ts`).
   * `waitUntilMapContinuationReady` and the New Map continuation in
   * `SpaceApp.test.tsx` hold that the address is present and that it begins
   * the editor without opening the list.
   */
  const continuation =
    kind === 'Map' ? (
      <button
        type="button"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-continuation-control="map-name"
        disabled={onRename === null}
        onClick={() => onRenaming('Map')}
      />
    ) : null;

  const renameItem = (
    <DropdownMenuItem
      className="gap-2"
      disabled={onRename === null}
      onClick={() => {
        caretMovedRef.current = true;
        onRenaming(kind);
      }}
    >
      <EditIcon />
      Rename
    </DropdownMenuItem>
  );
  const identity = (trigger: ReactNode): IdentityDisclosure => ({
    trigger,
    renameItem,
    triggerId,
    open,
    onOpenChange,
  });

  if (onRename !== null && editing) {
    return (
      <IdentityCaretContext.Provider value={caretMovedRef}>
        <InlineTitleEditor
          variant="header"
          className="command-dock__name-editor"
          title={title}
          label={`${kind} name`}
          onComplete={(next) => {
            const named = next.trim();
            if (named === '') return `A ${kind} needs a name.`;
            // **The Edit's answer, not the press.** A rename can be refused for
            // more than a blank name — a Map that has stopped drawing, a title
            // Authoring will not take — and `InlineTitleEditor` holds a refused
            // draft open and editable for exactly that. Closing on the press
            // instead would drop the author's words on the floor and leave the
            // stored title unchanged with nothing said.
            const refusal = onRename(named);
            if (refusal !== null) return refusal;
            endRename();
            return null;
          }}
          onCancel={endRenameReturningFocus}
          onReturnFocus={endRenameReturningFocus}
        />
        {children(
          identity(
            <ChoiceMenuTrigger
              id={triggerId}
              className="nokey command-dock__disclose"
              aria-label={identityDisclosureName(kind, title)}
              title={triggerTitle}
              render={<ToolbarButton variant="ghost" size="icon" />}
            />,
          ),
        )}
        {continuation}
      </IdentityCaretContext.Provider>
    );
  }

  return (
    <IdentityCaretContext.Provider value={caretMovedRef}>
      {children(
        identity(
          <ChoiceMenuTrigger
            ref={nameRef}
            id={triggerId}
            className="nokey command-dock__name"
            data-testid={testId}
            aria-label={identityDisclosureName(kind, title)}
            title={triggerTitle}
            icon={icon}
            name={title}
            render={<ToolbarButton variant="ghost" size="compact" />}
          />,
        ),
      )}
      {continuation}
    </IdentityCaretContext.Provider>
  );
}

/**
 * `Resources ⌄` — the same shape as `Map ⌄` and `Graph ⌄` beside it, and one
 * trigger whichever surface opens.
 *
 * It carries a chevron because it discloses a list, which is what the chevron
 * says next to it on the other three. Space, Map and Graph name one entity
 * each, and that name is the same disclosure — Rename lives in the list.
 * "Resources" names a set, and a set has no name to edit — so the word is a label
 * inside the trigger rather than a button of its own, and the cluster is one
 * target instead of two.
 *
 * **It draws the same three parts in the same order as an identity trigger** —
 * an icon, the title through `IdentityLabel`, then the chevron — so the word
 * lands in the column the other three names land in, whichever edge the dock
 * is on.
 */
export function SetTrigger({
  icon,
  children,
}: {
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <>
      {icon}
      <IdentityLabel>{children}</IdentityLabel>
      <ChevronDownIcon />
    </>
  );
}
