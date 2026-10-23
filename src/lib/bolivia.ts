import type { Classroom, School } from "./types";
import { schoolCsv } from "./school";

export const ministerialReference =
  "RM 0001/2026 · Educación Regular; RM 0190/2024 · Evaluación";
export const ministerialUrl =
  "https://www.minedu.gob.bo/files/documentos-normativos/resoluciones-ministeriales/1_RM_0001_EDUCACIN_REGULAR.pdf";
export const documentKinds = {
  poa: "Plan Operativo Anual",
  pdc: "Plan de Desarrollo Curricular",
  support: "Plan de apoyo y seguimiento",
  commission: "Acta de Comisión Técnico Pedagógica",
};
export const documentStatuses = {
  draft: "Borrador",
  submitted: "Pendiente de revisión",
  approved: "Aprobado",
  returned: "Devuelto con observaciones",
};
/** The database supplies the authoritative classroom flag; initial never inherits it. */
export function schoolRoom(room?: Classroom, school?: School): boolean {
  if (!room) return false;
  if (typeof room.boliviaRegular === "boolean") return room.boliviaRegular;
  return (
    !!school?.educationLevels?.some((l) =>
      ["Primaria", "Secundaria"].includes(l),
    ) && ["primaria", "secundaria"].includes(room.level?.trim().toLowerCase())
  );
}
export interface BoliviaProfile {
  id?: string;
  year_id: string;
  unit_code: string;
  district: string;
  department: string;
  authorization_reference: string;
  reference: string;
  reference_url: string;
  school_days: string[];
  calendar_note: string;
  reviewed: boolean;
  revision?: number;
}
export interface PedagogicalDocument {
  id?: string;
  school_id?: string;
  year_id: string;
  classroom_id?: string | null;
  class_subject_id?: string | null;
  student_id?: string | null;
  kind: keyof typeof documentKinds;
  title: string;
  starts_on: string;
  ends_on: string;
  objective: string;
  activities: string;
  evidence: string;
  adaptations: string;
  participants: string;
  status: keyof typeof documentStatuses;
  review_note?: string;
  revision?: number;
}
export interface BoliviaWorkspace {
  canManage: boolean;
  year: {
    id: string;
    year: number;
    starts_on: string;
    ends_on: string;
    status: string;
  } | null;
  years: { id: string; year: number; name: string }[];
  profile: BoliviaProfile | null;
  rooms: { id: string; name: string; gradeCode?: string }[];
  documents: PedagogicalDocument[];
  cards: {
    id: string;
    student_id: string;
    classroom_id: string;
    term_id: string;
    content: {
      studentName: string;
      classroomName: string;
      year: number;
      termName: string;
      complete: boolean;
      subjects: { subject: string; score: number | null; missing: number }[];
    };
  }[];
}
export function dateRange(start: string, end: string): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    start > end
  )
    return [];
  const values: string[] = [],
    last = new Date(`${end}T12:00:00Z`);
  for (
    const d = new Date(`${start}T12:00:00Z`);
    d <= last && values.length < 366;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    values.push(d.toISOString().slice(0, 10));
  return values;
}
export function weekdays(
  start: string,
  end: string,
  excluded: string[] = [],
): string[] {
  const skip = new Set(excluded);
  return dateRange(start, end).filter(
    (v) =>
      ![0, 6].includes(new Date(`${v}T12:00:00Z`).getUTCDay()) && !skip.has(v),
  );
}
export function centralizerCsv(cards: BoliviaWorkspace["cards"]): string {
  return schoolCsv([
    ["INFORME INTERNO MICOLE — NO SUSTITUYE LA LIBRETA OFICIAL DEL SIE"],
    [
      "Estudiante",
      "Aula",
      "Gestión",
      "Trimestre",
      "Área / materia",
      "Nota publicada",
      "Pendientes",
      "ID de publicación",
    ],
    ...cards.flatMap((c) =>
      c.content.subjects.map((s) => [
        c.content.studentName,
        c.content.classroomName,
        c.content.year,
        c.content.termName,
        s.subject,
        s.score ?? "",
        s.missing,
        c.id,
      ]),
    ),
  ]);
}
