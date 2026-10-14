import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const navigate = async (page: Page, name: string) => {
  const opener = page.getByRole("button", { name: "Abrir menú", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("button", { name, exact: true })
    .click();
};

const switchRole = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await page
    .locator(".profile-menu")
    .getByRole("button", { name, exact: true })
    .click();
};

const setOctober = async (page: Page) => {
  await page.getByLabel("Desde", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Hasta", { exact: true }).fill("2026-10-31");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
};

const openReport = async (page: Page, platform = false) => {
  await page.clock.setFixedTime(new Date("2026-10-14T16:00:00Z"));
  await page.goto("/app/overview");
  if (platform) await switchRole(page, "Superadministración");
  await navigate(page, "Reportes");
  await expect(
    page.getByRole("heading", {
      name: platform ? "Ingresos de MiCole" : "Finanzas de tu colegio",
      exact: true,
    }),
  ).toBeVisible();
  await setOctober(page);
};

const tab = (page: Page, name: string) =>
  page.locator(".financial-report").getByRole("tab", { name: new RegExp(`^${name}(?:\\s*\\d+)?$`) });
const rows = (page: Page) => page.getByTestId("report-row");

// The seed has actual dated charges; the assertions distinguish due amounts
// from cash movements and exercise the user's filters instead of fake data.
test.describe("Reportes financieros", () => {
  test.use({ reducedMotion: "reduce" });

  test("Dirección filtra importes por curso y período sin mezclar colegios", async ({
    page,
  }) => {
    await openReport(page);
    await expect(page.getByTestId("report-issued")).toContainText("Bs 2.520");
    await expect(page.getByTestId("report-collected")).toContainText("Bs 1.420");
    await expect(page.getByTestId("report-outstanding")).toContainText("Bs 1.100");
    await expect(page.getByTestId("report-overdue")).toContainText("Bs 420");
    await expect(page.locator(".financial-report")).not.toContainText("Diego Salinas");

    await page.getByRole("combobox", { name: "Curso actual", exact: true }).selectOption("c1");
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await expect(page.getByTestId("report-issued")).toContainText("Bs 840");
    await expect(page.getByTestId("report-collected")).toContainText("Bs 420");
    await expect(page.getByTestId("report-outstanding")).toContainText("Bs 420");
    await tab(page, "Cuotas").click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: "Mateo García" })).toHaveCount(1);
    await expect(rows(page).filter({ hasText: "Emma Rivera" })).toHaveCount(0);

    await page.getByLabel("Desde", { exact: true }).fill("2026-11-01");
    await page.getByLabel("Hasta", { exact: true }).fill("2026-11-30");
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await expect(rows(page)).toHaveCount(0);
    await tab(page, "Resumen").click();
    await expect(page.getByTestId("report-issued")).toContainText("Bs 0");
  });

  test("cuotas filtra por estado y búsqueda y exporta las filas visibles", async ({
    page,
  }) => {
    await openReport(page);
    await tab(page, "Cuotas").click();
    await expect(rows(page)).toHaveCount(6);
    await page.getByLabel("Estado de cuota", { exact: true }).selectOption("paid");
    await expect(rows(page)).toHaveCount(3);
    await page.getByPlaceholder("Buscar concepto o estudiante").fill("Sofía");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Sofía Martínez");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    let csv = "";
    for await (const chunk of stream!) csv += chunk.toString();
    expect(csv).toMatch(/concepto/i);
    expect(csv).toContain("Sofía Martínez");
    expect(csv).toContain("Mensualidad octubre");
    expect(csv).not.toContain("Mateo García");
    expect(csv).not.toContain("Diego Salinas");
    expect(csv.trim().split(/\r?\n/).length).toBeGreaterThanOrEqual(2);

    await page.evaluate(() => {
      window.print = () => { document.documentElement.dataset.reportPrinted = "yes"; };
    });
    await page.getByRole("button", { name: "Imprimir / Guardar PDF", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-report-printed", "yes");
  });

  test("morosos abre el estado de cuenta y movimientos separa el dinero cobrado", async ({
    page,
  }) => {
    await openReport(page);
    await tab(page, "Morosos").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Mateo García");
    await expect(rows(page)).toContainText("Bs 420");
    await page.getByRole("button", { name: "Ver estado de cuenta", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Estudiante", exact: true })).toHaveValue("a2");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Mensualidad octubre");
    await expect(rows(page)).toContainText("Mateo García");
    await expect(rows(page)).not.toContainText("Sofía Martínez");

    await page.getByRole("combobox", { name: "Estudiante", exact: true }).selectOption("");
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await tab(page, "Movimientos").click();
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).filter({ hasText: "Sofía Martínez" })).toHaveCount(1);
    await expect(rows(page).filter({ hasText: "Mateo García" })).toHaveCount(0);
  });

  test("superadmin informa licencias por institución sin mostrar fichas de alumnos", async ({
    page,
  }) => {
    await openReport(page, true);
    await expect(page.getByTestId("report-issued")).toContainText("Bs 253");
    await expect(page.getByTestId("report-collected")).toContainText("Bs 58");
    await expect(page.getByTestId("report-outstanding")).toContainText("Bs 195");
    await expect(page.getByRole("combobox", { name: "Curso actual", exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Estudiante", exact: true })).toHaveCount(0);
    await expect(tab(page, "Morosos")).toHaveCount(0);
    await tab(page, "Licencias").click();
    await expect(rows(page)).toHaveCount(3);
    for (const child of ["Isabella López", "Sofía Martínez", "Diego Salinas"])
      await expect(page.locator(".financial-report")).not.toContainText(child);

    await page.getByRole("combobox", { name: "Institución del reporte", exact: true }).selectOption("s2");
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Colegio Horizonte");
    await expect(rows(page)).not.toContainText("Pinitos Montessori");
    await page.getByPlaceholder("Buscar concepto o institución").fill("no existe");
    await expect(rows(page)).toHaveCount(0);
    await page.getByPlaceholder("Buscar concepto o institución").fill("Horizonte");
    await expect(rows(page)).toHaveCount(1);
    await tab(page, "Resumen").click();
    await expect(page.getByTestId("report-issued")).toContainText("Bs 58");
  });

  test("Docente no accede al reporte al cambiar de rol ni mediante la URL", async ({
    page,
  }) => {
    await openReport(page);
    await switchRole(page, "Docente");
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(
      page.getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Reportes", exact: true }),
    ).toHaveCount(0);
    // Keep the same SPA identity; a hard reload resets the local role selector.
    await page.evaluate(() => {
      history.pushState(null, "", "/app/reports");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(page.locator(".financial-report")).toHaveCount(0);
  });

  test("reportes caben en teléfonos y tablet, sin errores y con movimiento reducido", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openReport(page);
    await expect(page.locator(".workspace-page")).toHaveCSS("animation-name", "none");
    await expect(page.getByTestId("report-issued")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "test-results/micole-reports-desktop.png", fullPage: true });
    for (const width of [320, 360, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ["Resumen", "Cuotas", "Movimientos", "Morosos"]) {
        await tab(page, name).click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `Dirección / ${name} a ${width}px`,
        ).toBe(true);
      }
      if (width === 390) {
        await tab(page, "Resumen").click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: "test-results/micole-reports-mobile.png", fullPage: true });
      }
    }
    await switchRole(page, "Superadministración");
    await navigate(page, "Reportes");
    await setOctober(page);
    for (const width of [320, 360, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ["Resumen", "Licencias", "Movimientos"]) {
        await tab(page, name).click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `Plataforma / ${name} a ${width}px`,
        ).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  });
});

test("las entradas animadas terminan y dejan el reporte disponible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openReport(page);
  const container = page.locator(".workspace-page");
  await expect(container).toHaveCSS("animation-name", "micole-page-in");
  await expect(container).toHaveCSS("animation-iteration-count", "1");
  const duration = await container.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeGreaterThan(0);
  expect(duration).toBeLessThan(1);
  await expect(container).toHaveCSS("opacity", "1");
  await expect.poll(() => container.evaluate((element) =>
    element.getAnimations().every((animation) => animation.playState === "finished"),
  )).toBe(true);
  expect(await container.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return transform === "none" || new DOMMatrix(transform).isIdentity;
  })).toBe(true);
  await tab(page, "Cuotas").click();
  await expect(rows(page)).toHaveCount(6);
  expect(errors).toEqual([]);
});
