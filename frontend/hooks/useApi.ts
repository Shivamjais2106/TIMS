'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '@/lib/api';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the request, keeping the previous data visible while it loads. */
  refetch: () => void;
}

/**
 * Minimal data-fetching hook.
 *
 * Deliberately not TanStack Query or Redux: the dashboard has a handful of
 * read-mostly endpoints, and this keeps the dependency surface small while
 * still handling the three states every panel needs (loading / error / data)
 * and cancelling stale responses.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Keeps the latest fetcher without making it a dependency of the effect,
  // which would re-run on every render for inline arrow functions.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(describeError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, refetch };
}
