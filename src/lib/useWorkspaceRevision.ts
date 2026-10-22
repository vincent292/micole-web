import { useEffect, useState } from "react";
import { onWorkspaceChange } from "./workspaceEvents";
/** Only the open module refreshes; a burst from one transaction becomes one read. */
export function useWorkspaceRevision(tables: readonly string[], schoolId?: string | null, enabled = true) {
  const [revision, setRevision] = useState(0);
  const key = [...tables].sort().join(",");
  useEffect(() => {
    if (!enabled) return;
    const selected = new Set(key.split(","));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onWorkspaceChange(change => {
      if (change.schoolId && schoolId && change.schoolId !== schoolId) return;
      if (change.table !== "*" && !selected.has(change.table)) return;
      clearTimeout(timer);
      timer = setTimeout(() => setRevision(value => value + 1), 300);
    });
    return () => { off(); clearTimeout(timer); };
  }, [key, schoolId, enabled]);
  return revision;
}
