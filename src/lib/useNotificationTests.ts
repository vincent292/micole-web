import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "./repository";
import type { NotificationTestWorkspace } from "./notificationTests";
export function useNotificationTests(context: unknown) {
  const [revision, setRevision] = useState(0);
  const scope = useMemo(() => ({ revision, context }), [revision, context]);
  const [result, setResult] = useState<{
    scope: typeof scope;
    data?: NotificationTestWorkspace;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    void rpc<NotificationTestWorkspace>("notification_test_workspace", {})
      .then((data) => {
        if (active) setResult({ scope, data });
      })
      .catch((e) => {
        if (active) setResult({ scope, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [scope]);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  return {
    data: result?.scope === scope ? result.data : undefined,
    error: result?.scope === scope ? result.error : "",
    loading: result?.scope !== scope,
    refresh,
  };
}
