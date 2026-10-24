import { readDemoData, writeDemoData } from "./demo";
import { demoRole } from "./demo-config";
import { today } from "./billing";
import type {
  AttendanceWorkspace,
  AttendanceMark,
  AttendanceRecord,
  AttendanceSession,
  AttendanceCorrection,
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
  corrections?: AttendanceCorrection[];
  submissions?: Record<string, { signature: string; result: unknown }>;
}
export const studentAttendanceOperations = [
  "student_attendance_workspace",
  "save_student_attendance",
  "request_attendance_correction",
  "review_attendance_correction",
];
export async function demoStudentAttendanceRpc(
  name: string,
  parameters: object,
) {
  const p = parameters as {
      p_id: string;
      p_record_id: string;
      p_status: AttendanceRecord["status"];
      p_note: string;
      p_approve: boolean;
      p_request_id?: string;
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
  const manager = role === "director" || role === "teacher";
  if (!manager && role !== "guardian")
    throw new Error("Este rol no tiene acceso a la asistencia.");
  let state: State = { sessions: [], records: [], notified: [] };
  try {
    state = JSON.parse(localStorage.getItem(key) || "null") || state;
  } catch {
    /* fresh state */
  }
  const corrections = (state.corrections ||= []);
  const target = state.records.find(
    (r) =>
      r.id ===
      (p.p_record_id || corrections.find((c) => c.id === p.p_id)?.record_id),
  );
  const room = data.classrooms.find(
    (r) =>
      r.id ===
      (p.p_classroom_id ||
        state.sessions.find((s) => s.id === target?.sessionId)?.room),
  );
  if (!room) throw new Error("Selecciona un aula.");
  const effective = (r: AttendanceRecord) => {
    const c = corrections
      .filter((c) => c.record_id === r.id && c.status === "approved")
      .at(-1);
    return c
      ? {
          ...r,
          status: c.proposed_status,
          note: c.proposed_note,
          correctionId: c.id,
        }
      : r;
  };
  if (name === "request_attendance_correction") {
    if (!manager || !target?.confirmed)
      throw new Error("Solo el personal del aula solicita correcciones.");
    const old = corrections.find((c) => c.id === p.p_id);
    if (old) return old.id;
    if (
      corrections.some(
        (c) => c.record_id === target.id && c.status === "pending",
      )
    )
      throw new Error("Ya hay una corrección pendiente.");
    if (
      !["present", "absent", "late", "excused"].includes(p.p_status || "") ||
      p.p_reason.trim().length < 5
    )
      throw new Error("Indica estado y motivo de la corrección.");
    const current = effective(target);
    if (current.status === p.p_status && current.note === p.p_note.trim())
      throw new Error("La solicitud no cambia el registro.");
    corrections.push({
      id: p.p_id,
      record_id: target.id,
      studentName: target.studentName,
      date: target.date,
      previous_status: current.status!,
      previous_note: current.note,
      proposed_status: p.p_status!,
      proposed_note: p.p_note.trim(),
      reason: p.p_reason.trim(),
      status: "pending",
      requested_by: `demo-${role}`,
      requested_at: new Date().toISOString(),
      review_note: "",
    });
    localStorage.setItem(key, JSON.stringify(state));
    return p.p_id;
  }
  if (name === "review_attendance_correction") {
    const c = corrections.find((c) => c.id === p.p_id);
    if (role !== "director" || !c || !target)
      throw new Error("Solo Dirección puede revisar la corrección.");
    if (c.status !== "pending")
      throw new Error("La solicitud ya fue revisada.");
    if (p.p_note.trim().length < 5)
      throw new Error("Indica el motivo de la decisión.");
    c.status = p.p_approve ? "approved" : "rejected";
    c.review_note = p.p_note.trim();
    c.reviewed_by = "demo-director";
    c.reviewed_at = new Date().toISOString();
    if (p.p_approve)
      data.notifications.push({
        id: crypto.randomUUID(),
        schoolId: room.schoolId,
        studentId: target.studentId,
        title: "Asistencia corregida",
        body: `Dirección aprobó una corrección del ${target.date}.`,
        userId: "demo-guardian",
        sourceId: c.id,
        createdAt: new Date().toISOString(),
        target: "studentAttendance",
        kind: "attendance_corrected",
        alertType: "attendance",
      });
    localStorage.setItem(key, JSON.stringify(state));
    writeDemoData(data, true);
    return;
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
      canReview: role === "director",
      corrections: manager
        ? corrections.filter(
            (c) =>
              state.sessions.some(
                (s) =>
                  s.room === room.id &&
                  s.id ===
                    state.records.find((r) => r.id === c.record_id)?.sessionId,
              ) && c.date.slice(0, 7) === p.p_month.slice(0, 7),
          )
        : [],
      session: manager ? session || null : null,
      roster: manager
        ? students.map((s) => ({
            student_id: s.id,
            student_name: `${s.firstName} ${s.lastName}`,
          }))
        : [],
      records: state.records
        .filter(
          (r) =>
            r.date.slice(0, 7) === p.p_month.slice(0, 7) &&
            (manager
              ? state.sessions.some(
                  (s) => s.room === room.id && s.id === r.sessionId,
                )
              : r.studentId === p.p_student_id &&
                r.studentId === "a1" &&
                r.confirmed),
        )
        .map(effective),
    } satisfies AttendanceWorkspace;
  if (!manager) throw new Error("Solo Dirección o Docente puede pasar lista.");
  if (p.p_day > today()) throw new Error("La asistencia no puede ser futura.");
  const signature = JSON.stringify([
    p.p_classroom_id,
    p.p_day,
    p.p_records,
    p.p_revision,
    p.p_confirm,
    p.p_reason,
  ]);
  const replay = p.p_request_id && state.submissions?.[p.p_request_id];
  if (replay) {
    if (replay.signature !== signature)
      throw new Error("La solicitud ya existe con otros datos.");
    return replay.result;
  }
  if (session?.status === "confirmed")
    throw new Error(
      "La asistencia de este día está confirmada y no puede modificarse.",
    );
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
  const result = {
    id: next.id,
    revision: next.revision,
    confirmed: p.p_confirm,
    notifications,
  };
  if (p.p_request_id)
    (state.submissions ||= {})[p.p_request_id] = { signature, result };
  localStorage.setItem(key, JSON.stringify(state));
  writeDemoData(data, true);
  return result;
}
