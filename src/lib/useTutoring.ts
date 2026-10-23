import { useCallback, useEffect, useState } from "react";
import { rpc } from "./repository";
import { useWorkspaceRevision } from "./useWorkspaceRevision";
import type { Coordination, TutorOverview } from "./tutoring";
function useTutoringData<T>(
  method: string,
  params: Record<string, unknown>,
  enabled: boolean,
  signalSchoolId?: string,
) {
  const key = JSON.stringify([method, params]),
    [version, setVersion] = useState(0);
  const live = useWorkspaceRevision(
    method === "classroom_tutor_overview"
      ? [
          "classrooms",
          "subject_teachers",
          "assignment_submissions",
          "assignments",
          "assessment_scores",
          "assessments",
          "academic_terms",
          "grades",
          "care_records",
          "students",
        ]
      : [
          "classroom_interviews",
          "interview_responses",
          "classroom_staff_messages",
          "classrooms",
          "student_guardians",
        ],
    signalSchoolId || String(params.p_school_id || "") || undefined,
    enabled,
  );
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    if (!enabled) return;
    const [, args] = JSON.parse(key);
    void rpc<T>(method, args)
      .then((data) => {
        const value = data as Record<string,unknown>;
        const fields = method === "classroom_tutor_overview" ? ["students","subjects","care","recommendations","feedback","pending"] : ["interviews","messages"];
        if (!value || fields.some(field=>!Array.isArray(value[field]))) throw new Error("No pudimos cargar el seguimiento. Vuelve a intentarlo.");
        if (active) setResult({ key, data });
      })
      .catch((e) => {
        if (active)
          setResult((old) => ({
            key,
            data:
              !/No tienes acceso|Solo Dirección|No tienes permiso/.test(
                e.message,
              ) && old?.key === key
                ? old.data
                : undefined,
            error: e.message,
          }));
      });
    return () => {
      active = false;
    };
  }, [key, method, enabled, version, live]);
  return {
    data: enabled && result?.key === key ? result.data : undefined,
    error: enabled && result?.key === key ? result.error || "" : "",
    loading: enabled && result?.key !== key,
    refresh,
  };
}
export function useCoordination(
  schoolId?: string,
  roomId?: string,
  studentId?: string,
  enabled = true,
) {
  return useTutoringData<Coordination>(
    "classroom_coordination_workspace",
    {
      p_school_id: schoolId,
      p_classroom_id: roomId || null,
      p_student_id: studentId || null,
    },
    !!schoolId && enabled,
    schoolId,
  );
}
export function useTutorOverview(
  schoolId: string | undefined,
  roomId: string,
  studentId?: string,
) {
  return useTutoringData<TutorOverview>(
    "classroom_tutor_overview",
    { p_classroom_id: roomId, p_student_id: studentId || null },
    !!schoolId && !!roomId,
    schoolId,
  );
}
