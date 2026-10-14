import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { ReportSnapshot } from "../src/lib/reports";

const url = "https://micole-test.supabase.co";
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = id(1), schoolId = id(20), secondSchoolId = id(21), classroomId = id(30), studentId = id(40);
const school = { id: schoolId, name: "Colegio Reportes Conectado", slug: "reportes-conectado", city: "La Paz", status: "active", brand_color: "#3D6EF7" };
const secondSchool = { ...school, id: secondSchoolId, name: "Segunda Institución", slug: "segunda-reportes" };
test.use({ baseURL: "http://localhost:4174", reducedMotion: "reduce" });

/** API fixture only: exercises the connected client, without sending mail or writing a remote database. */
async function fixtureApi(page: Page, initialRole: "director" | "superadmin") {
  const state = {
    role: initialRole as "director" | "superadmin" | "teacher",
    fail: false,
    wrongScope: false,
    manyCharges: false,
    calls: [] as { name: string; params: Record<string, unknown> | null }[],
  };
  const now = Math.floor(Date.now() / 1000);
  const user = { id: userId, email: "reports-user@example.invalid", aud: "authenticated", role: "authenticated", user_metadata: { full_name: "Usuario de Reportes" }, app_metadata: { provider: "email" }, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
    session: { access_token: jwt, refresh_token: "reports-refresh", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user },
  });
  await page.route("**/auth/v1/**", route => route.fulfill({ json: route.request().url().includes("/settings") ? { external: { email: true, google: false } } : user }));
  await page.route("**/rest/v1/**", async route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").at(-1)!;
    const params = request.method() === "POST" ? request.postDataJSON() as Record<string, unknown> : null;
    state.calls.push({ name, params });
    let json: unknown = [];
    if (name === "workspace_identity") {
      json = {
        id: userId, email: user.email, name: user.user_metadata.full_name,
        canSupport: state.role === "superadmin", roles: [state.role],
        memberships: state.role === "superadmin" ? [] : [{ schoolId, role: state.role }],
        teacherIds: state.role === "teacher" ? [id(50)] : [], guardianStudentIds: [], support: null,
      };
    } else if (name === "schools") json = state.role === "superadmin" ? [school, secondSchool] : [school];
    else if (name === "platform_school_counts") json = [{ schoolId, activeStudentCount: 1 }, { schoolId: secondSchoolId, activeStudentCount: 0 }];
    else if (name === "classrooms") json = [{ id: classroomId, school_id: schoolId, name: "Primero B", academic_year: 2025 }];
    else if (name === "students") json = [{ id: studentId, school_id: schoolId, classroom_id: classroomId, first_name: "Ana", last_name: "Conectada", status: "active", profile_complete: true, monthly_fee: 9999 }];
    else if (name === "teacher_classrooms") json = [{ school_id: schoolId, teacher_id: id(50), classroom_id: classroomId, subject_name: "Titular" }];
    // A deliberately different local snapshot proves live reports never infer cashflow from store charges.
    else if (name === "school_charges") json = [{ id: id(99), school_id: schoolId, student_id: studentId, concept: "Cuota del listado 9999", amount: 9999, due_date: "2025-10-05", status: "paid", paid_at: "2025-10-05T15:00:00Z" }];
    else if (name === "financial_report") {
      if (state.fail) {
        await route.fulfill({ status: 503, json: { code: "P0001", message: "El registro de pagos no está disponible. Reintenta el reporte." } });
        return;
      }
      const from = String(params!.p_from), to = String(params!.p_to);
      const inPeriod = (date: string) => date >= from && date <= to;
      const scope = state.role === "superadmin" ? "platform" : "school";
      const value: ReportSnapshot = {
        scope, fromDate: from, toDate: to, generatedAt: "2025-10-31T16:00:00Z",
        schools: scope === "platform" ? [school, secondSchool].filter(s => !params!.p_school_id || s.id === params!.p_school_id) : [school],
        classrooms: scope === "school" ? [{ id: classroomId, name: "Primero B" }] : [],
        students: scope === "school" ? [{ id: studentId, name: "Ana Conectada", classroomId, status: "active" }] : [],
        charges: scope === "school"
          ? [{ id: id(100), schoolId, studentId, concept: "Cuota septiembre", date: "2025-09-15", dueDate: "2025-09-15", amount: 185, status: "paid" as const, kind: "tuition" as const }, { id: id(101), schoolId, studentId, concept: "Cuota octubre", date: "2025-10-10", dueDate: "2025-10-10", amount: 120, status: "overdue" as const, kind: "tuition" as const }].filter(c => inPeriod(c.date))
          : [{ id: id(300), schoolId, concept: "Licencias octubre", date: "2025-10-01", amount: 116, status: "pending" as const, kind: "license" as const, licenseCount: 4 }, { id: id(301), schoolId, concept: "Activación inicial", date: "2025-10-02", amount: 50, status: "paid" as const, kind: "activation" as const, licenseCount: null }].filter(c => inPeriod(c.date) && (!params!.p_school_id || c.schoolId === params!.p_school_id)),
        payments: scope === "school"
          ? [{ id: id(200), chargeId: id(100), schoolId, studentId, concept: "Cuota septiembre", date: "2025-10-02", amount: 185, method: "transfer" as const, reference: "=SUM(1;2)" }].filter(p => inPeriod(p.date))
          : [{ id: id(400), chargeId: id(301), schoolId, concept: "Activación inicial", date: "2025-10-02", amount: 50, method: "qr" as const, reference: "PLAT-400" }].filter(p => inPeriod(p.date) && (!params!.p_school_id || p.schoolId === params!.p_school_id)),
      };
      if (state.manyCharges && scope === "school") {
        value.charges = Array.from({ length: 31 }, (_, index) => {
          const date = `2025-10-${String(index + 1).padStart(2, "0")}`;
          return { id: id(500 + index), schoolId, studentId, concept: `Cuota masiva ${String(index + 1).padStart(2, "0")}`, date, dueDate: date, amount: 1, status: "overdue" as const, kind: "tuition" as const };
        }).filter(c => inPeriod(c.date));
        value.payments = [];
      }
      if (state.wrongScope) {
        value.scope = scope === "platform" ? "school" : "platform";
        value.students = [{ id: studentId, name: "Nombre privado de respuesta inválida", classroomId, status: "active" }];
        value.charges = [{ id: id(999), schoolId, studentId, concept: "Nombre privado de respuesta inválida", date: "2025-10-01", amount: 7777, status: "pending", kind: "tuition" }];
      }
      json = value;
    }
    await route.fulfill({ json });
  });
  return state;
}
async function applyOctober(page: Page) {
  await expect(page.getByRole("button", { name: "Aplicar filtros" })).toBeEnabled();
  await page.getByLabel("Desde", { exact: true }).fill("2025-10-01");
  await page.getByLabel("Hasta", { exact: true }).fill("2025-10-31");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
}

