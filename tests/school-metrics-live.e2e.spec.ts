import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
test.use({ baseURL: "http://localhost:4174", reducedMotion: "reduce" });
const id = (n: number) =>
  `ae000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function setup(page: Page, role = "superadmin") {
  const user = {
      id: id(1),
      email: role + "@example.invalid",
      aud: "authenticated",
      role: "authenticated",
      user_metadata: { full_name: "Cuenta de métricas" },
      app_metadata: { provider: "email" },
      created_at: new Date().toISOString(),
    },
    seconds = Math.floor(Date.now() / 1000);
  const jwt =
    Buffer.from('{"alg":"HS256"}').toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: seconds + 3600,
        iat: seconds,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url") +
    ".test";
  await page.addInitScript(
    ({ user, jwt, seconds }) =>
      localStorage.setItem(
        "sb-micole-test-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "test",
          expires_at: seconds + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ),
    { user, jwt, seconds },
  );
  await page.routeWebSocket("**/realtime/v1/websocket*", () => {});
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/settings")
        ? { external: { email: true } }
        : user,
    }),
  );
  const calls: any[] = [],
    state = { fail: false, empty: false, slow: false };
  await page.route("**/rest/v1/**", async (route) => {
    const req = route.request(),
      name = new URL(req.url()).pathname.split("/").at(-1);
    let body: any = {};
    try {
      body = req.postDataJSON() || {};
    } catch {}
    calls.push({ name, body });
    let json: any = [];
    if (name === "workspace_identity")
      json = {
        id: user.id,
        email: user.email,
        name: "Superadmin prueba",
        roles: [role],
        memberships: role === "director" ? [{ schoolId: id(20), role }] : [],
        teacherIds: [],
        guardianStudentIds: [],
      };
    if (name === "finance_register") json = { receipts: [], invoices: [] };
    if (name === "schools")
      json = [
        {
          id: id(20),
          name: "Colegio Métricas",
          slug: "metricas",
          city: "La Paz",
          status: "active",
          platform_enabled: true,
          brand_color: "#3D6EF7",
        },
      ];
    if (name === "platform_school_metrics") {
      if (state.fail)
        return route.fulfill({
          status: 500,
          json: { message: "No se pudo consultar las métricas" },
        });
      if (state.slow) await new Promise((r) => setTimeout(r, 600));
      const testing = body.p_environment === "testing",
        summary = {
          schoolCount: 1,
          activeStudents: 30,
          newStudents: 5,
          studentsPaid: 12,
          collected: 2400,
          due: 5000,
          outstanding: 2600,
          overdue: 1000,
          studentsPending: 18,
          average: 65.5,
          completedGrades: 20,
          incompleteGrades: 3,
          studentsAtRisk: 4,
          riskEvaluated: 20,
          registrations: 50,
          updates: 12,
          consultations: 80,
          activeActors: 25,
          present: 50,
          late: 3,
          absent: 2,
          excused: 1,
        };
      json = {
        scope: "platform-school-metrics",
        generatedAt: new Date().toISOString(),
        from: body.p_from,
        to: body.p_to,
        group: body.p_group,
        environment: body.p_environment,
        schoolId: body.p_school_id,
        classroomId: body.p_classroom_id,
        schools: [
          {
            id: id(20),
            name: testing ? "Kinder Prueba" : "Colegio Métricas",
            testing,
            status: "active",
          },
        ],
        classrooms: body.p_school_id
          ? [{ id: id(30), name: "Primero A", year: 2026 }]
          : [],
        summary,
        institutions: state.empty
          ? []
          : [
              {
                id: id(20),
                name: testing ? "Kinder Prueba" : "Colegio Métricas",
                testing,
                status: "active",
                activeStudents: 30,
                newStudents: 5,
                studentsPaid: 12,
                collected: 2400,
                outstanding: 2600,
                studentsPending: 18,
                average: 65.5,
                studentsAtRisk: 4,
                registrations: 50,
              },
            ],
        subjects: state.empty
          ? []
          : [
              {
                school_id: id(20),
                school: "Colegio Métricas",
                classroom_id: id(30),
                classroom: "Primero A",
                term_id: id(60),
                term_name: "Trimestre 3",
                starts_on: "2026-09-01",
                ends_on: "2026-12-31",
                subject: "Matemáticas",
                class_subject_id: id(70),
                average: 48,
                completed: 20,
                incomplete: 3,
                enrolled: 23,
                below_minimum: 4,
                risk_evaluated: 20,
              },
            ],
        usage: state.empty
          ? []
          : [
              {
                module: "care_records",
                registrations: 35,
                updates: 5,
                consultations: 0,
              },
              {
                module: "consulta:grades",
                registrations: 0,
                updates: 0,
                consultations: 80,
              },
            ],
        trend: [
          {
            from: body.p_from,
            to: body.p_to,
            newStudents: 5,
            studentsPaid: 12,
            collected: 2400,
            registrations: 50,
            consultations: 80,
          },
        ],
      };
    }
    await route.fulfill({ json });
  });
  return { calls, state };
}
test("superadmin consulta panorama, materias, uso, filtros y exporta sin datos individuales", async ({
  page,
}) => {
  const { calls } = await setup(page);
  await page.goto("/app/schoolMetrics");
  await expect(
    page.getByRole("heading", {
      name: "Métricas de colegios",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByText("12 alumnos con pago verificado")).toBeVisible();
  await page.getByRole("tab", { name: "Materias y riesgo" }).click();
  await expect(page.getByRole("row", { name: /Matemáticas/ })).toContainText(
    "4 / 20",
  );
  await page.getByRole("tab", { name: "Uso y registros" }).click();
  await expect(
    page.getByRole("row", { name: /Cuidados diarios/ }),
  ).toContainText("35");
  await page.getByRole("tab", { name: "Por colegio" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const file = await (await download).path();
  expect(fs.readFileSync(file!, "utf8")).toContain("Colegio Métricas");
  expect(fs.readFileSync(file!, "utf8")).not.toMatch(/studentId|student_name/);
  await page
    .getByRole("button", { name: "Filtrar por colegio y curso" })
    .click();
  await page.getByLabel("Entorno", { exact: true }).selectOption("testing");
  await expect(page.getByRole("row", { name: /Kinder Prueba/ })).toBeVisible();
  await page.getByLabel("Colegio", { exact: true }).selectOption(id(20));
  await page.getByLabel("Curso", { exact: true }).selectOption(id(30));
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect
    .poll(
      () =>
        calls.filter((c) => c.name === "platform_school_metrics").at(-1)?.body
          .p_classroom_id,
    )
    .toBe(id(30));
  await page.getByRole("button", { name: "Últimos 6 meses" }).click();
  await expect
    .poll(
      () =>
        calls.filter((c) => c.name === "platform_school_metrics").at(-1)?.body
          .p_group,
    )
    .toBe("month");
});
test("no muestra la navegación a Dirección y no ejecuta la RPC por ruta directa", async ({
  page,
}) => {
  const { calls } = await setup(page, "director");
  await page.goto("/app/schoolMetrics");
  await expect(
    page.getByRole("button", { name: "Métricas de colegios" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/overview/);
  expect(calls.some((c) => c.name === "platform_school_metrics")).toBe(false);
});
test("error, reintento y vista vacía quedan claros sin conservar cifras anteriores", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/app/schoolMetrics");
  await expect(page.getByText("12 alumnos con pago verificado")).toBeVisible();
  state.fail = true;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo");
  await expect(page.getByText("12 alumnos con pago verificado")).toHaveCount(0);
  state.fail = false;
  state.empty = true;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await page.getByRole("tab", { name: "Materias y riesgo" }).click();
  await expect(
    page.getByText("Sin registros para estos filtros"),
  ).toBeVisible();
});
test("pantalla estrecha conserva filtros y tablas dentro del ancho de la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/app/schoolMetrics");
  await expect(page.getByText("12 alumnos con pago verificado")).toBeVisible();
  await page.getByRole("tab", { name: "Materias y riesgo" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/qa/2026-10-29-metricas-superadmin/web-local-movil.png",
    fullPage: true,
  });
});
