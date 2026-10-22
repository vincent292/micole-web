import type { AppData, Classroom, Identity, Role, Student } from "./types";
import { studentAccess, today } from "./billing";
import { ownerPaymentAccess } from "./support-access";
export const classroomTabs = {
  students: "Alumnos",
  studentAttendance: "Asistencia",
  subjects: "Materias",
  assignments: "Tareas",
  gradebook: "Evaluaciones",
  calendar: "Calendario",
  materials: "Materiales",
} as const;
export type ClassroomTab = keyof typeof classroomTabs;
export const studentTabs = {
  summary: "Resumen",
  health: "Salud y emergencias",
  family: "Familia y recojos",
  attendance: "Asistencia",
  documents: "Documentos",
  learning: "Seguimiento",
  account: "Cuotas y recibos",
  invoices: "Facturas",
} as const;
export type StudentTab = keyof typeof studentTabs;
export function schoolRooms(
  data: AppData,
  schoolId: string | undefined,
  role: Role,
  identity: Identity,
) {
  return data.classrooms.filter(
    (r) =>
      r.schoolId === schoolId &&
      (role === "director" ||
        (role === "teacher" &&
          r.teacherIds.some((t) => identity.teacherIds.includes(t)))),
  );
}
export function canReadRecord(
  child: Student | undefined,
  role: Role,
  identity: Identity,
  data: AppData,
  schoolId?: string,
) {
  if (!child || child.schoolId !== schoolId) return false;
  if (role === "director")
    return !!(
      identity.memberships.some(
        (m) => m.schoolId === schoolId && m.role === "director",
      ) ||
      (identity.support?.schoolId === schoolId &&
        identity.support.role === "director")
    );
  if (role === "teacher")
    return schoolRooms(data, schoolId, role, identity).some(
      (r) => r.id === child.classroomId,
    );
  return role === "guardian" && identity.guardianStudentIds.includes(child.id);
}
export function recordAcademicAccess(
  child: Student,
  role: Role,
  data: AppData,
  identity: Identity,
) {
  return (
    role !== "guardian" ||
    ownerPaymentAccess(identity, child.schoolId) ||
    (!!child.profileComplete && studentAccess(child, data).allowed)
  );
}
export function recordTabs(role: Role) {
  return (Object.keys(studentTabs) as StudentTab[]).filter(
    (k) =>
      role !== "teacher" || !["documents", "account", "invoices"].includes(k),
  );
}
/** This is a UI projection of already-authorized data, never an authorization substitute. */
export function focusData(
  data: AppData,
  room: Classroom,
  children: Student[],
  role: Role,
): AppData {
  const ids = new Set(children.map((s) => s.id)),
    subjects = data.classSubjects.filter((s) => s.classroomId === room.id),
    subjectIds = new Set(subjects.map((s) => s.id));
  const assignments = data.assignments.filter((a) => a.classroomId === room.id),
    assignmentIds = new Set(assignments.map((a) => a.id));
  const submissions = data.submissions.filter(
      (s) => ids.has(s.studentId) && assignmentIds.has(s.assignmentId),
    ),
    submissionIds = new Set(submissions.map((s) => s.id));
  const childRows = <T extends { studentId: string }>(rows: T[]) =>
    rows.filter((s) => ids.has(s.studentId));
  const finance = role === "director" || role === "guardian";
  return {
    ...data,
    classrooms: [room],
    students: children,
    teachers: data.teachers.filter((t) => room.teacherIds.includes(t.id)),
    classSubjects: subjects,
    subjectTeachers: data.subjectTeachers.filter((s) =>
      subjectIds.has(s.classSubjectId),
    ),
    assignments,
    submissions,
    assignmentFiles: data.assignmentFiles.filter((f) =>
      submissionIds.has(f.submissionId),
    ),
    events: data.events.filter(
      (e) =>
        e.schoolId === room.schoolId &&
        (!e.classroomId || e.classroomId === room.id),
    ),
    announcements: data.announcements.filter(
      (a) =>
        a.schoolId === room.schoolId &&
        (!a.classroomId || a.classroomId === room.id),
    ),
    academicRequests: data.academicRequests.filter(
      (a) =>
        a.schoolId === room.schoolId &&
        (!a.classroomId || a.classroomId === room.id),
    ),
    dailyEntries: childRows(data.dailyEntries),
    grades: childRows(data.grades),
    requests: childRows(data.requests),
    media: childRows(data.media),
    messages: childRows(data.messages),
    studentDocuments:
      role === "teacher" ? [] : childRows(data.studentDocuments),
    familyIntakes: childRows(data.familyIntakes),
    charges: finance ? childRows(data.charges) : [],
    paymentPlans: finance ? childRows(data.paymentPlans) : [],
    schoolReceipts: finance ? childRows(data.schoolReceipts) : [],
    invoiceRequests: finance ? childRows(data.invoiceRequests) : [],
    platformCharges: finance
      ? data.platformCharges.filter(
          (c) => !!c.studentId && ids.has(c.studentId),
        )
      : [],
    notifications: data.notifications.filter(
      (n) =>
        n.schoolId === room.schoolId && (!n.studentId || ids.has(n.studentId)),
    ),
  };
}
export interface DayAction {
  key: string;
  title: string;
  detail: string;
  count?: number;
  page: string;
  priority?: boolean;
}
export function dayActions(
  data: AppData,
  schoolId: string | undefined,
  role: Role,
  students: Student[],
  child?: Student,
): DayAction[] {
  const ids = new Set(students.map((s) => s.id));
  const requests = data.requests.filter(
    (r) =>
      r.schoolId === schoolId && ids.has(r.studentId) && r.status === "pending",
  ).length;
  if (role === "director")
    return [
      {
        key: "intake",
        title: "Inscripciones por completar",
        detail: "Revisa la ficha y los datos familiares.",
        count: students.filter(
          (s) => s.status !== "inactive" && !s.profileComplete,
        ).length,
        page: "students",
        priority: true,
      },
      {
        key: "requests",
        title: "Permisos y recojos",
        detail: "Solicitudes que requieren revisión.",
        count: requests,
        page: "requests",
        priority: true,
      },
      {
        key: "evidence",
        title: "Verificar depósitos",
        detail:
          "Consulta los comprobantes pendientes antes de registrar el cobro.",
        page: "cash",
      },
      {
        key: "invoices",
        title: "Facturas por emitir",
        detail: "Solicitudes con cobros registrados.",
        count: data.invoiceRequests.filter(
          (i) => i.schoolId === schoolId && i.status === "pending",
        ).length,
        page: "invoices",
      },
      {
        key: "materials",
        title: "Materiales por aprobar",
        detail: "Propuestas del equipo docente.",
        count: data.academicRequests.filter(
          (r) => r.schoolId === schoolId && r.status === "pending",
        ).length,
        page: "materials",
      },
    ];
  if (role === "teacher")
    return [
      {
        key: "attendance",
        title: "Pasar lista de alumnos",
        detail: "Abre tu aula y registra la asistencia de hoy.",
        page: "classrooms",
        priority: true,
      },
      {
        key: "submissions",
        title: "Entregas por revisar",
        detail: "Revisa las respuestas de tus alumnos.",
        count: data.submissions.filter(
          (s) => ids.has(s.studentId) && s.status === "submitted",
        ).length,
        page: "assignments",
      },
      {
        key: "requests",
        title: "Permisos y recojos",
        detail: "Solicitudes de tus aulas.",
        count: requests,
        page: "requests",
      },
      {
        key: "calendar",
        title: "Agenda de hoy",
        detail: "Actividades y fechas de tus aulas.",
        count: data.events.filter(
          (e) =>
            e.schoolId === schoolId &&
            e.date === today() &&
            (!e.classroomId ||
              students.some((s) => s.classroomId === e.classroomId)),
        ).length,
        page: "calendar",
      },
    ];
  if (role === "guardian" && child) {
    const due = data.charges.filter(
      (c) =>
        c.studentId === child.id && !["paid", "cancelled"].includes(c.status),
    );
    return [
      {
        key: "record",
        title: "Ficha de mi hijo/a",
        detail: "Salud, contactos, asistencia y documentos.",
        page: "studentRecord",
        priority: true,
      },
      {
        key: "notices",
        title: "Avisos para mi familia",
        detail: "Revisa los comunicados importantes.",
        count: data.notifications.filter(
          (n) =>
            n.schoolId === schoolId &&
            (!n.studentId || n.studentId === child.id) &&
            !n.readAt,
        ).length,
        page: "notifications",
      },
      {
        key: "calendar",
        title: "Calendario de mi hijo/a",
        detail: "Actividades y fechas de su aula.",
        page: "calendar",
      },
      {
        key: "payments",
        title: "Próximos pagos",
        detail: "Consulta cuotas, saldos y recibos.",
        count: due.length,
        page: "payments",
      },
    ];
  }
  return [];
}
