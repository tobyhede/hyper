import type { Layout } from '@project/core';
import { CheckIcon, LayoutIcon } from './icons';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorGroupLabel, SelectorTrigger } from './SelectorTrigger';

export interface LayoutSelectorProps {
  readonly layouts: readonly Layout[];
  readonly value: string | null;
  /** Whether an authored Layout, rather than a built-in View, is drawing. */
  readonly active: boolean;
  readonly onValueChange: (layoutId: string) => void;
}

export function LayoutSelector({ layouts, value, active, onValueChange }: LayoutSelectorProps) {
  const selected = layouts.find((layout) => layout.id === value);

  // Base UI spells the controlled empty state as null.
  //
  // A Space has no Layout until an author's first edit converts one into being
  // (ADR 0025), so `value` starts null and becomes an id without ever becoming
  // uncontrolled. The trigger renders its own label, so nothing here depends on
  // a matching item.
  return (
    <Select value={value} onValueChange={(next) => next !== null && onValueChange(next)}>
      <SelectorTrigger
        accessibleName="Choose layout"
        testId="layout-selector"
        glyph={<LayoutIcon />}
        label={selected?.title ?? 'None'}
        activeLayout={active}
      />
      <SelectContent className="w-[214px]">
        <SelectorGroupLabel>Layouts · authored</SelectorGroupLabel>
        {layouts.map((layout) => (
          <SelectItem key={layout.id} value={layout.id} className="px-[8px] py-[7px] text-[13px]">
            <span className="flex w-full items-center gap-[10px]">
              <span className="text-muted-foreground">
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
