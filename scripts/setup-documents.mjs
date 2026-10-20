import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { environment } from "./database.mjs";
environment();
const apiKey = process.env.GEMINI_API_KEY?.trim(),
  model = (process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();
if (!apiKey || /[\r\n]/.test(apiKey) || !/^[a-zA-Z0-9.-]{1,100}$/.test(model))
  throw new Error(
    "Configura GEMINI_API_KEY y GEMINI_MODEL en el entorno privado del servidor.",
  );
const fallbackModel = (
  process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite"
).trim();
if (!/^[a-zA-Z0-9.-]{1,100}$/.test(fallbackModel))
  throw new Error("Revisa GEMINI_FALLBACK_MODEL.");
const project = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const apply = process.argv.includes("--apply");
const cli = process.env.MICOLE_SUPABASE_CLI || "supabase";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "micole-gemini-"));
fs.chmodSync(temporary, 0o700);
try {
  const file = path.join(temporary, "secrets.env");
  const origins =
    process.env.DOCUMENT_IMPORT_ORIGINS ||
    "https://www.micole.click,https://micole.click,https://micole-web.vercel.app,http://localhost:5173,http://localhost:5175,http://localhost:8081";
  if (/[\r\n]/.test(origins))
    throw new Error("Revisa DOCUMENT_IMPORT_ORIGINS.");
  fs.writeFileSync(
    file,
    `GEMINI_API_KEY=${apiKey}\nGEMINI_MODEL=${model}\nGEMINI_FALLBACK_MODEL=${fallbackModel}\nDOCUMENT_IMPORT_ORIGINS=${origins}\n`,
    { mode: 0o600 },
  );
  if (apply) {
    execFileSync(
      cli,
      ["secrets", "set", "--env-file", file, "--project-ref", project],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
    );
    execFileSync(
      cli,
      [
        "functions",
        "deploy",
        "document-analyze",
        "--project-ref",
        project,
        "--use-api",
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 },
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      applied: apply,
      function: "document-analyze",
      model,
      fallbackModel,
      valuesPrinted: false,
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "configure-document-analysis",
      message:
        "No se pudo guardar los secretos o desplegar la función. Revisa la sesión y permisos de Supabase.",
      exitCode: e.status || null,
    }),
  );
  process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