test("reportes conectados separan cobros de cuotas emitidas y exportan el ledger verificado", async ({ page }) => {
  const state = await fixtureApi(page, "director");
  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Finanzas de tu colegio" })).toBeVisible();
  await applyOctober(page);
  await expect(page.getByTestId("report-issued")).toContainText("Bs 120");
  await expect(page.getByTestId("report-collected")).toContainText("Bs 185");
  await expect(page.getByTestId("report-outstanding")).toContainText("Bs 120");
  await expect(page.getByTestId("report-overdue")).toContainText("Bs 120");
  await page.getByRole("tab", { name: /^Cuotas/ }).click();
  await expect(page.getByTestId("report-row")).toHaveCount(1);
  await expect(page.getByTestId("report-row")).toContainText("Cuota octubre");
  await expect(page.getByTestId("report-row")).not.toContainText("Cuota septiembre");
  await page.getByRole("tab", { name: /^Movimientos/ }).click();
  await expect(page.getByTestId("report-row")).toContainText("Cuota septiembre");
  await expect(page.getByTestId("report-row")).toContainText("2025-10-02");
  await expect(page.getByTestId("report-row")).toContainText("Bs 185");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("micole-school-payments-2025-10-01-2025-10-31.csv");
  const content = await readFile((await download.path())!, "utf8");
  expect(content).toContain('"Cuota septiembre"');
  expect(content).toContain('"\'=SUM(1;2)"');
  expect(content).not.toContain("9999");
  expect(state.calls.filter(c => c.name === "financial_report").at(-1)?.params).toMatchObject({ p_school_id: schoolId, p_from: "2025-10-01", p_to: "2025-10-31", p_classroom_id: null, p_student_id: null });
});

