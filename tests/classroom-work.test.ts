import { expect, it } from "vitest";
import { classroomWork } from "../src/lib/classroomWork";
import type { AppData, Classroom, Identity } from "../src/lib/types";
it("mantiene materia, permisos de escritura y pendientes dentro de su aula", () => {
  const data = {
      classrooms: [],
      classSubjects: [],
      subjects: [],
      subjectTeachers: [],
      assignments: [],
      submissions: [],
    } as unknown as AppData,
    room = { id: "c1", schoolId: "s1", teacherIds: ["t1"] } as Classroom,
    identity = { teacherIds: ["t1"] } as Identity;
  data.classrooms = [room];
  data.classSubjects = [
    { id: "m1", classroomId: "c1", subjectId: "s-math", active: true },
    { id: "m2", classroomId: "c2", subjectId: "s-math", active: true },
  ] as typeof data.classSubjects;
  data.subjects = [
    { id: "s-math", name: "Matemáticas" },
  ] as typeof data.subjects;
  data.subjectTeachers = [
    { classSubjectId: "m1", teacherId: "t1" },
  ] as typeof data.subjectTeachers;
  data.assignments = [
    { id: "a1", classroomId: "c1", classSubjectId: "m1" },
    { id: "a2", classroomId: "c2", classSubjectId: "m2" },
  ] as typeof data.assignments;
  data.submissions = [
    { assignmentId: "a1", status: "submitted" },
    { assignmentId: "a2", status: "submitted" },
  ] as typeof data.submissions;
  const work = classroomWork(data, room, identity, "teacher");
  expect(work).toHaveLength(1);
  expect(work[0]).toMatchObject({ id: "m1", canWrite: true, pending: 1 });
  expect(
    classroomWork(data, room, { teacherIds: ["otro"] } as Identity, "teacher"),
  ).toEqual([]);
});
