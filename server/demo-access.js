// Server-only gate for the separate demo deployment. Never import from src/.
const cookieName = "__Host-micole_demo";
const lifetime = 8 * 60 * 60;
const encoder = new TextEncoder();
const securityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};
function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function decode(value) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
async function credentialHash(email, password) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${email.trim().toLowerCase()}\0${password}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++)
    different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
function loginPage(error = "") {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Acceso privado a la demo · MiCole</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8faff;color:#263238;font-family:Inter,system-ui,sans-serif;min-height:100dvh}header{max-width:1120px;margin:auto;padding:28px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}a{color:#3159c9;text-decoration:none}.brand{font-size:32px;font-weight:800;letter-spacing:-1px;color:#263238}.brand span{color:#3d6ef7}main{max-width:1050px;margin:5vh auto;padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}.eyebrow{font-size:12px;font-weight:700;letter-spacing:2px;color:#3159c9}h1{font-size:clamp(32px,5vw,52px);line-height:1.13;letter-spacing:-1.5px;margin:18px 0}h1 span{color:#3d6ef7}p{color:#52636c;line-height:1.7}section{background:#fff;border:1px solid #dfe7f5;border-radius:24px;padding:32px;box-shadow:0 8px 40px #26323806}h2{margin:0 0 12px;font-size:27px}form{display:grid;gap:10px;margin-top:26px}label{font-weight:600;font-size:14px;margin-top:8px}input{font:inherit;min-width:0;width:100%;border:1px solid #cad8ed;border-radius:12px;padding:15px;background:#fff;color:#263238}input:focus{outline:3px solid #3d6ef733;border-color:#3d6ef7}button{font:600 16px Inter,system-ui,sans-serif;border:0;border-radius:12px;background:#3d6ef7;color:white;padding:16px;margin-top:14px;cursor:pointer}button:hover{background:#305bda}button:focus-visible,a:focus-visible{outline:3px solid #ffc857;outline-offset:3px}small{display:block;color:#52636c;line-height:1.6;margin-top:20px}.note{border-left:3px solid #54d2a0;padding-left:16px;margin-top:30px}.error{color:#9c2635;background:#fff0f1;border-radius:10px;padding:12px;font-size:14px;margin:0}footer{text-align:center;color:#52636c;font-size:13px;padding:28px}@media(max-width:760px){main{grid-template-columns:1fr;gap:24px;margin:0 auto;padding:20px}.intro{padding:0 8px}.intro h1{font-size:34px}.intro .note{display:none}section{padding:26px 22px}header{padding:20px 24px}header a:last-child{font-size:13px}}
</style></head><body><header><a class="brand" href="https://www.micole.click/">Mi<span>Cole</span></a><a href="https://www.micole.click/">Conocer MiCole</a></header><main><div class="intro"><span class="eyebrow">DEMOSTRACIÓN PRIVADA</span><h1>Descubre tu próximo cole,<br><span>más cerca.</span></h1><p>Explora aulas, tareas, pagos y comunicación con las familias usando datos de ejemplo.</p><div class="note"><b>Un espacio para tus pruebas</b><p>Los cambios de la demo quedan en tu navegador. No se envían correos ni se realizan cobros.</p></div></div><section><h2>Entrar a la demo</h2><p>Ingresa el correo y la clave que te compartió el equipo de MiCole.</p><form method="post" action="/__demo/login"><label for="email">Correo de acceso</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required spellcheck="false"><label for="password">Clave de acceso</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="200" required>${error ? `<p class="error" role="alert">${error}</p>` : ""}<button type="submit">Entrar a la demo</button></form><small>¿Todavía no tienes acceso? <a href="https://www.micole.click/#solicitar-demo">Solicita tu demo</a>. Dentro podrás explorar los distintos perfiles.</small></section></main><footer>MiCole · Cerca en cada paso</footer></body></html>`;
}
export function createDemoGate({
  credentialDigest,
  sessionSecret,
  now = () => Date.now(),
}) {
  const configured =
    /^[a-f0-9]{64}$/.test(credentialDigest || "") &&
    sessionSecret?.length >= 32;
  let key;
  async function sessionKey() {
    return (key ||= crypto.subtle.importKey(
      "raw",
      encoder.encode(`${sessionSecret}:${credentialDigest}`),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    ));
  }
  function respond(body, status = 200, extra = {}) {
    return new Response(body, {
      status,
      headers: { ...securityHeaders, ...extra },
    });
  }
  const html = (error = "", status = 200) =>
    respond(loginPage(error), status, {
      "Content-Type": "text/html; charset=utf-8",
    });
  async function validCookie(request) {
    const value = request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!value || value.length > 1000) return false;
    try {
      const [payload, signature, extra] = value.split(".");
      if (!payload || !signature || extra !== undefined) return false;
      if (
        !(await crypto.subtle.verify(
          "HMAC",
          await sessionKey(),
          decode(signature),
          encoder.encode(payload),
        ))
      )
        return false;
      const data = JSON.parse(new TextDecoder().decode(decode(payload)));
      const seconds = Math.floor(now() / 1000);
      return (
        data.v === 1 &&
        Number.isInteger(data.exp) &&
        data.exp > seconds &&
        data.exp <= seconds + lifetime
      );
    } catch {
      return false;
    }
  }
  function sameOrigin(request) {
    return request.headers.get("origin") === new URL(request.url).origin;
  }
  async function formBody(request) {
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      return null;
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 2048) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new URLSearchParams(new TextDecoder().decode(bytes));
  }
  return async function gate(request) {
    const path = new URL(request.url).pathname;
    if (path === "/robots.txt" && request.method === "GET")
      return respond("User-agent: *\nDisallow: /\n", 200, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    if (!configured)
      return respond(
        "El acceso de demostración no está disponible. Contacta a MiCole.",
        503,
      );
    if (path === "/__demo/login") {
      if (request.method !== "POST")
        return respond(null, 303, { Location: "/" });
      if (!sameOrigin(request)) return respond("Solicitud no autorizada.", 403);
      const form = await formBody(request);
      const email = form?.get("email"),
        password = form?.get("password");
      if (
        !email ||
        !password ||
        email.length > 254 ||
        password.length > 200 ||
        !equal(await credentialHash(email, password), credentialDigest)
      )
        return html(
          "El correo o la clave no son correctos. Usa los datos que te compartió MiCole.",
          401,
        );
      const payload = base64url(
        encoder.encode(
          JSON.stringify({
            v: 1,
            exp: Math.floor(now() / 1000) + lifetime,
            nonce: crypto.randomUUID(),
          }),
        ),
      );
      const signature = base64url(
        await crypto.subtle.sign(
          "HMAC",
          await sessionKey(),
          encoder.encode(payload),
        ),
      );
      return respond(null, 303, {
        Location: "/app/overview",
        "Set-Cookie": `${cookieName}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}`,
      });
    }
    if (path === "/__demo/logout") {
      if (request.method !== "POST")
        return respond("Método no permitido.", 405, { Allow: "POST" });
      if (!sameOrigin(request)) return respond("Solicitud no autorizada.", 403);
      return respond(null, 204, {
        "Set-Cookie": `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      });
    }
    const allowed = await validCookie(request);
    if (path === "/__demo/session")
      return respond(
        JSON.stringify({ authenticated: allowed }),
        allowed ? 200 : 401,
        { "Content-Type": "application/json" },
      );
    if (!allowed) {
      if (request.method === "GET" && !/\.[a-z0-9]+$/i.test(path))
        return html();
      return respond("Inicia sesión para acceder a la demo.", 401);
    }
    return respond(null, 200, { "x-middleware-next": "1" });
  };
}
