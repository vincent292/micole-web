import { expect, test, type Page } from "@playwright/test";
import { showFormSection } from "./form-sections";

test.use({ baseURL: "http://localhost:4174", reducedMotion: "reduce" });
async function fixture(page: Page, administrator = false) {
  const userId = "ac000000-0000-4000-8000-000000000002";
  const user = { id: userId, email: "registration@example.invalid", aud: "authenticated", role: "authenticated", user_metadata: { full_name: "Responsable de prueba" }, app_metadata: { provider: "email" }, created_at: new Date().toISOString() };
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
  await page.addInitScript(session => localStorage.setItem("sb-micole-test-auth-token", JSON.stringify(session)), { access_token: jwt, refresh_token: "test-refresh", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user });
  await page.route("**/auth/v1/**", route => route.fulfill({ json: route.request().url().includes("/settings") ? { external: { email: true, google: false } } : user }));
  let request: Record<string, unknown> | undefined, saved: Record<string, unknown> | undefined;
  let schools: unknown[] = [];
  await page.route("**/rest/v1/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let json: unknown = [];
    if (name === "workspace_identity") json = { id: userId, email: user.email, name: "Responsable de prueba", canSupport: administrator, roles: administrator ? ["superadmin"] : [], memberships: [], teacherIds: [], guardianStudentIds: [], support: null };
    if (name === "platform_tariffs") json = { activationFee: 50, monthlyLicenseFee: 25, inherited: true };
    if (name === "finance_register") json = { receipts: [], invoices: [] };
    if (name === "schools") json = schools;
    if (name === "institution_requests" && request) json = [{ ...request, id: "ac000000-0000-4000-8000-000000000020", user_id: userId, email: user.email, status: "pending", created_at: new Date().toISOString() }];
    if (name === "request_institution") { request = route.request().postDataJSON().p_request; json = "ac000000-0000-4000-8000-000000000020"; }
    if (name === "save_school") { saved = route.request().postDataJSON().p_school; schools = [{ ...saved }]; json = null; }
    await route.fulfill({ json });
  });
  return { request: () => request, saved: () => saved };
}

for (const levels of [["Inicial"], ["Primaria"], ["Secundaria"], ["Primaria", "Secundaria"], ["Inicial", "Primaria"], ["Inicial", "Secundaria"], ["Inicial", "Primaria", "Secundaria"]]) {
  test(`el registro público envía y muestra los niveles: ${levels.join(" + ")}`, async ({ page }) => {
    const api = await fixture(page);
    await page.goto("/login?intent=school");
    await page.getByLabel("Nombre de la institución", { exact: false }).fill("Institución de ejemplo");
    await page.getByLabel("Ciudad", { exact: false }).fill("La Paz");
    await page.getByLabel("Teléfono de contacto", { exact: false }).fill("70000000");
    for (const level of levels) await page.getByRole("checkbox", { name: level === "Inicial" ? "Inicial / kínder" : level, exact: true }).check();
    await page.getByRole("button", { name: "Solicitar incorporación", exact: true }).click();
    await expect(page.getByRole("button", { name: "Consultar estado", exact: true })).toBeVisible();
    expect(api.request()?.education_levels).toEqual(levels);
    expect(api.request()).not.toHaveProperty("workspace_mode");
    for (const level of levels) await expect(page.locator(".request-status")).toContainText(level === "Inicial" ? "Inicial / kínder" : level);
  });
}

test("el registro público exige un nivel y se adapta al celular", async ({ page }, testInfo) => {
  const api = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login?intent=school");
  await page.getByLabel("Nombre de la institución", { exact: false }).fill("Institución de ejemplo");
  await page.getByLabel("Ciudad", { exact: false }).fill("La Paz");
  await page.getByLabel("Teléfono de contacto", { exact: false }).fill("70000000");
  await page.getByRole("button", { name: "Solicitar incorporación", exact: true }).click();
  expect(api.request()).toBeUndefined();
  await expect(page.getByRole("checkbox", { name: "Inicial / kínder", exact: true })).toBeFocused();
  await page.getByRole("checkbox", { name: "Inicial / kínder", exact: true }).check();
  await page.getByRole("checkbox", { name: "Primaria", exact: true }).check();
  await expect(page.locator(".institution-level-summary")).toContainText("Colegio con kínder");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".onboarding-levels").screenshot({ path: testInfo.outputPath("niveles-celular.png") });
});

test("la creación administrativa guarda una institución mixta sin forzar modo colegio o kínder", async ({ page }, testInfo) => {
  const api = await fixture(page, true);
  await page.goto("/app/overview");
  await page.getByRole("button", { name: "Nueva institución", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre de la institución", { exact: false }).fill("Colegio con kínder de ejemplo");
  await dialog.getByLabel("Ciudad", { exact: false }).selectOption("La Paz");
  await dialog.getByLabel("Nombre de la directora", { exact: false }).fill("Responsable de ejemplo");
  await showFormSection(page, "Inicial");
  for (const level of ["Inicial / kínder", "Primaria", "Secundaria"]) await dialog.getByRole("checkbox", { name: level, exact: true }).check();
  await expect(dialog.locator(".institution-level-summary")).toContainText("Colegio con kínder");
  await expect(dialog.getByRole("combobox", { name: "Tipo de institución", exact: true })).toHaveCount(0);
  await dialog.screenshot({ path: testInfo.outputPath("niveles-administracion.png") });
  await showFormSection(page, "Mostrar institución");
  await dialog.getByLabel("Carnet de Dirección", { exact: true }).fill("1234567 LP");
  await dialog.getByLabel("Celular de Dirección", { exact: true }).fill("70000000");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.saved()).toMatchObject({ education_levels: ["Inicial", "Primaria", "Secundaria"], workspace_mode: "auto" });
});
