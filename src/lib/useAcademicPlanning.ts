import { useCallback, useEffect, useState } from "react";
import { rpc } from "./repository";
import { useWorkspaceRevision } from "./useWorkspaceRevision";
export function useAcademicPlanning<T>(
  method: string,
  args: Record<string, unknown>,
  school?: string,
) {
  const key = JSON.stringify([method, args]),
    [version, setVersion] = useState(0),
    [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  const live = useWorkspaceRevision(
    [
      "bolivia_school_profiles",
      "bolivia_pedagogical_documents",
      "timetable_versions",
      "timetable_delegates",
      "academic_years",
      "classrooms",
      "class_subjects",
      "subject_teachers",
      "teachers",
      "academic_class_policies",
      "assessment_scores",
      "assessments",
      "academic_terms",
      "report_cards",
      "promotion_batches",
      "students",
      "school_memberships",
      "school_charges",
      "school_payments",
      "platform_credit_accounts",
    ],
    school,
  );
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    if (!school) return;
    const [, params] = JSON.parse(key);
    void rpc<T>(method, params)
      .then((data) => {
        if (active) setResult({ key, data });
      })
      .catch((e) => {
        if (active) setResult({ key, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [key, method, school, version, live]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error || "" : "",
    loading: !!school && result?.key !== key,
    refresh,
  };
}
