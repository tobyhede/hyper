/**
 * THROWAWAY UX PROTOTYPE — three replacements for the Sidebar's persistent
 * "Copy link to X" / "Copy link in this Space View" buttons, switchable with
 * `?variant=smart|menu|share`. Nothing here copies to the real clipboard,
 * navigates, or authors anything: every action only appends to the on-screen
 * log so the interaction can be judged without side effects. See
 * `.scratch/link-ux/issues/01-choose-the-link-action-pattern.md` for the
 * question this answers and the recommendation drawn from it.
 */
import type { Story } from '@ladle/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  CardKindIcon,
  CheckIcon,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  GraphIcon,
  LayoutIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@project/ui';
import { ApplicationChromeFixture } from '../support/ApplicationChromeFixture';

export default { title: 'Review/Link Actions' };

type Variant = 'smart' | 'menu' | 'share';

const VARIANTS: readonly { readonly id: Variant; readonly label: string }[] = [
  { id: 'smart', label: 'A — Smart default' },
  { id: 'menu', label: 'B — Actions menu' },
  { id: 'share', label: 'C — Share popover' },
];

const isVariant = (value: string | null): value is Variant =>
  value === 'smart' || value === 'menu' || value === 'share';

/** Which of an entity's link commands a control fired. */
type Which = 'default' | 'permanent';

interface LinkDestination {
  /** Plain-language description of where the link opens, never "canonical"/"contextual". */
  readonly label: string;
  readonly url: string;
}

type EntityKind = 'card' | 'graph' | 'space-view' | 'space';

interface LinkEntity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly title: string;
  readonly subtitle: string;
  /** What a single click copies — the address that reproduces what's on screen. */
  readonly default: LinkDestination;
  /** The Card/Graph's own durable address, offered only when it differs from `default`. */
  readonly permanent?: LinkDestination;
}

const ENTITIES: readonly LinkEntity[] = [
  {
    id: 'card-in-layout',
    kind: 'card',
    title: 'Constraints',
    subtitle: 'Card · in Layout 1',
    default: {
      label: 'Opens Constraints inside Layout 1, selected the way it is now',
      url: '/spaces/8fQmZ2/views/R7yUxa/cards/Kx91Lp',
    },
    permanent: {
      label: "Always opens Constraints on its own, wherever it's placed",
      url: '/spaces/8fQmZ2/cards/Kx91Lp',
    },
  },
  {
    id: 'card-outside-layout',
    kind: 'card',
    title: 'Deployment notes',
    subtitle: "Card · not in Layout 1 — shown from the Space's Cards",
    default: {
      label: "Opens Deployment notes on its own — Layout 1 doesn't place it",
      url: '/spaces/8fQmZ2/cards/Qz4Tmn',
    },
  },
  {
    id: 'graph',
    kind: 'graph',
    title: 'Golden path',
    subtitle: 'Graph · active in Layout 1',
    default: {
      label: 'Opens Golden path inside Layout 1, at the current step',
      url: '/spaces/8fQmZ2/views/R7yUxa/graphs/N4tPqe',
    },
    permanent: {
      label: 'Always opens Golden path, in whichever Space View draws it',
      url: '/spaces/8fQmZ2/graphs/N4tPqe',
    },
  },
  {
    id: 'space-view',
    kind: 'space-view',
    title: 'Layout 1',
    subtitle: 'Space View',
    default: {
      label: 'Opens Layout 1 exactly as authored',
      url: '/spaces/8fQmZ2/views/R7yUxa',
    },
  },
  {
    id: 'space',
    kind: 'space',
    title: 'Presentation kit',
    subtitle: 'Space',
    default: {
      label: "Opens Presentation kit at the Space's own entry view",
      url: '/spaces/8fQmZ2',
    },
  },
];

const destinationOf = (entity: LinkEntity, which: Which): LinkDestination | undefined =>
  which === 'permanent' ? entity.permanent : entity.default;

/** Row action controls share this hover-and-focus reveal so no variant leaves a persistent button in view. */
const REVEAL_ON_HOVER =
  'ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/link-row:opacity-100 group-focus-within/link-row:opacity-100 max-md:opacity-100';

function EntityGlyph({ kind }: { readonly kind: EntityKind }) {
  if (kind === 'card') return <CardKindIcon kind="markdown" />;
  if (kind === 'graph') return <GraphIcon />;
  if (kind === 'space-view') return <LayoutIcon />;
  return (
    <span aria-hidden="true" className="inline-block size-4 text-center text-muted-foreground">
      ◆
    </span>
  );
}

