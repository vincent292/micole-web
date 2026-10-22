import { readDemoData, writeDemoData } from "./demo";
import { demoRole } from "./demo-config";
import { today } from "./billing";
import type {
  AttendanceWorkspace,
  AttendanceMark,
  AttendanceRecord,
  AttendanceSession,
} from "./studentAttendance";
const key = "micole_public_demo_student_attendance_v1";
interface Session extends AttendanceSession {
  room: string;
  day: string;
}
interface State {
  sessions: Session[];
  records: AttendanceRecord[];
  notified: string[];
}
export const studentAttendanceOperations = [
  "student_attendance_workspace",
  "save_student_attendance",
];
export async function demoStudentAttendanceRpc(
  name: string,
  parameters: object,
) {
  const p = parameters as {
      p_classroom_id: string;
      p_day: string;
      p_month: string;
      p_student_id?: string;
      p_records: AttendanceMark[];
      p_revision: number;
      p_confirm: boolean;
      p_reason: string;
    },
    data = readDemoData(),
    role = demoRole();
  const room = data.classrooms.find((r) => r.id === p.p_classroom_id);
  if (!room) throw new Error("Selecciona un aula.");
  const manager = role === "director" || role === "teacher";
  if (!manager && role !== "guardian")
    throw new Error("Este rol no tiene acceso a la asistencia.");
  let state: State = { sessions: [], records: [], notified: [] };
  try {
    state = JSON.parse(localStorage.getItem(key) || "null") || state;
  } catch {
    /* start fresh */
  }
  const session = state.sessions.find(
    (s) => s.room === room.id && s.day === p.p_day,
  );
  const students = data.students.filter(
    (s) =>
      s.classroomId === room.id &&
      s.status !== "inactive" &&
      s.enrolledAt <= p.p_day,
  );
  if (name === "student_attendance_workspace")
    return {
      canManage: manager,
      session: manager ? session || null : null,
      roster: manager
        ? students.map((s) => ({
            student_id: s.id,
            student_name: `${s.firstName} ${s.lastName}`,
          }))
        : [],
      records: state.records.filter(
        (r) =>
          r.date.slice(0, 7) === p.p_month.slice(0, 7) &&
          (manager
            ? state.sessions.some(
                (s) => s.room === room.id && s.id === r.sessionId,
              )
            : r.studentId === p.p_student_id &&
              r.studentId === "a1" &&
              r.confirmed),
      ),
    } satisfies AttendanceWorkspace;
  if (!manager) throw new Error("Solo Dirección o Docente puede pasar lista.");
  if (p.p_day > today()) throw new Error("La asistencia no puede ser futura.");
  if(session?.status=== "confirmed")throw new Error("La asistencia de este día está confirmada y no puede modificarse.");
  if ((session?.revision || 0) !== p.p_revision)
    throw new Error(
      "Otra persona actualizó la lista. Recarga antes de guardar.",
    );
  if (
    !students.length ||
    students.length !== p.p_records.length ||
    new Set(p.p_records.map((m) => m.studentId)).size !== students.length ||
    p.p_records.some(
      (m) =>
        !students.some((s) => s.id === m.studentId) ||
        !["", "present", "absent", "late", "excused"].includes(m.status),
    )
  )
    throw new Error("Revisa la lista de estudiantes.");
  if (p.p_confirm && p.p_records.some((m) => !m.status))
    throw new Error("Marca a cada estudiante antes de confirmar.");
  const next: Session = session
    ? {
        ...session,
        revision: session.revision + 1,
        status: p.p_confirm ? "confirmed" : "draft",
      }
    : {
        id: crypto.randomUUID(),
        room: room.id,
        day: p.p_day,
        status: p.p_confirm ? "confirmed" : "draft",
        revision: 1,
      };
  if (session)
    state.sessions = state.sessions.map((s) => (s.id === next.id ? next : s));
  else state.sessions.push(next);
  let notifications = 0;
  for (const mark of p.p_records) {
    const old = state.records.find(
        (r) => r.sessionId === next.id && r.studentId === mark.studentId,
      ),
      student = students.find((s) => s.id === mark.studentId)!;
    const record: AttendanceRecord = {
      ...mark,
      status: mark.status || null,
      id: old?.id || crypto.randomUUID(),
      date: p.p_day,
      studentName: `${student.firstName} ${student.lastName}`,
      sessionId: next.id,
      confirmed: p.p_confirm,
      revision: next.revision,
    };
    state.records = state.records.filter((r) => r.id !== record.id);
    state.records.push(record);
    const absentKey = `absent:${record.id}`,
      correctionKey = `corrected:${record.id}`;
    const kind = p.p_confirm
      ? mark.status === "absent" && !state.notified.includes(absentKey)
        ? "attendance_absent"
        : mark.status !== "absent" &&
            state.notified.includes(absentKey) &&
            !state.notified.includes(correctionKey)
          ? "attendance_corrected"
          : null
      : null;
    if (kind) {
      state.notified.push(
        kind === "attendance_absent" ? absentKey : correctionKey,
      );
      data.notifications.push({
        id: crypto.randomUUID(),
        schoolId: room.schoolId,
        studentId: student.id,
        title:
          kind === "attendance_absent"
            ? "Falta registrada"
            : "Asistencia corregida",
        body: `${record.studentName} · ${p.p_day} · Aviso simulado para su familia.`,
        userId: "demo-guardian",
        sourceId: record.id,
        createdAt: new Date().toISOString(),
        target: "studentAttendance",
        kind,
        alertType: "attendance",
      });
      notifications++;
    }
  }
  localStorage.setItem(key, JSON.stringify(state));
  writeDemoData(data, true);
  return {
    id: next.id,
    revision: next.revision,
    confirmed: p.p_confirm,
    notifications,
  };
}
