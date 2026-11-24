import { useEffect, useState } from 'react';

const MIN = 10;
const MAX = 60;
const DEFAULT = 30;

function readStored(languageId: string | undefined): number {
  try {
    const raw = localStorage.getItem(`sessionSize:${languageId}`);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) return Math.min(MAX, Math.max(MIN, n));
  } catch { /* storage unavailable */ }
  return DEFAULT;
}

/** Session size persisted per language in localStorage (`sessionSize:<languageId>`). */
export function useSessionSize(languageId: string | undefined): [number, (n: number) => void] {
  const [size, setSize] = useState<number>(() => readStored(languageId));
  useEffect(() => { setSize(readStored(languageId)); }, [languageId]);
  const update = (n: number) => {
    setSize(n);
    try { localStorage.setItem(`sessionSize:${languageId}`, String(n)); } catch { /* ignore */ }
  };
  return [size, update];
}

interface Props {
  value: number;
  onChange: (n: number) => void;
  summary?: { reviewsInSession?: number; newInSession?: number; remainingReviews?: number };
}

export function SessionSizeControl({ value, onChange, summary }: Props) {
  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Tamaño de sesión</p>
        <span className="text-sm font-bold">{value}</span>
      </div>
      <input
        type="range" min={MIN} max={MAX} step={5} value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full"
      />
      {summary && summary.reviewsInSession !== undefined && (
        <>
          <p className="text-sm text-center">{summary.reviewsInSession} repasos + {summary.newInSession ?? 0} nuevas</p>
          {(summary.remainingReviews ?? 0) > 0 && (
            <p className="text-xs text-center text-muted-foreground">Quedan {summary.remainingReviews} repasos para otra sesión</p>
          )}
        </>
      )}
    </div>
  );
}
