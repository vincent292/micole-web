import { test, expect } from "@playwright/test";
const url = "https://micole-test.supabase.co";
const owner = "00000000-0000-4000-8000-000000000001";
const schoolId = "00000000-0000-4000-8000-000000000020";
const supportId = "00000000-0000-4000-8000-000000000090";
const now = Math.floor(Date.now() / 1000);
const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: owner, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
test.use({ baseURL: "http://localhost:4174", reducedMotion: "reduce" });
test("el cliente conectado abre, recarga y cierra soporte sin cambiar el login ni cargar alumnos en plataforma", async ({
  page,
}) => {
  const calls: { name: string; support: string | undefined }[] = [];
  let expired = false;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = {
    id: owner,
    email: "owner@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { full_name: "Propietario Prueba" },
    app_metadata: { provider: "email" },
    created_at: new Date().toISOString(),
  };
  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
      session: {
        access_token: jwt,
        refresh_token: "test-refresh",
        expires_at: now + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user,
      },
    },
  );
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/settings")
        ? { external: { email: true, google: false } }
        : user,
    }),
  );
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const name = path.split("/").at(-1)!;
    const header = request.headers()["x-micole-support"];
    calls.push({ name, support: header });
    if (
      expired &&
      header &&
      ["students", "workspace_identity"].includes(name)
    ) {
      await route.fulfill({
        status: 400,
        json: { code: "P0001", message: "support_expired: Sesión revocada" },
      });
      return;
    }
    const school = {
      id: schoolId,
      name: "Colegio de revisión",
      slug: "revision",
      city: "La Paz",
      status: "active",
      brand_color: "#3D6EF7",
    };
    let json: unknown = name === "finance_register" ? {receipts:[],invoices:[]} : [];
    if (name === "workspace_identity")
      json = {
        id: owner,
        email: user.email,
        name: user.user_metadata.full_name,
        canSupport: true,
        roles: header ? ["director"] : ["superadmin", "director"],
        memberships: header ? [{ schoolId, role: "director" }] : [],
        teacherIds: [],
        guardianStudentIds: [],
        support: header
          ? {
              id: supportId,
              schoolId,
              role: "director",
              adminId: owner,
              reason: "Revisar la inscripción conectada",
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            }
          : null,
      };
    else if (name === "schools") json = [school];
    else if (name === "platform_school_counts")
      json = [{ schoolId, activeStudentCount: 0 }];
    else if (name === "support_accounts")
      json = [
        {
          id: owner,
          name: "Dirección · acceso de soporte",
          email: "",
          role: "director",
        },
      ];
    else if (name === "start_support_session") {
      expect(header).toBeUndefined();
      expect(request.postDataJSON()).toMatchObject({
        p_school_id: schoolId,
        p_user_id: owner,
        p_role: "director",
        p_reason: "Revisar la inscripción conectada",
      });
      json = { id: supportId };
    } else if (name === "end_support_session") {
      expect(header).toBe(supportId);
      json = null;
    }
    await route.fulfill({ json });
  });
  await page.goto("/app/overview");
  await expect(
    page.getByRole("heading", { name: "Resumen de plataforma" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await expect(
    page
      .locator(".profile-menu")
      .getByRole("button", { name: "Dirección", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  expect(
    calls.filter((c) =>
      ["students", "teachers", "daily_entries", "messages"].includes(c.name),
    ),
  ).toEqual([]);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Soporte y probar roles" })
    .click();
  await page
    .getByLabel("Motivo de soporte")
    .fill("Revisar la inscripción conectada");
  await page.getByRole("button", { name: "Entrar como Dirección" }).click();
  await expect(
    page.getByRole("region", { name: "Sesión de soporte" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Estudiantes", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      calls.some((c) => c.name === "students" && c.support === supportId),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Sesión de soporte" }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Sesión de soporte" })
    .getByRole("button", { name: "Volver a superadmin" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resumen de plataforma" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Estudiantes", exact: true }),
  ).toHaveCount(0);
  const state = await page.evaluate(
    (key) => ({
      support: sessionStorage.getItem("micole_support_session"),
      auth: !!localStorage.getItem(key),
    }),
    `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
  );
  expect(state).toEqual({ support: null, auth: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Soporte y probar roles" })
    .click();
  await page
    .getByLabel("Motivo de soporte")
    .fill("Revisar la inscripción conectada");
  await page.getByRole("button", { name: "Entrar como Dirección" }).click();
  await expect(
    page.getByRole("region", { name: "Sesión de soporte" }),
  ).toBeVisible();
  expired = true;
  await page.getByRole("button", { name: "Actualizar datos" }).click();
  await expect(
    page.getByRole("heading", { name: "Soporte y probar roles", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Sesión de soporte" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("micole_support_session")),
  ).toBeNull();
  expect(errors).toEqual([]);
});
