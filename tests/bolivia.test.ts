import { expect, it } from "vitest";
import {
  centralizerCsv,
  dateRange,
  schoolRoom,
  weekdays,
} from "../src/lib/bolivia";
import { validateSchoolTimetable } from "../src/lib/boliviaTimetable";
import { defaultTimetable, teachingSlots } from "../src/lib/timetable";
import type { School, Classroom } from "../src/lib/types";
it("separa primaria/secundaria de inicial en una sede mixta y respeta la política del servidor", () => {
  const school = {
    educationLevels: ["Inicial", "Primaria", "Secundaria"],
  } as School;
  expect(schoolRoom({ level: "Primaria" } as Classroom, school)).toBe(true);
  expect(schoolRoom({ level: "Inicial" } as Classroom, school)).toBe(false);
  expect(
    schoolRoom(
      { level: "Primaria", boliviaRegular: false } as Classroom,
      school,
    ),
  ).toBe(false);
  expect(
    schoolRoom(
      { level: "Primaria" } as Classroom,
      { educationLevels: ["Guardería"] } as School,
    ),
  ).toBe(false);
});
it("prepara fechas sin alterar la zona horaria y permite revisar feriados", () => {
  expect(weekdays("2026-02-02", "2026-02-08", ["2026-02-04"])).toEqual([
    "2026-02-02",
    "2026-02-03",
    "2026-02-05",
    "2026-02-06",
  ]);
  expect(dateRange("2026-12-01", "2026-02-01")).toEqual([]);
  expect(dateRange("2026-02-28", "2026-03-01")).toHaveLength(2);
});
it("exige seis periodos de 40/35 solo en los horarios con primaria/secundaria", () => {
  const c = {
    ...defaultTimetable(),
    days: [1],
    end: 720,
    loads: [
      {
        classSubjectId: "s",
        classroomId: "r",
        teacherId: "t",
        periods: 6,
        blockSize: 1,
      },
    ],
  };
  const lessons = teachingSlots(c).map((v) => ({
    ...v,
    end: v.start + 40,
    classSubjectId: "s",
    classroomId: "r",
    teacherId: "t",
  }));
  expect(validateSchoolTimetable(c, lessons, ["r"])).toEqual([]);
  expect(
    validateSchoolTimetable({ ...c, periodMinutes: 90 }, [], ["r"], false)
      .length,
  ).toBe(1);
  expect(
    validateSchoolTimetable({ ...c, periodMinutes: 90 }, [], [], false),
  ).toEqual([]);
  expect(validateSchoolTimetable(c, lessons.slice(1), ["r"]).length).toBe(1);
});
it("exporta solo publicaciones entregadas y protege fórmulas sin inventar notas faltantes", () => {
  const csv = centralizerCsv([
    {
      id: "card",
      student_id: "student",
      classroom_id: "room",
      term_id: "term",
      content: {
        studentName: '=HYPERLINK("evil")',
        classroomName: "Primero A",
        year: 2026,
        termName: "Primero",
        complete: false,
        subjects: [{ subject: "Matemáticas", score: null, missing: 1 }],
      },
    },
  ]);
  expect(csv).toContain("NO SUSTITUYE");
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain('"Matemáticas","","1"');
});
