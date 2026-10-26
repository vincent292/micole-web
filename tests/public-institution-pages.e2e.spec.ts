import { test, expect, type Page, type Request } from "@playwright/test";
import { showFormSection } from "./form-sections";

test.use({ baseURL: "http://localhost:4174", reducedMotion: "reduce" });
const institution = {
  id: "26000000-0000-4000-8000-000000000020", slug: "pequenos-pasos", name: "Guardería Pequeños Pasos", city: "La Paz",
  logoUrl: "", bannerUrl: "", color: "#4f937a", siteName: "Sede Sopocachi", educationLevels: ["Guardería", "Inicial"],
  website: "https://pequenos-pasos.example.org", description: "Un espacio para descubrir, jugar y aprender juntos.\nAcompañamos cada etapa con cariño, respetando el ritmo de cada niño y trabajando cerca de su familia.",
  phone: "+591 70001234", address: "Av. Arce 123, Sopocachi", mapsUrl: "https://www.google.com/maps/embed?pb=example",
  nit: "PRIVATE_NIT", directorIdentity: "PRIVATE_CI", directorPhone: "PRIVATE_DIRECTOR_PHONE", students: [{ name: "PRIVATE_STUDENT" }],
};

async function fixture(page: Page, value: Record<string, unknown> | null = institution) {
  const state = { value, fail: false, calls: [] as Request[], forbidden: [] as string[] };
  await page.addInitScript(() => {
    sessionStorage.setItem("micole_support_session", "private-support");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value: string) => { document.documentElement.dataset.copied = value; } } });
  });
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async route => {
    const request = route.request(); state.calls.push(request);
    const name = new URL(request.url()).pathname.split("/").at(-1);
    if (name === "platform_tariffs") return route.fulfill({ json: { activationFee: 50, monthlyLicenseFee: 29, inherited: true } });
    if (name === "landing_institutions") return route.fulfill({ json: state.value ? [state.value] : [] });
    if (name === "landing_institution") return route.fulfill(state.fail ? { status: 503, json: { message: "Unavailable" } } : { json: state.value });
    state.forbidden.push(request.url()); return route.fulfill({ status: 500, json: {} });
  });
  return state;
}

test("una tarjeta sin sitio web abre su página propia, con ubicación, contacto y enlace para compartir", async ({ page }) => {
  const state = await fixture(page, { ...institution, website: "" });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const card = page.getByRole("link", { name: `Conocer ${institution.name}`, exact: true });
  await expect(card).toHaveAttribute("href", "/instituciones/pequenos-pasos");
  await card.click();
  await expect(page).toHaveURL(/\/instituciones\/pequenos-pasos$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(institution.name);
  await expect(page.locator("#nosotros")).toContainText("respetando el ritmo");
  await expect(page.locator("#niveles")).toContainText("Inicial");
  await expect(page.locator("#ubicacion")).toContainText(institution.address);
  await expect(page.getByRole("link", { name: "Consultar por WhatsApp" }).first()).toHaveAttribute("href", /^https:\/\/wa.me\/59170001234\?text=/);
  await expect(page.getByRole("link", { name: institution.phone })).toHaveAttribute("href", "tel:+59170001234");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.route("https://www.google.com/maps/embed?pb=example", route => route.fulfill({ contentType: "text/html", body: "<p>Mapa de prueba</p>" }));
  await page.getByRole("button", { name: "Ver mapa aquí" }).click();
  await expect(page.getByTitle(`Ubicación de ${institution.name}`)).toBeVisible();
  await page.getByRole("button", { name: "Compartir página" }).click();
  await expect(page.getByRole("status")).toHaveText("Enlace copiado. Ya puedes compartirlo.");
  expect(await page.locator("html").getAttribute("data-copied")).toBe("http://localhost:4174/instituciones/pequenos-pasos");
  await expect(page).toHaveTitle(/Guardería Pequeños Pasos en La Paz \| MiCole/);
  await expect(page.locator("body")).not.toContainText("PRIVATE_");
  expect(state.forbidden).toEqual([]);
  for (const request of state.calls) {
    const headers = await request.allHeaders();
    expect(headers.authorization).toBeUndefined(); expect(headers["x-micole-support"]).toBeUndefined(); expect(headers.cookie).toBeUndefined();
  }
  expect(errors).toEqual([]);
  await page.getByRole("link", { name: "Todas las instituciones" }).click();
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Todo lo importante");
});

for (const width of [320, 390, 768, 1440]) {
  test(`la página se adapta a ${width} px y conserva su identidad`, async ({ page }, testInfo) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/instituciones/pequenos-pasos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(institution.name);
    await expect(page.locator(".institution-identity .affiliate-logo")).toContainText("GP");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`institucion-${width}.png`), fullPage: true });
  });
}

test("los campos opcionales vacíos se ocultan y una portada o logo rotos tienen alternativa", async ({ page }) => {
  await fixture(page, { ...institution, phone: "", address: "", mapsUrl: "", website: "", description: "", educationLevels: [], logoUrl: "https://assets.example.org/missing.png", bannerUrl: "https://assets.example.org/missing-cover.png" });
  await page.route("https://assets.example.org/**", route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/instituciones/pequenos-pasos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(institution.name);
  await expect(page.locator(".institution-identity .affiliate-logo > span")).toHaveText("GP");
  await expect(page.locator(".institution-cover img")).toHaveCount(0);
  await expect(page.locator("#nosotros,#niveles,#ubicacion")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /WhatsApp|Llamar|Visitar sitio/ })).toHaveCount(0);
  await expect(page.getByText("undefined", { exact: true })).toHaveCount(0);
});

test("distingue una institución oculta de un fallo temporal y permite reintentar", async ({ page }) => {
  const state = await fixture(page, null);
  await page.goto("/instituciones/oculta");
  await expect(page.getByRole("heading", { name: "Esta institución no está disponible." })).toBeVisible();
  state.fail = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Inténtalo una vez más." })).toBeVisible();
  state.fail = false; state.value = institution;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(institution.name);
});

test("Dirección edita la presentación y el permiso de contacto desde identidad y los conserva al recargar", async ({ page }) => {
  await page.goto("http://localhost:4173/app/settings");
  await page.getByRole("button", { name: "Editar identidad", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await showFormSection(page, "Presentación");
  await dialog.getByLabel("Presentación (opcional)").fill("Una comunidad para aprender jugando.");
  await dialog.getByRole("checkbox", { name: /Publicar el teléfono institucional/ }).check();
  await expect(dialog.getByRole("link", { name: "Ver página pública" })).toHaveAttribute("href", /^\/instituciones\//);
  await showFormSection(page, "Mostrar institución");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Editar identidad", exact: true }).click();
  await showFormSection(page, "Presentación");
  await expect(dialog.getByLabel("Presentación (opcional)")).toHaveValue("Una comunidad para aprender jugando.");
  await expect(dialog.getByRole("checkbox", { name: /Publicar el teléfono institucional/ })).toBeChecked();
});
