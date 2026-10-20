import { callGemini } from "./gemini.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { r2OriginHeaders } from "../r2-media/origins.ts";
import {
  extractionPrompt,
  extractionSchema,
  normalizeExtraction,
  validateSources,
} from "./core.ts";
Deno.serve(async (req: Request) => {
  const cors = r2OriginHeaders(
    req.headers.get("origin"),
    Deno.env.get("DOCUMENT_IMPORT_ORIGINS") ||
      Deno.env.get("APP_ORIGINS") ||
      "",
  );
  const headers = {
    ...(cors || {}),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const reply = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (!cors) return reply({ error: "Origen no autorizado." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return reply({ error: "Método no permitido." }, 405);
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (!token)
      return reply({ error: "Inicia sesión para leer documentos." }, 401);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authorization,
            ...(req.headers.get("x-micole-support")
              ? { "x-micole-support": req.headers.get("x-micole-support")! }
              : {}),
          },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: identity, error: authError } = await db.auth.getUser(token);
    if (authError || !identity.user)
      return reply({ error: "Tu sesión venció. Vuelve a ingresar." }, 401);
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Selecciona un documento." }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 14 * 1024 * 1024) {
        await reader.cancel();
        return reply({ error: "Los archivos pueden sumar hasta 10 MB." }, 413);
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
    if (
      !["form", "calendar"].includes(body.kind) ||
      !Number.isInteger(body.year) ||
      body.year < 2020 ||
      body.year > 2100 ||
      typeof body.schoolId !== "string" ||
      !/^[-a-f0-9]{36}$/i.test(body.schoolId) ||
      body.emptyDocumentConfirmed !== true
    )
      return reply(
        {
          error:
            "Revisa la gestión y confirma que el documento no contiene datos personales.",
        },
        400,
      );
    const files = validateSources(body.files);
    const key = Deno.env.get("GEMINI_API_KEY"),
      model = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";
    if (!key || !/^[a-zA-Z0-9.-]{1,100}$/.test(model))
      return reply(
        {
          error:
            "La lectura de documentos todavía no está configurada. Contacta a MiCole.",
        },
        503,
      );
    const { error: permission } = await db.rpc("reserve_document_analysis", {
      p_school_id: body.schoolId,
    });
    if (permission)
      return reply(
        {
          error: permission.message.startsWith("Se alcanzó")
            ? permission.message
            : "Solo Dirección puede leer documentos de esta institución.",
        },
        permission.message.startsWith("Se alcanzó") ? 429 : 403,
      );
    const { response, modelUsed } = await callGemini({
      apiKey: key,
      model,
      fallbackModel: Deno.env.get("GEMINI_FALLBACK_MODEL") || undefined,
      signal: AbortSignal.timeout(85000),
      payload: JSON.stringify({
        systemInstruction: {
          parts: [{ text: extractionPrompt(body.kind, body.year) }],
        },
        contents: [
          {
            role: "user",
            parts: files.flatMap((f, i) => [
              { text: `Documento ${i + 1}: ${f.name}` },
              { inlineData: { mimeType: f.mimeType, data: f.data } },
            ]),
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: extractionSchema(body.kind),
          maxOutputTokens: 16000,
        },
      }),
    });
    if (!response.ok)
      return reply(
        {
          error:
            response.status === 503
              ? "Gemini está ocupado temporalmente. Tus archivos y la revisión se conservan; inténtalo de nuevo en unos minutos."
              : response.status === 429
                ? "Gemini alcanzó su límite de uso. Revisa la cuota o inténtalo más tarde."
                : response.status === 404
                  ? "El modelo Gemini configurado no está disponible. Revisa GEMINI_MODEL."
                  : "Gemini no pudo leer el documento. Revisa su configuración o intenta con una foto más clara.",
        },
        502,
      );
    const output = await response.json();
    const candidate = output.candidates?.[0];
    if (candidate?.finishReason !== "STOP")
      return reply(
        {
          error:
            "La lectura no se completó. Sube menos páginas o fotos más claras.",
        },
        422,
      );
    const content = candidate.content?.parts
      ?.filter(
        (p: { text?: string; thought?: boolean }) => p.text && !p.thought,
      )
      .map((p: { text: string }) => p.text)
      .join("");
    const extracted = normalizeExtraction(JSON.parse(content), body.kind);
    const hash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          files.map((f) => f.mimeType + ":" + f.data).join("|"),
        ),
      ),
    );
    return reply({
      ...extracted,
      sourceHash: Array.from(hash, (n) => n.toString(16).padStart(2, "0")).join(
        "",
      ),
      modelUsed,
      kind: body.kind,
      year: body.year,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const safe =
      /^(Selecciona|Usa PDF|Los archivos|El contenido|La plantilla|El calendario|No se pudo interpretar)/.test(
        message,
      );
    return reply(
      {
        error: safe
          ? message
          : "No se pudo completar la lectura. Conserva tus archivos e intenta nuevamente.",
      },
      safe ? 400 : 502,
    );
  }
});
