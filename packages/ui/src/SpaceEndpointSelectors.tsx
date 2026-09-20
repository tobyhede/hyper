import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DropdownMenuItem } from './components/dropdown-menu';
import { ChoiceMenu, ChoiceMenuTrigger } from './ChoiceMenu';
import { ToolbarButton, ToolbarGroup } from './components/toolbar';
import { MapMenuActions, GraphMenuActions } from './IdentityMenuActions';
import { MapIcon, EditIcon, GraphIcon } from './icons';
import { InlineTitleEditor } from './InlineTitleEditor';
import type { PaletteColorEntry } from './PaletteColorPicker';

/** One entity a Space Resource's selectors can be pointed at, named as an author reads it. */
export interface CanvasSpaceEndpointChoice {
  readonly id: string;
  readonly title: string;
}

/**
 * Kind commands for one Map or Graph on an Open Space Resource rail.
 *
 * Rename, create, delete and copy — the same verbs the Dock spends on that
 * entity, addressed here to the context this Resource stores.
 */
export interface CanvasSpaceEndpointCommands {
  readonly onRename: (title: string) => string | null;
  readonly onCreate: (renameScope: string) => Promise<string | null>;
  readonly onDelete: () => Promise<string | null>;
  readonly onCopyLink: () => Promise<string | null>;
  readonly deleteDisabled: boolean;
}

export interface CanvasSpaceEndpointGraphCommands extends CanvasSpaceEndpointCommands {
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  readonly onRecolor: (color: string) => string | null;
}

/**
 * The two choices an Open Space Resource publishes, and what is available to make
 * them from.
 *
 * One interface rather than four loose props, because the four move together:
 * the Graphs on offer are the selected Map's, so a caller that changed the
 * Map without changing the list beside it would be offering Graphs from a
 * Map this Resource no longer shows. Which Maps and Graphs exist is the target
 * Space's business and neither is derived here.
 */
export interface CanvasSpaceEndpointSelection {
  readonly onEditingChange?: (editing: boolean) => void;
  readonly mapCommands?: CanvasSpaceEndpointCommands;
  readonly graphCommands?: CanvasSpaceEndpointGraphCommands;
  readonly maps: readonly CanvasSpaceEndpointChoice[];
  readonly graphs: readonly CanvasSpaceEndpointChoice[];
  /** The selected Map, or `null` where the Resource selects none. */
  readonly mapId: string | null;
  readonly graphId: string | null;
  readonly onMapChange: (mapId: string) => void;
  readonly onGraphChange: (graphId: string) => void;
  /**
   * The selections are read but cannot be changed right now.
   *
   * Distinct from an absent selection, which means the target Space has not
   * been read yet: a canvas that has withdrawn authoring — a creation pane is
   * up, or the Space is presenting — still knows perfectly well which Map
   * and Graph this Resource selects, and a Resource that said otherwise would be
   * reporting a wait that had already ended.
   */
  readonly disabled?: boolean;
}

/**
 * What {@link SpaceEndpointSelectors} needs to draw Map and Graph on a Space
 * Resource rail, minus portal Read/Edit which stays on the Resource front.
 *
 * The one shape both an embedded canvas Resource (`CanvasResource`'s own rail) and
 * the application's Space Resource rail render — the Dock's identical-looking
 * clusters are a different operation over the same primitive and are not
 * built from this type (`docs/agents/ui.md`, `command-surface-sharing.test.ts`).
 */
export interface SpaceEndpointSelectorsProps extends CanvasSpaceEndpointSelection {
  readonly onReport: (message: string | null) => void;
}

/**
 * Map and Graph kind commands extend the Resource's one rail toolbar.
 * They share the Dock's clusters and choices while writing this Resource's selection.
 */
