import {showFormSection} from './form-sections';
import { test, expect } from "@playwright/test";
test.use({ reducedMotion: "reduce" });
test("Dirección registra padres, comparte ficha móvil y aprueba cuidados sin cambiar pagos", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/students");
  await page
    .getByRole("button", { name: "Inscribir estudiante", exact: true })
    .click();
  let modal = page.getByRole("dialog");
  await showFormSection(page,'Nombres'); await modal.getByLabel("Nombres", { exact: false }).fill("Valeria");
  await showFormSection(page,'Apellidos'); await modal.getByLabel("Apellidos", { exact: false }).fill("Familia Prueba");
  await showFormSection(page,'Fecha de nacimiento'); await modal.getByLabel("Fecha de nacimiento").fill("2023-02-01");
  await showFormSection(page,'Aula'); await modal.getByLabel("Aula", { exact: false }).selectOption("c1");
  await showFormSection(page,'Número de CI del niño'); await modal.getByLabel("Número de CI del niño").fill("CI-VALERIA-1");
  await showFormSection(page,'Nombre completo de la madre'); await modal
    .getByLabel("Nombre completo de la madre")
    .fill("Daniela Martínez");
  await showFormSection(page,'Correo de la madre'); await modal.getByLabel("Correo de la madre").fill("daniela@example.com");
  await showFormSection(page,'Nombre completo del padre'); await modal.getByLabel("Nombre completo del padre").fill("Fernando Prueba");
  await showFormSection(page,'Correo del padre'); await modal.getByLabel("Correo del padre").fill("fernando@example.com");
  await showFormSection(page,'Mensualidad fija'); await modal.getByLabel("Mensualidad fija").fill("490");
  await modal.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(modal).toBeHidden();
  let row = page.getByRole("row").filter({ hasText: "Valeria Familia Prueba" });
  await row.getByRole("button", { name: "Ficha familiar y WhatsApp" }).click();
  modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Crear enlace de ficha" }).click();
  const link = await modal.getByLabel("Enlace de ficha familiar").inputValue();
  expect(link).toMatch(/\/inscripcion\/[a-f0-9]{64}$/);
  await expect(
    modal.getByRole("link", { name: "Compartir por WhatsApp" }),
  ).toHaveAttribute("href", /^https:\/\/wa.me\/\?text=/);
  const parent = await context.newPage();
  parent.on("pageerror", (e) => errors.push(e.message));
  await parent.setViewportSize({ width: 390, height: 844 });
  await parent.goto(link);
  await expect(
    parent.getByRole("heading", { name: "Ayúdanos a cuidar a Valeria" }),
  ).toBeVisible();
  await parent.getByLabel("Alergias", { exact: false }).fill("Leche");
  await parent.getByLabel("Alimentos que no puede comer").fill("Lácteos");
  await parent.getByLabel("¿Tiene seguro?").selectOption("true");
  await parent.getByLabel("Entidad del seguro").fill("Seguro Prueba");
  await parent
    .getByLabel("Contacto de emergencia", { exact: false })
    .fill("Abuela María");
  await parent
    .getByLabel("Teléfono de emergencia", { exact: false })
    .fill("70000000");
  await parent.getByLabel("Segundo contacto (opcional)").fill("Tío Luis");
  await parent.getByLabel("Segundo teléfono (opcional)").fill("71111111");
  await parent.getByRole("checkbox").check();
  expect(
    await parent.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await parent.screenshot({
    path: "test-results/micole-family-intake-mobile.png",
    fullPage: true,
  });
  await parent
    .getByRole("button", { name: "Enviar ficha a Dirección" })
    .click();
  await expect(
    parent.getByRole("heading", { name: "Ficha recibida" }),
  ).toBeVisible();
  await parent.reload();
  await expect(
    parent.getByRole("heading", { name: "Ficha recibida" }),
  ).toBeVisible();
  await page.goto("/app/students");
  row = page.getByRole("row").filter({ hasText: "Valeria Familia Prueba" });
  await expect(row).toContainText("Ficha por revisar");
  await row.getByRole("button", { name: "Ficha familiar y WhatsApp" }).click();
  modal = page.getByRole("dialog");
  await expect(modal).toContainText("Leche");
  await expect(modal).toContainText("Seguro Prueba");
  await modal
    .getByRole("button", { name: "Aprobar y completar ficha" })
    .click();
  await expect(modal).toContainText("Ficha aprobada");
  await modal
    .getByRole("button", { name: "Cerrar", exact: true })
    .first()
    .click();
  await expect(row).toContainText("Cuidados completos");
  await expect(row).toContainText("Bs 490");
  await expect(row).toContainText("Pendiente");
  await row.getByRole("button", { name: "Documentos del estudiante" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Certificado de nacimiento",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await page
    .locator(".profile-menu")
    .getByRole("button", { name: "Familia", exact: true })
    .click();
  await expect(page.getByLabel("Mi hijo").locator("option")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("un enlace inválido no abre la ficha ni solicita ingreso", async ({
  page,
}) => {
  await page.goto("/inscripcion/no-es-un-token");
  await expect(
    page.getByRole("heading", { name: "La ficha no está disponible" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test.describe("ficha conectada", () => {
  test.use({ baseURL: "http://localhost:4174" });
  test("el formulario utiliza únicamente RPC públicos y envía solo cuidados", async ({
    page,
  }) => {
    const calls: string[] = [];
    let submitted = false;
    await page.route("**/rest/v1/**", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
      calls.push(name);
      if (name === "family_intake_context")
        await route.fulfill({
          json: {
            schoolName: "Colegio Prueba",
            childName: "Lucía",
            recipient: "mother",
            status: submitted ? "submitted" : "open",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        });
      else if (name === "submit_family_intake") {
        const params = route.request().postDataJSON();
        expect(params.p_profile).toMatchObject({
          allergies: "Ninguna",
          foodRestrictions: "Ninguno",
          hasInsurance: false,
          emergencyContact: "Madre",
          emergencyPhone: "70000000",
        });
        expect(params.p_profile.monthlyFee).toBeUndefined();
        submitted = true;
        await route.fulfill({ json: null });
      } else {
        await route.abort();
      }
    });
    await page.goto(`/inscripcion/${"a".repeat(64)}`);
    await showFormSection(page,'Alergias'); await page.getByLabel("Alergias", { exact: false }).fill("Ninguna");
    await showFormSection(page,'Alimentos que no puede comer'); await page.getByLabel("Alimentos que no puede comer").fill("Ninguno");
    await showFormSection(page,'¿Tiene seguro?'); await page.getByLabel("¿Tiene seguro?").selectOption("false");
    await showFormSection(page,'Contacto de emergencia'); await page
      .getByLabel("Contacto de emergencia", { exact: false })
      .fill("Madre");
    await showFormSection(page,'Teléfono de emergencia'); await page
      .getByLabel("Teléfono de emergencia", { exact: false })
      .fill("70000000");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Enviar ficha a Dirección" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ficha recibida" }),
    ).toBeVisible();
    expect([...new Set(calls)]).toEqual([
      "family_intake_context",
      "submit_family_intake",
    ]);
  });
});
