'use client';

import { useEffect, useState } from 'react';

/** Delays propagating a rapidly changing value — used for search inputs. */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
