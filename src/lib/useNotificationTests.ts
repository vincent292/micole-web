import { useCallback, useEffect, useState } from "react";
import { rpc } from "./repository";
import { useWorkspaceRevision } from "./useWorkspaceRevision";
import type { NotificationTestWorkspace } from "./notificationTests";
export function useNotificationTests(_context?: unknown) {
  const [revision, setRevision] = useState(0);
  const liveRevision = useWorkspaceRevision(["notifications", "notification_test_runs"]);
  const [result, setResult] = useState<{data?: NotificationTestWorkspace; error?: string}>();
  useEffect(() => {
    let active = true;
    void rpc<NotificationTestWorkspace>("notification_test_workspace", {})
      .then(data => { if (active) setResult({data}); })
      .catch(e => { if (active) setResult(old => ({...old, error: e.message})); });
    return () => { active = false; };
  }, [revision, liveRevision]);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  return {data:result?.data, error:result?.error || "", loading:!result, refresh};
}
