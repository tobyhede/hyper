import { useState } from 'react';
import type { Story } from '@ladle/react';
import {
  AddCardControl,
  Button,
  FlowIcon,
  GraphIcon,
  GridIcon,
  LayoutIcon,
  PersistenceIndicator,
  PresentIcon,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@project/ui';

export default { title: 'Review/Designing/Workspace Sidebar' };

type CanvasChoice =
  | { readonly kind: 'view'; readonly id: 'flow' | 'grid'; readonly title: string }
  | { readonly kind: 'layout'; readonly id: string; readonly title: string };

const computed: readonly CanvasChoice[] = [
  { kind: 'view', id: 'flow', title: 'Flow' },
  { kind: 'view', id: 'grid', title: 'Grid' },
];

const initialCanvas: CanvasChoice = {
  kind: 'layout',
  id: 'collection-1',
  title: 'Collection 1',
};

const authored: readonly CanvasChoice[] = [
  initialCanvas,
  { kind: 'layout', id: 'collection-2', title: 'Collection 2' },
];

const initialGraphId = 'long' as const;

const graphs = [
  { id: initialGraphId, title: 'Long', color: '#6ea8fe' },
  { id: 'mid', title: 'Mid', color: '#f59e0b' },
  { id: 'short', title: 'Short', color: '#34d399' },
] as const;

const sameChoice = (left: CanvasChoice, right: CanvasChoice): boolean =>
  left.kind === right.kind && left.id === right.id;

function CanvasMenu({
  choices,
  selected,
  onSelect,
}: {
  readonly choices: readonly CanvasChoice[];
  readonly selected: CanvasChoice;
  readonly onSelect: (choice: CanvasChoice) => void;
}) {
  return (
    <SidebarMenu>
      {choices.map((choice) => {
        const active = sameChoice(choice, selected);
        const Icon =
          choice.kind === 'layout' ? LayoutIcon : choice.id === 'flow' ? FlowIcon : GridIcon;
        return (
          <SidebarMenuItem key={`${choice.kind}:${choice.id}`}>
            <SidebarMenuButton
              isActive={active}
              aria-pressed={active}
              tooltip={choice.title}
              onClick={() => onSelect(choice)}
            >
              <Icon />
              <span>{choice.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/**
 * Working design only. It deliberately composes shadcn's production Sidebar
 * primitives with local fixture state instead of claiming parity with today's
 * toolbar. Once accepted, the application becomes the state owner and the
 * stable story must render that production boundary unchanged (ADR 0052).
 */
export const SingleCanvasChoice: Story = () => {
  const [selected, setSelected] = useState<CanvasChoice>(initialCanvas);
  const [activeGraph, setActiveGraph] = useState<(typeof graphs)[number]['id']>(initialGraphId);

  return (
    <div className="h-screen min-h-[36rem] overflow-hidden bg-background text-foreground">
      <SidebarProvider>
        <Sidebar collapsible="offcanvas">
          <SidebarHeader />
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <AddCardControl
                  onAddCard={() => undefined}
                  onAddAlias={() => undefined}
                  keyShortcut="C"
                />
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Computed views</SidebarGroupLabel>
              <SidebarGroupContent>
                <CanvasMenu choices={computed} selected={selected} onSelect={setSelected} />
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Authored layouts</SidebarGroupLabel>
              <SidebarGroupContent>
                <CanvasMenu choices={authored} selected={selected} onSelect={setSelected} />
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Graphs</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {graphs.map((graph) => (
                    <SidebarMenuItem key={graph.id}>
                      <SidebarMenuButton
                        isActive={activeGraph === graph.id}
                        aria-pressed={activeGraph === graph.id}
                        onClick={() => setActiveGraph(graph.id)}
                      >
                        <GraphIcon color={graph.color} />
                        <span>{graph.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <Button className="w-full justify-start gap-2" variant="secondary">
              <PresentIcon
                color={graphs.find((graph) => graph.id === activeGraph)?.color ?? '#6ea8fe'}
              />
              Present {graphs.find((graph) => graph.id === activeGraph)?.title}
            </Button>
            <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
              <span>Changes saved</span>
              <PersistenceIndicator state="settled" />
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-0">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
            <SidebarTrigger />
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-medium">{selected.title}</span>
              <span className="text-xs text-muted-foreground">
                {selected.kind === 'layout' ? 'Authored layout' : 'Computed view'}
              </span>
            </div>
          </header>
          <main className="relative min-h-0 flex-1 overflow-hidden bg-background">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--border)_1px,transparent_1px)] bg-size-[24px_24px]" />
            <div className="absolute inset-0 grid place-items-center p-8">
              <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
                <h2 className="text-lg font-medium">{selected.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Selecting a computed View or an authored Layout replaces this canvas state. There
                  is no second selection and no “None” value.
                </p>
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
};
