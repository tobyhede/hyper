import { RESOURCE_SHAPES, type ResourceShape } from '@project/core';
import { ChoiceMenu, ChoiceMenuTrigger } from './ChoiceMenu';
import { ToolbarButton } from './components/toolbar';
import { ResourceShapeIcon } from './icons';

/** How each Shape is named wherever it is offered. */
const RESOURCE_SHAPE_NAMES = {
  rectangle: 'Rectangle',
  pill: 'Pill',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
} as const satisfies Record<ResourceShape, string>;

/** The name a Shape is offered by: `Diamond`. */
export const resourceShapeName = (resourceShape: ResourceShape): string =>
  RESOURCE_SHAPE_NAMES[resourceShape];

const RESOURCE_SHAPE_CHOICES = RESOURCE_SHAPES.map((resourceShape) => ({
  id: resourceShape,
  title: resourceShapeName(resourceShape),
  icon: <ResourceShapeIcon shape={resourceShape} />,
}));

export interface ResourceShapeMenuProps {
  /** The Shape the Resource is drawn in now. */
  readonly shape: ResourceShape;
  /** Draw the Resource in another Shape. */
  readonly onChoose: (resourceShape: ResourceShape) => void;
}

/**
 * An Ur Resource's Shape, chosen from its rail (ADR 0121).
 *
 * The shared `ChoiceMenu`: the radio list, the mark on the current Shape, the
 * keyboard and the dismissal are the primitive's. The trigger's face is the
 * Shape the Resource is drawn in, so the list is uncaptioned — the face already
 * says what the set is — and each row is a Shape's glyph and its name.
 *
 * The trigger is a `ToolbarButton`, so it takes its place in the rail's one
 * roving tab stop (ADR 0073). `nokey nodrag nopan` and the click and
 * pointer-down stops are what every other rail control carries: a press opens
 * the list rather than panning or dragging the canvas, and the portalled popup
 * carries `nokey` itself because it is outside the Resource.
 */
export function ResourceShapeMenu({ shape: resourceShape, onChoose }: ResourceShapeMenuProps) {
  return (
    <ChoiceMenu<ResourceShape>
      label="Shape"
      captioned={false}
      choices={RESOURCE_SHAPE_CHOICES}
      chosen={resourceShape}
      onChoose={onChoose}
      align="start"
      className="nokey w-40"
      trigger={
        <ChoiceMenuTrigger
          render={<ToolbarButton size="compact" />}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="nokey nodrag nopan gap-1 px-1.5"
          aria-label={`Shape: ${resourceShapeName(resourceShape)}`}
          icon={<ResourceShapeIcon shape={resourceShape} />}
        />
      }
    />
  );
}
