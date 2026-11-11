import { createClient } from "npm:@supabase/supabase-js@2";
import { r2OriginHeaders } from "../r2-media/origins.ts";
import { callGemini } from "../document-analyze/gemini.ts";
import { type GuideMessage } from "../_shared/assistant-guide.ts";
import { assistantRoles, buildAssistantRouterPayload, localAssistantReply, pauseMessage, routedGuideReply, type AssistantRole } from "../_shared/assistant-policy.ts";
Deno.serve(async (req: Request) => {
  const cors = r2OriginHeaders(
    req.headers.get("origin"),
    Deno.env.get("APP_ORIGINS") ||
      Deno.env.get("DOCUMENT_IMPORT_ORIGINS") ||
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
    const authorization = req.headers.get("authorization") || "",
      token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (!token)
      return reply(
        { error: "Inicia sesión para consultar al asistente." },
        401,
      );
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
    const { data: auth, error } = await db.auth.getUser(token);
    if (error || !auth.user) return reply({ error: "Tu sesión venció." }, 401);
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Escribe tu consulta." }, 400);
    let text = "",
      size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 96000) {
        await reader.cancel();
        return reply(
          { error: "Acorta la consulta o inicia una conversación nueva." },
          413,
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text),
      messages = body.messages as GuideMessage[];
    if (
      !(body.schoolId == null || typeof body.schoolId === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.schoolId)) ||
      !Array.isArray(messages) ||
      !messages.length ||
      messages.length > 8 ||
      messages.at(-1)?.role !== "user" ||
      messages.some(
        (m) =>
          !["user", "model"].includes(m.role) ||
          typeof m.text !== "string" ||
          !m.text.trim() ||
          m.text.length > 3000,
      )
    )
      return reply({ error: "Revisa tu consulta." }, 400);
    const role:AssistantRole = body.role || "director";
    if(!assistantRoles.includes(role))return reply({error:"Rol no válido."},400);
    const { data:state,error: permission } = await db.rpc("micole_assistant_state", {
      p_school_id: body.schoolId || null,p_role:role,p_reserve:true,
    });
    if (permission)
      return reply(
        {
          error: permission.message.startsWith("Se alcanzó")
            ? permission.message
            : "No tienes acceso al asistente en este panel o sede.",
        },
        permission.message.startsWith("Se alcanzó") ? 429 : 403,
      );
    if(state.pausedUntil)return reply({answer:pauseMessage,steps:[],actions:[],pausedUntil:state.pausedUntil});
    const key = Deno.env.get("GEMINI_API_KEY");
    let result;
    let mode="ia";
    try {
    if(!key)throw Error("Provider unavailable");
    const { response } = await callGemini({
      apiKey: key,
      model: Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash",
      fallbackModel: Deno.env.get("GEMINI_FALLBACK_MODEL") || undefined,
      signal: AbortSignal.timeout(55000),
      attemptTimeoutMs: 25000,
      payload: JSON.stringify(buildAssistantRouterPayload(messages,role,typeof body.page==="string" ? body.page.slice(0,60):"overview")),
    });
    if (!response.ok)throw Error("Provider unavailable");
    const output = await response.json(),
      candidate = output.candidates?.[0];
    if (candidate?.finishReason !== "STOP")throw Error("Incomplete classification");
    const content = candidate.content?.parts
      ?.filter(
        (p: { text?: string; thought?: boolean }) => p.text && !p.thought,
      )
      .map((p: { text: string }) => p.text)
      .join("");
    result=routedGuideReply(JSON.parse(content),role);
    } catch {
      // A provider failure only falls back to documented guidance/local routing.
      result=localAssistantReply(messages.at(-1)!.text,role);
      mode="guide";
    }
    if(result.offTopic){
      const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:pausedUntil,error:pauseError}=await admin.rpc("pause_micole_assistant",{p_user_id:auth.user.id});
      if(pauseError)throw Error("Could not persist pause");
      return reply({answer:pauseMessage,steps:[],actions:[],pausedUntil,mode});
    }
    const {data:latest,error:stateError}=await db.rpc("micole_assistant_state",{p_school_id:body.schoolId||null,p_role:role});
    if(stateError)throw Error("Could not validate current session");
    if(latest.pausedUntil)return reply({answer:pauseMessage,steps:[],actions:[],pausedUntil:latest.pausedUntil});
    return reply({...result,mode});
  } catch {
    return reply(
      {
        error:
          "No se pudo responder ahora. Revisa tu conexión o inicia una consulta nueva.",
      },
      502,
    );
  }
});
