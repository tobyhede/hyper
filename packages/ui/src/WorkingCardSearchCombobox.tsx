import { useRef } from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import type { Card } from '@project/core';
import { CardKindIcon } from './CardKindIcon';
import { CheckIcon, ChevronDownIcon } from './icons';
import { Input } from './components/input';
import { cn } from './lib/utils';

export interface WorkingCardSearchComboboxProps {
  readonly label: string;
  readonly cards: readonly WorkingCardChoice[];
  readonly value: string | null;
  readonly onValueChange: (cardId: string) => void;
}

interface WorkingCardChoice {
  readonly id: string;
  readonly title: string;
  readonly kind: Card['kind'];
}

/**
 * PROTOTYPE: the improved one-input picker from `feat/surface-inventory`.
 *
 * This deliberately remains a Working-catalogue component while the three
 * Card picker presentations are compared. It is not a third production picker.
 */
export function WorkingCardSearchCombobox({
  label,
  cards,
  value,
  onValueChange,
}: WorkingCardSearchComboboxProps) {
  const anchor = useRef<HTMLDivElement | null>(null);
  const portalContainer = useRef<HTMLElement | null>(null);
  const chosen = cards.find((card) => card.id === value) ?? null;

  return (
    <div
      data-working-card-search-combobox=""
      ref={(element) => {
        anchor.current = element;
        portalContainer.current = element?.ownerDocument.body ?? null;
      }}
      className="relative w-full"
    >
      <ComboboxPrimitive.Root
        items={cards}
        value={chosen}
        itemToStringLabel={(card) => card.title}
        itemToStringValue={(card) => card.title}
        onValueChange={(card) => {
          if (card !== null) onValueChange(card.id);
        }}
      >
        {chosen !== null && (
          <span className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2">
            <CardKindIcon kind={chosen.kind} />
          </span>
        )}
        <ComboboxPrimitive.Input
          render={<Input />}
          aria-label={label}
          placeholder="Choose a Card"
          className={cn(chosen === null ? 'pr-9' : 'pr-9 pl-8')}
        />
        <ComboboxPrimitive.Trigger
          aria-label={`Open ${label}`}
          className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDownIcon />
        </ComboboxPrimitive.Trigger>
        <ComboboxPrimitive.Portal container={portalContainer}>
          <ComboboxPrimitive.Positioner
            anchor={anchor}
            side="bottom"
            sideOffset={0}
            align="start"
            className="isolate z-50"
          >
            <ComboboxPrimitive.Popup
              data-working-card-search-popup=""
              className="nokey data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100"
            >
              <ComboboxPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                No Cards found.
              </ComboboxPrimitive.Empty>
              <ComboboxPrimitive.List className="max-h-72 overflow-y-auto p-1">
                {(card: WorkingCardChoice) => (
                  <ComboboxPrimitive.Item
                    key={card.id}
                    value={card}
                    className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <CardKindIcon kind={card.kind} />
                    <span className="truncate">{card.title}</span>
                    <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                      <CheckIcon />
                    </ComboboxPrimitive.ItemIndicator>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
    </div>
  );
}
