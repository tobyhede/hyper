import { CardRenderer, PresentationControls } from '@project/ui';

export interface PresentationLayerProps {
  title: string;
  markdown: string;
  stepIndex: number;
  stepCount: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}

/** Slide overlay shown while presenting: the active card plus step controls. */
export function PresentationLayer({
  title,
  markdown,
  stepIndex,
  stepCount,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onExit,
}: PresentationLayerProps) {
  return (
    <div className="presentation" data-testid="presentation-layer">
      <div className="presentation__slide">
        <CardRenderer title={title} markdown={markdown} variant="slide" />
      </div>
      <PresentationControls
        stepIndex={stepIndex}
        stepCount={stepCount}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={onPrev}
        onNext={onNext}
        onExit={onExit}
      />
    </div>
  );
}
