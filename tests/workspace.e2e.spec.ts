import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
test.use({ reducedMotion: "reduce" });
const navigate = async (page: Page, label: string) => {
  if (
    await page
      .getByRole("button", { name: "Abrir menú", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
};
const switchRole = async (page: Page, label: string) => {
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await page
    .locator(".profile-menu")
    .getByRole("button", { name: label, exact: true })
    .click();
};
test("inscripción, activación, plan y persistencia forman un flujo completo", async ({
  page,
}) => {
  await page.goto("/app/overview");
  await page
    .getByRole("button", { name: "Nueva inscripción", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombres", { exact: false }).fill("Luciana");
  await dialog.getByLabel("Apellidos", { exact: false }).fill("Prueba");
  await dialog.getByLabel("Fecha de nacimiento").fill("2023-05-02");
  await dialog.getByLabel("Aula", { exact: false }).selectOption("c1");
  await dialog.getByLabel("Número de CI del niño").fill("CI-LUCIANA-1");
  await dialog.getByLabel("Nombre completo de la madre").fill("Ana Prueba");
  await dialog.getByLabel("Correo de la madre").fill("ana@example.com");
  await dialog.getByLabel("Nombre completo del padre").fill("Pedro Prueba");
  await dialog.getByLabel("Correo del padre").fill("pedro@example.com");
  await dialog.getByLabel("Cuotas mensuales").selectOption("2");
  await dialog.getByLabel("Mensualidad fija").fill("420");
  await dialog.getByLabel("Merienda mensual").fill("60");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await navigate(page, "Estudiantes");
  let row = page.getByRole("row").filter({ hasText: "Luciana Prueba" });
  await expect(row).toContainText("Pendiente");
  await row.getByRole("button", { name: "Activar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("activación");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar" })
    .click();
  await switchRole(page, "Superadministración");
  await navigate(page, "Facturación MiCole");
  row = page
    .getByRole("row")
    .filter({ hasText: "Activación de Luciana Prueba" });
  await row.getByRole("button", { name: "Registrar pago" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Referencia o comprobante")
    .fill("REC-TEST-1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await switchRole(page, "Dirección");
  await navigate(page, "Estudiantes");
  row = page.getByRole("row").filter({ hasText: "Luciana Prueba" });
  await row.getByRole("button", { name: "Activar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(row).toContainText("Activo");
  await navigate(page, "Pagos y mensualidades");
  await expect(
    page.getByRole("row").filter({ hasText: "Luciana Prueba" }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("row").filter({ hasText: "Luciana Prueba" }).first(),
  ).toContainText("Bs 509");
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Luciana Prueba" }),
  ).toHaveCount(2);
});
test("familia completa ficha, manda permiso y la maestra responde; alumnos ajenos quedan fuera", async ({
  page,
}) => {
  await page.goto("/app/overview");
  await switchRole(page, "Familia");
  await expect(
    page.getByRole("heading", { name: "Mis hijos", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Completar ficha", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Alergias", { exact: false }).fill("Ninguna");
  await dialog.getByLabel("Alimentos que no puede comer").fill("Ninguno");
  await dialog.getByLabel("Contacto de emergencia").fill("Abuela");
  await dialog.getByLabel("Teléfono de emergencia").fill("70000000");
  await dialog.getByLabel("¿Tiene seguro?").selectOption("false");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("button", { name: "Documentos", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Subir documento" }),
  ).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .first()
    .click();
  await navigate(page, "Permisos y recogidas");
  await page.getByRole("button", { name: "Solicitar permiso" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Motivo o mensaje" })
    .fill("Control médico");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(page.locator(".request-row")).toContainText("Control médico");
  await switchRole(page, "Docente");
  await navigate(page, "Estudiantes");
  await expect(
    page.getByRole("row").filter({ hasText: "Emma Rivera" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Mateo García" }),
  ).toHaveCount(1);
  await navigate(page, "Permisos y recogidas");
  await page.getByRole("button", { name: "Revisar solicitud" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Mensaje para la familia")
    .fill("Gracias por avisar");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await switchRole(page, "Familia");
  await navigate(page, "Permisos y recogidas");
  await expect(page.locator(".request-row")).toContainText("Aprobado");
  await expect(page.locator(".request-row")).toContainText(
    "Gracias por avisar",
  );
  await navigate(page, "Mensajes");
  await page
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill("¿Cómo estuvo Sofía hoy?");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator(".chat-message")).toContainText(
    "¿Cómo estuvo Sofía hoy?",
  );
  await expect(page.getByLabel("Mi hijo").locator("option")).toHaveCount(1);
});
test("rediseño en escritorio y móvil sin errores ni desbordamiento", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/overview");
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const label of [
    "Estudiantes",
    "Equipo docente",
    "Aulas y cursos",
    "Pagos y mensualidades",
    "Cuaderno digital",
    "Agenda",
    "Comunicados",
    "Mensajes",
    "Permisos y recogidas",
    "Notas y recomendaciones",
    "Galería",
    "Materiales",
    "Configuración",
  ]) {
    await navigate(page, label);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      label,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("tarifas por alumno, descuentos y publicación por aula funcionan desde los formularios", async ({
  page,
}) => {
  await page.goto("/app/overview");
  await navigate(page, "Pagos y mensualidades");
  await page.getByRole("button", { name: "Crear plan de pagos" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Estudiante", { exact: false }).selectOption("a6");
  await expect(dialog.getByLabel("Mensualidad fija")).toHaveValue("520");
  await dialog.getByLabel("Fecha de inicio").fill("2026-11-01");
  await dialog.getByLabel("Cuotas mensuales").selectOption("2");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  const november = page
    .getByRole("row")
    .filter({ hasText: "Mensualidad noviembre" });
  await november.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByRole("button", { name: /Registrar cobro/ }).click();
  await page.getByRole("dialog").getByLabel("Referencia o número de recibo").fill("REC-DESCUENTO");
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar y generar recibo" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await navigate(page, "Pagos y mensualidades");
  await page.getByRole("button", { name: "Ajustar descuento" }).click();
  await page.getByRole("dialog").getByLabel("Descuento por cuota").fill("50");
  await page.getByRole("dialog").getByLabel("Vigente desde").fill("2026-11-01");
  await page.getByRole("dialog").getByLabel("Vigente hasta").fill("2027-01-01");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(november).toContainText("Bs 549");
  await expect(
    page.getByRole("row").filter({ hasText: "Mensualidad diciembre" }),
  ).toContainText("Bs 499");
  await switchRole(page, "Docente");
  await navigate(page, "Cuaderno digital");
  await page.getByRole("button", { name: "Nueva entrada" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Estudiante o aula")
    .selectOption("class:c1");
  await page
    .getByRole("dialog")
    .getByLabel("¿Qué pasó hoy?")
    .fill("Descubrimos formas jugando juntos");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(
    page
      .locator(".journal-entry")
      .filter({ hasText: "Descubrimos formas jugando juntos" }),
  ).toHaveCount(2);
  await navigate(page, "Comunicados");
  await page.getByRole("button", { name: "Nuevo comunicado" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Título")
    .fill("Aviso solo para Nidito");
  await page
    .getByRole("dialog")
    .getByLabel("Comunicado", { exact: true })
    .fill("Traer acuarelas");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(
    page
      .locator(".announcement-card")
      .filter({ hasText: "Aviso solo para Nidito" }),
  ).toContainText("Nidito A");
});
