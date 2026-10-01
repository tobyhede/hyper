import { useId } from 'react';
import { GraphLegendMark } from './GraphLegendMark';
import type { GraphAppearance } from './graph-color';
import { MapIcon } from './icons';
import { cn } from './lib/utils';

/** One Graph under its Map: its title, and how its Edges are drawn. */
export interface MapGraphListGraph {
  readonly key: string;
  readonly title: string;
  readonly appearance: GraphAppearance;
}

/** One Map and the Graphs it owns that the list names, which may be none. */
export interface MapGraphListMap {
  readonly key: string;
  readonly title: string;
  readonly graphs: readonly MapGraphListGraph[];
}

export interface MapGraphListProps {
  /** What the list is, which names it to assistive technology. */
  readonly label: string;
  readonly maps: readonly MapGraphListMap[];
  readonly className?: string | undefined;
}

/**
 * Maps with the Graphs each owns beneath it, so ownership reads from the
 * shape: a Map row carries the Map glyph, and each Graph row carries the
 * `GraphLegendMark` every Graph list draws, in the Graph's colour and head
 * shape. Each Map's Graphs are a list of their own, named for the Map.
 */
export function MapGraphList({ label, maps, className }: MapGraphListProps) {
  return (
    <ul
      aria-label={label}
      data-slot="map-graph-list"
      className={cn('grid gap-1.5 text-sm', className)}
    >
      {maps.map((m) => (
        <MapEntry key={m.key} entry={m} />
      ))}
    </ul>
  );
}

function MapEntry({ entry }: { readonly entry: MapGraphListMap }) {
  const titleId = useId();
  return (
    <li data-slot="map-graph-list-map" className="grid gap-1">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-flex text-muted-foreground">
          <MapIcon size={14} />
        </span>
        <span id={titleId} className="min-w-0 truncate font-medium">
          {entry.title}
        </span>
      </div>
      {entry.graphs.length === 0 ? null : (
        <ul
          aria-labelledby={titleId}
          data-slot="map-graph-list-graphs"
          className="grid gap-1 pl-[22px]"
        >
          {entry.graphs.map((graph) => (
            <li
              key={graph.key}
              data-slot="map-graph-list-graph"
              className="flex min-w-0 items-center gap-2"
            >
              <GraphLegendMark {...graph.appearance} />
              <span className="min-w-0 truncate">{graph.title}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
