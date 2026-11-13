import type { Role } from "./types";
const groups = ["INICIO", "GESTIÓN ACADÉMICA", "COMUNIDAD", "ECONOMÍA", "EQUIPO", "ADMINISTRACIÓN"];
const sections: Record<string, [string, number]> = {
  overview: ["INICIO", 0], students: ["GESTIÓN ACADÉMICA", 10], enrollment: ["GESTIÓN ACADÉMICA", 20],
  classrooms: ["GESTIÓN ACADÉMICA", 30], teachers: ["GESTIÓN ACADÉMICA", 40], timetables: ["GESTIÓN ACADÉMICA", 50],
  studentAttendance: ["GESTIÓN ACADÉMICA", 60], centralizers: ["GESTIÓN ACADÉMICA", 70], bolivia: ["GESTIÓN ACADÉMICA", 80],
  schoolCalendar: ["GESTIÓN ACADÉMICA", 90], promotion: ["GESTIÓN ACADÉMICA", 100],
  payments: ["ECONOMÍA", 10], cash: ["ECONOMÍA", 20], invoices: ["ECONOMÍA", 30], reports: ["ECONOMÍA", 40], credit: ["ECONOMÍA", 50],
};
export function navigationGroups(role: Role) {
  return ["director", "scheduler"].includes(role) ? groups : ["TU ESPACIO", "COMUNIDAD", "EQUIPO", "ADMINISTRACIÓN"];
}
export function organizeNavigation<T extends { key: string; label: string; group: string }>(items: T[], role: Role): T[] {
  if (!["director", "scheduler"].includes(role)) return [...items].sort((a,b) => Number(b.key === "overview") - Number(a.key === "overview"));
  return items.map(item => ({ ...item, group: sections[item.key]?.[0] || item.group,
    label: item.key === "overview" ? "Resumen" : item.key === "classrooms" ? "Grados y paralelos" : item.label,
  })).sort((a,b) => (sections[a.key]?.[1] ?? 500) - (sections[b.key]?.[1] ?? 500));
}
