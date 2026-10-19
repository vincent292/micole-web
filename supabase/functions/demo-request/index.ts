import { createClient } from "npm:@supabase/supabase-js@2";
import { r2OriginHeaders } from "../r2-media/origins.ts";
import { validateDemoContact } from "./validate.ts";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin"),
    cors = r2OriginHeaders(
      origin,
      Deno.env.get("APP_ORIGINS") || Deno.env.get("APP_ORIGIN") || "",
    );
  const headers = {
    ...(cors || {}),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const reply = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (!origin || !cors) return reply({ error: "Origen no autorizado." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return reply({ error: "Método no permitido." }, 405);
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Solicitud vacía." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 8192) {
        await reader.cancel();
        return reply({ error: "La solicitud es demasiado extensa." }, 413);
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof body.website === "string" && body.website.trim())
      return reply({ ok: true });
    if (
      typeof body.requestKey !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        body.requestKey,
      )
    )
      return reply({ error: "Actualiza la página e intenta nuevamente." }, 400);
    const contact = validateDemoContact(body);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const hash = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`demo:${ip}`),
      ),
    );
    const fingerprint = Array.from(hash, (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    const db = createClient(Deno.env.get("SUPABASE_URL")!, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.rpc("submit_demo_request", {
      p_request_key: body.requestKey,
      p_payload: contact,
      p_fingerprint: fingerprint,
    });
    if (error) {
      if (error.message.startsWith("Ya recibimos"))
        return reply({ error: error.message }, 429);
      return reply(
        { error: "No pudimos recibir la solicitud. Intenta nuevamente." },
        400,
      );
    }
    return reply({ ok: true });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error && e.message.startsWith("Completa")
            ? e.message
            : "Revisa los datos e intenta nuevamente.",
      },
      400,
    );
  }
});
