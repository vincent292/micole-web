import { test, expect, type Page } from "@playwright/test";
test.setTimeout(30000);
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
function olderMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 2);
  return d.toISOString().slice(0, 7);
}
test("Dirección corrige asistencia, prepara y aprueba una boleta que el docente consulta", async ({
  page,
}) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (/supabase|firebase|googleapis|baneco/i.test(r.url()))
      outside.push(r.url());
  });
  await login(page);
  const month = olderMonth();
  const day = month + "-17";
  await page.goto("/app/staffAttendance");
  await page.getByLabel("Mes", { exact: true }).fill(month);
  await page
    .getByRole("button", { name: "Registrar corrección", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const teacher = await dialog
    .getByRole("combobox", { name: "Docente de la corrección", exact: true })
    .inputValue();
  await dialog.getByLabel("Entrada · hora Bolivia").fill(day + "T08:15");
  await dialog.getByLabel("Salida · hora Bolivia").fill(day + "T16:00");
  await dialog
    .getByLabel("Motivo y respaldo de la corrección")
    .fill("Prueba de marcación revisada por Dirección");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("main")).toContainText("15 min de tardanza");
  await page.goto("/app/staffPayroll");
  await page.getByLabel("Mes", { exact: true }).fill(month);
  await page
    .getByRole("combobox", { name: "Docente", exact: true })
    .selectOption(teacher);
  await page
    .getByRole("button", { name: "Preparar boleta", exact: true })
    .click();
  await page.getByRole("button", { name: "Ver boleta", exact: true }).click();
  await expect(dialog).toContainText("2.990");
  await dialog
    .getByRole("button", { name: "Agregar concepto", exact: true })
    .click();
  await dialog.getByLabel("Concepto", { exact: true }).fill("Bono de prueba");
  await dialog.getByLabel("Importe · Bs", { exact: true }).fill("100");
  await dialog
    .getByRole("button", { name: "Guardar conceptos", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Ver boleta", exact: true }).click();
  await expect(dialog).toContainText("3.090");
  await dialog.getByRole("checkbox", { name: /He revisado/ }).check();
  await dialog
    .getByRole("button", { name: "Aprobar boleta", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Aprobada");
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption("teacher");
  await page.goto("/app/staffPayroll");
  await page.getByLabel("Mes", { exact: true }).fill(month);
  await expect(
    page.getByRole("button", { name: "Ver boleta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preparar boleta", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver boleta", exact: true }).click();
  await expect(dialog).toContainText("3.090");
  await expect(
    dialog.getByRole("button", { name: "Aprobar boleta", exact: true }),
  ).toHaveCount(0);
  expect(outside).toEqual([]);
});
test("Docente marca entrada y salida simuladas sin solicitar ubicación real", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = () => {
      throw new Error("La demo no debe solicitar GPS real.");
    };
  });
  await login(page, "teacher");
  await page.goto("/app/staffAttendance");
  await page
    .getByRole("button", { name: "Marcar entrada", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Marcar salida", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Marcar salida", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Marcar entrada", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("Turno cerrado");
});
for (const width of [390, 1024])
  test(`formulario de horario se desplaza y conserva sus pasos a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page);
    await page.goto("/app/staffAttendance");
    await page
      .getByRole("button", { name: "Editar horario y sueldo", exact: true })
      .first()
      .click();
    const d = page.getByRole("dialog");
    await expect(
      d.getByRole("button", { name: "Guardar", exact: true }),
    ).toHaveCount(0);
    await d.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(
      d.getByRole("button", { name: "Agregar turno", exact: true }),
    ).toBeVisible();
    const content = d.locator(".modal-content");
    await content.hover({ position: { x: 10, y: 50 } });
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => content.evaluate((e) => e.scrollTop))
      .toBeGreaterThan(0);
    await expect(
      d.getByRole("button", { name: "Guardar", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `/private/tmp/micole-staff-schedule-${width}.png`,
      fullPage: true,
    });
  });
