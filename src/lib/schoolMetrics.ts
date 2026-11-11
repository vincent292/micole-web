export interface MetricsFilters {
  from: string;
  to: string;
  group: "week" | "month";
  schoolId: string;
  classroomId: string;
  environment: "production" | "testing" | "all";
}
export interface MetricsSummary {
  schoolCount: number;
  activeStudents: number;
  newStudents: number;
  studentsPaid: number;
  collected: number;
  due: number;
  outstanding: number;
  overdue: number;
  studentsPending: number;
  average: number | null;
  completedGrades: number;
  incompleteGrades: number;
  studentsAtRisk: number;
  riskEvaluated: number;
  registrations: number;
  updates: number;
  consultations: number;
  activeActors: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
}
export interface SchoolMetric {
  id: string;
  name: string;
  testing: boolean;
  status: string;
  activeStudents: number;
  newStudents: number;
  studentsPaid: number;
  collected: number;
  outstanding: number;
  studentsPending: number;
  average: number | null;
  studentsAtRisk: number;
  registrations: number;
}
export interface SubjectMetric {
  school_id: string;
  school: string;
  classroom_id: string;
  classroom: string;
  term_id: string;
  term_name: string;
  starts_on: string;
  ends_on: string;
  subject: string;
  class_subject_id: string | null;
  average: number | null;
  completed: number;
  incomplete: number;
  enrolled: number;
  below_minimum: number;
  risk_evaluated: number;
}
export interface UsageMetric {
  module: string;
  registrations: number;
  updates: number;
  consultations: number;
}
export interface TrendMetric {
  from: string;
  to: string;
  newStudents: number;
  collected: number;
  studentsPaid: number;
  registrations: number;
  consultations: number;
}
export interface SchoolMetrics {
  scope: "platform-school-metrics";
  generatedAt: string;
  from: string;
  to: string;
  group: string;
  environment: string;
  schoolId: string | null;
  classroomId: string | null;
  schools: { id: string; name: string; status: string; testing: boolean }[];
  classrooms: { id: string; name: string; year: number }[];
  summary: MetricsSummary;
  institutions: SchoolMetric[];
  subjects: SubjectMetric[];
  usage: UsageMetric[];
  trend: TrendMetric[];
}
export function metricsRangeError(from: string, to: string) {
  const date = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!date(from) || !date(to) || to < from)
    return "Elige fechas válidas en orden.";
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366)
    return "Consulta hasta 367 días por vez.";
  return "";
}
export function metricsPreset(
  preset: "week" | "month" | "sixMonths",
  day: string,
): Pick<MetricsFilters, "from" | "to" | "group"> {
  const d = new Date(day + "T12:00:00Z");
  if (preset === "week")
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  else {
    d.setUTCDate(1);
    if (preset === "sixMonths") d.setUTCMonth(d.getUTCMonth() - 5);
  }
  return {
    from: d.toISOString().slice(0, 10),
    to: day,
    group: preset === "sixMonths" ? "month" : "week",
  };
}
export const metricsArgs = (f: MetricsFilters) => ({
  p_from: f.from,
  p_to: f.to,
  p_group: f.group,
  p_school_id: f.schoolId || null,
  p_classroom_id: f.classroomId || null,
  p_environment: f.environment,
});
export function validMetricsScope(r: SchoolMetrics, f: MetricsFilters) {
  return (
    r?.scope === "platform-school-metrics" &&
    r.from === f.from &&
    r.to === f.to &&
    r.group === f.group &&
    r.environment === f.environment &&
    r.schoolId === (f.schoolId || null) &&
    r.classroomId === (f.classroomId || null)
  );
}
const moduleNames: Record<string, string> = {
  students: "Alumnos",
  teachers: "Equipo docente",
  school_charges: "Cuotas",
  school_receipts: "Recibos",
  school_payments: "Abonos",
  platform_charges: "Licencias MiCole",
  invitations: "Invitaciones",
  family_intake_forms: "Inscripciones familiares",
  student_documents: "Documentos",
  assignments: "Tareas",
  assignment_submissions: "Entregas",
  academic_requests: "Materiales y actividades",
  academic_terms: "Periodos académicos",
  assessments: "Evaluaciones",
  assessment_scores: "Notas",
  report_cards: "Libretas",
  gradebook_rules: "Reglas de evaluación",
  gradebook_settings: "Configuración de notas",
  student_attendance_sessions: "Listas de asistencia",
  student_attendance_corrections: "Correcciones de asistencia",
  staff_attendance_records: "Marcaciones del equipo",
  care_records: "Cuidados diarios",
  announcements: "Comunicados",
  pickup_requests: "Recojos",
  absence_requests: "Permisos",
  daily_entries: "Cuaderno digital",
  messages: "Mensajes",
  schools: "Instituciones",
  calendar_events: "Agenda",
  document_imports: "Importaciones",
  admission_templates: "Formularios de inscripción",
};
const contentNames: Record<string, string> = {
  daily: "Cuaderno digital",
  journal: "Cuaderno digital",
  grades: "Notas",
  gradebook: "Evaluación",
  payments: "Pagos",
  requests: "Permisos y recojos",
  announcements: "Comunicados",
  report_card: "Libreta",
  report_cards: "Libretas",
  care: "Cuidados",
  materials: "Materiales",
  activities: "Actividades",
  gallery: "Galería",
  calendar: "Agenda",
  student_record: "Expediente",
  studentRecord: "Expediente",
};
export function metricsModuleName(key: string) {
  if (key.startsWith("consulta:")) {
    const kind = key.slice(9);
    return "Consulta · " + (contentNames[kind] || kind.replaceAll("_", " "));
  }
  return moduleNames[key] || key.replaceAll("_", " ");
}
export const metricNotes = [
  "Alumnos activos y saldos reflejan el estado actual. Las altas cuentan alumnos cargados en las fechas elegidas; al filtrar curso se usa la asignación actual.",
  "Cobrado suma abonos verificados por su fecha en Bolivia, incluso de cuotas anteriores. Alumnos con pago cuenta cada alumno una sola vez; el sistema no identifica siempre qué familiar entregó el dinero.",
  "Pendiente corresponde al saldo actual de cuotas con vencimiento en el rango. Vencido compara esas cuotas con hoy. No representa una reconstrucción del saldo en una fecha pasada.",
  "Notas: resultados actuales completos por alumno, materia y periodo que coincida con el rango; se aplica la misma regla de la planilla, normalizada sobre 100. La media da igual peso a cada resultado completo. No es la nota anual ni una media de evaluaciones de la semana.",
  "Riesgo: resultado completo menor a 51 únicamente en aulas con la política Bolivia 2026. Es una señal observada, no un pronóstico de reprobación. Las notas incompletas y cualitativas no cuentan como cero ni como riesgo.",
  "Asistencia cuenta registros de listas confirmadas y sus correcciones vigentes. Sin lista o sin marca no se infiere falta. Son marcas, no alumnos únicos.",
  "Uso muestra altas y cambios auditados, y aperturas o descargas registradas. Puede incluir procesos del sistema. No mide tiempo de pantalla ni todo el uso de la app. El filtro de curso no se aplica al uso: este corresponde al colegio completo.",
];
