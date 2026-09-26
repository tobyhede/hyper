import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DropdownMenuItem } from './components/dropdown-menu';
import { ChoiceMenu, ChoiceMenuTrigger, type ChoiceMenuChoice } from './ChoiceMenu';
import type { GraphHeadShape } from '@project/core';
import { GraphLegendMark } from './GraphLegendMark';
import { ToolbarButton, ToolbarGroup } from './components/toolbar';
import { MapMenuActions, GraphMenuActions } from './IdentityMenuActions';
import { MapIcon, EditIcon, GraphIcon } from './icons';
import { InlineTitleEditor } from './InlineTitleEditor';
import type { PaletteColorEntry } from './PaletteColorPicker';

/** One entity a Space Resource's selectors can be pointed at, named as an author reads it. */
export interface CanvasSpaceResourceChoice {
  readonly id: string;
  readonly title: string;
}

/** A Graph a Space Resource can select, carrying the colour and head shape its row is marked in. */
export interface CanvasSpaceResourceGraphChoice extends CanvasSpaceResourceChoice {
  /** The Graph's resolved colour, through the shared `graphColor` seam. */
  readonly color: string;
  /** The Graph's resolved head shape, through `graphHeadShape`. */
  readonly headShape: GraphHeadShape;
}

/**
 * The Map commands on an Open Space Resource rail, addressed to the Map this
 * Resource selects — the verbs the Dock spends on its Map, over the target
 * Space.
 *
 * Rename, New Map and Delete are each one field: the press, or `null` where the
 * command is unavailable. The application answers each from one Map authoring
 * capability, so the row's unavailable treatment and what it invokes cannot
 * disagree.
 *
 * **What the rail says, and what it does not.** A refused rename answers the
 * sentence that holds the draft open, which is the editor's own treatment. A
 * refused creation or deletion answers nothing here: the containing canvas's
 * command outcomes say it as a notice, and a second sentence on the rail
 * would outlive the notice's dismissal.
 */
export interface CanvasSpaceResourceMapCommands {
  readonly onRename: ((title: string) => string | null) | null;
  /**
   * Create an empty Map, resolving whether the caret continues in its name —
   * which is what keeps this menu from taking the caret back on close.
   */
  readonly onCreate: ((renameScope: string) => Promise<boolean>) | null;
  readonly onDelete: (() => Promise<void>) | null;
  readonly onCopyLink: () => Promise<string | null>;
}

/**
 * The Graph commands on an Open Space Resource rail, addressed to the Graph
 * this Resource selects. Each answers the sentence the rail reports, or `null`.
 */
export interface CanvasSpaceResourceGraphCommands {
  readonly onRename: (title: string) => string | null;
  readonly onCreate: (renameScope: string) => Promise<string | null>;
  readonly onDelete: () => Promise<string | null>;
  readonly onCopyLink: () => Promise<string | null>;
  readonly deleteDisabled: boolean;
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  readonly onRecolor: (color: string) => string | null;
}

/**
 * One selector's commands as it spends them: each press, or `null` where it is
 * unavailable, and for creation whether the caret continued apart from the
 * sentence to report — so a creation that moved nothing and said nothing
 * cannot be read as one that moved the caret.
 */
interface SelectorCommands {
  readonly rename: ((title: string) => string | null) | null;
  readonly create:
    | ((
        renameScope: string,
      ) => Promise<{ readonly continued: boolean; readonly report: string | null }>)
    | null;
  readonly delete: (() => Promise<string | null>) | null;
  readonly copyLink: () => Promise<string | null>;
  /** A Graph's colour, the one command a Graph carries that a Map does not. */
  readonly palette?: Pick<CanvasSpaceResourceGraphCommands, 'color' | 'colors' | 'onRecolor'>;
}

const mapSelectorCommands = (commands: CanvasSpaceResourceMapCommands): SelectorCommands => {
  const { onCreate, onDelete } = commands;
  return {
    rename: commands.onRename,
    create:
      onCreate === null
        ? null
        : async (renameScope) => ({ continued: await onCreate(renameScope), report: null }),
    delete:
      onDelete === null
        ? null
        : async () => {
            await onDelete();
            return null;
          },
    copyLink: commands.onCopyLink,
  };
};

const graphSelectorCommands = (commands: CanvasSpaceResourceGraphCommands): SelectorCommands => ({
  rename: commands.onRename,
  create: async (renameScope) => ({
    continued: false,
    report: await commands.onCreate(renameScope),
  }),
  delete: commands.deleteDisabled ? null : commands.onDelete,
  copyLink: commands.onCopyLink,
  palette: commands,
});

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
export interface CanvasSpaceResourceSelection {
  readonly onEditingChange?: (editing: boolean) => void;
  readonly mapCommands?: CanvasSpaceResourceMapCommands;
  readonly graphCommands?: CanvasSpaceResourceGraphCommands;
  readonly maps: readonly CanvasSpaceResourceChoice[];
  readonly graphs: readonly CanvasSpaceResourceGraphChoice[];
  /** The selected Map, or `null` where the Resource selects none. */
  readonly mapId: string | null;
  readonly graphId: string | null;
  readonly onMapChange: (mapId: string) => void;
  readonly onGraphChange: (graphId: string) => void;
  /**
   * The selections are read but cannot be changed right now.
   *
   * Distinct from an absent selection, which means the target Space has not
   * been read yet: a canvas that has withdrawn authoring — the Space is
   * presenting, say — still knows perfectly well which Map
   * and Graph this Resource selects, and a Resource that said otherwise would be
   * reporting a wait that had already ended.
   */
  readonly disabled?: boolean;
}

