export const dimensions = {
  ser: "Ser · 10",
  saber: "Saber · 45",
  hacer: "Hacer · 40",
  self: "Autoevaluación · 5",
};
export const gradeOptions = [
  { value: "initial", label: "Inicial / kínder" },
  ...["primary", "secondary"].flatMap((level) =>
    Array.from({ length: 6 }, (_, i) => ({
      value: `${level}${i + 1}`,
      label: `${i + 1}.º de ${level === "primary" ? "Primaria" : "Secundaria"}`,
    })),
  ),
];
export const schemes = {
  flexible: "Evaluación flexible",
  qualitative: "Cualitativa · inicial",
  bolivia2026: "Bolivia 2026 · Ser, Saber, Hacer y Autoevaluación",
};
export const reinforcementMethods = {
  best: "Conservar la mejor nota (original o reforzamiento)",
  replace: "Usar la nota del reforzamiento aprobado",
};
export interface AcademicPolicy {
  grade_code: string;
  scheme: keyof typeof schemes;
  reinforcement_method: keyof typeof reinforcementMethods;
}
export interface Reinforcement {
  id: string;
  student_id: string;
  original_score: number;
  score: number | null;
  status: "pending" | "approved";
  revision: number;
  reason: string;
  method: string;
  corrections: number;
}
export interface AnnualStudent {
  studentId: string;
  studentName: string;
  classroomId: string;
  classroomName: string;
  gradeCode?: string;
  outcome: "pending" | "passed" | "retained" | "graduated";
  targetGrade?: string;
  subjects: {
    subject: string;
    score: number | null;
    classification?: string;
  }[];
  fingerprint: string;
}
export interface PromotionData {
  sourceYear?: { id: string; year: number; name: string; status: string };
  years: { id: string; year: number; name: string; status: string }[];
  rooms: {
    id: string;
    name: string;
    academic_year: number;
    policy?: AcademicPolicy;
  }[];
  students: AnnualStudent[];
  batches: { id: string; created_at: string; items: unknown[] }[];
}
export const outcomeNames = {
  pending: "Pendiente de revisión",
  passed: "Aprobado",
  retained: "Retenido",
  graduated: "Egreso de secundaria",
};
