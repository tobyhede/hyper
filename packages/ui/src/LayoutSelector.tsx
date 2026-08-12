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

  // Controlled across the empty state, never uncontrolled.
  //
  // A Space has no Layout until an author's first edit converts one into being
  // (ADR 0025), so `value` starts null and becomes an id — and omitting the prop
  // for null made that ordinary transition flip Radix from uncontrolled to
  // controlled. It warns, and the half of the transition that matters is silent:
  // while uncontrolled it keeps selection state of its own, which the app is no
  // longer the source of truth for.
  //
  // The empty string is Radix's own spelling of "nothing selected" — a
  // `SelectItem` may not carry it, which is what reserves it for this. The
  // trigger renders its own label, so nothing here depends on a match.
  return (
    <Select value={value ?? ''} onValueChange={onValueChange}>
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
