import { demoRole } from "./demo-config";
import { readDemoData, writeDemoData, demoRpc } from "./demo";
import { publishWorkspaceChange } from "./workspaceEvents";
import { subjectName, canManageAssignment } from "./learning";
import type { Coordination, Interview, StaffMessage } from "./tutoring";
import type { SchoolWorkspace } from "./school";
const key = "micole_public_demo_tutoring_v1";
export const tutoringOperations = [
  "classroom_coordination_workspace",
  "classroom_tutor_overview",
  "set_classroom_tutor",
  "save_classroom_interview",
  "respond_classroom_interview",
  "close_classroom_interview",
  "send_classroom_staff_message",
];
export async function demoTutoringRpc(
  name: string,
  parameters: object,
): Promise<unknown> {
  const p = parameters as Record<string, any>,
    d = readDemoData(),
    role = demoRole(),
    actor = `demo-${role}`;
  let state: Coordination = { interviews: [], messages: [] };
  try {
    state = JSON.parse(localStorage.getItem(key) || "null") || state;
  } catch {}
  const staff = role === "director" || role === "teacher",
    teacherIds = d.teachers
      .filter((t) => t.email === "docente@micole.test")
      .map((t) => t.id),
    room = d.classrooms.find((r) => r.id === p.p_classroom_id),
    pupil = d.students.find((s) => s.id === p.p_student_id);
  const manage = (r: string, subject?: string) =>
    staff &&
    (role === "director" ||
      teacherIds.includes(
        d.classrooms.find((c) => c.id === r)?.tutorTeacherId || "",
      ) ||
      canManageAssignment(d, { teacherIds } as any, role!, {
        classroomId: r,
        classSubjectId: subject,
      }));
  let result: unknown = null,
    mutation = true;
  if (name === "classroom_coordination_workspace") {
    mutation = false;
    const allowed =
      role === "guardian"
        ? d.students
            .filter((s) =>
              [s.motherEmail, s.fatherEmail, s.guardianEmail].includes(
                "familia@micole.test",
              ),
            )
            .map((s) => s.id)
        : [];
    result = {
      interviews: state.interviews
        .filter(
          (i) =>
            i.school_id === p.p_school_id &&
            (!p.p_classroom_id || i.classroom_id === p.p_classroom_id) &&
            (!p.p_student_id || i.student_id === p.p_student_id) &&
            (staff || allowed.includes(i.student_id)),
        )
        .map((i) => ({
          ...i,
          canManage: manage(i.classroom_id, i.class_subject_id),
        })),
      messages: staff
        ? state.messages.filter(
            (m) =>
              (!p.p_classroom_id || m.classroom_id === p.p_classroom_id) &&
              (!p.p_student_id || m.student_id === p.p_student_id) &&
              (role === "director" ||
                m.sender_id === actor ||
                teacherIds.includes(m.recipient_teacher_id)),
          )
        : [],
    };
  } else if (name === "classroom_tutor_overview") {
    mutation = false;
    if (
      !room ||
      !staff ||
      (role !== "director" && !teacherIds.includes(room.tutorTeacherId || ""))
    )
      throw Error(
        "Solo Dirección o la tutora de esta aula consulta el seguimiento completo.",
      );
    const students = d.students.filter(
        (s) => s.classroomId === room.id && s.status !== "inactive",
      ),
      selected = pupil || students[0],
      life = await demoRpc<SchoolWorkspace>("school_workspace", {
        p_school_id: room.schoolId,
        p_from: "2026-01-01",
        p_to: "2030-12-31",
      });
    const pending = (studentId: string) =>
      d.assignments.filter(
        (t) =>
          t.classroomId === room.id &&
          t.status !== "draft" &&
          !d.submissions.some(
            (s) =>
              s.assignmentId === t.id &&
              s.studentId === studentId &&
              ["submitted", "reviewed"].includes(s.status),
          ),
      );
    const subjects = await Promise.all(
      d.classSubjects
        .filter((s) => s.classroomId === room.id && s.active)
        .map(async (s) => {
          const sheet = selected
            ? await demoRpc<any>("gradebook_workspace", {
                p_classroom_id: room.id,
                p_subject_id: s.id,
                p_student_id: selected.id,
              })
            : null;
          return {
            id: s.id,
            name: subjectName(d, s.id),
            total: sheet?.roster.find((r: any) => r.studentId === selected?.id)
              ?.total,
            teachers: d.teachers
              .filter((t) =>
                d.subjectTeachers.some(
                  (st) => st.teacherId === t.id && st.classSubjectId === s.id,
                ),
              )
              .map((t) => ({ id: t.id, name: t.name, hasAccount: true })),
            pendingTasks: selected
              ? pending(selected.id).filter((t) => t.classSubjectId === s.id)
                  .length
              : 0,
          };
        }),
    );
    result = {
      studentId: selected?.id,
      termName: life.terms[0]?.name,
      students: students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        pendingTasks: pending(s.id).length,
        overdueTasks: pending(s.id).filter(
          (a) => a.dueAt && Date.parse(a.dueAt) < Date.now(),
        ).length,
      })),
      subjects,
      care: life.care
        .filter((c) => c.studentId === selected?.id)
        .map((c) => ({
          id: c.id,
          entry_date: c.entryDate,
          kind: c.kind,
          note: c.note,
          food: c.food,
          mood: c.mood,
        })),
      recommendations: d.grades.filter((g) => g.studentId === selected?.id),
      feedback: [],
      pending: selected
        ? pending(selected.id).map((t) => ({
            id: t.id,
            title: t.title,
            class_subject_id: t.classSubjectId,
            due_at: t.dueAt,
            subject: subjectName(d, t.classSubjectId),
            submission_status:
              d.submissions.find(
                (s) => s.assignmentId === t.id && s.studentId === selected.id,
              )?.status || "missing",
          }))
        : [],
    };
  } else if (name === "set_classroom_tutor") {
    if (role !== "director" || !room)
      throw Error("Solo Dirección asigna a la tutora.");
    if (p.p_teacher_id && !room.teacherIds.includes(p.p_teacher_id))
      throw Error("Asigna primero al docente al aula.");
    room.tutorTeacherId = p.p_teacher_id || undefined;
    writeDemoData(d);
  } else if (name === "save_classroom_interview") {
    const v = p.p_interview,
      r = d.classrooms.find((c) => c.id === v.classroom_id),
      s = d.students.find((c) => c.id === v.student_id),
      t = d.teachers.find((t) => t.id === v.teacher_id);
    if (
      !r ||
      !s ||
      !t ||
      s.classroomId !== r.id ||
      !manage(r.id, v.class_subject_id)
    )
      throw Error("No puedes convocar esta entrevista.");
    const old = state.interviews.find((i) => i.id === v.id);
    if (old && old.starts_at === v.starts_at && old.title === v.title) {
      result = old.id;
    } else {
      if (old && old.revision !== v.revision)
        throw Error("La convocatoria cambió. Actualiza antes de editar.");
      const value: Interview = {
        ...v,
        school_id: r.schoolId,
        status: "scheduled",
        revision: old ? old.revision + 1 : 1,
        created_by: actor,
        studentName: `${s.firstName} ${s.lastName}`,
        classroomName: r.name,
        teacherName: t.name,
        subjectName: subjectName(d, v.class_subject_id),
        canManage: true,
        responses: [],
      };
      state.interviews = [
        ...state.interviews.filter((i) => i.id !== v.id),
        value,
      ];
      result = v.id;
    }
  } else if (name === "respond_classroom_interview") {
    const i = state.interviews.find((i) => i.id === p.p_id);
    if (!i || i.revision !== p.p_revision)
      throw Error("La convocatoria cambió.");
    if (
      p.p_response !== "confirmed" &&
      String(p.p_note || "").trim().length < 5
    )
      throw Error("Indica el motivo.");
    i.responses = [
      ...i.responses.filter((r) => r.userId !== actor),
      {
        userId: actor,
        name: role === "guardian" ? "Familia · Demo" : "Equipo · Demo",
        response: p.p_response,
        note: p.p_note,
        respondedAt: new Date().toISOString(),
        revision: i.revision,
      },
    ];
  } else if (name === "close_classroom_interview") {
    const i = state.interviews.find((i) => i.id === p.p_id);
    if (!i || !manage(i.classroom_id, i.class_subject_id))
      throw Error("No puedes cerrar esta entrevista.");
    i.status = p.p_status;
    i.revision++;
  } else if (name === "send_classroom_staff_message") {
    const v = p.p_message,
      s = d.students.find((s) => s.id === v.student_id),
      t = d.teachers.find((t) => t.id === v.recipient_teacher_id);
    if (!s || !t || !manage(v.classroom_id, v.class_subject_id))
      throw Error("No puedes enviar este mensaje.");
    if (!state.messages.some((m) => m.id === v.id))
      state.messages.push({
        ...v,
        sender_id: actor,
        senderName: "Equipo · Demo",
        recipientName: t.name,
        studentName: `${s.firstName} ${s.lastName}`,
        subjectName: subjectName(d, v.class_subject_id),
        created_at: new Date().toISOString(),
      } as StaffMessage);
    result = v.id;
  }
  if (mutation) {
    localStorage.setItem(key, JSON.stringify(state));
    publishWorkspaceChange({ table: "classroom_interviews" });
    publishWorkspaceChange({ table: "classroom_staff_messages" });
  }
  return result;
}