export function SpaceEndpointSelectors({
  onEditingChange,
  onReport,
  mapCommands,
  graphCommands,
  maps,
  graphs,
  mapId,
  graphId,
  onMapChange,
  onGraphChange,
  disabled,
}: SpaceEndpointSelectorsProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onEditingChange?.(renaming !== null || busy);
    return () => onEditingChange?.(false);
  }, [renaming, busy, onEditingChange]);
  return (
    <>
      <SpaceEndpointSelector
        label="Map"
        commands={mapCommands}
        onBusy={setBusy}
        renaming={renaming === 'Map'}
        onRenaming={(editing) => setRenaming(editing ? 'Map' : null)}
        onReport={onReport}
        icon={<MapIcon />}
        testId="space-resource-map"
        choices={maps}
        chosen={mapId}
        disabled={disabled === true || busy}
        onChoose={onMapChange}
      />
      <SpaceEndpointSelector
        label="Graph"
        commands={graphCommands}
        onBusy={setBusy}
        renaming={renaming === 'Graph'}
        onRenaming={(editing) => setRenaming(editing ? 'Graph' : null)}
        onReport={onReport}
        icon={<GraphIcon size={14} />}
        testId="space-resource-graph"
        choices={graphs}
        chosen={graphId}
        disabled={disabled === true || busy}
        onChoose={onGraphChange}
      />
    </>
  );
}

interface SpaceEndpointSelectorProps {
  readonly onBusy: (busy: boolean) => void;
  readonly commands: CanvasSpaceEndpointCommands | CanvasSpaceEndpointGraphCommands | undefined;
  readonly renaming: boolean;
  readonly onRenaming: (editing: boolean) => void;
  readonly onReport: (message: string | null) => void;
  readonly label: string;
  readonly icon: ReactNode;
  readonly testId: string;
  readonly choices: readonly CanvasSpaceEndpointChoice[];
  readonly chosen: string | null;
  /** Authoring is withdrawn from this canvas; the selection itself is known. */
  readonly disabled: boolean;
  readonly onChoose: (id: string) => void;
}

/**
 * One of the two, so the Map and the Graph cannot drift apart in treatment,
 * labelling or keyboard behaviour.
 *
 * The shared `ChoiceMenu` (ADR 0050): the labelled list, the mark on the member
 * this Resource selects, arrow navigation, type-ahead, the menu's own
 * `menu`/`menuitemradio` pairing and dismissal are all the primitive's, and none
 * of them is restated here. **The operation is not shared and must not be** —
 * this list writes which Map *this Resource* shows into the Resource, where the
 * Dock's identical-looking list moves the canvas the author is standing on.
 * Both arrive from the caller for exactly that reason.
 *
 * Three attributes are this Resource's and are supplied from here.
 *
 * `nokey` on the trigger and on the popup. React Flow subscribes its live
 * Space-key pan activation on the document and excludes a target through a
 * `.nokey` ancestor; a `button` is not one of its own native exclusions, so a
 * trigger sitting on a canvas Resource would pan the canvas instead of opening its
 * list, and the popup — portalled out of the Resource entirely — is outside the
 * canvas's own guard. `nodrag nopan` are the same pair every other in-Resource
 * control carries, so a press on the trigger does not drag the Resource out from
 * under it.
 *
 * An empty list disables the trigger rather than opening onto nothing, and the
 * trigger says which set is empty. A Space with no Graphs is an ordinary entity
 * to reference, and a control that opens onto an empty list says "look again"
 * where an unavailable one says "there are none". A canvas that has withdrawn
 * authoring disables it the same way, and for the reason it still draws the
 * selection at all: which Map this Resource shows is known, and only changing it
 * is unavailable.
 *
 * The trigger resolves the selected id against this list itself: the popup is
 * unmounted while closed, so nothing has registered a title at the moment the
 * trigger first has to display one.
 */
