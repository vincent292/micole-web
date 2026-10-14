import { test, expect, type Page, type Request } from "@playwright/test";

const liveUrl = "http://localhost:4174";
const publicRpc = "/rest/v1/rpc/landing_institutions";
const logoOrigin = "https://logos.example.invalid";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=", "base64");

type AffiliateFixture = {
  id: string;
  name: string;
  city: string;
  logoUrl: string;
  website: string;
  nit: string;
  address: string;
  director_email: string;
};
function institution(index: number): AffiliateFixture {
  return {
    id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Colegio Conectado ${index}`,
    city: index % 2 ? "La Paz" : "Cochabamba",
    logoUrl: `${logoOrigin}/good.png`,
    website: `https://institucion-${index}.example.invalid`,
    nit: "PRIVATE_NIT_729",
    address: "DIRECCIÓN PRIVADA PARA PRUEBA",
    director_email: "correo-privado@example.invalid",
  };
}
async function publicFixture(page: Page, rows: AffiliateFixture[] = []) {
  const state = { rows, fail: false, calls: [] as Request[], forbidden: [] as string[] };
  // Existing credentials/support state must never affect the anonymous landing request.
  await page.addInitScript(() => {
    sessionStorage.setItem("micole_support_session", "private-support-context");
    localStorage.setItem("sb-micole-test-auth-token", JSON.stringify({ access_token: "private-access-token", refresh_token: "private-refresh-token", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "private-user", email: "private-user@example.invalid" } }));
  });
  await page.route(`${logoOrigin}/**`, async (route) => {
    if (route.request().url().endsWith("broken.png")) await route.fulfill({ status: 404, body: "" });
    else await route.fulfill({ contentType: "image/png", body: pixel });
  });
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request();
    state.calls.push(request);
    if (new URL(request.url()).pathname !== publicRpc) {
      state.forbidden.push(request.url());
      await route.fulfill({ status: 500, json: { message: "Unexpected private request on public landing" } });
      return;
    }
    await route.fulfill(state.fail
      ? { status: 503, json: { message: "Public list unavailable" } }
      : { json: state.rows });
  });
  return state;
}
async function assertPublicOnly(state: Awaited<ReturnType<typeof publicFixture>>) {
  expect(state.calls.length).toBeGreaterThan(0);
  expect(state.forbidden).toEqual([]);
  for (const request of state.calls) {
    expect(new URL(request.url()).pathname).toBe(publicRpc);
    expect(request.method()).toBe("POST");
    expect(request.postDataJSON()).toEqual({});
    const headers = await request.allHeaders();
    expect(headers.apikey).toBe("public-test");
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-micole-support"]).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
  }
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function opacity(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) => Number(getComputedStyle(node).opacity));
}

