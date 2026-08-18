import type { ReactNode } from 'react';
import { cn } from './lib/utils';
import { SelectTrigger } from './Select';

export interface SelectorTriggerProps {
  readonly accessibleName: string;
  /** Absent on a selector whose choices are told apart by their titles alone. */
  readonly glyph?: ReactNode;
  readonly label: string;
  /**
   * Whether this selector's choice is the live renderer. Only the Layout
   * selector has anything to say here; leaving it off is what reserves no space
   * for a dot the other two never show.
   */
  readonly activeLayout?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * The shared trigger shape for the three workspace selectors.
 *
 * A Select trigger carries its current value, so its natural width is the width
 * of whatever happens to be chosen — which would move every control to its right
 * on each selection. The label is therefore given a **fixed** width rather than
 * a maximum, so the toolbar's geometry is a property of the toolbar and not of
 * the Space's longest title. What will not fit truncates, and the `title`
 * attribute keeps the whole value readable.
 *
 * The live-Layout dot and the glyph sit outside that box so a Layout going live
 * does not shorten its own label; both are fixed-size and `shrink-0`.
 */
export function SelectorTrigger({
  accessibleName,
  glyph,
  label,
  activeLayout,
  className,
  testId,
}: SelectorTriggerProps) {
  return (
    <SelectTrigger
      aria-label={accessibleName}
      title={`${accessibleName} · ${label}`}
      data-testid={testId}
      className={cn('gap-[7px] px-[9px] py-[6px] text-[13px] hover:border-accent', className)}
    >
      {activeLayout === undefined ? null : (
        // The slot is what holds the width; the dot inside it comes and goes.
        <span className="size-[6px] shrink-0" aria-hidden="true">
          {activeLayout && (
            <span
              data-testid="layout-live-indicator"
              className="block size-[6px] rounded-full bg-accent"
            />
          )}
        </span>
      )}
      {glyph}
      <span className="w-[8.5rem] truncate text-left">{label}</span>
    </SelectTrigger>
  );
}

/** The heading that says what kind of thing a selector's choices are. */
export function SelectorGroupLabel({ children }: { readonly children: ReactNode }) {
  return (
    <div className="px-[8px] pt-[7px] pb-[5px] font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}
