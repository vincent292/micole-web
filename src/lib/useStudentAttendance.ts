import { useCallback, useEffect, useState } from "react";
import { rpc } from "./repository";
import { onWorkspaceChange } from "./workspaceEvents";
import { attendanceMonth, type AttendanceWorkspace } from "./studentAttendance";
export function useStudentAttendance(
  room: string,
  day: string,
  studentId?: string,
  schoolId?: string,
) {
  const key = JSON.stringify([room, day, studentId, schoolId]);
  const [revision, setRevision] = useState(0),
    [result, setResult] = useState<{
      key: string;
      data?: AttendanceWorkspace;
      error?: string;
      revision: number;
    }>();
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onWorkspaceChange((change) => {
      if (change.schoolId && schoolId && change.schoolId !== schoolId) return;
      if (
        ![
          "*",
          "student_attendance_sessions",
          "students",
          "enrollment_history",
          "classrooms",
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
    if (!room) return;
    void rpc<AttendanceWorkspace>("student_attendance_workspace", {
      p_classroom_id: room,
      p_day: day,
      p_month: attendanceMonth(day),
      p_student_id: studentId || null,
    })
      .then((data) => {
        if (active) setResult({ key, data, revision });
      })
      .catch((e) => {
        if (active)
          setResult((old) => ({
            key,
            data: old?.key === key ? old.data : undefined,
            error: e.message,
            revision,
          }));
      });
    return () => {
      active = false;
    };
  }, [key, room, day, studentId, revision]);
  const data = result?.key === key ? result.data : undefined,
    error = result?.key === key ? result.error : "";
  return {
    data,
    error,
    loading: !!room && !data && !error,
    refreshing: !!data && result?.revision !== revision,
    refresh,
  };
}
