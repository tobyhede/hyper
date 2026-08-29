import { Panel, useReactFlow, useStore, useViewport, type PanelProps } from '@xyflow/react';
import { Button, FitViewIcon, Slider, ZoomInIcon, ZoomOutIcon, cn } from '@project/ui';

const CAMERA_MOVE_DURATION = 300;

export type ZoomSliderProps = Omit<PanelProps, 'children'>;

/** Registry-derived zoom controls over the camera owned by React Flow. */
export function ZoomSlider({ className, position = 'bottom-left', ...props }: ZoomSliderProps) {
  const { zoom } = useViewport();
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);

  return (
    <Panel
      className={cn(
        'nokey flex items-center gap-1 rounded-md border border-border bg-background p-1 text-foreground shadow-sm',
        className,
      )}
      position={position}
      {...props}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => {
          void zoomOut({ duration: CAMERA_MOVE_DURATION });
        }}
      >
        <ZoomOutIcon data-icon="inline-start" />
      </Button>
      <Slider
        className="w-32"
        getAriaLabel={() => 'Zoom'}
        value={zoom}
        min={minZoom}
        max={maxZoom}
        step={0.01}
        onValueChange={(nextZoom) => {
          void zoomTo(nextZoom);
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => {
          void zoomIn({ duration: CAMERA_MOVE_DURATION });
        }}
      >
        <ZoomInIcon data-icon="inline-start" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Fit view"
        title="Fit view"
        onClick={() => {
          void fitView({ duration: CAMERA_MOVE_DURATION });
        }}
      >
        <FitViewIcon data-icon="inline-start" />
      </Button>
    </Panel>
  );
}
