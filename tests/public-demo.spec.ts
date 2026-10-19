import { test, expect, type Page } from "@playwright/test";
import { showFormSection } from "./form-sections";
const key = "micole_public_demo_v1";
async function login(page: Page, role = "director") {
  await page.goto("/");
  await page
    .locator(".demo-accounts button")
    .filter({
      hasText:
        role === "director"
          ? "Dirección"
          : role === "teacher"
            ? "Docente"
            : role === "guardian"
              ? "Familia"
              : "Estudiante",
    })
    .click();
  await page.getByRole("button", { name: "Usar esta clave" }).click();
  await page
    .getByRole("button", { name: "Entrar a la demo", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Rol de demostración" }),
  ).toHaveValue(role);
}
async function role(page: Page, value: string) {
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption(value);
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo", exact: true }),
  ).toBeVisible();
}
async function route(page: Page, path: string) {
  await page.goto(`/app/${path}`);
  await expect(page.locator("main h1").first()).toBeVisible();
}
async function local(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), key);
}
test("credenciales ficticias, cuatro roles y pantallas sin conexiones externas", async ({
  page,
}) => {
  const requests: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      ["http:", "https:"].includes(u.protocol) &&
      u.origin !==
        new URL(process.env.MICOLE_DEMO_TEST_URL || "http://127.0.0.1:4177")
          .origin
    )
      requests.push(u.origin + u.pathname);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/students");
  await expect(
    page.getByRole("heading", { name: "Solicitar demo", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Clave de demostración", { exact: true })
    .fill("incorrecta");
  await page
    .getByRole("button", { name: "Entrar a la demo", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("correos ficticios");
  await login(page);
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await expect(page.locator(".profile-menu")).not.toContainText(
    "Superadministración",
  );
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  for (const path of [
    "students",
    "teachers",
    "classrooms",
    "subjects",
    "assignments",
    "care",
    "gradebook",
    "years",
    "onboarding",
    "cash",
    "invoices",
    "reports",
    "journal",
    "calendar",
    "announcements",
    "messages",
    "requests",
    "grades",
    "gallery",
    "materials",
    "activities",
    "settings",
  ]) {
    await route(page, path);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".loading-screen")).toHaveCount(0);
  }
  for (const r of ["teacher", "guardian", "student"]) {
    await role(page, r);
    await route(page, "assignments");
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (r !== "teacher")
      await expect(
        page.getByRole("button", { name: "Nueva tarea", exact: true }),
      ).toHaveCount(0);
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
test("estudiante entrega archivo local, docente revisa y familia consulta sin editar", async ({
  page,
}) => {
  await login(page, "student");
  await route(page, "assignments");
  await page
    .getByRole("button", { name: "Entregar tarea", exact: true })
    .first()
    .click();
  let d = page.getByRole("dialog");
  await d
    .getByLabel("Tu respuesta", { exact: true })
    .fill("Mi color favorito es azul. Esta respuesta solo existe en la demo.");
  await d.locator("input[type=file]").setInputFiles({
    name: "tarea-demo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nArchivo ficticio para probar adjuntos."),
  });
  await expect(d).toContainText("Adjunto: tarea-demo.pdf");
  await d.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  await expect(d).toHaveCount(0);
  await role(page, "teacher");
  await route(page, "assignments");
  await page
    .getByRole("button", { name: /Ver tarea y entregas/ })
    .first()
    .click();
  const row = page
    .locator(".academic-submission")
    .filter({ hasText: "Sofía Martínez" });
  await row
    .getByRole("button", { name: "Revisar entrega", exact: true })
    .first()
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Nota (opcional, hasta 100)", { exact: true }).fill("95");
  await d
    .getByLabel("Comentarios", { exact: true })
    .fill("Excelente trabajo de demostración.");
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(d).toHaveCount(0);
  await role(page, "guardian");
  await route(page, "assignments");
  await page
    .getByRole("button", { name: "Ver tarea", exact: true })
    .first()
    .click();
  await expect(page.locator("main")).toContainText(
    "Excelente trabajo de demostración.",
  );
  await expect(
    page.getByRole("button", { name: "Entregar tarea", exact: true }),
  ).toHaveCount(0);
  const data = await local(page);
  expect(data.submissions.find((s: any) => s.studentId === "a1")).toMatchObject(
    { status: "reviewed", score: 95 },
  );
  expect(data.assignmentFiles).toHaveLength(1);
});
test("pago simulado acredita abono, genera recibo y conserva el saldo", async ({
  page,
}) => {
  await login(page);
  await route(page, "cash");
  await page.getByLabel("Estudiante para el cobro").selectOption("a2");
  const first = page
    .getByRole("checkbox", { name: /Seleccionar Mensualidad/ })
    .first();
  await first.check();
  const amount = page
    .getByRole("spinbutton", { name: /Abono para Mensualidad/ })
    .first();
  await amount.fill("210");
  await page
    .getByRole("button", { name: "Generar QR bancario", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("button", { name: "Preparar pago simulado", exact: true })
    .click();
  await expect(d).toContainText("SIMULACIÓN · SIN COBRO");
  await d
    .getByRole("button", { name: "Simular pago recibido", exact: true })
    .click();
  await expect(d).toContainText("Pago simulado registrado");
  await d.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  await expect
    .poll(async () => {
      const data = await local(page);
      return data.charges.find((c: any) => c.id === "p2")?.paidAmount;
    })
    .toBe(210);
  const data = await local(page);
  expect(data.charges.find((c: any) => c.id === "p2")).toMatchObject({
    amount: 420,
    paidAmount: 210,
    status: "pending",
  });
  expect(
    data.schoolReceipts.some(
      (r: any) => r.total === 210 && r.paymentMethod === "qr",
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Estudiante para el cobro")).toBeVisible();
  expect(
    (await local(page)).charges.find((c: any) => c.id === "p2").paidAmount,
  ).toBe(210);
});
test("cuidados, materias y gestiones se guardan localmente y se restablecen", async ({
  page,
  browser,
}) => {
  await login(page, "teacher");
  await route(page, "care");
  await page
    .getByRole("button", { name: "Registrar cuidado", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d
    .getByLabel("Alimento", { exact: false })
    .fill("Sopa de verduras de ejemplo");
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(page.locator("main")).toContainText(
    "Sopa de verduras de ejemplo",
  );
  await role(page, "guardian");
  await route(page, "care");
  await expect(page.locator("main")).toContainText(
    "Sopa de verduras de ejemplo",
  );
  await expect(
    page.getByRole("button", { name: "Registrar cuidado", exact: true }),
  ).toHaveCount(0);
  await role(page, "director");
  await route(page, "subjects");
  await page
    .getByRole("button", { name: "Asignar materia", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Materia", { exact: true }).fill("Robótica de ejemplo");
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Robótica de ejemplo", exact: true }),
  ).toBeVisible();
  await route(page, "years");
  await page
    .getByRole("button", { name: "Nueva gestión", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Gestión 2027/ })).toHaveCount(
    1,
  );
  const other = await browser.newContext(),
    visitor = await other.newPage();
  await visitor.goto(page.url());
  await expect(
    visitor.getByRole("heading", { name: "Solicitar demo", exact: true }),
  ).toBeVisible();
  await login(visitor);
  expect(
    (await local(visitor)).subjects.some(
      (s: any) => s.name === "Robótica de ejemplo",
    ),
  ).toBe(false);
  await other.close();
  await page
    .getByRole("button", { name: "Restablecer demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sí, restablecer", exact: true })
    .click();
  await route(page, "subjects");
  await expect(
    page.getByRole("heading", { name: "Robótica de ejemplo", exact: true }),
  ).toHaveCount(0);
  await route(page, "care");
  await expect(page.locator("main")).not.toContainText(
    "Sopa de verduras de ejemplo",
  );
});
test("inscripción y plan crean cuotas y formulario familiar local", async ({
  page,
  context,
}) => {
  await login(page);
  await route(page, "students");
  await page
    .getByRole("button", { name: "Inscribir estudiante", exact: true })
    .click();
  let d = page.getByRole("dialog");
  for (const [label, value] of [
    ["Nombres", "Valeria"],
    ["Apellidos", "Familia Demo"],
    ["Fecha de nacimiento", "2023-02-01"],
    ["Nombre completo de la madre", "Madre Demo"],
    ["Correo de la madre", "madre-valeria@micole.test"],
    ["Nombre completo del padre", "Padre Demo"],
    ["Correo del padre", "padre-valeria@micole.test"],
    ["Mensualidad fija", "490"],
  ]) {
    await showFormSection(page, label);
    await d.getByLabel(label, { exact: false }).fill(value);
  }
  await showFormSection(page, "Aula");
  await d.getByLabel("Aula", { exact: false }).selectOption("c1");
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(d).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "Valeria Familia Demo" });
  await row.getByRole("button", { name: "Ficha familiar y WhatsApp" }).click();
  d = page.getByRole("dialog");
  await d
    .getByRole("button", { name: "Crear enlace de ficha", exact: true })
    .click();
  const link = await d.getByLabel("Enlace de ficha familiar").inputValue();
  const parent = await context.newPage();
  await parent.goto(link);
  await expect(
    parent.getByRole("heading", { name: "Ayúdanos a cuidar a Valeria" }),
  ).toBeVisible();
  const data = await local(page),
    child = data.students.find((s: any) => s.firstName === "Valeria");
  expect(
    data.charges.filter((c: any) => c.studentId === child.id).length,
  ).toBeGreaterThan(0);
  await parent.close();
});
for (const width of [360, 390, 768, 1024])
  test(`demo adaptable a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Entrar a la demo", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await login(page);
    await expect(
      page.getByRole("combobox", { name: "Rol de demostración" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await route(page, "care");
    await page
      .getByRole("button", { name: "Registrar cuidado", exact: true })
      .click();
    const d = page.getByRole("dialog"),
      box = await d.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    await expect(
      d.getByRole("button", { name: "Guardar", exact: true }),
    ).toBeInViewport();
  });
