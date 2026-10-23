import { test, expect } from "@playwright/test";
for (const width of [390, 1366])
  test(`planificación y revisión de primaria sin afectar inicial a ${width}px`, async ({
    page,
  }) => {
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ width, height: 850 });
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
      .selectOption("director");
    await page.goto("/app/bolivia");
    await expect(
      page.getByRole("heading", {
        name: "Gestión educativa Bolivia",
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await expect(page.locator(".bolivia-panel")).toContainText(
      "1.º Primaria B",
    );
    await page.getByRole("tab", { name: "POA y planificación" }).click();
    await page.getByRole("button", { name: "Crear POA", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Título/).fill("POA de primaria 2026");
    await dialog
      .getByLabel("Objetivo y resultados esperados")
      .fill("Mejorar la lectura y el razonamiento matemático");
    await dialog
      .getByLabel("Acciones, responsables y cronograma")
      .fill("Lectura diaria y actividades de seguimiento semanales");
    await dialog
      .getByLabel("Enviar a revisión de Dirección al guardar")
      .check();
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Pendiente de revisión", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revisar documento", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Decisión")
      .selectOption("approve");
    await page
      .getByRole("dialog")
      .getByLabel("Fundamento u observaciones")
      .fill("Plan y cronograma revisados por Dirección");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar revisión" })
      .click();
    await expect(page.getByText("Aprobado", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Editar y enviar", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "POA y planificación" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "POA y planificación" }).click();
    await expect(
      page.getByRole("heading", { name: "POA de primaria 2026" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({ path: `/private/tmp/micole-bolivia-${width}.png` });
  });
