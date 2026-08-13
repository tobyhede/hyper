import type { ReactNode } from 'react';
import { SelectTrigger } from './Select';

export interface SelectorTriggerProps {
  accessibleName: string;
  /** Absent on a selector whose choices are told apart by their titles alone. */
  glyph?: ReactNode;
  label: string;
  activeLayout?: boolean;
  className?: string;
  testId?: string;
}

/** Shared toolbar control shape for selecting a renderer or active graph. */
export function SelectorTrigger({
  accessibleName,
  glyph,
  label,
  activeLayout = false,
  className,
  testId,
}: SelectorTriggerProps) {
  return (
    <SelectTrigger
      aria-label={accessibleName}
      title={accessibleName}
      data-testid={testId}
      className={`gap-[7px] px-[9px] py-[6px] text-[13px] hover:border-[var(--accent)] ${className ?? ''}`}
    >
      {activeLayout && (
        <span
          data-testid="layout-live-indicator"
          className="size-[6px] shrink-0 rounded-full bg-[var(--accent)]"
          aria-hidden="true"
        />
      )}
      {glyph}
      <span className="max-w-[9rem] truncate">{label}</span>
    </SelectTrigger>
  );
}
