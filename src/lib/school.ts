export interface AcademicYear {
  id: string;
  schoolId: string;
  year: number;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "open" | "closed";
}
export interface EnrollmentRecord {
  id: string;
  studentId: string;
  schoolId: string;
  classroomId: string;
  yearId: string;
  studentName: string;
  classroomName: string;
  level: string;
  startedOn: string;
  endedOn?: string;
  status: "enrolled" | "completed" | "transferred" | "withdrawn";
  reason: string;
  monthlyFee: number;
}
export interface CareRecord {
  id: string;
  studentId: string;
  classroomId: string;
  entryDate: string;
  kind: "meal" | "rest" | "hygiene" | "incident" | "mood";
  occurredAt: string;
  endedAt?: string;
  food: string;
  amount: string;
  hygiene: string;
  mood: string;
  note: string;
}
export interface AcademicTerm {
  id: string;
  schoolId: string;
  yearId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  weight: number;
  status: "open" | "closed";
  revision: number;
}
export interface Assessment {
  id: string;
  schoolId: string;
  termId: string;
  classroomId: string;
  classSubjectId?: string;
  assignmentId?: string;
  title: string;
  assessmentDate: string;
  maxScore: number;
  weight: number;
}
export interface AssessmentScore {
  id: string;
  assessmentId: string;
  studentId: string;
  score?: number;
  exempt: boolean;
  comment: string;
}
export interface CardSubject {
  classSubjectId?: string;
  subject: string;
  score: number | null;
  missing: number;
  assessments: number;
  exemptions: number;
}
export interface CardContent {
  studentId: string;
  studentName: string;
  schoolName: string;
  classroomId: string;
  classroomName: string;
  year: number;
  yearId: string;
  termId: string;
  termName: string;
  termWeight: number;
  scale: number;
  startsOn: string;
  endsOn: string;
  complete: boolean;
  subjects: CardSubject[];
}
export interface ReportCard {
  id: string;
  termId: string;
  studentId: string;
  classroomId: string;
  revision: number;
  revokedAt?: string;
  publishedAt: string;
  content: CardContent;
}
export interface SchoolWorkspace {
  years: AcademicYear[];
  enrollments: EnrollmentRecord[];
  care: CareRecord[];
  terms: AcademicTerm[];
  assessments: Assessment[];
  scores: AssessmentScore[];
  cards: ReportCard[];
}
export const emptySchoolWorkspace = (): SchoolWorkspace => ({
  years: [],
  enrollments: [],
  care: [],
  terms: [],
  assessments: [],
  scores: [],
  cards: [],
});
export const careKinds = {
  meal: "Alimentación",
  rest: "Descanso",
  hygiene: "Higiene",
  incident: "Incidente",
  mood: "Estado de ánimo",
};
export const foodAmounts = {
  none: "No comió",
  little: "Poco",
  half: "La mitad",
  most: "Casi todo",
  all: "Todo",
};
export const hygieneKinds = {
  diaper: "Cambio de pañal",
  toilet: "Uso del baño",
  clothes: "Cambio de ropa",
};
export const moods = {
  happy: "Alegre",
  calm: "Tranquilo/a",
  tired: "Cansado/a",
  upset: "Molesto/a",
};
export const enrollmentStates = {
  enrolled: "Inscrito",
  completed: "Gestión finalizada",
  transferred: "Traslado",
  withdrawn: "Baja",
};
export const hourOptions = Array.from({ length: 96 }, (_, i) => {
  const value = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
  return { value, label: value };
});
export function normalizeSchoolWorkspace(
  raw: Record<string, unknown>,
): SchoolWorkspace {
  const result = emptySchoolWorkspace();
  for (const key of Object.keys(result) as (keyof SchoolWorkspace)[]) {
    if (!Array.isArray(raw[key]))
      throw new Error("La respuesta del módulo está incompleta.");
    (result[key] as unknown[]) = (raw[key] as Record<string, unknown>[]).map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
            v === null ? undefined : v,
          ]),
        ),
    );
  }
  for (const a of result.assessments) {
    a.maxScore = Number(a.maxScore);
    a.weight = Number(a.weight);
  }
  for (const t of result.terms) t.weight = Number(t.weight);
  for (const s of result.scores)
    if (s.score !== undefined) s.score = Number(s.score);
  for (const h of result.enrollments) h.monthlyFee = Number(h.monthlyFee);
  return result;
}
export function weightedSubject(
  assessments: Assessment[],
  scores: AssessmentScore[],
  studentId: string,
) {
  let numerator = 0,
    denominator = 0,
    missing = 0,
    exemptions = 0;
  for (const a of assessments) {
    const mark = scores.find(
      (s) => s.assessmentId === a.id && s.studentId === studentId,
    );
    if (mark?.exempt) {
      exemptions++;
      continue;
    }
    if (mark?.score === undefined) {
      missing++;
      continue;
    }
    numerator += (mark.score / a.maxScore) * 100 * a.weight;
    denominator += a.weight;
  }
  return {
    score: denominator
      ? Math.round((numerator / denominator) * 100) / 100
      : null,
    missing,
    exemptions,
  };
}
export function annualSubjects(cards: ReportCard[]) {
  const lines = new Map<
    string,
    { subject: string; sum: number; weight: number; periods: number }
  >();
  for (const card of cards.filter((c) => !c.revokedAt))
    for (const line of card.content.subjects) {
      const key = line.classSubjectId || line.subject;
      const current = lines.get(key) || {
        subject: line.subject,
        sum: 0,
        weight: 0,
        periods: 0,
      };
      if (line.score !== null) {
        current.sum += line.score * Number(card.content.termWeight);
        current.weight += Number(card.content.termWeight);
        current.periods++;
      }
      lines.set(key, current);
    }
  return [...lines.values()].map((l) => ({
    subject: l.subject,
    score: l.weight ? Math.round((l.sum / l.weight) * 100) / 100 : null,
    periods: l.periods,
  }));
}
export function careSummary(records: CareRecord[]) {
  return {
    meals: records.filter((r) => r.kind === "meal").length,
    restMinutes: records
      .filter((r) => r.kind === "rest" && r.endedAt)
      .reduce((n, r) => {
        const minutes = (v: string) =>
          Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
        return n + Math.max(0, minutes(r.endedAt!) - minutes(r.occurredAt));
      }, 0),
    hygiene: records.filter((r) => r.kind === "hygiene").length,
    incidents: records.filter((r) => r.kind === "incident").length,
  };
}
export type ImportKind = "students" | "teachers";
export interface ImportResult {
  rows: { row: number; ok: boolean; error?: string; id?: string }[];
  committed: boolean;
  count: number;
  activationFee: number;
  licenseFee: number;
}
export const importColumns: Record<ImportKind, string[]> = {
  teachers: ["name", "email", "specialty", "year", "classroom"],
  students: [
    "first_name",
    "last_name",
    "birth_date",
    "identity_number",
    "rude",
    "mother_name",
    "mother_email",
    "mother_phone",
    "father_name",
    "father_email",
    "father_phone",
    "year",
    "classroom",
    "monthly_fee",
    "snack_fee",
    "enrollment_fee",
    "start_date",
    "months",
    "due_day",
  ],
};
export const importLabels: Record<string, string> = {
  name: "Nombre docente",
  email: "Correo",
  specialty: "Especialidad",
  year: "Gestión",
  classroom: "Aula",
  first_name: "Nombres",
  last_name: "Apellidos",
  birth_date: "Nacimiento",
  identity_number: "CI",
  rude: "RUDE",
  mother_name: "Nombre madre",
  mother_email: "Correo madre",
  mother_phone: "Celular madre",
  father_name: "Nombre padre",
  father_email: "Correo padre",
  father_phone: "Celular padre",
  monthly_fee: "Mensualidad",
  snack_fee: "Merienda",
  enrollment_fee: "Matrícula",
  start_date: "Inicio plan",
  months: "Cuotas",
  due_day: "Día vencimiento",
};
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function schoolCsv(rows: unknown[][]) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function importTemplate(kind: ImportKind) {
  return "\uFEFF" + importColumns[kind].join(",") + "\r\n";
}
export function parseDirectoryCsv(content: string, kind: ImportKind) {
  if (content.length > 1024 * 1024)
    throw new Error("Usa un CSV de hasta 1 MB.");
  const text = content.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter =
    first.split(";").length > first.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
      continue;
    }
    if (c === '"' && !cell && !closed) {
      quoted = true;
      continue;
    }
    if (c === delimiter) {
      row.push(cell);
      cell = "";
      closed = false;
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
      continue;
    }
    if (closed && !/\s/.test(c))
      throw new Error("Revisa las comillas del archivo CSV.");
    cell += c;
  }
  if (quoted) throw new Error("Hay una celda con comillas sin cerrar.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim().toLowerCase()) || [];
  if (new Set(headers).size !== headers.length)
    throw new Error("Hay columnas repetidas.");
  const required =
    kind === "teachers"
      ? ["name", "email", "year", "classroom"]
      : ["first_name", "last_name", "birth_date", "year", "classroom"];
  if (required.some((h) => !headers.includes(h)))
    throw new Error("Utiliza las columnas de la plantilla de MiCole.");
  if (rows.length < 1 || rows.length > 200)
    throw new Error("Importa de 1 a 200 filas por archivo.");
  if (headers.some((h) => !importColumns[kind].includes(h)))
    throw new Error(
      "El archivo contiene columnas desconocidas. Utiliza la plantilla.",
    );
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error(
        `La fila ${i + 2} tiene una cantidad incorrecta de columnas.`,
      );
    return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
  });
}
