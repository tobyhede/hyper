import { CircleAlertIcon, SaveCheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Spinner } from './components/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/tooltip';

export type PersistenceIndicatorState = 'settled' | 'pending' | 'rejected';

export interface PersistenceIndicatorProps {
  readonly state: PersistenceIndicatorState;
}

const SETTLED_VISIBLE_MS = 2_000;
const SETTLED_FADE_MS = 200;

type SettledPhase = 'hidden' | 'visible' | 'exiting';

/**
 * Quiet persistence feedback for chrome that is otherwise unrelated to saving.
 * A settled write is deliberately absent: saving normally is not a user task.
 */
export function PersistenceIndicator({ state }: PersistenceIndicatorProps) {
  const [observedState, setObservedState] = useState(state);
  const [settledPhase, setSettledPhase] = useState<SettledPhase>('hidden');

  if (state !== observedState) {
    setObservedState(state);
    setSettledPhase(state === 'settled' && observedState === 'pending' ? 'visible' : 'hidden');
  }

  const settledCueActive = settledPhase !== 'hidden';

  useEffect(() => {
    if (state !== 'settled' || !settledCueActive) return;

    const fade = window.setTimeout(() => setSettledPhase('exiting'), SETTLED_VISIBLE_MS);
    const hide = window.setTimeout(
      () => setSettledPhase('hidden'),
      SETTLED_VISIBLE_MS + SETTLED_FADE_MS,
    );

    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(hide);
    };
  }, [settledCueActive, state]);

  if (state === 'settled') {
    if (settledPhase === 'hidden') return null;

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Changes saved"
              data-state={settledPhase}
              size="icon"
              variant="ghost"
            />
          }
        >
          <SaveCheckIcon data-icon="inline-start" />
        </TooltipTrigger>
        <TooltipContent>Changes saved</TooltipContent>
      </Tooltip>
    );
  }

  const pending = state === 'pending';
  const label = pending ? 'Saving changes' : 'Persistence rejected';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={label} size="icon" variant={pending ? 'ghost' : 'destructive'} />
        }
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <CircleAlertIcon data-icon="inline-start" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