/**
 * What {@link SpaceResourceSelectors} needs to draw Map and Graph on a Space
 * Resource rail, minus portal Read/Edit which stays on the Resource front.
 *
 * The one shape both an embedded canvas Resource (`CanvasResource`'s own rail) and
 * the application's Space Resource rail render — the Dock's identical-looking
 * clusters are a different operation over the same primitive and are not
 * built from this type (`docs/agents/ui.md`, `command-surface-sharing.test.ts`).
 */
export interface SpaceResourceSelectorsProps extends CanvasSpaceResourceSelection {
  readonly onReport: (message: string | null) => void;
}

/**
 * Map and Graph kind commands extend the Resource's one rail toolbar.
 * They share the Dock's clusters and choices while writing this Resource's selection.
 */
export function SpaceResourceSelectors({
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
}: SpaceResourceSelectorsProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onEditingChange?.(renaming !== null || busy);
    return () => onEditingChange?.(false);
  }, [renaming, busy, onEditingChange]);
  return (
    <>
      <SpaceResourceSelector
        label="Map"
        commands={mapCommands === undefined ? undefined : mapSelectorCommands(mapCommands)}
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
      <SpaceResourceSelector
        label="Graph"
        commands={graphCommands === undefined ? undefined : graphSelectorCommands(graphCommands)}
        onBusy={setBusy}
        renaming={renaming === 'Graph'}
        onRenaming={(editing) => setRenaming(editing ? 'Graph' : null)}
        onReport={onReport}
        icon={<GraphIcon size={14} />}
        testId="space-resource-graph"
        choices={graphs.map(({ id, title, color, headShape }) => ({
          id,
          title,
          icon: <GraphLegendMark color={color} headShape={headShape} />,
        }))}
        chosen={graphId}
        disabled={disabled === true || busy}
        onChoose={onGraphChange}
      />
    </>
  );
}

interface SpaceResourceSelectorProps {
  readonly onBusy: (busy: boolean) => void;
  readonly commands: SelectorCommands | undefined;
  readonly renaming: boolean;
  readonly onRenaming: (editing: boolean) => void;
  readonly onReport: (message: string | null) => void;
  readonly label: string;
  readonly icon: ReactNode;
  readonly testId: string;
  /** Each row's own mark rides on its choice: a Graph's legend mark, and nothing on a Map. */
  readonly choices: readonly ChoiceMenuChoice<string>[];
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
function SpaceResourceSelector({
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
}: SpaceResourceSelectorProps) {
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
  // One answer per command: a withdrawn rail, or a command the application
  // answered unavailable, offers nothing to press.
  const rename = disabled || selected === undefined ? null : (commands?.rename ?? null);
  const create = disabled ? null : (commands?.create ?? null);
  const remove = disabled ? null : (commands?.delete ?? null);
  const palette = commands?.palette;
  const renameItem = (
    <DropdownMenuItem
      className="gap-2"
      disabled={rename === null}
      onClick={() => {
        movedCaret.current = true;
        onRenaming(true);
      }}
    >
      <EditIcon />
      Rename
    </DropdownMenuItem>
  );
  const onCreate =
    create === null
      ? null
      : () => {
          // The application requests creation's continuation; keep the menu
          // from restoring focus while its adapter waits for the new name.
          movedCaret.current = label === 'Map';
          onBusy(true);
          void create(renameScope)
            .then(({ continued, report }) => {
              onReport(report);
              movedCaret.current = continued;
            })
            .catch(() => {
              movedCaret.current = false;
            })
            .finally(() => {
              onBusy(false);
            });
        };
  const onDelete =
    remove === null
      ? null
      : () => {
          onBusy(true);
          void remove()
            .then((refusal) => {
              onReport(refusal);
            })
            .catch(() => undefined)
            .finally(() => {
              onBusy(false);
            });
        };
  const commonCommands = {
    title: selected?.title ?? `No ${label}`,
    renameItem,
    onCopyLink: () => {
      if (commands === undefined) return;
      void commands.copyLink().then((refusal) => onReport(refusal ?? 'Link copied.'));
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
          disabled={rename === null}
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
            // A rename withdrawn while its editor was open closes it, as an
            // unavailable rename does wherever it is invoked.
            const refusal = commands.rename === null ? null : commands.rename(title);
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
          (palette !== undefined ? (
            <GraphMenuActions
              {...commonCommands}
              editsDisabled={disabled}
              deleteDisabled={onDelete === null}
              onCreate={() => onCreate?.()}
              onDelete={() => onDelete?.()}
              color={palette.color}
              colors={palette.colors}
              onRecolor={(color) => {
                onReport(palette.onRecolor(color));
                setMenuOpen(false);
              }}
            />
          ) : (
            <MapMenuActions {...commonCommands} onCreate={onCreate} onDelete={onDelete} />
          ))}
      </ChoiceMenu>
    </ToolbarGroup>
  );
}
