import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "./repository";
import {
  emptySchoolWorkspace,
  normalizeSchoolWorkspace,
  type SchoolWorkspace,
} from "./school";
export function useSchoolWorkspace(
  schoolId: string | undefined,
  day: string,
  context: unknown,
) {
  const [revision, setRevision] = useState(0);
  const scope = useMemo(
    () => ({ schoolId, day, context, revision }),
    [schoolId, day, context, revision],
  );
  const [result, setResult] = useState<{
    scope: typeof scope;
    data: SchoolWorkspace;
    error: string;
  } | null>(null);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    if (!schoolId) return;
    void rpc<Record<string, unknown>>("school_workspace", {
      p_school_id: schoolId,
      p_from: day,
      p_to: day,
    })
      .then(normalizeSchoolWorkspace)
      .then((data) => {
        if (active) setResult({ scope, data, error: "" });
      })
      .catch((e) => {
        if (active)
          setResult({ scope, data: emptySchoolWorkspace(), error: e.message });
      });
    return () => {
      active = false;
    };
  }, [schoolId, day, scope]);
  return {
    data: result?.scope === scope ? result.data : emptySchoolWorkspace(),
    error: result?.scope === scope ? result.error : "",
    loading: !!schoolId && result?.scope !== scope,
    refresh,
  };
}
