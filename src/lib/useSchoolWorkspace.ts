import { useCallback, useEffect, useState } from "react";
import { rpc } from "./repository";
import { onWorkspaceChange } from "./workspaceEvents";
import {
  emptySchoolWorkspace,
  normalizeSchoolWorkspace,
  type SchoolWorkspace,
} from "./school";
export function useSchoolWorkspace(
  schoolId: string | undefined,
  day: string,
  _context?: unknown,
) {
  const key = JSON.stringify([schoolId, day]),
    [revision, setRevision] = useState(0),
    [result, setResult] = useState<{
      key: string;
      data: SchoolWorkspace;
      error?: string;
    }>();
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onWorkspaceChange((change) => {
      if (change.schoolId && schoolId && change.schoolId !== schoolId) return;
      if (
        ![
          "*",
          "academic_years",
          "academic_terms",
          "assessments",
          "assessment_scores",
          "report_cards",
          "care_records",
          "students",
          "enrollment_history",
          "classrooms",
          "gradebook_rules",
          "gradebook_settings",
        ].includes(change.table)
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(refresh, 200);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [schoolId, refresh]);
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
        if (active) setResult({ key, data });
      })
      .catch((e) => {
        if (active)
          setResult((old) => ({
            key,
            data: old?.key === key ? old.data : emptySchoolWorkspace(),
            error: e.message,
          }));
      });
    return () => {
      active = false;
    };
  }, [key, schoolId, day, revision]);
  return {
    data: result?.key === key ? result.data : emptySchoolWorkspace(),
    error: (result?.key === key ? result.error : "") || "",
    loading: !!schoolId && result?.key !== key,
    refresh,
  };
}
