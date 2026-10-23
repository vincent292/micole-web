import { it, expect } from "vitest";
import {
  defaultTimetable,
  generateTimetable,
  validateTimetable,
  teachingSlots,
} from "../src/lib/timetable";
it("reparte la carga de un docente entre paralelos sin cruces ni recreos", () => {
  const c = {
    ...defaultTimetable(),
    periodMinutes: 40,
    loads: [
      {
        classSubjectId: "mathA",
        classroomId: "A",
        teacherId: "math",
        periods: 8,
        blockSize: 2,
      },
      {
        classSubjectId: "mathB",
        classroomId: "B",
        teacherId: "math",
        periods: 8,
        blockSize: 2,
      },
      {
        classSubjectId: "languageA",
        classroomId: "A",
        teacherId: "language",
        periods: 5,
        blockSize: 1,
      },
    ],
    unavailable: [{ teacherId: "math", day: 1, start: 450, end: 610 }],
  };
  const r = generateTimetable(c);
  expect(r.status).toBe("solved");
  expect(validateTimetable(c, r.lessons)).toEqual([]);
  expect(r.lessons.filter((l) => l.classSubjectId === "mathA")).toHaveLength(4);
  expect(c.end).toBe(800);
});
it("explica la falta de capacidad sin extender la jornada", () => {
  const c = {
    ...defaultTimetable(),
    days: [1],
    start: 450,
    end: 570,
    breaks: [],
    loads: [
      {
        classSubjectId: "math",
        classroomId: "A",
        teacherId: "T",
        periods: 4,
        blockSize: 1,
      },
    ],
  };
  const r = generateTimetable(c);
  expect(r.status).toBe("impossible");
  expect(r.issues.join(" ")).toContain("40 minutos");
  expect(c.end).toBe(570);
});
it("distingue búsqueda agotada de imposibilidad demostrada", () => {
  const c = {
    ...defaultTimetable(),
    loads: [
      {
        classSubjectId: "math",
        classroomId: "A",
        teacherId: "T",
        periods: 8,
        blockSize: 1,
      },
    ],
  };
  expect(generateTimetable(c, [], 0).status).toBe("limit");
});
it("respeta compromisos publicados del docente en otras sedes", () => {
  const c = {
    ...defaultTimetable(),
    days: [1],
    start: 450,
    end: 610,
    breaks: [],
    loads: [
      {
        classSubjectId: "math",
        classroomId: "A",
        teacherId: "T",
        periods: 2,
        blockSize: 1,
      },
    ],
  };
  const holds = [{ teacherId: "T", day: 1, start: 450, end: 530 }];
  const r = generateTimetable(c, holds);
  expect(r.status).toBe("solved");
  expect(r.lessons.every((l) => l.start >= 530)).toBe(true);
});
it("los bloques no atraviesan el recreo y una carga indivisible se rechaza", () => {
  const c = {
    ...defaultTimetable(),
    loads: [
      {
        classSubjectId: "math",
        classroomId: "A",
        teacherId: "T",
        periods: 3,
        blockSize: 2,
      },
    ],
  };
  expect(() => generateTimetable(c)).toThrow(/dividan/);
  expect(
    teachingSlots(defaultTimetable()).every(
      (s) => s.end <= 610 || s.start >= 640,
    ),
  ).toBe(true);
});
