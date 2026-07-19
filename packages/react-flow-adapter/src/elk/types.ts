/** A single handle/port on an ELK-laid-out node. */
export type ElkHandle = { id: string };

/**
 * Minimal node-data contract the ELK layout needs: a list of source (outbound)
 * and target (inbound) handles whose ids are used as ELK port ids.
 */
export type ElkPortData = {
  sourceHandles: ElkHandle[];
  targetHandles: ElkHandle[];
};

/** A node's ELK-computed geometry: its position and each port's local offset. */
export interface ElkNodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Port id → offset relative to the node's top-left corner. */
  ports: Record<string, { x: number; y: number }>;
}

export type ElkLayoutResult = Record<string, ElkNodeLayout>;
