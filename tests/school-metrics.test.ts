import { describe, it, expect } from "vitest";
import {
  metricsPreset,
  metricsRangeError,
  metricsArgs,
  validMetricsScope,
} from "../src/lib/schoolMetrics";
describe("filtros de métricas", () => {
  it("usa semanas desde lunes y meses calendario sin desbordar fechas", () => {
    expect(metricsPreset("week", "2026-11-01")).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
      group: "week",
    });
    expect(metricsPreset("sixMonths", "2026-03-31").from).toBe("2025-10-01");
  });
  it("rechaza días inexistentes y permite un año bisiesto", () => {
    expect(metricsRangeError("2026-02-30", "2026-03-10")).not.toBe("");
    expect(metricsRangeError("2024-01-01", "2024-12-31")).toBe("");
    expect(metricsRangeError("2024-01-01", "2026-01-01")).not.toBe("");
  });
  it("una respuesta previa de otro colegio o entorno nunca corresponde al filtro nuevo", () => {
    const f = {
      ...metricsPreset("month", "2026-10-29"),
      schoolId: "",
      classroomId: "",
      environment: "production" as const,
    };
    const r = {
      scope: "platform-school-metrics",
      from: f.from,
      to: f.to,
      group: f.group,
      environment: f.environment,
      schoolId: null,
      classroomId: null,
    } as any;
    expect(validMetricsScope(r, f)).toBe(true);
    expect(validMetricsScope({ ...r, environment: "testing" }, f)).toBe(false);
    expect(metricsArgs(f).p_school_id).toBeNull();
  });
});
