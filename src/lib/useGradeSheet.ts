import { useCallback, useEffect, useState } from "react";
import { rpc } from "./repository";
import { onWorkspaceChange } from "./workspaceEvents";
import type { GradeSheetData } from "./gradeSheet";
export function useGradeSheet(
  room: string,
  subject: string,
  term: string,
  student?: string,
  schoolId?: string,
) {
  const key = JSON.stringify([room, subject, term, student, schoolId]),
    [revision, setRevision] = useState(0),
    [result, setResult] = useState<{
      key: string;
      data?: GradeSheetData;
      error?: string;
    }>();
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onWorkspaceChange((c) => {
      if (c.schoolId && schoolId && c.schoolId !== schoolId) return;
      if (
        ![
          "*",
          "school_charges", "school_payments", "platform_charges", "platform_credit_accounts",
          "school_memberships", "student_guardians", "teacher_classrooms", "subject_teachers",
          "academic_class_policies", "academic_reinforcements",
          "assessments",
          "assessment_scores",
          "academic_terms",
          "gradebook_rules",
          "gradebook_settings",
          "students",
          "enrollment_history",
          "school_charges",
          "school_payments",
          "school_receipts",
        ].includes(c.table)
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
    if (!room) return;
    void rpc<GradeSheetData>("gradebook_workspace", {
      p_classroom_id: room,
      p_subject_id: subject || null,
      p_term_id: term || null,
      p_student_id: student || null,
    })
      .then((data) => {
        if (
          !data ||
          !Array.isArray(data.terms) ||
          !Array.isArray(data.assessments) ||
          !Array.isArray(data.roster) ||
          !Array.isArray(data.scores) ||
          !data.settings
        )
          throw new Error(
            "La respuesta de la planilla está incompleta. Vuelve a cargarla.",
          );
        if (active) setResult({ key, data });
      })
      .catch((e) => {
        if (active)
          setResult((old) => ({
            key,
            data:
              old?.key === key &&
              !/No tienes acceso|Solo su familia|crédito inicial/i.test(
                e.message,
              )
                ? old.data
                : undefined,
            error: e.message,
          }));
      });
    return () => {
      active = false;
    };
  }, [key, room, subject, term, student, revision]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: (result?.key === key ? result.error : "") || "",
    loading: !!room && result?.key !== key,
    refresh,
    key,
  };
}