/** What every variant reports so the log and confirmation stay uniform even though each control differs. */
function useLinkActions() {
  const [copied, setCopied] = useState<{ readonly entityId: string; readonly which: Which } | null>(
    null,
  );
  const [log, setLog] = useState<readonly { readonly id: number; readonly line: string }[]>([]);
  const clearTimer = useRef<number | undefined>(undefined);
  const nextLogId = useRef(0);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const append = (line: string) => {
    nextLogId.current += 1;
    const entry = { id: nextLogId.current, line };
    setLog((current) => [entry, ...current].slice(0, 4));
  };

  const copyLink = (entity: LinkEntity, which: Which) => {
    const destination = destinationOf(entity, which);
    if (destination === undefined) return;
    setCopied({ entityId: entity.id, which });
    append(`Copied → ${destination.url}`);
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  const openInNewTab = (entity: LinkEntity, which: Which = 'default') => {
    const destination = destinationOf(entity, which);
    if (destination === undefined) return;
    append(`Would open in a new tab → ${destination.url}`);
  };

  const isCopied = (entity: LinkEntity, which: Which) =>
    copied !== null && copied.entityId === entity.id && copied.which === which;

  return { log, copyLink, openInNewTab, isCopied };
}

type LinkActions = ReturnType<typeof useLinkActions>;

interface RowActionProps {
  readonly entity: LinkEntity;
  readonly actions: LinkActions;
}

/**
 * Variant A — one "Copy link" action that copies the useful default outright;
 * a second, smaller control opens the one alternative only when it exists.
 */
function SmartDefaultAction({ entity, actions }: RowActionProps) {
  return (
    <div className={REVEAL_ON_HOVER}>
      <Button
        variant="ghost"
        size="icon"
        title={entity.default.label}
        aria-label={`Copy link to ${entity.title}`}
        onClick={() => actions.copyLink(entity, 'default')}
      >
        {actions.isCopied(entity, 'default') ? <CheckIcon /> : <span aria-hidden="true">🔗</span>}
      </Button>
      {entity.permanent !== undefined && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`More link options for ${entity.title}`}
              />
            }
          >
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onClick={() => actions.copyLink(entity, 'permanent')}>
              <div className="flex flex-col gap-0.5">
                <span>
                  {actions.isCopied(entity, 'permanent') ? 'Copied' : 'Copy permanent link'}
                </span>
                <span className="text-xs text-muted-foreground">{entity.permanent.label}</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.openInNewTab(entity, 'default')}>
              Open in new tab
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/**
 * Variant B — one actions menu naming every link command explicitly. Nothing
 * is guessed: a Card or Graph with two addresses lists both, each with its
 * own plain-language destination.
 */
function ActionsMenu({ entity, actions }: RowActionProps) {
  return (
    <div className={REVEAL_ON_HOVER}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={`${entity.title} link actions`} />
          }
        >
          <span aria-hidden="true">⋯</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{entity.title}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => actions.copyLink(entity, 'default')}>
              <div className="flex flex-col gap-0.5">
                <span>{actions.isCopied(entity, 'default') ? 'Copied' : 'Copy link'}</span>
                <span className="text-xs text-muted-foreground">{entity.default.label}</span>
              </div>
            </DropdownMenuItem>
            {entity.permanent !== undefined && (
              <DropdownMenuItem onClick={() => actions.copyLink(entity, 'permanent')}>
                <div className="flex flex-col gap-0.5">
                  <span>
                    {actions.isCopied(entity, 'permanent') ? 'Copied' : 'Copy permanent link'}
                  </span>
                  <span className="text-xs text-muted-foreground">{entity.permanent.label}</span>
                </div>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => actions.openInNewTab(entity, 'default')}>
            Open in new tab
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ShareRow({
  label,
  copied,
  onCopy,
  onOpenNewTab,
}: {
  readonly label: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
  readonly onOpenNewTab: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border p-2">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">{label}</p>
      <Button size="compact" variant={copied ? 'default' : 'secondary'} onClick={onCopy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Button size="icon" variant="ghost" aria-label="Open in new tab" onClick={onOpenNewTab}>
        <span aria-hidden="true">↗</span>
      </Button>
    </div>
  );
}

/**
 * Variant C — a popover that explains each destination in a sentence before
 * it's copied, and stays open afterward so a second destination can be
 * copied too.
 */
function SharePopover({ entity, actions }: RowActionProps) {
  return (
    <div className={REVEAL_ON_HOVER}>
      <Popover>
        <PopoverTrigger
          render={<Button variant="ghost" size="icon" aria-label={`Share ${entity.title}`} />}
        >
          <span aria-hidden="true">🔗</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <p className="mb-2 text-sm font-medium">{entity.title}</p>
          <div className="grid gap-2">
            <ShareRow
              label={entity.default.label}
              copied={actions.isCopied(entity, 'default')}
              onCopy={() => actions.copyLink(entity, 'default')}
              onOpenNewTab={() => actions.openInNewTab(entity, 'default')}
            />
            {entity.permanent !== undefined && (
              <ShareRow
                label={entity.permanent.label}
                copied={actions.isCopied(entity, 'permanent')}
                onCopy={() => actions.copyLink(entity, 'permanent')}
                onOpenNewTab={() => actions.openInNewTab(entity, 'permanent')}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LinkEntityRow({ entity, children }: { readonly entity: LinkEntity; children: ReactNode }) {
  return (
    <SidebarMenuItem className="group/link-row flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent">
      <EntityGlyph kind={entity.kind} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{entity.title}</span>
        <span className="truncate text-xs text-muted-foreground">{entity.subtitle}</span>
      </span>
      {children}
    </SidebarMenuItem>
  );
}

function LinkActionsPanel({
  variant,
  actions,
}: {
  readonly variant: Variant;
  readonly actions: LinkActions;
}) {
  return (
    <Sidebar side="right" collapsible="none" className="w-96 shrink-0 overflow-y-auto border-l">
      <SidebarHeader className="gap-1 border-b border-neutral-300 p-4">
        <h2 className="font-semibold">Link actions — states</h2>
        <p className="text-xs text-neutral-500">
          One trigger per selected entity, revealed on hover or focus. Hover a row (or tab to it) to
          see the control this variant uses.
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Card, Graph, Space View, Space</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ENTITIES.map((entity) => (
                <LinkEntityRow key={entity.id} entity={entity}>
                  {variant === 'smart' && <SmartDefaultAction entity={entity} actions={actions} />}
                  {variant === 'menu' && <ActionsMenu entity={entity} actions={actions} />}
                  {variant === 'share' && <SharePopover entity={entity} actions={actions} />}
                </LinkEntityRow>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function PrototypeBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-400 px-3 py-1 text-center text-xs font-semibold text-amber-950">
      PROTOTYPE — Link UX exploration. Nothing here copies to the clipboard, navigates, or writes to
      the Space.
    </div>
  );
}

function ActivityLog({
  log,
}: {
  readonly log: readonly { readonly id: number; readonly line: string }[];
}) {
  return (
    <div
      aria-live="polite"
      className="absolute right-4 bottom-4 z-10 w-80 rounded-md border bg-background/95 p-3 font-mono text-[11px] shadow-sm"
    >
      <p className="mb-1 font-sans text-xs font-semibold text-muted-foreground">Last actions</p>
      {log.length === 0 ? (
        <p className="text-muted-foreground">Nothing yet — try a row's link control.</p>
      ) : (
        <ul className="grid gap-1">
          {log.map((entry) => (
            <li key={entry.id}>{entry.line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useVariant(): [Variant, (variant: Variant) => void] {
  const initial = new URLSearchParams(window.location.search).get('variant');
  const [variant, setVariant] = useState<Variant>(isVariant(initial) ? initial : 'smart');
  const choose = (next: Variant) => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState({}, '', url);
    setVariant(next);
  };
  return [variant, choose];
}

function PrototypeSwitcher({
  variant,
  onChange,
}: {
  readonly variant: Variant;
  readonly onChange: (v: Variant) => void;
}) {
  const index = VARIANTS.findIndex(({ id }) => id === variant);
  const move = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    if (next !== undefined) onChange(next.id);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-neutral-700 bg-neutral-950 px-2 py-2 text-white shadow-2xl">
      <Button size="icon" variant="ghost" aria-label="Previous variant" onClick={() => move(-1)}>
        ←
      </Button>
      <span className="min-w-44 text-center text-xs font-semibold">{VARIANTS[index]?.label}</span>
      <Button size="icon" variant="ghost" aria-label="Next variant" onClick={() => move(1)}>
        →
      </Button>
    </div>
  );
}

function LinkActionsPrototype() {
  const [variant, setVariant] = useVariant();
  const actions = useLinkActions();

  return (
    <>
      <PrototypeBanner />
      <div className="pt-6">
        <ApplicationChromeFixture
          rightPanel={<LinkActionsPanel variant={variant} actions={actions} />}
          canvasOverlay={<ActivityLog log={actions.log} />}
        />
      </div>
      <PrototypeSwitcher variant={variant} onChange={setVariant} />
    </>
  );
}

export const Variants: Story = () => <LinkActionsPrototype />;
Variants.meta = { iframed: true };
