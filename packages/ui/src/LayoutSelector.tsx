import type { Layout } from '@project/core';
import { CheckIcon, LayoutIcon } from './icons';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorTrigger } from './SelectorTrigger';

export interface LayoutSelectorProps {
  layouts: readonly Layout[];
  value: string | null;
  /** Whether an authored Layout, rather than an Algorithmic View, is drawing. */
  active: boolean;
  onValueChange: (layoutId: string) => void;
}

export function LayoutSelector({ layouts, value, active, onValueChange }: LayoutSelectorProps) {
  const selected = layouts.find((layout) => layout.id === value);

  return (
    <Select {...(value === null ? {} : { value })} onValueChange={onValueChange}>
      <SelectorTrigger
        accessibleName="Choose layout"
        testId="layout-selector"
        glyph={<LayoutIcon />}
        label={selected?.title ?? 'None'}
        activeLayout={active}
      />
      <SelectContent className="w-[214px]">
        <div className="px-[8px] pt-[7px] pb-[5px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
          Layouts · authored
        </div>
        {layouts.map((layout) => (
          <SelectItem key={layout.id} value={layout.id} className="px-[8px] py-[7px] text-[13px]">
            <span className="flex w-full items-center gap-[10px]">
              <span className="text-[var(--muted)]">
                <LayoutIcon />
              </span>
              <span className="flex-1">{layout.title}</span>
              {layout.id === value && <CheckIcon />}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
