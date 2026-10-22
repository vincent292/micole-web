import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, role = "director") {
  await page.goto("/");
  await page
    .getByLabel("Correo de acceso", { exact: true })
    .fill(process.env.MICOLE_DEMO_TEST_EMAIL || "invitado@example.test");
  await page
    .getByLabel("Clave de acceso", { exact: true })
    .fill(process.env.MICOLE_DEMO_TEST_PASSWORD || "AccesoLocalSoloPruebas!");
  await page
    .getByRole("button", { name: "Entrar a la demo", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption(role);
}
test("pasa lista, guarda borrador sin avisos, confirma falta y la familia consulta solo su hijo", async ({
  page,
}) => {
  await login(page, "teacher");
  await page.goto("/app/studentAttendance");
  const all = page.getByRole("button", {
    name: "Marcar pendientes como presentes",
    exact: true,
  });
  await all.click();
  const first = page.locator(".attendance-row").first();
  const name = await first.locator(".attendance-person strong").innerText();
  await first.getByRole("combobox").selectOption("absent");
  await page
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Borrador guardado" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("micole_public_demo_v1") || "{}",
        ).notifications.filter(
          (n: { kind: string }) => n.kind === "attendance_absent",
        ).length,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Revisar y confirmar", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 faltas");
  await dialog
    .getByRole("button", { name: "Confirmar y avisar", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".attendance-summary")).toContainText(
    "Lista confirmada",
  );
  await first.getByRole("combobox").selectOption("late");
  await page
    .getByRole("button", { name: "Revisar corrección", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Guardar corrección", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Motivo de la corrección" })
    .fill("Llegó con retraso y se verificó su presencia");
  await dialog
    .getByRole("button", { name: "Guardar corrección", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Historial del mes", exact: true })
    .click();
  await expect(
    page.locator(".attendance-history").filter({ hasText: name }),
  ).toContainText("Tardanza");
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption("guardian");
  await page.goto("/app/studentAttendance");
  await expect(
    page.getByRole("button", { name: "Revisar y confirmar", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".attendance-history")).toHaveCount(1);
});
for (const width of [390, 768, 1366])
  test(`recorrido de módulos y modales sin desbordes a ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 850 });
    await login(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const routes = [
      "students",
      "classrooms",
      "teachers",
      "subjects",
      "assignments",
      "care",
      "gradebook",
      "years",
      "payments",
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
      "sites",
      "admissionForms",
      "calendarImport",
      "staffAttendance",
      "staffPayroll",
      "studentAttendance",
    ];
    const forms: Record<string, RegExp> = {
      students: /Inscribir estudiante|Nuevo estudiante|Inscribir alumno/,
      classrooms: /Nueva aula|Crear aula/,
      teachers: /Nuevo docente|Agregar docente/,
      subjects: /Asignar materia/,
      assignments: /Nueva tarea/,
      care: /Registrar cuidado|Nuevo registro/,
      years: /Nueva gestión/,
      journal: /Nueva entrada|Registrar actividad/,
      calendar: /Nuevo evento/,
      announcements: /Nuevo comunicado/,
      messages: /Nuevo mensaje/,
      grades: /Nueva nota/,
      gallery: /Subir foto|Nueva foto|Agregar foto/,
      materials: /Solicitar materiales|Nueva solicitud/,
      activities: /Nueva actividad|Crear actividad/,
      sites: /Nueva sede|Crear sede/,
      staffAttendance: /Configurar ubicación y reglas/,
    };
    let opened = 0;
    const openedForms: string[] = [];
    for (const route of routes) {
      await page.goto("/app/" + route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator(".loading-screen")).toHaveCount(0);
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
          { message: `desborde en ${route}` },
        )
        .toBe(true);
      if (!forms[route]) continue;
      const action = page
        .locator("main")
        .getByRole("button", { name: forms[route] })
        .first();
      if (!(await action.count())) continue;
      await action.click();
      const d = page.getByRole("dialog");
      if (!(await d.count())) continue;
      opened++;
      openedForms.push(route);
      await expect(d).toBeInViewport();
      await expect(d.locator(".modal-footer")).toBeInViewport();
      const b = d.locator(".modal-content");
      const scrollable = await b.evaluate(
        (e) => e.scrollHeight > e.clientHeight + 5,
      );
      if (scrollable) {
        await b.hover({ position: { x: 10, y: 20 } });
        await page.mouse.wheel(0, 900);
        await expect
          .poll(() => b.evaluate((e) => e.scrollTop), {
            message: `scroll en ${route}`,
          })
          .toBeGreaterThan(0);
      }
      await d.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(d).toHaveCount(0);
    }
    await test
      .info()
      .attach("recorrido-ux", {
        body: JSON.stringify({ width, routes, openedForms }),
        contentType: "application/json",
      });
    expect(opened).toBeGreaterThanOrEqual(8);
    expect(errors).toEqual([]);
  });
test("formularios protegen cambios, pasos obligatorios y selección de materias conserva el contexto", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/announcements");
  await page
    .getByRole("button", { name: "Nuevo comunicado", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await expect(
    d.getByRole("button", { name: "Guardar", exact: true }),
  ).toHaveCount(0);
  await d.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(d.getByRole("alert")).toBeVisible();
  const text = d.getByRole("textbox", { name: /^Título/ });
  await text.fill("Comunicado sin guardar");
  await d.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(d).toContainText("cambios sin guardar");
  await d.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(text).toHaveValue("Comunicado sin guardar");
  await d.getByRole("button", { name: "Cerrar", exact: true }).click();
  await d
    .getByRole("button", { name: "Descartar y cerrar", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await page.goto("/app/subjects?classroom=c4");
  const card = page.locator(".entity-card").first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Ver tareas", exact: true }).click();
  await expect(page).toHaveURL(/subject=/);
  const selectedSubject = new URL(page.url()).searchParams.get("subject")!;
  await expect(page.locator(".academic-filters select").nth(1)).toHaveValue(selectedSubject);
});

test("modal conserva acciones al reducir la altura disponible como ocurre con el teclado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/app/students");
  await page
    .getByRole("button", { name: "Inscribir estudiante", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await page.setViewportSize({ width: 390, height: 430 });
  await expect(d.locator(".modal-footer")).toBeInViewport();
  const body = d.locator(".modal-content");
  await body.hover({ position: { x: 10, y: 10 } });
  await page.mouse.wheel(0, 700);
  await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await expect(d.locator(".modal-footer")).toBeInViewport();
  await page.screenshot({ path: "/private/tmp/micole-modal-compacta.png" });
});
