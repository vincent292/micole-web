const listeners = new Set<(id: string) => void>();
let pending: string | undefined;
export function openAnnouncement(id: string) {
  if (!id) return;
  if (!listeners.size) pending = id;
  else for (const listener of listeners) listener(id);
}
export function subscribeAnnouncements(listener: (id: string) => void) {
  listeners.add(listener);
  if (pending) {
    const value = pending;
    pending = undefined;
    queueMicrotask(() => {
      if (listeners.has(listener)) listener(value);
    });
  }
  return () => {
    listeners.delete(listener);
  };
}
export function consumeAnnouncement() {
  pending = undefined;
}
