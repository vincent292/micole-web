/** Coalesce bursts and serialize reads so a newer partial read never discards another table. */
export function createRefreshQueue<T>(load: (items?: T[]) => Promise<void>) {
  let running = false, pending = false, full = false;
  const items = new Set<T>();
  let waiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending) {
        const batch = full ? undefined : [...items], callers = waiters;
        pending = false; full = false; items.clear(); waiters = [];
        try { await load(batch); for (const caller of callers) caller.resolve(); }
        catch (error) { for (const caller of callers) caller.reject(error); }
      }
    } finally { running = false; }
  }
  return (collections?: T[]): Promise<void> => {
    if (collections?.length === 0) return Promise.resolve();
    pending = true;
    if (!collections) full = true;
    else for (const item of collections) items.add(item);
    const result = new Promise<void>((resolve, reject) => waiters.push({resolve, reject}));
    void Promise.resolve().then(drain);
    return result;
  };
}