function SpaceEndpointSelector({
  onBusy,
  commands,
  renaming,
  onRenaming,
  onReport,
  label,
  icon,
  testId,
  choices,
  chosen,
  disabled,
  onChoose,
}: SpaceEndpointSelectorProps) {
  const selected = choices.find((choice) => choice.id === chosen);
  const renameScope = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const movedCaret = useRef(false);
  const returningFocus = useRef(false);
  useEffect(() => {
    if (renaming || !returningFocus.current) return;
    returningFocus.current = false;
    triggerRef.current?.focus();
  }, [renaming]);
  const endRename = () => {
    onRenaming(false);
  };
  const endRenameReturningFocus = () => {
    returningFocus.current = true;
    endRename();
  };
  const renameItem = (
    <DropdownMenuItem
      className="gap-2"
      disabled={disabled || selected === undefined}
      onClick={() => {
        movedCaret.current = true;
        onRenaming(true);
      }}
    >
      <EditIcon />
      Rename
    </DropdownMenuItem>
  );
  const commonCommands = {
    title: selected?.title ?? `No ${label}`,
    renameItem,
    deleteDisabled: disabled || commands?.deleteDisabled === true,
    onCreate: () => {
      if (commands === undefined) return;
      // The application requests creation's continuation; keep the menu
      // from restoring focus while its adapter waits for the new name.
      movedCaret.current = label === 'Map';
      onBusy(true);
      void commands
        .onCreate(renameScope)
        .then((refusal) => {
          onReport(refusal);
          if (refusal !== null) movedCaret.current = false;
        })
        .catch(() => {
          movedCaret.current = false;
        })
        .finally(() => {
          onBusy(false);
        });
    },
    onDelete: () => {
      if (commands === undefined) return;
      onBusy(true);
      void commands
        .onDelete()
        .then((refusal) => {
          onReport(refusal);
        })
        .catch(() => undefined)
        .finally(() => {
          onBusy(false);
        });
    },
    onCopyLink: () => {
      if (commands === undefined) return;
      void commands.onCopyLink().then((refusal) => onReport(refusal ?? 'Link copied.'));
    },
  };
  return (
    <ToolbarGroup aria-label={label} className="min-w-0">
      {label === 'Map' && commands !== undefined && (
        <button
          type="button"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-continuation-control="map-name"
          data-continuation-scope={renameScope}
          data-continuation-subject={chosen}
          disabled={disabled || selected === undefined}
          onClick={() => onRenaming(true)}
        />
      )}
      {renaming && commands !== undefined && selected !== undefined && (
        <InlineTitleEditor
          title={selected.title}
          label={`${label} name`}
          variant="header"
          className="nokey nodrag nopan"
          onComplete={(title) => {
            const refusal = commands.onRename(title);
            if (refusal === null) endRename();
            return refusal;
          }}
          onCancel={endRename}
          onReturnFocus={endRenameReturningFocus}
        />
      )}
      <ChoiceMenu<string>
        label={`${label}s`}
        choices={choices}
        chosen={chosen}
        onChoose={onChoose}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        className="nokey w-64"
        restoresFocusOnClose={() => !movedCaret.current}
        trigger={
          <ChoiceMenuTrigger
            ref={triggerRef}
            render={<ToolbarButton size={renaming ? 'icon' : 'compact'} />}
            onClick={(event) => {
              event.stopPropagation();
              movedCaret.current = false;
            }}
            onPointerDown={(event) => event.stopPropagation()}
            data-testid={testId}
            className="canvas-resource__space-choice nokey nodrag nopan"
            aria-label={selected === undefined ? `${label}: none` : `${label}: ${selected.title}`}
            title={`Choose the ${label} this Space Resource shows`}
            disabled={disabled || choices.length === 0}
            icon={icon}
            name={renaming ? undefined : (selected?.title ?? `No ${label}`)}
          />
        }
      >
        {commands !== undefined &&
          ('onRecolor' in commands ? (
            <GraphMenuActions
              {...commonCommands}
              editsDisabled={disabled}
              color={commands.color}
              colors={commands.colors}
              onRecolor={(color) => {
                onReport(commands.onRecolor(color));
                setMenuOpen(false);
              }}
            />
          ) : (
            <MapMenuActions {...commonCommands} createDisabled={disabled} />
          ))}
      </ChoiceMenu>
    </ToolbarGroup>
  );
}
