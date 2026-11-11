import type { AttendanceRecord, AttendanceStatus } from "./studentAttendance";

export type AttendanceSort = "lastName" | "firstName";
export interface AttendancePupil {
  student_id: string;
  student_name: string;
  first_name?: string;
  last_name?: string;
}
export interface SchoolDay {
  date: string;
  isSchoolDay: boolean;
  label: string;
  kind?: "holiday" | "suspension" | "school_day" | "schedule";
  sourceUrl?: string;
}
export interface AttendanceWeek {
  start: string;
  roster: AttendancePupil[];
  days: (SchoolDay & {
    sessionStatus?: "draft" | "confirmed";
    studentIds: string[];
  })[];
  records: AttendanceRecord[];
}
export const attendanceSymbols: Record<AttendanceStatus, string> = {
  present: "✓",
  absent: "F",
  late: "T",
  excused: "J",
};
export function moveAttendanceDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new Error("Fecha de asistencia inválida.");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function attendanceWeekStart(day: string) {
  moveAttendanceDay(day, 0);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return moveAttendanceDay(day, -((weekday + 6) % 7));
}
export function attendanceWeekDates(day: string) {
  const start = attendanceWeekStart(day);
  return Array.from({ length: 7 }, (_, index) =>
    moveAttendanceDay(start, index),
  );
}
const collator = new Intl.Collator("es", {
  sensitivity: "base",
  numeric: true,
});
export function sortAttendancePupils(
  rows: AttendancePupil[],
  order: AttendanceSort,
) {
  return [...rows].sort((a, b) => {
    const first = order === "lastName" ? "last_name" : "first_name";
    const second = order === "lastName" ? "first_name" : "last_name";
    return (
      collator.compare(
        a[first] || a.student_name,
        b[first] || b.student_name,
      ) ||
      collator.compare(a[second] || "", b[second] || "") ||
      collator.compare(a.student_id, b.student_id)
    );
  });
}
export function attendanceDayLabel(day: string) {
  return new Intl.DateTimeFormat("es-BO", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}
