import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  demoRpc,
  readDemoData,
  writeDemoData,
  resetDemo,
  demoDataKey,
} from "../src/lib/demo";
import {
  demoLogin,
  demoRole,
  setDemoRole,
  demoPassword,
} from "../src/lib/demo-config";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, String(v));
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
    clear: () => values.clear(),
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("A demo must not contact a server.");
    }),
  );
  setDemoRole("director");
});
afterEach(() => vi.unstubAllGlobals());
describe("demostración comercial aislada", () => {
  it("acepta solo credenciales públicas de ejemplo y conserva el rol", () => {
    expect(() => demoLogin("persona@gmail.com", demoPassword)).toThrow();
    expect(() => demoLogin("direccion@micole.test", "otra")).toThrow();
    expect(demoLogin(" Familia@MiCole.test ", demoPassword)).toBe("guardian");
    expect(demoRole()).toBe("guardian");
    setDemoRole(null);
    expect(demoRole()).toBeNull();
  });
  it("crea datos ficticios completos con correos .test, materias y planes por aula", () => {
    const d = readDemoData();
    expect(d.schools).toHaveLength(1);
    expect(d.schools[0].name).toContain("Demo");
    expect(d.teachers.every((t) => t.email.endsWith(".test"))).toBe(true);
    expect(
      d.students.every(
        (s) =>
          s.motherEmail?.endsWith(".test") && s.fatherEmail?.endsWith(".test"),
      ),
    ).toBe(true);
    expect(d.subjects).toHaveLength(3);
    expect(d.charges.some((c) => c.minimumAccessRatio === 0.5)).toBe(true);
    expect(d.charges.some((c) => c.minimumAccessRatio === 1)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("aumenta cuotas, nunca disminuye ni cambia el importe por un abono", async () => {
    await expect(
      demoRpc("increase_issued_charge", {
        p_kind: "school",
        p_charge_id: "p2",
        p_amount: 419,
        p_reason: "Prueba",
      }),
    ).rejects.toThrow("disminuir");
    await demoRpc("increase_issued_charge", {
      p_kind: "school",
      p_charge_id: "p2",
      p_amount: 450,
      p_reason: "Prueba",
    });
    expect(readDemoData().charges.find((c) => c.id === "p2")?.amount).toBe(450);
    await demoRpc("set_student_fees", {
      p_student_id: "a2",
      p_monthly_fee: 500,
      p_snack_fee: 50,
      p_enrollment_fee: 100,
      p_reason: "Nuevas cuotas",
    });
    expect(readDemoData().charges.find((c) => c.id === "p2")?.amount).toBe(450);
  });
  it("simula abonos sin duplicar el recibo y valida el saldo", async () => {
    const { payment } = await demoRpc<any>("demo_bank_action", {
      action: "generate",
      kind: "school",
      studentId: "a2",
      items: [{ chargeId: "p2", amount: 210 }],
      invoice: {
        invoiceName: "Ejemplo",
        invoiceNit: "00000000",
        invoicePhone: "00000000",
      },
    });
    expect(payment.image).toBeUndefined();
    await demoRpc("demo_bank_action", {
      action: "demo_confirm",
      id: payment.id,
    });
    await demoRpc("demo_bank_action", {
      action: "demo_confirm",
      id: payment.id,
    });
    const d = readDemoData();
    expect(d.schoolReceipts.filter((r) => r.id === payment.id)).toHaveLength(1);
    expect(
      d.invoiceRequests.filter((r) => r.receiptId === payment.id),
    ).toHaveLength(1);
    expect(d.charges.find((c) => c.id === "p2")).toMatchObject({
      amount: 420,
      paidAmount: 210,
      status: "pending",
    });
    await expect(
      demoRpc("demo_bank_action", {
        action: "generate",
        kind: "school",
        studentId: "a2",
        items: [{ chargeId: "p2", amount: 211 }],
      }),
    ).rejects.toThrow("saldos");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("devuelve entregas para corregir y evita que familia escriba tareas", async () => {
    setDemoRole("student");
    const submission = await demoRpc<string>("save_assignment_submission", {
      p_assignment_id: "demo-task-initial",
      p_body: "Respuesta ficticia",
      p_submit: true,
    });
    setDemoRole("teacher");
    await demoRpc("review_assignment_submission", {
      p_id: submission,
      p_decision: "returned",
      p_score: null,
      p_feedback: "Completa la respuesta",
    });
    expect(
      readDemoData().submissions.find((s) => s.id === submission)?.status,
    ).toBe("returned");
    setDemoRole("guardian");
    await expect(
      demoRpc("save_assignment_submission", {
        p_assignment_id: "demo-task-initial",
        p_body: "No permitido",
        p_submit: true,
      }),
    ).rejects.toThrow("Estudiante");
    await expect(
      demoRpc("save_assignment", { p_assignment: {} }),
    ).rejects.toThrow("Dirección o Docente");
  });
  it("publica libretas completas, revoca al reabrir y exige notas pendientes", async () => {
    await demoRpc("close_academic_term", { p_term_id: "term-demo-open" });
    let ws = await demoRpc<any>("school_workspace", {
      p_school_id: "s1",
      p_from: "2000-01-01",
      p_to: "2100-12-31",
    });
    expect(ws.cards.some((c: any) => c.termId === "term-demo-open")).toBe(true);
    await demoRpc("reopen_academic_term", {
      p_term_id: "term-demo-open",
      p_reason: "Corregir una nota",
    });
    ws = await demoRpc<any>("school_workspace", {
      p_school_id: "s1",
      p_from: "2000-01-01",
      p_to: "2100-12-31",
    });
    expect(ws.cards.some((c: any) => c.termId === "term-demo-open")).toBe(
      false,
    );
    await demoRpc("save_assessment_scores", {
      p_assessment_id: "assessment-demo",
      p_scores: [{ student_id: "a1", score: null, exempt: false, comment: "" }],
    });
    await expect(
      demoRpc("close_academic_term", { p_term_id: "term-demo-open" }),
    ).rejects.toThrow("Completa las notas");
  });
  it("la familia solo consulta sus historiales y libretas publicadas", async () => {
    setDemoRole("guardian");
    const ws = await demoRpc<any>("school_workspace", {
      p_school_id: "s1",
      p_from: "2000-01-01",
      p_to: "2100-12-31",
    });
    expect(ws.enrollments.map((e: any) => e.studentId).sort()).toEqual([
      "a1",
      "a7",
    ]);
    expect(ws.cards.every((c: any) => ["a1", "a7"].includes(c.studentId))).toBe(
      true,
    );
    expect(ws.assessments).toEqual([]);
    await expect(
      demoRpc("save_care_record", { p_record: { student_id: "a1" } }),
    ).rejects.toThrow();
  });
  it("importa con vista previa, rechaza lotes con errores y repite sin duplicar", async () => {
    const row = {
      name: "Docente ficticia",
      email: "nueva@micole.test",
      classroom: "Nidito A",
      year: new Date().getFullYear().toString(),
    };
    const params = { p_kind: "teachers", p_rows: [row], p_school_id: "s1" };
    await demoRpc("import_school_directory", { ...params, p_commit: false });
    expect(readDemoData().teachers).toHaveLength(3);
    await expect(
      demoRpc("import_school_directory", {
        ...params,
        p_rows: [row, { ...row, email: "incorrecto" }],
        p_commit: true,
        p_batch_id: "bad",
      }),
    ).rejects.toThrow("Corrige");
    expect(readDemoData().teachers).toHaveLength(3);
    await demoRpc("import_school_directory", {
      ...params,
      p_commit: true,
      p_batch_id: "batch-1",
    });
    await demoRpc("import_school_directory", {
      ...params,
      p_commit: true,
      p_batch_id: "batch-1",
    });
    expect(readDemoData().teachers).toHaveLength(4);
  });
  it("restablece datos, adjuntos y operaciones sin tocar otros registros del navegador", async () => {
    localStorage.setItem("aulanexo_demo_v2", "original");
    const d = readDemoData();
    d.students[0].firstName = "Cambio";
    writeDemoData(d);
    await demoRpc("save_academic_year", {
      p_year: {
        school_id: "s1",
        year: 2030,
        name: "Gestión futura",
        starts_on: "2030-01-01",
        ends_on: "2030-12-31",
      },
    });
    resetDemo();
    expect(readDemoData().students[0].firstName).toBe("Sofía");
    const ws = await demoRpc<any>("school_workspace", {
      p_school_id: "s1",
      p_from: "2000-01-01",
      p_to: "2100-12-31",
    });
    expect(ws.years).toHaveLength(1);
    expect(localStorage.getItem("aulanexo_demo_v2")).toBe("original");
    expect(localStorage.getItem(demoDataKey)).toBeTruthy();
    await expect(demoRpc("unknown_real_operation", {})).rejects.toThrow(
      "externa",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
it("una build pública nunca inicializa Supabase aunque reciba variables de producción", async () => {
  vi.stubEnv("VITE_PUBLIC_DEMO", "true");
  vi.stubEnv("VITE_APP_MODE", "live");
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "fake-test-key");
  vi.stubGlobal("window", { location: { search: "", hash: "" } });
  vi.resetModules();
  const module = await import("../src/lib/supabase");
  expect(module.liveMode).toBe(false);
  expect(module.supabase).toBeNull();
  await expect(module.signInGoogle()).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});
