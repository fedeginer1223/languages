export const DEFAULT_SESSION_SIZE = 30;
export const MAX_SESSION_SIZE = 200;

export interface ComposeInput<R, N> {
  /** Due reviews, already sorted by priority (first = most urgent). */
  reviews: R[];
  /** New-item candidates, already in desired introduction order. */
  newItems: N[];
  sessionSize: number;
  /** Fraction of the session reserved for new items. Default 0.5. */
  newRatio?: number;
}

export interface ComposeResult<R, N> {
  reviews: R[];
  newItems: N[];
  remainingReviews: number;
  remainingNew: number;
}

export function clampSessionSize(n: number | undefined | null): number {
  if (n === undefined || n === null || !Number.isFinite(n)) return DEFAULT_SESSION_SIZE;
  return Math.min(MAX_SESSION_SIZE, Math.max(1, Math.round(n)));
}

/** Parse a `sessionSize` query value; undefined when absent/invalid. */
export function parseSessionSize(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? clampSessionSize(n) : undefined;
}

export function composeSession<R, N>(input: ComposeInput<R, N>): ComposeResult<R, N> {
  const size = clampSessionSize(input.sessionSize);
  const ratio = input.newRatio ?? 0.5;
  const reviewTarget = size - Math.round(size * ratio);

  let reviewsTaken = Math.min(input.reviews.length, reviewTarget);
  const newTake = Math.min(input.newItems.length, size - reviewsTaken);
  const space = size - reviewsTaken - newTake;
  if (space > 0 && input.reviews.length > reviewsTaken) {
    reviewsTaken = Math.min(input.reviews.length, reviewsTaken + space);
  }

  return {
    reviews: input.reviews.slice(0, reviewsTaken),
    newItems: input.newItems.slice(0, newTake),
    remainingReviews: input.reviews.length - reviewsTaken,
    remainingNew: input.newItems.length - newTake,
  };
}
