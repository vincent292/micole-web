export type WorkspaceChange = { table: string; schoolId?: string };
const listeners = new Set<(change: WorkspaceChange) => void>();
export function publishWorkspaceChange(change: WorkspaceChange) {
  for (const listener of listeners) listener(change);
}
export function onWorkspaceChange(listener: (change: WorkspaceChange) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
