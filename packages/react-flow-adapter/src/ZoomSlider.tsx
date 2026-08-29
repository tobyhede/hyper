import { Panel, useReactFlow, useStore, useViewport, type PanelProps } from '@xyflow/react';
import { Button, FitViewIcon, Slider, ZoomInIcon, ZoomOutIcon, cn } from '@project/ui';

const CAMERA_MOVE_DURATION = 300;

/**
 * How many positions the track holds, end to end.
 *
 * The slider is driven in *track* units rather than zoom units, and this is why:
 * the registry component is linear and assumes React Flow's default 0.5–2, while
 * this canvas spans 0.2–16 (`SpaceCanvas`'s `minZoom` and `camera.ts`'s
 * `MAX_ZOOM`) — eighty-fold. Linear over that range puts the whole useful
 * 0.2–1.0 stretch in the first five per cent of the track, so a pixel of drag
 * moves zoom by more than a tenth and the opening position sits three pixels
 * from the left end. Mapping the track logarithmically makes one step a constant
 * *ratio* instead: a hundred of them cross the range, each about 2.9%, and the
 * thumb sits where the eye expects at every zoom.
 */
const TRACK_STEPS = 100;

/** Where a zoom sits on the track, as a fraction of it. */
const trackPositionOf = (zoom: number, minZoom: number, maxZoom: number): number => {
  const span = Math.log(maxZoom / minZoom);
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.min(1, Math.max(0, Math.log(zoom / minZoom) / span));
};

/** The zoom a track position names. */
const zoomAtTrackPosition = (position: number, minZoom: number, maxZoom: number): number =>
  minZoom * (maxZoom / minZoom) ** position;

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
        // The track's own units, so `aria-valuenow` would otherwise announce a
        // fraction of a track nobody can see. `getAriaValueText` answers the
        // magnification instead, which is the thing being changed.
        getAriaValueText={(_formatted, value) =>
          `${Math.round(zoomAtTrackPosition(value, minZoom, maxZoom) * 100)}%`
        }
        value={trackPositionOf(zoom, minZoom, maxZoom)}
        min={0}
        max={1}
        step={1 / TRACK_STEPS}
        onValueChange={(nextPosition) => {
          void zoomTo(zoomAtTrackPosition(nextPosition, minZoom, maxZoom));
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
