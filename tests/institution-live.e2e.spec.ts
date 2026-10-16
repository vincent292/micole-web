import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://localhost:4174", reducedMotion: "reduce" });
test("una base pendiente de migrar mantiene el formulario y no descarta datos nuevos al guardar", async ({ page }) => {
  const userId = "50000000-0000-4000-8000-000000000001";
  const schoolId = "50000000-0000-4000-8000-000000000020";
  const now = Math.floor(Date.now() / 1000);
  const user = { id: userId, email: "direction@example.invalid", aud: "authenticated", role: "authenticated", user_metadata: { full_name: "Dirección de prueba" }, app_metadata: { provider: "email" }, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
  await page.addInitScript(({ session }) => localStorage.setItem("sb-micole-test-auth-token", JSON.stringify(session)), { session: { access_token: jwt, refresh_token: "test-refresh", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user } });
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/settings") ? { external: { email: true, google: false } } : user }));
  let saves = 0;
  let schemaChecks = 0;
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split("/").at(-1);
    if (name === "schools" && url.searchParams.get("select") === "nit,address,website,show_on_landing") {
      schemaChecks++;
      await route.fulfill({ status: 400, json: { code: "42703", message: "column schools.nit does not exist" } });
      return;
    }
    let json: unknown = name === "finance_register" ? {receipts:[],invoices:[]} : [];
    if (name === "workspace_identity") json = { id: userId, email: user.email, name: "Dirección de prueba", canSupport: false, roles: ["director"], memberships: [{ schoolId, role: "director" }], teacherIds: [], guardianStudentIds: [], support: null };
    if (name === "schools") json = [{ id: schoolId, name: "Colegio de prueba", slug: "prueba", city: "La Paz", status: "active", brand_color: "#3D6EF7", director_name: "Dirección de prueba" }];
    if (name === "save_school") { saves++; json = null; }
    if (name === "institution_private_contact") json={directorIdentity:"",directorPhone:""};
    await route.fulfill({ json });
  });
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Editar identidad", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("NIT (opcional)", { exact: true }).fill("987654321");
  await modal.getByLabel("Dirección de la institución", { exact: true }).fill("Calle de prueba 123");
  await modal.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("requiere una actualización");
  await expect(modal.getByLabel("NIT (opcional)", { exact: true })).toHaveValue("987654321");
  expect(schemaChecks).toBe(1);
  expect(saves).toBe(0);
});
