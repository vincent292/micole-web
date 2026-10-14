import { describe, expect, it } from "vitest";
import { buildSchedule, chargeStatus, studentAccess } from "../src/lib/billing";
import { seed } from "../src/lib/seed";
import type { PaymentPlan } from "../src/lib/types";
const plan: PaymentPlan = {
  id: "plan",
  schoolId: "s1",
  studentId: "a1",
  startDate: "2026-10-01",
  months: 10,
  monthlyFee: 420,
  snackFee: 60,
  enrollmentFee: 200,
  dueDay: 10,
  discount: 50,
  discountFrom: "2026-10-01",
  discountTo: "2026-11-30",
  prorate: false,
  createdAt: "2026-10-13",
};
describe("planes de pago y acceso", () => {
  it("suma matrícula, tarifa fija, merienda y 29 de licencia, y aplica descuentos por fechas", () => {
    const charges = buildSchedule(plan, () => "id");
    expect(charges).toHaveLength(11);
    expect(charges[0].amount).toBe(200);
    expect(charges[1].amount).toBe(459);
    expect(charges[2].amount).toBe(459);
    expect(charges[3].amount).toBe(509);
    expect(charges.at(-1)?.period).toBe("2027-07");
  });
  it("prorratea solo tarifa y merienda y nunca reduce la licencia", () => {
    const charges = buildSchedule(
      {
        ...plan,
        startDate: "2026-10-17",
        months: 1,
        prorate: true,
        discount: 999,
      },
      () => "id",
    );
    expect(charges[1].baseAmount).toBe(203.23);
    expect(charges[1].snackAmount).toBe(29.03);
    expect(charges[1].amount).toBe(29);
  });
  it("respeta fin de mes y febrero sin vencimientos previos al inicio", () => {
    const charges = buildSchedule(
      {
        ...plan,
        startDate: "2026-01-31",
        dueDay: 28,
        months: 3,
        enrollmentFee: 0,
        discount: 0,
      },
      () => "id",
    );
    expect(charges.map((c) => c.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-28",
    ]);
  });
  it("rechaza planes inválidos", () => {
    expect(() => buildSchedule({ ...plan, months: 0 }, () => "")).toThrow();
    expect(() => buildSchedule({ ...plan, dueDay: 31 }, () => "")).toThrow();
    expect(() =>
      buildSchedule({ ...plan, discountFrom: "" }, () => ""),
    ).toThrow();
  });
  it("bloquea deuda vencida y respeta excepciones temporales sin borrar deuda", () => {
    const student = seed.students[1];
    expect(studentAccess(student, seed, "2026-10-13").allowed).toBe(false);
    expect(
      studentAccess(
        { ...student, accessUntil: "2026-10-15" },
        seed,
        "2026-10-13",
      ).allowed,
    ).toBe(true);
    expect(
      studentAccess(
        { ...student, accessUntil: "2026-10-15" },
        seed,
        "2026-10-16",
      ).allowed,
    ).toBe(false);
    expect(studentAccess(seed.students[4], seed, "2026-10-13").allowed).toBe(
      false,
    );
    expect(
      chargeStatus({ ...seed.charges[2], dueDate: "2026-10-12" }, "2026-10-13"),
    ).toBe("overdue");
    expect(
      chargeStatus({ ...seed.charges[2], status: "cancelled" }, "2026-10-20"),
    ).toBe("cancelled");
  });
});
