import type {
  AppData,
  Assignment,
  AssignmentSubmission,
  Identity,
  Role,
} from "./types";
export const submissionLabels: Record<AssignmentSubmission["status"], string> =
  {
    draft: "Borrador",
    submitted: "Entregada",
    returned: "Para corregir",
    reviewed: "Revisada",
  };
export const assignmentLabels: Record<Assignment["status"], string> = {
  draft: "Borrador",
  published: "Publicada",
  closed: "Cerrada",
};
export function subjectName(data: AppData, id?: string) {
  const cs = data.classSubjects.find((s) => s.id === id);
  return (
    data.subjects.find((s) => s.id === cs?.subjectId)?.name || "Trabajo general"
  );
}
export function canManageAssignment(
  data: AppData,
  identity: Identity,
  role: Role,
  assignment: Pick<Assignment, "classroomId" | "classSubjectId">,
) {
  if (role === "director") return true;
  if (role !== "teacher") return false;
  const room = data.classrooms.find((r) => r.id === assignment.classroomId);
  return (
    !!room?.teacherIds.some((t) => identity.teacherIds.includes(t)) &&
    (!assignment.classSubjectId ||
      data.subjectTeachers.some(
        (st) =>
          st.classSubjectId === assignment.classSubjectId &&
          identity.teacherIds.includes(st.teacherId),
      ))
  );
}
export function canSubmitAssignment(
  a: Assignment,
  submission?: AssignmentSubmission,
  now = Date.now(),
) {
  return (
    a.status === "published" &&
    submission?.status !== "reviewed" &&
    (a.allowLate || !a.dueAt || Date.parse(a.dueAt) >= now)
  );
}
export function subjectOptions(
  data: AppData,
  classroomId: string,
  identity?: Identity,
  role?: Role,
) {
  return data.classSubjects
    .filter(
      (cs) =>
        cs.classroomId === classroomId &&
        cs.active &&
        (role !== "teacher" ||
          data.subjectTeachers.some(
            (st) =>
              st.classSubjectId === cs.id &&
              identity?.teacherIds.includes(st.teacherId),
          )),
    )
    .map((cs) => ({ value: cs.id, label: subjectName(data, cs.id) }));
}
export function subjectSuggestions(data: AppData, query: string) {
  const key = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("es");
  return [
    ...new Map(
      [...data.subjectCatalog, ...data.subjects].map((s) => [
        key(s.name),
        s.name,
      ]),
    ).values(),
  ]
    .filter((name) => key(name).includes(key(query)))
    .sort((a, b) => a.localeCompare(b, "es"));
}
export function assignmentDate(day: string) {
  return day ? `${day}T23:59:59.999-04:00` : null;
}

export function learningDay(value?: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key)?.value || "")
    .join("-");
}
