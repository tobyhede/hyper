import { CheckIcon, FlowIcon, GridIcon } from './icons';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorTrigger } from './SelectorTrigger';

export type AlgorithmicViewId = 'flow' | 'grid';

export interface ViewSelectorProps {
  value: AlgorithmicViewId;
  /** Whether the remembered View, rather than a Layout, is drawing. */
  active: boolean;
  onValueChange: (view: AlgorithmicViewId) => void;
}

const views = [
  { id: 'flow', title: 'Flow', icon: FlowIcon },
  { id: 'grid', title: 'Grid', icon: GridIcon },
] as const;

export function ViewSelector({ value, active, onValueChange }: ViewSelectorProps) {
  const selected = views.find((view) => view.id === value) ?? views[0];
  const SelectedIcon = selected.icon;

  return (
    <Select
      value={active ? value : null}
      onValueChange={(next) => next !== null && onValueChange(next as AlgorithmicViewId)}
    >
      <SelectorTrigger
        accessibleName="Choose view"
        testId="view-selector"
        glyph={<SelectedIcon />}
        label={selected.title}
      />
      <SelectContent className="w-[214px]">
        <div className="px-[8px] pt-[7px] pb-[5px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
          Views · computed
        </div>
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <SelectItem key={view.id} value={view.id} className="px-[8px] py-[7px] text-[13px]">
              <span className="flex w-full items-center gap-[10px]">
                <span className="text-[var(--muted)]">
                  <Icon />
                </span>
                <span className="flex-1">{view.title}</span>
                {active && view.id === value && <CheckIcon />}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
