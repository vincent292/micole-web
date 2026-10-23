import { teachingSlots, type Lesson, type TimetableConfig } from "./timetable";
export function validateSchoolTimetable(
  c: TimetableConfig,
  lessons: Lesson[],
  rooms: string[],
  complete = true,
): string[] {
  const included = rooms.filter((id) =>
    c.loads.some((l) => l.classroomId === id),
  );
  if (!included.length) return [];
  const period = c.boliviaShift === "night" ? 35 : 40;
  if (c.periodMinutes !== period)
    return [
      "Primaria/secundaria: usa periodos de 40 minutos en jornada diurna o 35 en nocturna.",
    ];
  const slots = teachingSlots(c);
  if (c.days.some((day) => slots.filter((s) => s.day === day).length !== 6))
    return [
      "Primaria/secundaria: configura seis periodos diarios y sus recreos.",
    ];
  if (
    complete &&
    included.some((id) =>
      c.days.some(
        (day) =>
          lessons
            .filter((l) => l.classroomId === id && l.day === day)
            .reduce((sum, l) => sum + (l.end - l.start) / period, 0) !== 6,
      ),
    )
  )
    return [
      "Completa seis periodos por día para cada paralelo de primaria/secundaria.",
    ];
  return [];
}
