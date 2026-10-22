import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "./repository";
import { attendanceMonth, type AttendanceWorkspace } from "./studentAttendance";
export function useStudentAttendance(
  room: string,
  day: string,
  studentId?: string,
  context?: unknown,
) {
  const [revision, setRevision] = useState(0);
  const scope = useMemo(
    () => ({ room, day, studentId, revision, context }),
    [room, day, studentId, revision, context],
  );
  const [result, setResult] = useState<{
    scope: typeof scope;
    data?: AttendanceWorkspace;
    error?: string;
  }>();
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
        if (active) setResult({ scope, data });
      })
      .catch((e) => {
        if (active) setResult({ scope, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [scope, room, day, studentId]);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  return {
    data: result?.scope === scope ? result.data : undefined,
    error: result?.scope === scope ? result.error : "",
    loading: !!room && result?.scope !== scope,
    refresh,
  };
}
