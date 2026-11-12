import { useAcademicPlanning } from "./useAcademicPlanning";
import { attendanceWeekStart, type AttendanceWeek } from "./attendanceWeek";
export function useAttendanceWeek(room: string, day: string, school?: string) {
  const week = useAcademicPlanning<AttendanceWeek>(
    "student_attendance_week",
    {
      p_classroom_id: room,
      p_day: attendanceWeekStart(day),
      p_student_id: null,
    },
    room ? school : undefined,
    ["student_attendance_sessions","student_attendance_corrections","enrollment_history","students","classrooms","school_calendar_days","school_calendar_announcements","family_requests"],
  );
  return {
    ...week,
    data: week.data?.days?.length === 7 ? week.data : undefined,
  };
}
