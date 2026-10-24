import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, role = "teacher") {
  await page.goto("/");
  await page
    .getByLabel("Correo de acceso", { exact: true })
    .fill("invitado@example.test");
  await page
    .getByLabel("Clave de acceso", { exact: true })
    .fill("AccesoLocalSoloPruebas!");
  await page
    .getByRole("button", { name: "Entrar a la demo", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption(role);
}
test("aula reúne jornada; corrección requiere Dirección y se refleja a la familia", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await login(page);
  await page.goto("/app/classrooms?classroom=c1");
  await expect(
    page.getByRole("heading", { name: "Tu jornada en el aula", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pasar lista", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Marcar pendientes como presentes",
      exact: true,
    })
    .click();
  await page
    .locator(".attendance-row")
    .first()
    .getByRole("combobox")
    .selectOption("absent");
  await page
    .getByRole("button", { name: "Revisar y confirmar", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar y avisar", exact: true })
    .click();
  await expect(
    page.locator(".attendance-row").first().getByRole("combobox"),
  ).toBeDisabled();
  await page
    .locator("summary")
    .filter({ hasText: "Correcciones de asistencia" })
    .click();
  await page
    .getByRole("button", { name: "Solicitar corrección", exact: true })
    .click();
  let modal = page.getByRole("dialog");
  await modal
    .getByRole("combobox", { name: /^Estado propuesto/ })
    .selectOption("late");
  await modal
    .getByLabel(/^Motivo para Dirección/)
    .fill("Se marcó falta por equivocación");
  await modal
    .getByRole("button", { name: "Enviar a Dirección", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Revisar solicitud", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption("director");
  await page.goto("/app/studentAttendance");
  await page
    .locator("summary")
    .filter({ hasText: "Correcciones de asistencia" })
    .click();
  await page
    .getByRole("button", { name: "Revisar solicitud", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal
    .getByRole("combobox", { name: /^Decisión/ })
    .selectOption("approved");
  await modal
    .getByLabel(/^Motivo de la decisión/)
    .fill("Verificado con la docente del aula");
  await modal
    .getByRole("button", { name: "Confirmar decisión", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption("guardian");
  await page.goto("/app/studentAttendance");
  await expect(page.locator(".attendance-history")).toContainText("Tardanza");
  await expect(
    page.getByText("Corrección aprobada por Dirección", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toContain(
    "Se marcó falta por equivocación",
  );
});
test("salida gratuita obtiene respuesta explícita sin inferirla de participación", async ({
  page,
}) => {
  await login(page, "director");
  await page.goto("/app/activities");
  await page
    .getByRole("button", { name: "Crear actividad", exact: true })
    .click();
  let modal = page.getByRole("dialog");
  await modal.getByRole("combobox", { name: /^Aula/ }).selectOption("c1");
  await modal.getByLabel(/^Título/).fill("Paseo de prueba con autorización");
  await modal
    .getByLabel("Lista o descripción", { exact: true })
    .fill("Recorrido pedagógico que necesita autorización familiar.");
  await modal
    .getByRole("button", { name: "Enviar a revisión", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  const card = page
    .locator(".entity-card")
    .filter({ hasText: "Paseo de prueba con autorización" });
  await card
    .getByRole("button", { name: "Aprobar y publicar", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Aprobar y publicar", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption("guardian");
  await page.goto("/app/activities");
  await page
    .locator(".entity-card")
    .filter({ hasText: "Paseo de prueba con autorización" })
    .getByRole("button", { name: "Ver autorizaciones y cobros", exact: true })
    .click();
  await expect(
    page.getByText("Autorización pendiente", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No autorizo", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal
    .getByLabel("Motivo de no autorización", { exact: true })
    .fill("Ese día tiene una cita familiar");
  await modal.getByRole("button", { name: "No autorizo", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("cell").filter({ hasText: "No autorizado por la familia" }),
  ).toBeVisible();
});
