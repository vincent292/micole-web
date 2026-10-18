import { describe, it, expect } from "vitest";
import {
  assignmentDate,
  canManageAssignment,
  canSubmitAssignment,
  learningDay,
  subjectSuggestions,
} from "../src/lib/learning";
import type { AppData, Assignment, Identity } from "../src/lib/types";
describe("reglas académicas de la interfaz", () => {
  it("conserva el día seleccionado en Bolivia al persistir el vencimiento en UTC", () => {
    const due = assignmentDate("2030-12-01")!;
    expect(new Date(due).toISOString()).toBe("2030-12-02T03:59:59.999Z");
    expect(learningDay(new Date(due).toISOString())).toBe("2030-12-01");
  });
  it("busca sin acentos y evita duplicar nombres del catálogo y la institución", () => {
    const data = {
      subjectCatalog: [
        { id: "a", name: "Matemáticas" },
        { id: "b", name: "Lenguaje" },
      ],
      subjects: [
        { id: "c", name: "MATEMATICAS" },
        { id: "d", name: "Robótica" },
      ],
    } as AppData;
    expect(subjectSuggestions(data, "matematicas")).toHaveLength(1);
    expect(subjectSuggestions(data, "robotica")).toEqual(["Robótica"]);
  });
  it("limita la gestión docente a sus aulas y materias asignadas", () => {
    const data = {
        classrooms: [{ id: "room", teacherIds: ["teacher"] }],
        subjectTeachers: [{ classSubjectId: "math", teacherId: "teacher" }],
      } as AppData,
      identity = { teacherIds: ["teacher"] } as Identity;
    expect(
      canManageAssignment(data, identity, "teacher", {
        classroomId: "room",
        classSubjectId: "math",
      }),
    ).toBe(true);
    expect(
      canManageAssignment(data, identity, "teacher", {
        classroomId: "room",
        classSubjectId: "english",
      }),
    ).toBe(false);
    expect(
      canManageAssignment(data, identity, "guardian", {
        classroomId: "room",
        classSubjectId: "math",
      }),
    ).toBe(false);
  });
  it("deshabilita entregas revisadas, cerradas o fuera de plazo estricto", () => {
    const task = {
      status: "published",
      allowLate: false,
      dueAt: "2026-01-01T12:00:00Z",
    } as Assignment;
    expect(
      canSubmitAssignment(task, undefined, Date.parse("2026-01-01T13:00:00Z")),
    ).toBe(false);
    expect(
      canSubmitAssignment(
        { ...task, allowLate: true },
        undefined,
        Date.parse("2026-01-01T13:00:00Z"),
      ),
    ).toBe(true);
    expect(
      canSubmitAssignment({ ...task, status: "closed" }, undefined, 0),
    ).toBe(false);
  });
});
