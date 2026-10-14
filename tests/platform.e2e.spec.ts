import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
test.use({ reducedMotion: "reduce" });
const menu = async (page: Page, name: string) => {
  const opener = page.getByRole("button", { name: "Abrir menú", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("button", { name, exact: true })
    .click();
};
const admin = async (page: Page) => {
  await page.goto("/app/overview");
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await page
    .locator(".profile-menu")
    .getByRole("button", { name: "Superadministración", exact: true })
    .click();
};
test("superadmin tiene una navegación de plataforma y evita rutas operativas", async ({
  page,
}) => {
  await admin(page);
  await expect(
    page.getByRole("heading", { name: "Resumen de plataforma" }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", {
    name: "Navegación principal",
  });
  for (const name of [
    "Estudiantes",
    "Equipo docente",
    "Cuaderno digital",
    "Mensajes",
    "Mis hijos",
    "Agenda",
    "Pagos y mensualidades",
  ])
    await expect(
      navigation.getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
  await expect(
    navigation.getByRole("button", { name: "Soporte y probar roles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Instituciones", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/micole-platform-desktop.png",
    fullPage: true,
  });
  await menu(page, "Configuración");
  await expect(
    page.getByRole("heading", { name: "Integraciones de MiCole" }),
  ).toBeVisible();
  // El estado se valida al cambiar de rol: una ruta operativa no queda abierta.
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await page
    .locator(".profile-menu")
    .getByRole("button", { name: "Dirección", exact: true })
    .click();
  await menu(page, "Estudiantes");
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await page
    .locator(".profile-menu")
    .getByRole("button", { name: "Superadministración", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/overview$/);
});
test("soporte se abre con motivo y permite volver a plataforma", async ({
  page,
}) => {
  await admin(page);
  await menu(page, "Soporte y probar roles");
  await expect(
    page.getByRole("button", { name: "Entrar como Dirección" }),
  ).toBeDisabled();
  await page
    .getByLabel("Motivo de soporte")
    .fill("Revisar una inscripción de prueba");
  await page.getByRole("button", { name: "Entrar como Dirección" }).click();
  await expect(
    page.getByRole("region", { name: "Sesión de soporte" }),
  ).toContainText("Revisar una inscripción de prueba");
  await expect(page.getByLabel("Institución", { exact: true })).toBeDisabled();
  await menu(page, "Estudiantes");
  await expect(
    page.getByRole("heading", { name: "Estudiantes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Sesión de soporte" })
    .getByRole("button", { name: "Volver a superadmin" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resumen de plataforma" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Sesión de soporte" }),
  ).toHaveCount(0);
});
test("plataforma y soporte caben en tablet y celulares, con menú compacto", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await admin(page);
  for (const width of [1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const item of [
      "Resumen",
      "Instituciones",
      "Facturación MiCole",
      "Solicitudes de colegios",
      "Historial de cambios",
      "Configuración",
      "Soporte y probar roles",
    ]) {
      await menu(page, item);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${item} a ${width}px`,
      ).toBe(true);
    }
    await page.screenshot({
      path: `test-results/micole-platform-support-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByLabel("Motivo de soporte")
    .fill("Comprobar la navegación móvil");
  await page.getByRole("button", { name: "Entrar como Dirección" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await expect(page.locator(".sidebar-open")).toBeVisible();
  expect(
    await page
      .locator(".sidebar .micole-logo")
      .evaluate((e) => e.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(140);
  await page.screenshot({
    path: "test-results/micole-compact-mobile-menu.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar-open")).toHaveCount(0);
  expect(errors).toEqual([]);
});
