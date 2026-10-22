import { useCallback, useRef } from "react";
import { createRefreshQueue } from "./refreshQueue";
export function useSerializedRefresh<T>(load: (items?: T[]) => Promise<void>) {
  const current = useRef<{load: typeof load; refresh: ReturnType<typeof createRefreshQueue<T>>} | null>(null);
  return useCallback((items?: T[]) => {
    if (!current.current || current.current.load !== load)
      current.current = {load, refresh: createRefreshQueue(load)};
    return current.current.refresh(items);
  }, [load]);
}
