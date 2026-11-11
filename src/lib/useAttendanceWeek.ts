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
  );
  return {
    ...week,
    data: week.data?.days?.length === 7 ? week.data : undefined,
  };
}
