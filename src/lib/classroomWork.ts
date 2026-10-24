import { canManageAssignment, subjectName } from "./learning";
import { isClassroomTutor } from "./tutoring";
import type { AppData, Classroom, Identity, Role } from "./types";
export function classroomWork(
  data: AppData,
  room: Classroom,
  identity: Identity,
  role: Role,
) {
  const tutor = isClassroomTutor(data, identity, role, room.id);
  return data.classSubjects
    .filter((s) => s.classroomId === room.id && s.active)
    .map((subject) => {
      const canWrite = canManageAssignment(data, identity, role, {
        classroomId: room.id,
        classSubjectId: subject.id,
      });
      const ids = new Set(
        data.assignments
          .filter(
            (a) => a.classroomId === room.id && a.classSubjectId === subject.id,
          )
          .map((a) => a.id),
      );
      return {
        id: subject.id,
        name: subjectName(data, subject.id),
        canWrite,
        visible: role === "director" || canWrite || tutor,
        pending: data.submissions.filter(
          (s) => ids.has(s.assignmentId) && s.status === "submitted",
        ).length,
      };
    })
    .filter((s) => s.visible);
}
