/** Rejected by: oxlint `anti-slop/no-chained-type-assertions`. */
export const launder = (value: string): number => value as unknown as number;
