import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });
const logo = {
  name: "institucion.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9iUAAAAASUVORK5CYII=", "base64"),
};

async function menu(page: Page, name: string) {
  await expect(page.getByRole("button", { name: "Menú de perfil" })).toBeVisible();
  const opener = page.getByRole("button", { name: "Abrir menú", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name, exact: true }).click();
}
async function admin(page: Page) {
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await page.locator(".profile-menu").getByRole("button", { name: "Superadministración", exact: true }).click();
}

test("superadmin crea y edita identidad completa, conserva el logo y puede ocultar la institución", async ({ page }) => {
  await page.goto("/app/overview");
  await admin(page);
  await menu(page, "Instituciones");
  await page.getByRole("button", { name: "Nueva institución", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre de la institución").fill("Colegio Nueva Comunidad");
  await dialog.getByLabel("Ciudad", { exact: false }).fill("Tarija");
  await dialog.getByLabel("Nombre de la directora").fill("Ana Paredes");
  await dialog.getByLabel("NIT (opcional)").fill("1234567890");
  await dialog.getByLabel("Dirección de la institución").fill("Av. Las Américas 120");
  await dialog.getByLabel("Teléfono de la institución").fill("+591 70001234");
  await dialog.getByLabel("Sitio web (opcional)").fill("https://colegio.example.com");
  await dialog.locator('input[name="logoFile"]').setInputFiles(logo);
  await expect(dialog.getByAltText("Vista previa del logo de la institución")).toHaveAttribute("src", /^blob:/);
  await expect(dialog.getByLabel("Mostrar institución en la página de MiCole")).toBeChecked();
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  let card = page.locator(".institution-card").filter({ hasText: "Colegio Nueva Comunidad" });
  await expect(card).toContainText("1234567890");
  await expect(card).toContainText("Av. Las Américas 120");
  await expect(card).toContainText("Pendiente");
  await expect(card.getByRole("link", { name: "Visitar sitio web" })).toHaveAttribute("href", "https://colegio.example.com");
  await expect(card.getByAltText("Logo de Colegio Nueva Comunidad")).toHaveAttribute("src", /^data:image\/png;base64,/);

  await card.getByRole("button", { name: "Editar institución" }).click();
  await dialog.getByLabel("Dirección de la institución").fill("Calle Familia 55");
  await dialog.getByLabel("Mostrar institución en la página de MiCole").uncheck();
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Oculta en la página de MiCole");
  await expect(card.getByAltText("Logo de Colegio Nueva Comunidad")).toHaveAttribute("src", /^data:image\/png;base64,/);

  await page.reload();
  await admin(page);
  await menu(page, "Instituciones");
  card = page.locator(".institution-card").filter({ hasText: "Colegio Nueva Comunidad" });
  await expect(card).toContainText("Calle Familia 55");
  await expect(card).toContainText("Oculta en la página de MiCole");
  await card.getByRole("button", { name: "Editar institución" }).click();
  await expect(dialog.getByLabel("NIT (opcional)")).toHaveValue("1234567890");
  await dialog.getByLabel("Quitar logo y usar las iniciales").check();
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card.locator("img")).toHaveCount(0);
  await expect(card.locator(".school-symbol")).toContainText("CN");
});

test("Dirección actualiza identidad, valida archivos y HTTPS y conserva cambios en celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/overview");
  await menu(page, "Configuración");
  await page.getByRole("button", { name: "Editar identidad" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("NIT (opcional)").fill("987654321");
  await dialog.getByLabel("Dirección de la institución").fill("Zona Central, Calle 5");
  await dialog.getByLabel("Teléfono de la institución").fill("76543210");
  await dialog.getByLabel("Sitio web (opcional)").fill("http://escuela.example.com");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("HTTPS");
  await dialog.getByLabel("Sitio web (opcional)").fill("https://escuela.example.com");
  await dialog.locator('input[name="logoFile"]').setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg />") });
  await expect(dialog.getByRole("alert").filter({ hasText: "JPG, PNG o WebP" })).toBeVisible();
  await dialog.locator('input[name="logoFile"]').setInputFiles(logo);
  await expect(dialog.getByAltText("Vista previa del logo de la institución")).toHaveAttribute("src", /^blob:/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  const panel = page.locator(".settings-grid > .panel").first();
  await expect(panel).toContainText("987654321");
  await expect(panel).toContainText("Zona Central, Calle 5");
  await expect(panel).toContainText("Visible en la página de MiCole");

  await page.getByRole("button", { name: "Editar identidad" }).click();
  await expect(dialog.getByLabel("NIT (opcional)")).toHaveValue("987654321");
  await expect(dialog.getByLabel("Sitio web (opcional)")).toHaveValue("https://escuela.example.com");
  await dialog.getByLabel("Mostrar institución en la página de MiCole").uncheck();
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await menu(page, "Configuración");
  await expect(panel).toContainText("Oculta en la página de MiCole");
  await expect(panel.getByRole("img", { name: /^Logo de/ })).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
