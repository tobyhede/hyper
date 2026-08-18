import type { ReactElement } from 'react';
import { BUILT_IN_VIEW_IDS, type BuiltInViewId } from '@project/core';
import { CheckIcon, FlowIcon, GridIcon } from './icons';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorGroupLabel, SelectorTrigger } from './SelectorTrigger';

export interface ViewSelectorProps {
  readonly value: BuiltInViewId;
  /** Whether the remembered View, rather than a Layout, is drawing. */
  readonly active: boolean;
  readonly onValueChange: (view: BuiltInViewId) => void;
}

/**
 * Keyed by the ids `core` ships, so a new built-in View is a compile error here
 * rather than a View the workspace quietly cannot reach.
 */
const VIEWS = {
  flow: { title: 'Flow', Icon: FlowIcon },
  grid: { title: 'Grid', Icon: GridIcon },
} as const satisfies Record<
  BuiltInViewId,
  { readonly title: string; readonly Icon: () => ReactElement }
>;

export function ViewSelector({ value, active, onValueChange }: ViewSelectorProps) {
  const SelectedIcon = VIEWS[value].Icon;

  return (
    <Select
      value={active ? value : null}
      // Base UI infers the value type from `value`, so `next` is already
      // `BuiltInViewId | null` here; the null branch is its clear value, which
      // Hyper has no action for.
      onValueChange={(next) => next !== null && onValueChange(next)}
    >
      <SelectorTrigger
        accessibleName="Choose view"
        testId="view-selector"
        glyph={<SelectedIcon />}
        label={VIEWS[value].title}
      />
      <SelectContent className="w-[214px]">
        <SelectorGroupLabel>Views · computed</SelectorGroupLabel>
        {BUILT_IN_VIEW_IDS.map((id) => {
          const { title, Icon } = VIEWS[id];
          return (
            <SelectItem key={id} value={id} className="px-[8px] py-[7px] text-[13px]">
              <span className="flex w-full items-center gap-[10px]">
                <span className="text-muted-foreground">
                  <Icon />
                </span>
                <span className="flex-1">{title}</span>
                {active && id === value && <CheckIcon />}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
