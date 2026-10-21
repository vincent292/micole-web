import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { createDemoGate } from "../server/demo-access.js";

const origin = "https://demo.example.test";
const email = "invitado@example.test";
const password = "AccesoLocalSoloPruebas!";
const config = {
  credentialDigest: createHash("sha256")
    .update(`${email}\0${password}`)
    .digest("hex"),
  sessionSecret: "unit-tests-only-session-signing-secret-2026",
};
function loginRequest(values = { email, password }, from = origin) {
  return new Request(`${origin}/__demo/login`, {
    method: "POST",
    headers: {
      Origin: from,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
  });
}
const request = (path = "/", cookie = "") =>
  new Request(`${origin}${path}`, { headers: { Cookie: cookie } });
async function login(gate = createDemoGate(config)) {
  const response = await gate(loginRequest());
  return {
    response,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}
describe("acceso privado a la demo", () => {
  it("muestra un formulario vacío y protege rutas y archivos sin sesión", async () => {
    const gate = createDemoGate(config);
    const response = await gate(request("/?perfil=director"));
    const html = await response.text();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(html).toContain('name="password"');
    expect(html).not.toContain(password);
    expect(html).not.toContain(email);
    expect(html).not.toContain('value="');
    expect(html).not.toContain("Usar esta clave");
    expect(html).not.toContain("<script");
    expect((await gate(request("/assets/app.js"))).status).toBe(401);
    expect(await (await gate(request("/app/students"))).text()).toContain(
      'name="password"',
    );
    expect((await gate(request("/__demo/session"))).status).toBe(401);
  });
  it("valida en servidor y crea una cookie firmada, segura y con vencimiento", async () => {
    const gate = createDemoGate(config);
    const { response, cookie } = await login(gate);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/app/overview");
    expect(response.headers.get("set-cookie")).toMatch(
      /HttpOnly; Secure; SameSite=Lax; Max-Age=28800/,
    );
    expect(response.headers.get("set-cookie")).not.toContain(password);
    expect(
      await (await gate(request("/__demo/session", cookie))).json(),
    ).toEqual({ authenticated: true });
    expect(
      (await gate(request("/assets/app.js", cookie))).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  });
  it("rechaza claves y correos incorrectos sin devolver los datos enviados", async () => {
    const gate = createDemoGate(config);
    for (const values of [
      { email, password: "clave-publica-antigua" },
      { email: "otro@example.test", password },
    ]) {
      const response = await gate(loginRequest(values));
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
      const html = await response.text();
      expect(html).not.toContain(password);
      expect(html).not.toContain(values.email);
      expect(html).not.toContain(values.password);
    }
  });
  it("rechaza firmas manipuladas, sesiones vencidas y cookies anteriores a una rotación", async () => {
    const start = Date.now();
    const { cookie } = await login(
      createDemoGate({ ...config, now: () => start }),
    );
    const gate = createDemoGate(config);
    expect((await gate(request("/__demo/session", cookie + "x"))).status).toBe(
      401,
    );
    const expired = createDemoGate({
      ...config,
      now: () => start + 8 * 60 * 60 * 1000 + 1000,
    });
    expect((await expired(request("/__demo/session", cookie))).status).toBe(
      401,
    );
    const rotated = createDemoGate({
      ...config,
      credentialDigest: "0".repeat(64),
    });
    expect((await rotated(request("/__demo/session", cookie))).status).toBe(
      401,
    );
    const forged =
      "__Host-micole_demo=" +
      Buffer.from('{"v":1,"exp":9999999999}').toString("base64url") +
      ".fake";
    expect((await gate(request("/__demo/session", forged))).status).toBe(401);
  });
  it("bloquea solicitudes de otro sitio y cuerpos excesivos", async () => {
    const gate = createDemoGate(config);
    expect(
      (await gate(loginRequest({ email, password }, "https://ajeno.example")))
        .status,
    ).toBe(403);
    expect(
      (await gate(loginRequest({ email, password: "x".repeat(4000) }))).status,
    ).toBe(401);
    const missingOrigin = loginRequest();
    missingOrigin.headers.delete("origin");
    expect((await gate(missingOrigin)).status).toBe(403);
  });
  it("cerrar sesión elimina la cookie y exige POST del mismo origen", async () => {
    const gate = createDemoGate(config);
    expect((await gate(request("/__demo/logout"))).status).toBe(405);
    const response = await gate(
      new Request(`${origin}/__demo/logout`, {
        method: "POST",
        headers: { Origin: origin },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      (
        await gate(
          new Request(`${origin}/__demo/logout`, {
            method: "POST",
            headers: { Origin: "https://ajeno.example" },
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("falla cerrado si faltan secretos y mantiene robots fuera de indexación", async () => {
    const gate = createDemoGate({});
    expect((await gate(request())).status).toBe(503);
    expect((await gate(request("/assets/app.js"))).status).toBe(503);
    expect(await (await gate(request("/robots.txt"))).text()).toContain(
      "Disallow: /",
    );
  });
});