test("un fallo del RPC oculta el reporte anterior y nunca calcula un reemplazo desde cuotas locales", async ({ page }) => {
  const state = await fixtureApi(page, "director");
  await page.goto("/app/reports");
  await applyOctober(page);
  await expect(page.getByTestId("report-collected")).toContainText("Bs 185");
  state.fail = true;
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "El registro de pagos no está disponible" })).toBeVisible();
  await expect(page.getByTestId("report-collected")).toHaveCount(0);
  await expect(page.getByTestId("report-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeDisabled();
  await expect(page.locator(".financial-report")).not.toContainText("9999");
  state.fail = false;
  await page.getByRole("button", { name: "Reintentar reporte" }).click();
  await expect(page.getByTestId("report-collected")).toContainText("Bs 185");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("plataforma consulta únicamente su reporte y rechaza respuestas de otro acceso antes de mostrar datos", async ({ page }) => {
  const state = await fixtureApi(page, "superadmin");
  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Ingresos de MiCole" })).toBeVisible();
  await applyOctober(page);
  await expect(page.getByTestId("report-issued")).toContainText("Bs 166");
  await expect(page.getByTestId("report-collected")).toContainText("Bs 50");
  await expect(page.getByLabel("Estudiante", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Morosos/ })).toHaveCount(0);
  expect(state.calls.filter(c => ["students", "teachers", "classrooms", "school_charges", "messages", "daily_entries"].includes(c.name))).toEqual([]);
  expect(state.calls.filter(c => c.name === "financial_report").at(-1)?.params).toMatchObject({ p_school_id: null, p_classroom_id: null, p_student_id: null });
  state.wrongScope = true;
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "El reporte recibido no corresponde a este acceso" })).toBeVisible();
  await expect(page.getByTestId("report-issued")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Nombre privado de respuesta inválida");
  await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
  // A verified identity update removes report access rather than retaining the prior privileged UI.
  state.role = "teacher";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".financial-report")).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("button", { name: "Reportes", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ingresos de MiCole" })).toHaveCount(0);
});


test("CSV e impresión incluyen las 31 cuotas aunque la pantalla pagine de 25 en 25", async ({ page }) => {
  const state = await fixtureApi(page, "director");
  state.manyCharges = true;
  await page.goto("/app/reports");
  await applyOctober(page);
  await expect(page.getByTestId("report-issued")).toContainText("Bs 31");
  await page.getByRole("tab", { name: /^Cuotas/ }).click();
  await expect(page.getByTestId("report-row")).toHaveCount(25);
  await expect(page.getByTestId("report-row").last()).toContainText("Cuota masiva 25");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("micole-school-charges-2025-10-01-2025-10-31.csv");
  const content = await readFile((await download.path())!, "utf8");
  expect(content.trim().split("\r\n")).toHaveLength(32);
  for (let index = 1; index <= 31; index++) expect(content).toContain(`"Cuota masiva ${String(index).padStart(2, "0")}"`);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.getByTestId("report-row")).toHaveCount(31);
  await expect(page.getByTestId("report-row").last()).toContainText("Cuota masiva 31");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("report-row")).toHaveCount(25);
  await expect(page.getByTestId("report-row").last()).toContainText("Cuota masiva 25");
});
