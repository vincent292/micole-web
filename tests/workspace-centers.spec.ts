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
for (const width of [390, 768, 1366])
  test(`aula mantiene contexto y expediente agrupa un solo alumno a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await login(page);
    await page.goto("/app/classrooms?classroom=c4&tab=students");
    await expect(page.locator(".focus-heading h2")).toHaveText(
      "1.º Primaria B",
    );
    await page.screenshot({path:`/private/tmp/micole-centers/aula-${width}.png`});
    const students = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("micole_public_demo_v1") || "{}",
      ).students.filter((s: any) => s.classroomId === "c4"),
    );
    await page
      .getByRole("navigation", { name: "Trabajo del aula" })
      .getByRole("button", { name: "Materias", exact: true })
      .click();
    await expect(page).toHaveURL(/classroom=c4.*tab=subjects/);
    await expect(page.locator(".focus-heading h2")).toHaveText(
      "1.º Primaria B",
    );
    await page
      .getByRole("navigation", { name: "Trabajo del aula" })
      .getByRole("button", { name: "Calendario", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar evento", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("combobox", { name: "Aula", exact: true }),
    ).toHaveValue("c4");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cerrar", exact: true })
      .click();
    await page.goto(`/app/studentRecord?student=${students[0].id}`);
    await expect(page.locator(".focus-heading h2")).toHaveText(
      `${students[0].firstName} ${students[0].lastName}`,
    );
    await page
      .getByRole("navigation", { name: "Expediente del alumno" })
      .getByRole("button", { name: "Salud y emergencias", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Salud y emergencias", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Expediente del alumno" })
      .getByRole("button", { name: "Cuotas y recibos", exact: true })
      .click();
    expect(await page.locator("main").innerText()).not.toContain(
      students[1]?.firstName + " " + students[1]?.lastName,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
test("docente ve su expediente sin documentos ni finanzas y rechaza otra aula", async ({
  page,
}) => {
  await login(page, "teacher");
  await page.goto("/app/studentRecord?student=a1");
  const tabs = page.getByRole("navigation", { name: "Expediente del alumno" });
  await expect(tabs).toBeVisible();
  await expect(
    tabs.getByRole("button", { name: "Facturas", exact: true }),
  ).toHaveCount(0);
  await expect(
    tabs.getByRole("button", { name: "Documentos", exact: true }),
  ).toHaveCount(0);
  await expect(
    tabs.getByRole("button", { name: "Cuotas y recibos", exact: true }),
  ).toHaveCount(0);
  await page.goto("/app/classrooms?classroom=otra-sede");
  await expect(
    page.getByText("Aula no disponible", { exact: true }),
  ).toBeVisible();
});
test("inicio familiar con deuda permite expediente y bloquea seguimiento académico", async ({
  page,
}) => {
  await login(page, "guardian");
  await page.evaluate(() => {
    const k = "micole_public_demo_v1",
      d = JSON.parse(localStorage.getItem(k) || "{}");
    d.charges.push({
      id: "overdue-for-record",
      schoolId: "s1",
      studentId: "a1",
      concept: "Cuota pendiente",
      amount: 900,
      paidAmount: 0,
      status: "overdue",
      dueDate: "2020-01-01",
    });
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.goto("/app/overview");
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Ficha de mi hijo/ }).click();
  await page
    .getByRole("navigation", { name: "Expediente del alumno" })
    .getByRole("button", { name: "Seguimiento", exact: true })
    .click();
  await expect(
    page.getByText("Seguimiento académico pendiente de habilitación", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Expediente del alumno" })
    .getByRole("button", { name: "Salud y emergencias", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Salud y emergencias", exact: true }),
  ).toBeVisible();
});
