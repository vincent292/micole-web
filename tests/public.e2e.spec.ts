import { test, expect } from "@playwright/test";
test.use({ reducedMotion: "reduce" });
test("raíz pública con MiCole, precios y navegación hacia ingreso", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/"))
      privateRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Todo lo importante",
  );
  await expect(
    page.getByRole("img", { name: "MiCole", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegación de MiCole" }),
  ).toBeVisible();
  expect(privateRequests).toEqual([]);
  await expect(page.locator(".price")).toContainText("29");
  await expect(page.locator(".activation-fee")).toContainText("Bs 50");
  await page
    .getByRole("link", { name: "Quiero MiCole en mi institución" })
    .click();
  await expect(page).toHaveURL(/\/login\?intent=school/);
  await expect(
    page.getByRole("heading", { name: "Bienvenido a MiCole" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Abrir espacio de prueba" }).click();
  await expect(page).toHaveURL(/\/app\/overview/);
});
test("landing, FAQ y menú funcionan en celular, con las fuentes de marca", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page
      .getByRole("heading", { level: 1 })
      .evaluate((e) => getComputedStyle(e).fontFamily),
  ).toContain("Poppins");
  expect(
    await page.locator("body").evaluate((e) => getComputedStyle(e).fontFamily),
  ).toContain("Inter");
  await page.getByRole("button", { name: "Abrir menú público" }).click();
  await page
    .getByRole("navigation", { name: "Navegación de MiCole" })
    .getByRole("link", { name: "Preguntas", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "¿Cada familia ve únicamente a sus hijos?" })
    .click();
  await expect(page.locator("details[open]")).toContainText(
    "más de un responsable",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/micole-landing-mobile.png",
    fullPage: true,
  });
});
test("rutas previas se conservan y una ruta inexistente tiene regreso al inicio", async ({
  page,
}) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/\/app\/students/);
  await expect(
    page.getByRole("heading", { name: "Estudiantes", exact: true }),
  ).toBeVisible();
  await page.goto("/una-ruta-inexistente");
  await expect(
    page.getByRole("heading", { name: "Este camino no llega a tu cole." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Volver al inicio" }).click();
  await expect(page).toHaveURL("/");
});
