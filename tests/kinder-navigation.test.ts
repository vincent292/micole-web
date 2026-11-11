import { describe, expect, it } from "vitest";
import type { Classroom, School } from "../src/lib/types";
import { isEarlyChildhoodLevel, isKinderClassroom, isKinderWorkspace, kinderClassroomNavigation, kinderNavigation, kinderPageLabel, readWorkspaceMode } from "../src/lib/kinder";

const school = { id: "school", educationLevels: ["Guardería", "Inicial"] } as School;
const room = { id: "room", schoolId: "school", level: "Pre-Kínder" } as Classroom;

describe("modo kínder y navegación", () => {
  it("detecta niveles infantiles explícitos y mantiene sedes mixtas en modo colegio", () => {
    expect(isKinderWorkspace(school)).toBe(true);
    expect(isKinderWorkspace({ ...school, educationLevels: ["Inicial", "Primaria"] })).toBe(false);
    expect(isKinderWorkspace({ ...school, educationLevels: ["Educación especial"] })).toBe(false);
    expect(isKinderWorkspace({ ...school, name: "Kínder MiCole", educationLevels: [] })).toBe(false);
    expect(isKinderWorkspace(undefined)).toBe(false);
    expect(isEarlyChildhoodLevel(" Pre-Kínder 2 ")).toBe(true);
    expect(isEarlyChildhoodLevel("Educación Inicial")).toBe(true);
    expect(isEarlyChildhoodLevel("Primaria")).toBe(false);
  });

  it("respeta la elección de Dirección sin modificar el régimen de aulas regulares", () => {
    expect(isKinderWorkspace({ ...school, workspaceMode: "school" })).toBe(false);
    expect(isKinderWorkspace({ ...school, educationLevels: [], workspaceMode: "kinder" })).toBe(true);
    const mixed = { ...school, educationLevels: ["Inicial", "Primaria"] };
    expect(isKinderClassroom(room, mixed)).toBe(true);
    expect(isKinderClassroom(room, { ...mixed, workspaceMode: "school" })).toBe(false);
    expect(isKinderClassroom({ ...room, level: "Primaria" }, { ...mixed, workspaceMode: "kinder" })).toBe(false);
    expect(isKinderClassroom({ ...room, boliviaRegular: true }, school)).toBe(false);
    expect(isKinderClassroom({ ...room, level: "Grupo especial" }, mixed)).toBe(false);
  });

  it("prioriza herramientas existentes conservando todo el conjunto autorizado y los enlaces", () => {
    const items = [
      { key: "subjects", label: "Materias", group: "COMUNIDAD" },
      { key: "settings", label: "Configuración", group: "ADMINISTRACIÓN" },
      { key: "classrooms", label: "Aulas y cursos", group: "TU ESPACIO" },
      { key: "overview", label: "Resumen", group: "TU ESPACIO" },
      { key: "care", label: "Cuidados diarios", group: "COMUNIDAD" },
      { key: "gradebook", label: "Evaluación y libretas", group: "COMUNIDAD" },
    ];
    const original = structuredClone(items);
    const result = kinderNavigation(items, "teacher");
    expect(result.primary.map(item => item.key)).toEqual(["overview", "classrooms", "care", "gradebook"]);
    expect(result.primary.map(item => item.label)).toEqual(["Mi jornada", "Mis aulas", "Así fue su día", "Aprendizajes"]);
    expect(result.secondary.map(item => item.key)).toEqual(["subjects", "settings"]);
    expect([...result.primary, ...result.secondary].map(item => item.key).sort()).toEqual(items.map(item => item.key).sort());
    expect(items).toEqual(original);
    expect(kinderNavigation([items[1]], "guardian").primary).toEqual([]);
    expect(kinderPageLabel("overview", "guardian", "Resumen")).toBe("Hoy en el kínder");
    expect(kinderPageLabel("classrooms", "director", "Aulas")).toBe("Aulas del kínder");
  });

  it("mantiene materias y tareas como pestañas secundarias sin perderlas", () => {
    const tabs: [string, string][] = [["subjects", "Materias"], ["assignments", "Tareas"], ["students", "Alumnos"], ["studentAttendance", "Asistencia"], ["care", "Cuidados"], ["today", "Tu jornada"]];
    const result = kinderClassroomNavigation(tabs);
    expect(result.primary.map(([key]) => key)).toEqual(["today", "care", "studentAttendance", "students"]);
    expect(result.secondary).toEqual([["subjects", "Materias"], ["assignments", "Tareas"]]);
    expect([...result.primary, ...result.secondary].map(([key]) => key).sort()).toEqual(tabs.map(([key]) => key).sort());
  });

  it("valida el modo antes de preparar la identidad institucional", () => {
    for (const mode of ["auto", "kinder", "school"]) expect(readWorkspaceMode(mode)).toBe(mode);
    for (const mode of ["", "admin", "Kínder", "null"]) expect(() => readWorkspaceMode(mode)).toThrow(/modo de trabajo/);
  });
});
