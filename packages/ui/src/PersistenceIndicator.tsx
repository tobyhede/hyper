import { CircleAlertIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { Spinner } from './components/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/tooltip';

export type PersistenceIndicatorState = 'settled' | 'pending' | 'rejected';

export interface PersistenceIndicatorProps {
  readonly state: PersistenceIndicatorState;
}

const SAVED_CUE_MS = 2_000;

const dotVariants = cva('size-2.5 shrink-0 rounded-full transition-colors duration-200', {
  variants: {
    tone: {
      neutral: 'bg-muted-foreground',
      success: 'bg-success',
    },
  },
});

function Dot({ tone }: { readonly tone: NonNullable<VariantProps<typeof dotVariants>['tone']> }) {
  return <span aria-hidden="true" className={dotVariants({ tone })} />;
}

/** Everything the indicator says about one moment in the persistence lifecycle. */
interface Cue {
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant: NonNullable<ButtonProps['variant']>;
}

const CUES = {
  // "Persisted" deliberately avoids the word "save": ADR 0030 proves persistence
  // is automatic by asserting no /save/i-named button remains once work settles,
  // and this is the resting cue rather than the transient one below it.
  persisted: { label: 'Persisted', icon: <Dot tone="neutral" />, variant: 'ghost' },
  saving: { label: 'Saving changes', icon: <Spinner />, variant: 'ghost' },
  saved: { label: 'Changes saved', icon: <Dot tone="success" />, variant: 'ghost' },
  rejected: { label: 'Persistence rejected', icon: <CircleAlertIcon />, variant: 'destructive' },
} as const satisfies Record<string, Cue>;

type CueName = keyof typeof CUES;

/** The cue each state rests on once its transient moment, if it has one, passes. */
const RESTING_CUE = {
  settled: 'persisted',
  pending: 'saving',
  rejected: 'rejected',
} as const satisfies Record<PersistenceIndicatorState, CueName>;

/**
 * Quiet persistence feedback for chrome that is otherwise unrelated to saving.
 * A fixed-size icon button carries every cue, so the toolbar around it never
 * reflows as the lifecycle moves.
 */
export function PersistenceIndicator({ state }: PersistenceIndicatorProps) {
  const name: CueName = useJustSaved(state) ? 'saved' : RESTING_CUE[state];
  const cue = CUES[name];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={cue.label} data-state={name} size="icon" variant={cue.variant} />
        }
      >
        {cue.icon}
      </TooltipTrigger>
      <TooltipContent>{cue.label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * True for `SAVED_CUE_MS` after a commit settles and false at every other
 * moment. The transition is read during render — React's documented alternative
 * to an effect for state derived from a prop — so the cue is right on the render
 * that settles rather than one paint later; the effect only ends it. Any other
 * transition clears the flag, which is what keeps it meaningful on its own
 * instead of needing to be re-checked against `state` at the point of use.
 */
function useJustSaved(state: PersistenceIndicatorState): boolean {
  const [observed, setObserved] = useState(state);
  const [justSaved, setJustSaved] = useState(false);

  if (state !== observed) {
    setObserved(state);
    setJustSaved(observed === 'pending' && state === 'settled');
  }

  useEffect(() => {
    if (!justSaved) return;

    const timer = window.setTimeout(() => setJustSaved(false), SAVED_CUE_MS);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  return justSaved;
}
