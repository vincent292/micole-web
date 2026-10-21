import { expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  staffLateDeduction,
  staffPayrollHtml,
  previousPayrollMonth,
  type StaffPayroll,
} from "../src/lib/staff";
import { demoStaffRpc } from "../src/lib/demo-staff";
import { setDemoRole } from "../src/lib/demo-config";
import { readDemoData, resetDemo } from "../src/lib/demo";
import { today } from "../src/lib/billing";
const record = {
  late_minutes: 15,
  tolerance_minutes: 10,
  late_mode: "excess" as const,
  late_rate: 2,
  deductions_enabled: true,
  late_waived: false,
};
it("aplica tolerancia y las dos reglas, con opción de no descontar o justificar", () => {
  expect(staffLateDeduction(record)).toBe(10);
  expect(
    staffLateDeduction({ ...record, late_mode: "all_after_tolerance" }),
  ).toBe(30);
  expect(staffLateDeduction({ ...record, tolerance_minutes: 0 })).toBe(30);
  expect(staffLateDeduction({ ...record, late_minutes: 10 })).toBe(0);
  expect(staffLateDeduction({ ...record, deductions_enabled: false })).toBe(0);
  expect(staffLateDeduction({ ...record, late_waived: true })).toBe(0);
  expect(previousPayrollMonth("2026-01-10")).toBe("2025-12");
});
it("la boleta impresa escapa el contenido y conserva el estado y los importes", () => {
  const p = {
    id: "example",
    period: "2026-09-01",
    status: "approved",
    profile_snapshot: {
      pay_type: "monthly",
      teacherName: "<script>datos</script>",
    },
    worked_minutes: 405,
    late_minutes: 15,
    base_amount: 3000,
    late_deduction: 10,
    adjustments: [{ kind: "earning", label: "Bono", amount: 50 }],
    gross_amount: 3050,
    deductions: 10,
    net_amount: 3040,
    note: "<img src=x>",
    approved_at: "2026-10-01T10:00:00Z",
  } as StaffPayroll;
  const html = staffPayrollHtml(p, "Docente", "Colegio");
  expect(html).toContain("3040.00");
  expect(html).toContain("Aprobada");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img src=x>");
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("La demo no debe contactar servidores.");
    }),
  );
  setDemoRole("director");
});
afterEach(() => vi.unstubAllGlobals());
it("la demo ofrece boletas y marcaciones ficticias aisladas y conserva permisos por rol", async () => {
  const data = readDemoData(),
    school = data.schools[0].id,
    month = previousPayrollMonth(today()) + "-01";
  const director = (await demoStaffRpc("staff_workspace", {
    p_school_id: school,
    p_month: month,
  })) as any;
  expect(director.canManage).toBe(true);
  expect(director.profiles.length).toBeGreaterThan(1);
  expect(director.payrolls[0].net_amount).toBe(2990);
  setDemoRole("teacher");
  const teacher = (await demoStaffRpc("staff_workspace", {
    p_school_id: school,
    p_month: month,
  })) as any;
  expect(teacher.profiles).toHaveLength(1);
  expect(
    teacher.payrolls.every((p: any) => p.teacher_id === data.teachers[0].id),
  ).toBe(true);
  await expect(
    demoStaffRpc("save_staff_settings", { p_school_id: school, p_values: {} }),
  ).rejects.toThrow("Dirección");
  await demoStaffRpc("mark_staff_attendance", {
    p_school_id: school,
    p_teacher_id: data.teachers[0].id,
    p_kind: "in",
    p_id: "demo-check",
  });
  await demoStaffRpc("mark_staff_attendance", {
    p_school_id: school,
    p_teacher_id: data.teachers[0].id,
    p_kind: "out",
    p_id: "demo-check",
  });
  setDemoRole("guardian");
  await expect(
    demoStaffRpc("staff_workspace", { p_school_id: school, p_month: month }),
  ).rejects.toThrow("equipo");
  expect(fetch).not.toHaveBeenCalled();
  resetDemo();
  expect(localStorage.getItem("micole_public_demo_staff_v1")).toBeNull();
});
