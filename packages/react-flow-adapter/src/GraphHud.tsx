import type { Graph } from '@project/core';
import { FALLBACK_GRAPH_COLOR, GraphLegend, graphColor } from '@project/ui';
import { MiniMap, Panel } from '@xyflow/react';

export interface GraphHudProps {
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: string | null;
  activeGraphCardIds: ReadonlySet<string>;
}

const inactiveNodeColor = 'var(--border)';

/** A graph key and interactive minimap grouped into one canvas HUD. */
export function GraphHud({
  graphs,
  colorByGraphId,
  activeGraphId,
  activeGraphCardIds,
}: GraphHudProps) {
  const activeGraph = graphs.find((graph) => graph.id === activeGraphId);
  const activeGraphColor =
    activeGraph === undefined ? FALLBACK_GRAPH_COLOR : graphColor(activeGraph, colorByGraphId);
  const nodeStrokeColor = ({ id }: { id: string }) =>
    activeGraphId !== null && activeGraphCardIds.has(id) ? activeGraphColor : inactiveNodeColor;

  return (
    <Panel position="bottom-right">
      <div
        className="graph-hud"
        style={{
          width: 214,
          overflow: 'hidden',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <GraphLegend
          graphs={graphs}
          colorByGraphId={colorByGraphId}
          activeGraphId={activeGraphId}
        />
        <div aria-hidden="true" style={{ height: 1, background: 'var(--border)' }} />
        <MiniMap
          ariaLabel="Graph overview"
          bgColor="var(--background)"
          nodeColor="var(--secondary)"
          nodeStrokeColor={nodeStrokeColor}
          pannable
          zoomable
          style={{ display: 'block', width: '100%', height: 86, margin: 0, border: 'none' }}
        />
      </div>
    </Panel>
  );
}
