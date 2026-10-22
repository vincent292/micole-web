export const attendanceLabels = {
  present: "Presente",
  absent: "Falta",
  late: "Tardanza",
  excused: "Con permiso",
} as const;
export type AttendanceStatus = keyof typeof attendanceLabels;
export interface AttendanceMark {
  studentId: string;
  status: AttendanceStatus | "";
  note: string;
}
export interface AttendanceRecord extends Omit<AttendanceMark, "status"> {
  id: string;
  studentName: string;
  status: AttendanceStatus | null;
  date: string;
  sessionId: string;
  confirmed: boolean;
  revision: number;
}
export interface AttendanceSession {
  id: string;
  revision: number;
  status: "draft" | "confirmed";
  confirmed_at?: string;
}
export interface AttendanceWorkspace {
  canManage: boolean;
  session: AttendanceSession | null;
  roster: { student_id: string; student_name: string }[];
  records: AttendanceRecord[];
}
export function attendanceCounts(
  marks: { status: AttendanceStatus | "" | null }[],
) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0, pending: 0 };
  for (const m of marks)
    if (m.status) counts[m.status]++;
    else counts.pending++;
  return counts;
}
export function attendanceMarks(
  data: AttendanceWorkspace,
  day: string,
): AttendanceMark[] {
  return data.roster.map((s) => {
    const mark = data.records.find(
      (r) => r.studentId === s.student_id && r.date === day,
    );
    return {
      studentId: s.student_id,
      status: mark?.status || "",
      note: mark?.note || "",
    };
  });
}
export function attendanceCsv(records: AttendanceRecord[]) {
  const cell = (v: string) =>
    '"' + (/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"';
  const rows = [
    ["Fecha", "Estudiante", "Estado", "Observación"],
    ...records
      .filter((r) => r.confirmed)
      .map((r) => [
        r.date,
        r.studentName,
        r.status ? attendanceLabels[r.status] : "Sin marcar",
        r.note,
      ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
export function attendanceMonth(day: string) {
  return day.slice(0, 7) + "-01";
}
