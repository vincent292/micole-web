import { describe, it, expect } from "vitest";
import {
  parseDirectoryCsv,
  schoolCsv,
  careSummary,
  weightedSubject,
  annualSubjects,
  normalizeSchoolWorkspace,
  emptySchoolWorkspace,
  type Assessment,
  type ReportCard,
  type CareRecord,
} from "../src/lib/school";
describe("Funciones compartidas web y Android", () => {
  it("lee CSV con BOM, delimitador, comillas, nuevas líneas y acentos", () => {
    const rows = parseDirectoryCsv(
      '\uFEFFname;email;year;classroom;specialty\r\n"María, José";docente@test.bo;2026;"Primero A|Primero B";"Música\n y arte"',
      "teachers",
    );
    expect(rows[0].name).toBe("María, José");
    expect(rows[0].specialty).toBe("Música\n y arte");
  });
  it("rechaza columnas repetidas, desconocidas, comillas abiertas y archivos vacíos", () => {
    for (const text of [
      "name,email,year,classroom,name\na,b,2026,c,d",
      "name,email,year,classroom,bad\na,b,2026,c,d",
      'name,email,year,classroom\n"abc,b,2026,c',
      "name,email,year,classroom\n",
    ])
      expect(() => parseDirectoryCsv(text, "teachers")).toThrow();
  });
  it("exporta CSV compatible con hojas de cálculo y evita fórmulas", () => {
    expect(schoolCsv([['=HYPERLINK("x")', "María, Ana"]])).toContain(
      '"\'=HYPERLINK(""x"")"',
    );
  });
  it("promedia por peso, normaliza a 100 y distingue cero, faltante y exención", () => {
    const a = [
      { id: "a", maxScore: 20, weight: 1 },
      { id: "b", maxScore: 100, weight: 3 },
    ] as Assessment[];
    expect(
      weightedSubject(
        a,
        [
          { assessmentId: "a", studentId: "s", score: 10, exempt: false },
          { assessmentId: "b", studentId: "s", score: 100, exempt: false },
        ] as any,
        "s",
      ),
    ).toEqual({ score: 87.5, missing: 0, exemptions: 0 });
    expect(
      weightedSubject(
        a,
        [{ assessmentId: "a", studentId: "s", score: 0, exempt: false }] as any,
        "s",
      ),
    ).toEqual({ score: 0, missing: 1, exemptions: 0 });
  });
  it("suma duración de descansos del día", () => {
    expect(
      careSummary([
        { kind: "rest", occurredAt: "12:30:00", endedAt: "14:00:00" },
        { kind: "meal" },
        { kind: "hygiene" },
      ] as CareRecord[]),
    ).toEqual({ meals: 1, restMinutes: 90, hygiene: 1, incidents: 0 });
  });
  it("promedio anual ignora versiones revocadas", () => {
    const card = (score: number, weight: number, revokedAt?: string) =>
      ({
        revokedAt,
        content: {
          termWeight: weight,
          subjects: [{ subject: "Lenguaje", score }],
        },
      }) as ReportCard;
    expect(
      annualSubjects([card(50, 1), card(100, 3), card(0, 50, "revocado")])[0]
        .score,
    ).toBe(87.5);
  });
  it("normaliza numerales y exige respuesta íntegra", () => {
    expect(() => normalizeSchoolWorkspace({ years: [] })).toThrow();
    const value = normalizeSchoolWorkspace({
      ...emptySchoolWorkspace(),
      scores: [{ assessment_id: "a", score: "0" }],
    });
    expect(value.scores[0].score).toBe(0);
  });
});
