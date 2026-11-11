import type { Classroom, Role, School } from "./types";
import { schoolRoom } from "./bolivia";

export type WorkspaceMode = "auto" | "kinder" | "school";
export const workspaceModes: { value: WorkspaceMode; label: string }[] = [
  { value: "auto", label: "Automático según los niveles" },
  { value: "kinder", label: "Kínder y guardería" },
  { value: "school", label: "Colegio" },
];

export function readWorkspaceMode(value: string): WorkspaceMode {
  if (value === "auto" || value === "kinder" || value === "school") return value;
  throw new Error("Selecciona un modo de trabajo válido.");
}

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function isEarlyChildhoodLevel(level: string) {
  return /^(guarderia|inicial|educacion inicial|kinder|pre kinder|prekinder|nidito|maternal|preescolar|parvulario)(?:\s|$)/.test(normalized(level));
}

/** Presentation preference only. Roles and server permissions remain authoritative. */
export function isKinderWorkspace(school: School | undefined): boolean {
  if (!school || school.workspaceMode === "school") return false;
  if (school.workspaceMode === "kinder") return true;
  const levels = school.educationLevels || [];
  return levels.length > 0 && levels.every(isEarlyChildhoodLevel);
}

export function isKinderClassroom(room: Classroom, school: School | undefined): boolean {
  if (school?.workspaceMode === "school" || schoolRoom(room, school)) return false;
  if (/^(primaria|secundaria)(?:\s|$)/.test(normalized(room.level))) return false;
  return isEarlyChildhoodLevel(room.level) || isKinderWorkspace(school);
}

const primaryKeys = ["overview", "classrooms", "family", "care", "studentAttendance", "journal", "gradebook", "students", "requests", "announcements", "messages", "calendar", "gallery", "payments"];
export function kinderPageLabel(key: string, role: Role, fallback: string): string {
  const labels: Record<string, string> = {
    overview: role === "guardian" ? "Hoy en el kínder" : "Mi jornada",
    classrooms: role === "teacher" ? "Mis aulas" : "Aulas del kínder",
    care: "Así fue su día",
    gradebook: "Aprendizajes",
    journal: "Cuaderno del aula",
    students: role === "teacher" ? "Niños de mis aulas" : "Niños y familias",
    requests: "Permisos y recojos",
    calendar: "Agenda del kínder",
    gallery: "Momentos del aula",
  };
  return labels[key] || fallback;
}

export function kinderNavigation<T extends { key: string; label: string; group: string }>(items: T[], role: Role) {
  const primary = primaryKeys.flatMap(key => {
    const item = items.find(candidate => candidate.key === key);
    return item ? [{ ...item, label: kinderPageLabel(item.key, role, item.label), group: "TU JORNADA" }] : [];
  });
  return { primary, secondary: items.filter(item => !primaryKeys.includes(item.key)) };
}

export function kinderClassroomNavigation<T extends [string, string]>(tabs: T[]) {
  const keys = ["today", "care", "journal", "studentAttendance", "students", "gradebook", "calendar", "materials"];
  const labels: Record<string, string> = { today: "La jornada", care: "Así fue su día", journal: "Cuaderno del aula", students: "Niños", gradebook: "Aprendizajes" };
  return {
    primary: keys.flatMap(key => {
      const tab = tabs.find(([candidate]) => candidate === key);
      return tab ? [[tab[0], labels[tab[0]] || tab[1]] as [string, string]] : [];
    }),
    secondary: tabs.filter(([key]) => !keys.includes(key)),
  };
}
