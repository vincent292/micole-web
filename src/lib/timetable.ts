export const weekDays = [
  "",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export type Window = {
  day: number;
  start: number;
  end: number;
  teacherId?: string;
};
export type Load = {
  classSubjectId: string;
  classroomId: string;
  teacherId: string;
  periods: number;
  blockSize: number;
};
export type Lesson = {
  classSubjectId: string;
  classroomId: string;
  teacherId: string;
  day: number;
  start: number;
  end: number;
};
export interface TimetableConfig {
  boliviaShift?: "day" | "night";
  days: number[];
  start: number;
  end: number;
  periodMinutes: number;
  breaks: { start: number; end: number }[];
  loads: Load[];
  unavailable: Window[];
}
export interface TimetableVersion {
  id: string;
  school_id: string;
  year_id: string;
  name: string;
  revision: number;
  status: "draft" | "published" | "archived";
  config: TimetableConfig;
  lessons: Lesson[];
  published_at?: string;
}
export interface PlanningData {
  canManage: boolean;
  canApprove: boolean;
  canDelegate: boolean;
  years: { id: string; year: number; name: string; status: string }[];
  rooms: { id: string; name: string; academic_year: number; boliviaRegular?: boolean }[];
  subjects: {
    id: string;
    classroomId: string;
    name: string;
    teacherIds: string[];
  }[];
  teachers: { id: string; name: string }[];
  versions: TimetableVersion[];
  delegates: { email: string; can_approve: boolean; active: boolean }[];
  externalBusy: Window[];
}
export const minuteLabel = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const parseMinute = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
export const clockOptions = Array.from({ length: 288 }, (_, i) => ({
  value: String(i * 5),
  label: minuteLabel(i * 5),
}));
export const defaultTimetable = (): TimetableConfig => ({
  days: [1, 2, 3, 4, 5],
  start: 450,
  end: 800,
  periodMinutes: 40,
  breaks: [{ start: 610, end: 640 }],
  loads: [],
  unavailable: [],
});
export function teachingSlots(c: TimetableConfig) {
  validateConfig(c);
  const slots: Window[] = [];
  for (const day of c.days) {
    let start = c.start;
    while (start + c.periodMinutes <= c.end) {
      const b = c.breaks.find(
        (b) => start < b.end && start + c.periodMinutes > b.start,
      );
      if (b) {
        start = b.end;
        continue;
      }
      slots.push({ day, start, end: start + c.periodMinutes });
      start += c.periodMinutes;
    }
  }
  return slots;
}
function validateConfig(c: TimetableConfig) {
  if (
    !Number.isInteger(c.periodMinutes) ||
    c.periodMinutes < 10 ||
    c.periodMinutes > 180 ||
    !Number.isInteger(c.start) ||
    !Number.isInteger(c.end) ||
    c.start < 0 ||
    c.end > 1440 ||
    c.start >= c.end
  )
    throw new Error(
      "Revisa la jornada y la duración del periodo (10 a 180 minutos).",
    );
  if (
    !c.days.length ||
    new Set(c.days).size !== c.days.length ||
    c.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
  )
    throw new Error("Elige días de clase distintos.");
  for (const [i, b] of c.breaks.entries())
    if (
      !Number.isInteger(b.start) ||
      !Number.isInteger(b.end) ||
      b.start < c.start ||
      b.end > c.end ||
      b.start >= b.end ||
      c.breaks.some((v, j) => i !== j && b.start < v.end && b.end > v.start)
    )
      throw new Error(
        "Los recreos deben estar dentro de la jornada y no superponerse.",
      );
  if (
    c.loads.length > 500 ||
    new Set(c.loads.map((l) => l.classSubjectId)).size !== c.loads.length
  )
    throw new Error("Configura una carga por materia y paralelo (máximo 500).");
  for (const l of c.loads)
    if (
      !l.teacherId ||
      !l.classSubjectId ||
      !l.classroomId ||
      !Number.isInteger(l.periods) ||
      l.periods < 1 ||
      l.periods > 80 ||
      !Number.isInteger(l.blockSize) ||
      l.blockSize < 1 ||
      l.blockSize > 6 ||
      l.periods % l.blockSize !== 0
    )
      throw new Error(
        "Cada carga necesita docente, periodos enteros y bloques que dividan su carga semanal.",
      );
  for (const b of c.unavailable)
    if (
      !b.teacherId ||
      !Number.isInteger(b.day) ||
      b.day < 1 ||
      b.day > 7 ||
      !Number.isInteger(b.start) ||
      !Number.isInteger(b.end) ||
      b.start < 0 ||
      b.end > 1440 ||
      b.start >= b.end
    )
      throw new Error("Revisa la disponibilidad del docente.");
}
const overlaps = (a: Window, b: Window) =>
  a.day === b.day && a.start < b.end && a.end > b.start;
export function validateTimetable(
  c: TimetableConfig,
  lessons: Lesson[],
  external: Window[] = [],
): string[] {
  try {
    validateConfig(c);
  } catch (e) {
    return [(e as Error).message];
  }
  const slots = teachingSlots(c),
    errors: string[] = [];
  for (const l of lessons) {
    const load = c.loads.find((x) => x.classSubjectId === l.classSubjectId);
    if (
      !load ||
      l.classroomId !== load.classroomId ||
      l.teacherId !== load.teacherId
    ) {
      errors.push("Una clase no corresponde a su materia, paralelo o docente.");
      continue;
    }
    if (
      l.end - l.start !== c.periodMinutes * load.blockSize ||
      !slots.some((s) => s.day === l.day && s.start === l.start) ||
      Array.from(
        { length: load.blockSize },
        (_, i) => l.start + i * c.periodMinutes,
      ).some(
        (start) => !slots.some((s) => s.day === l.day && s.start === start),
      )
    )
      errors.push("Una clase cruza un recreo o sale de la jornada.");
    if (
      [...c.unavailable, ...external].some(
        (b) => b.teacherId === l.teacherId && overlaps(b, l),
      )
    )
      errors.push("Una clase cruza una indisponibilidad del docente.");
  }
  for (let i = 0; i < lessons.length; i++)
    for (let j = i + 1; j < lessons.length; j++)
      if (
        overlaps(lessons[i], lessons[j]) &&
        (lessons[i].teacherId === lessons[j].teacherId ||
          lessons[i].classroomId === lessons[j].classroomId)
      )
        errors.push("Hay un cruce de docente o aula.");
  for (const l of c.loads)
    if (
      lessons
        .filter((s) => s.classSubjectId === l.classSubjectId)
        .reduce((n, s) => n + (s.end - s.start) / c.periodMinutes, 0) !==
      l.periods
    )
      errors.push("La carga semanal de una materia está incompleta.");
  return [...new Set(errors)];
}
/** Deterministic, bounded constraint search. A timeout is not proof of infeasibility. */
export function generateTimetable(
  c: TimetableConfig,
  external: Window[] = [],
  maxNodes = 150000,
): {
  status: "solved" | "impossible" | "limit";
  lessons: Lesson[];
  issues: string[];
  nodes: number;
} {
  const slots = teachingSlots(c),
    issues: string[] = [];
  if (!c.loads.length)
    return {
      status: "impossible",
      lessons: [],
      issues: ["Configura al menos una materia y su carga semanal."],
      nodes: 0,
    };
  for (const field of ["classroomId", "teacherId"] as const)
    for (const id of new Set(c.loads.map((l) => l[field]))) {
      const needed = c.loads
        .filter((l) => l[field] === id)
        .reduce((n, l) => n + l.periods, 0);
      const available = slots.filter(
        (s) =>
          field !== "teacherId" ||
          ![...c.unavailable, ...external].some(
            (b) => b.teacherId === id && overlaps(b, s),
          ),
      ).length;
      if (needed > available)
        issues.push(
          `${field === "teacherId" ? "Docente" : "Aula"} ${id}: requiere ${needed} periodos y dispone de ${available}. Faltan al menos ${(needed - available) * c.periodMinutes} minutos semanales.`,
        );
    }
  if (issues.length)
    return { status: "impossible", lessons: [], issues, nodes: 0 };
  const candidates = c.loads.map((l) =>
    slots
      .filter((s) =>
        Array.from(
          { length: l.blockSize },
          (_, i) => s.start + i * c.periodMinutes,
        ).every((start) =>
          slots.some((t) => t.day === s.day && t.start === start),
        ),
      )
      .map((s) => ({
        ...s,
        end: s.start + c.periodMinutes * l.blockSize,
        ...l,
      }))
      .filter(
        (s) =>
          ![...c.unavailable, ...external].some(
            (b) => b.teacherId === l.teacherId && overlaps(b, s),
          ),
      ),
  );
  const left = c.loads.map((l) => l.periods / l.blockSize),
    chosen: Lesson[] = [],
    last = c.loads.map(() => -1);
  let nodes = 0,
    limited = false;
  function search(): boolean {
    if (++nodes > maxNodes) {
      limited = true;
      return false;
    }
    let pick = -1,
      options: number[] = [];
    for (let i = 0; i < left.length; i++) {
      if (!left[i]) continue;
      const valid = candidates[i]
        .map((_, j) => j)
        .filter(
          (j) =>
            j > last[i] &&
            !chosen.some(
              (s) =>
                overlaps(s, candidates[i][j]) &&
                (s.classroomId === c.loads[i].classroomId ||
                  s.teacherId === c.loads[i].teacherId),
            ),
        );
      if (valid.length < left[i]) return false;
      if (pick < 0 || valid.length / left[i] < options.length / left[pick]) {
        pick = i;
        options = valid;
      }
    }
    if (pick < 0) return true;
    options.sort((a, b) => {
      const dayLoad = (j: number) =>
        chosen.filter(
          (s) =>
            s.classSubjectId === c.loads[pick].classSubjectId &&
            s.day === candidates[pick][j].day,
        ).length;
      return dayLoad(a) - dayLoad(b) || a - b;
    });
    for (const j of options) {
      const old = last[pick];
      last[pick] = j;
      left[pick]--;
      const { classSubjectId, classroomId, teacherId, day, start, end } =
        candidates[pick][j];
      chosen.push({ classSubjectId, classroomId, teacherId, day, start, end });
      if (search()) return true;
      chosen.pop();
      left[pick]++;
      last[pick] = old;
      if (limited) return false;
    }
    return false;
  }
  const solved = search();
  return {
    status: solved ? "solved" : limited ? "limit" : "impossible",
    lessons: solved
      ? [...chosen].sort(
          (a, b) =>
            a.day - b.day ||
            a.start - b.start ||
            a.classroomId.localeCompare(b.classroomId),
        )
      : [],
    issues: solved
      ? []
      : [
          limited
            ? "Se alcanzó el límite de búsqueda. No demuestra que sea imposible; reduce bloques o revisa disponibilidad y vuelve a generar."
            : "No existe una combinación con estos bloques, cargas y disponibilidades. Revisa las restricciones; la jornada no se amplió.",
        ],
    nodes,
  };
}
