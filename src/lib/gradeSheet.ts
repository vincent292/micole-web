export const defaultGradeLabels = [
  "Destacado",
  "Logrado",
  "En proceso",
  "Necesita apoyo",
];
export const gradeMethods = {
  weighted: "Promedio ponderado",
  average: "Promedio simple",
  sum: "Suma de puntos",
};
export interface GradeColumn {
  id: string;
  term_id: string;
  classroom_id: string;
  class_subject_id?: string;
  assignment_id?: string;
  title: string;
  assessment_date: string;
  max_score: number;
  weight: number;
  grading_type: "numeric" | "qualitative";
  qualitative_options: string[];
}
export interface GradeValue {
  id: string;
  assessment_id: string;
  student_id: string;
  score: number | null;
  qualitative_score: string | null;
  exempt: boolean;
  comment: string;
  revision: number;
  corrections: number;
}
export interface GradeTotal {
  score: number | null;
  max_score: number | null;
  missing: number;
  qualitative: { title: string; value: string | null }[];
}
export interface GradeSheetData {
  canManage: boolean;
  canConfigure: boolean;
  schoolId: string;
  termId: string | null;
  terms: {
    id: string;
    name: string;
    starts_on: string;
    ends_on: string;
    status: string;
  }[];
  settings: { maxCorrections: number; labels: string[] };
  method: keyof typeof gradeMethods;
  assessments: GradeColumn[];
  scores: GradeValue[];
  roster: { studentId: string; studentName: string; total: GradeTotal }[];
}
export function gradeDisplay(value: GradeValue | undefined) {
  return value?.exempt
    ? "Exento"
    : (value?.qualitative_score ??
        (value?.score != null ? String(value.score) : ""));
}
export function scoreInput(column: GradeColumn, text: string) {
  if (column.grading_type === "qualitative") {
    if (text && !column.qualitative_options.includes(text))
      throw new Error("Elige una etiqueta válida.");
    return { score: null, qualitative_score: text || null };
  }
  const number =
    text.trim() === "" ? null : Number(text.trim().replace(",", "."));
  if (
    number !== null &&
    (!Number.isFinite(number) ||
      number < 0 ||
      number > Number(column.max_score))
  )
    throw new Error(`La nota debe estar entre 0 y ${column.max_score}.`);
  return { score: number, qualitative_score: null };
}
export function gradeCellKey(column: string, student: string) {
  return `${column}:${student}`;
}
export function totalLabel(total: GradeTotal) {
  return total.score == null
    ? total.qualitative.length
      ? "Evaluación cualitativa"
      : "Sin notas"
    : `${Number(total.score)} / ${Number(total.max_score || 100)}`;
}

export function validateGradeMutation(name:string,args:Record<string,unknown>){
 if(name==='save_gradebook_settings'){
  const limit=Number(args.p_limit),labels=args.p_labels as string[];
  if(!Number.isInteger(limit)||limit<0||limit>100)throw new Error('Indica un límite entero de 0 a 100 correcciones.');
  if(!validLabels(labels))throw new Error('Escribe entre 2 y 12 etiquetas diferentes, una por línea.');
 }
 if(name==='save_assessment'){
  const a=args.p_assessment as Record<string,unknown>;
  if(String(a.title||'').trim().length<2||String(a.title||'').trim().length>160)throw new Error('Escribe un nombre de evaluación de 2 a 160 caracteres.');
  if(!a.assessment_date)throw new Error('Elige la fecha de evaluación.');
  if(!Number.isFinite(Number(a.max_score))||Number(a.max_score)<=0||Number(a.max_score)>10000)throw new Error('La puntuación máxima debe ser mayor a cero y hasta 10000.');
  if(!Number.isFinite(Number(a.weight))||Number(a.weight)<=0||Number(a.weight)>1000)throw new Error('El peso debe ser mayor a cero y hasta 1000.');
  if(a.grading_type==='qualitative'&&!validLabels(a.qualitative_options as string[]))throw new Error('Escribe entre 2 y 12 etiquetas diferentes, una por línea.');
 }
}
function validLabels(labels:string[]){return Array.isArray(labels)&&labels.length>=2&&labels.length<=12&&labels.every(l=>l.trim().length>0&&l.trim().length<=60)&&new Set(labels.map(l=>l.trim().toLocaleLowerCase())).size===labels.length;}