// The real public page in demo mode does not invent institutions or access private tables.
test.describe("landing pública y animaciones", () => {
  test.use({ reducedMotion: "no-preference" });

  test("la raíz invita a la primera institución sin inventar colegios afiliados", async ({ page }) => {
    const privateRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/rest\/v1\/|\/auth\/v1\//.test(request.url())) privateRequests.push(request.url());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tu institución puede ser la primera." })).toBeVisible();
    await expect(page.getByTestId("affiliate-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Instituciones siguientes" })).toHaveCount(0);
    await expect(page.locator(".affiliates-empty-visual")).toBeVisible();
    expect(privateRequests).toEqual([]);
    await page.getByRole("link", { name: "Sumar mi institución" }).click();
    await expect(page).toHaveURL(/\/login\?intent=school$/);
  });

  test("Motion revela el contenido al desplazarse y finaliza la entrada del hero", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator(".landing-scroll-progress")).toHaveCount(1);
    await expect.poll(() => opacity(page, ".landing-hero-copy > h1")).toBe(1);
    await expect.poll(() => opacity(page, ".hero-reassurance")).toBe(1);
    await expect.poll(() => page.locator(".landing-hero-copy > h1").evaluate(node => { const transform = getComputedStyle(node).transform; return transform === "none" || new DOMMatrix(transform).isIdentity; })).toBe(true);
    await expect.poll(() => opacity(page, "#comunidad")).toBe(0);
    await page.locator("#comunidad").scrollIntoViewIfNeeded();
    await expect.poll(() => opacity(page, "#comunidad")).toBe(1);
    await expect(page.getByRole("heading", { name: /Un espacio para cada quien/ })).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().some(animation => animation.effect?.getTiming().iterations === Infinity))).toBe(false);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await expect(page.locator(".landing-scroll-progress")).toBeVisible();
    await page.locator(".landing-hero").scrollIntoViewIfNeeded();
    await expect.poll(() => opacity(page, ".product-preview-scene")).toBe(1);
    await page.screenshot({ path: "test-results/micole-landing-motion-desktop.png" });
    expect(errors).toEqual([]);
  });

  test("el panel ilustrativo cambia de sección con clic y con teclado", async ({ page }) => {
    await page.goto("/");
    const preview = page.getByRole("region", { name: "Vista previa ilustrativa del espacio MiCole" });
    await expect(preview.getByRole("tab")).toHaveCount(5);
    const expected = [
      ["Cuaderno", "¡Hoy crecemos juntos!"],
      ["Aulas", "Cada aula tiene su espacio"],
      ["Agenda", "Nos encontramos en el cole"],
      ["Cuotas", "Las cuentas, en orden"],
      ["Familia", "Su día también es tuyo"],
    ];
    for (const [label, heading] of expected) {
      await preview.getByRole("tab", { name: `Vista de ${label}`, exact: true }).click();
      await expect(preview.getByRole("tabpanel")).toHaveCount(1);
      await expect(preview.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(preview.getByRole("tab", { name: `Vista de ${label}`, exact: true })).toHaveAttribute("aria-selected", "true");
    }
    await page.keyboard.press("Home");
    await expect(preview.getByRole("tab", { name: "Vista de Cuaderno" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(preview.getByRole("tab", { name: "Vista de Aulas" })).toBeFocused();
    await expect(preview.getByRole("heading", { name: "Cada aula tiene su espacio" })).toBeVisible();
    await page.keyboard.press("End");
    await expect(preview.getByRole("tab", { name: "Vista de Familia" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(preview.getByRole("tab", { name: "Vista de Cuotas" })).toBeFocused();
    await expect(preview.getByRole("heading", { name: "Las cuentas, en orden" })).toBeVisible();
    await expect(preview).toContainText("Vista ilustrativa");
  });
});

test.describe("preferencia de movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });

  test("el contenido ya es visible y las interacciones funcionan sin desplazamientos animados", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".landing-scroll-progress")).toHaveCount(0);
    for (const selector of [".landing-hero-copy > h1", "#comunidad", "#funciones", "#planes", "#preguntas"]) {
      await expect.poll(() => opacity(page, selector)).toBe(1);
      expect(await page.locator(selector).evaluate(node => getComputedStyle(node).transform)).toBe("none");
    }
    expect(await page.locator(".product-preview").evaluate(node => getComputedStyle(node).transform)).toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    await page.getByRole("tab", { name: "Vista de Agenda" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Nos encontramos en el cole");
    expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
  });

  for (const width of [320, 360, 390, 768, 1024]) {
    test(`la raíz vacía se adapta a ${width} px sin desbordarse`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Tu institución puede ser la primera." })).toBeVisible();
      await noHorizontalOverflow(page);
      if (width <= 960) {
        await page.getByRole("button", { name: "Abrir menú público" }).click();
        await page.getByRole("navigation", { name: "Navegación de MiCole" }).getByRole("link", { name: "Instituciones", exact: true }).click();
        await expect(page).toHaveURL(/#instituciones$/);
        await expect(page.getByRole("button", { name: "Abrir menú público" })).toBeVisible();
      }
      await page.getByRole("tab", { name: "Vista de Cuotas" }).click();
      await expect(page.getByRole("tabpanel")).toContainText("Las cuentas, en orden");
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("instituciones públicas conectadas", () => {
  test.use({ baseURL: liveUrl, reducedMotion: "reduce", hasTouch: true });

  test("la lista vacía real conserva el CTA y consulta únicamente el RPC anónimo", async ({ page }) => {
    const state = await publicFixture(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tu institución puede ser la primera." })).toBeVisible();
    await expect(page.getByTestId("affiliate-card")).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("micole_support_session"))).toBe("private-support-context");
    await assertPublicOnly(state);
  });

  test("una institución usa su logo y permanece estática sin controles sobrantes", async ({ page }) => {
    const state = await publicFixture(page, [institution(1)]);
    await page.goto("/");
    await expect(page.getByTestId("affiliate-card")).toHaveCount(1);
    await page.locator("#instituciones").scrollIntoViewIfNeeded();
    await expect(page.getByRole("img", { name: "Logo de Colegio Conectado 1" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Colegio Conectado 1", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Conocer Colegio Conectado 1 (abre en otra pestaña)", exact: true })).toHaveAttribute("href", institution(1).website);
    await expect(page.getByRole("button", { name: /Instituciones anteriores|Instituciones siguientes/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("PRIVATE_NIT_729");
    await expect(page.locator("body")).not.toContainText("DIRECCIÓN PRIVADA PARA PRUEBA");
    await expect(page.locator("body")).not.toContainText("correo-privado@example.invalid");
    await assertPublicOnly(state);
  });

  test("el carrusel admite botones, teclado y nuevos colegios al recuperar foco", async ({ page }) => {
    const rows = Array.from({ length: 7 }, (_, index) => institution(index + 1));
    rows[0] = { ...rows[0], logoUrl: `${logoOrigin}/broken.png` };
    rows[1] = { ...rows[1], website: "javascript:alert('unsafe')" };
    const state = await publicFixture(page, rows);
    await page.goto("/");
    await expect(page.getByTestId("affiliate-card")).toHaveCount(7);
    await page.locator("#instituciones").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("affiliate-card").first().locator(".affiliate-logo > span")).toHaveText("CC");
    await expect(page.getByTestId("affiliate-card").nth(1).locator("a")).toHaveCount(0);
    const track = page.locator(".affiliate-track");
    const left = () => track.evaluate(element => element.scrollLeft);
    await expect(page.getByRole("button", { name: "Instituciones anteriores" })).toBeDisabled();
    await page.getByRole("button", { name: "Instituciones siguientes" }).click();
    await expect.poll(left).toBeGreaterThan(100);
    await expect(page.getByRole("button", { name: "Instituciones anteriores" })).toBeEnabled();
    await page.getByRole("button", { name: "Instituciones anteriores" }).click();
    await expect.poll(left).toBeLessThanOrEqual(2);
    await expect(page.getByRole("button", { name: "Instituciones anteriores" })).toBeDisabled();
    await track.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(left).toBeGreaterThan(100);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(left).toBeLessThanOrEqual(2);
    await expect(page.getByRole("button", { name: "Instituciones anteriores" })).toBeDisabled();
    state.rows = [...rows, institution(8), institution(8)];
    const callsBefore = state.calls.length;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => state.calls.length).toBeGreaterThan(callsBefore);
    await expect(page.getByTestId("affiliate-card")).toHaveCount(8);
    await expect(page.getByRole("heading", { name: "Colegio Conectado 8", exact: true })).toHaveCount(1);
    await expect(page.locator(".affiliate-count")).toContainText("8 instituciones");
    await assertPublicOnly(state);
  });

  test("el carrusel se desplaza con un gesto táctil real", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await publicFixture(page, Array.from({ length: 7 }, (_, index) => institution(index + 1)));
    await page.goto("/");
    await expect(page.getByTestId("affiliate-card")).toHaveCount(7);
    const track = page.locator(".affiliate-track");
    await track.scrollIntoViewIfNeeded();
    const box = (await track.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width * 0.85;
    const endX = box.x + box.width * 0.15;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + (endX - startX) * step / 8, y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(30);
    await cdp.detach();
    await noHorizontalOverflow(page);
    await assertPublicOnly(state);
  });

  test("un fallo público permite reintentar sin mostrar instituciones de ejemplo", async ({ page }) => {
    const state = await publicFixture(page, [institution(1)]);
    state.fail = true;
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Reintentar instituciones" })).toBeVisible();
    await expect(page.locator(".affiliate-error")).toContainText("No pudimos cargar las instituciones");
    await expect(page.getByTestId("affiliate-card")).toHaveCount(0);
    await expect(page.locator(".affiliates-empty")).toHaveCount(0);
    state.fail = false;
    await page.getByRole("button", { name: "Reintentar instituciones" }).click();
    await expect(page.getByTestId("affiliate-card")).toHaveCount(1);
    await expect(page.locator(".affiliate-error")).toHaveCount(0);
    await assertPublicOnly(state);
  });

  for (const width of [320, 360, 390, 768, 1024]) {
    test(`instituciones y carrusel adaptados a ${width} px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      const state = await publicFixture(page, Array.from({ length: 7 }, (_, index) => institution(index + 1)));
      await page.goto("/");
      await expect(page.getByTestId("affiliate-card")).toHaveCount(7);
      await page.locator("#instituciones").scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: "Instituciones siguientes" })).toBeVisible();
      await noHorizontalOverflow(page);
      await page.getByRole("button", { name: "Instituciones siguientes" }).click();
      await expect.poll(() => page.locator(".affiliate-track").evaluate(element => element.scrollLeft)).toBeGreaterThan(100);
      await noHorizontalOverflow(page);
      if (width === 390) {
        await page.locator(".landing-hero").scrollIntoViewIfNeeded();
        await page.screenshot({ path: "test-results/micole-landing-affiliates-mobile-full.png", fullPage: true });
        await page.locator("#instituciones").screenshot({ path: "test-results/micole-landing-affiliates-mobile-section.png" });
      }
      expect(errors).toEqual([]);
      await assertPublicOnly(state);
    });
  }
});
