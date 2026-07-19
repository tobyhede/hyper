import { Button } from './Button';

export interface PresentationControlsProps {
  stepIndex: number;
  stepCount: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}

export function PresentationControls({
  stepIndex,
  stepCount,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onExit,
}: PresentationControlsProps) {
  return (
    <div className="controls" data-testid="presentation-controls">
      <Button variant="secondary" onClick={onPrev} disabled={!canPrev} aria-label="Previous step">
        ‹ Prev
      </Button>
      <span className="controls__counter" data-testid="step-counter">
        {stepCount === 0 ? '0 / 0' : `${stepIndex + 1} / ${stepCount}`}
      </span>
      <Button variant="secondary" onClick={onNext} disabled={!canNext} aria-label="Next step">
        Next ›
      </Button>
      <Button variant="destructive" className="ml-2" onClick={onExit}>
        Exit
      </Button>
    </div>
  );
}
