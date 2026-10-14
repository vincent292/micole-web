import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "micole-auth-"));
fs.chmodSync(temporary, 0o700);
const project = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const cli = (args) =>
  execFileSync(
    "npx",
    [
      "supabase",
      ...args,
      "--workdir",
      temporary,
      "--project-ref",
      project,
      "--yes",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
  );
try {
  fs.mkdirSync(path.join(temporary, "supabase", ".temp"), { recursive: true });
  fs.copyFileSync(
    "supabase/config.toml",
    path.join(temporary, "supabase/config.toml"),
  );
  fs.writeFileSync(
    path.join(temporary, "supabase", ".temp", "project-ref"),
    project,
  );
  cli(["config", "pull"]);
  const configPath = path.join(temporary, "supabase/config.toml");
  const original = fs.readFileSync(configPath, "utf8");
  const section = original.match(/(^|\n)(\[auth\]\n)([\s\S]*?)(?=\n\[|$)/);
  if (!section) throw new Error("No se encontró la configuración de Auth.");
  const siteLine = section[3].match(/^site_url\s*=.*$/m);
  const redirectsLine = section[3].match(
    /^additional_redirect_urls\s*=\s*(\[[\s\S]*?\])/m,
  );
  if (!siteLine || !redirectsLine)
    throw new Error("No se encontraron las URLs de Auth.");
  const existing = JSON.parse(redirectsLine[1]);
  const callbacks = [
    "http://localhost:5173/auth/callback",
    "http://localhost:5175/auth/callback",
    "http://localhost:5173/invite/**",
    "http://localhost:5175/invite/**",
  ];
  const redirects = [...new Set([...existing, ...callbacks])];

  fs.writeFileSync(
    configPath,
    [
      'project_id = "micole-app"',
      "[auth]",
      'site_url = "http://localhost:5173"',
      "additional_redirect_urls = " + JSON.stringify(redirects),
      "[auth.email]",
      "enable_confirmations = true",
      "",
    ].join("\n"),
  );
  const diffRaw = cli(["config", "diff", "--output-format", "json"]);
  fs.writeFileSync(path.join(temporary, "diff.json"), diffRaw, { mode: 0o600 });
  const diff = JSON.parse(diffRaw);
  // El archivo mínimo declara las URLs y la confirmación de correo; los otros ajustes se conservan.
  const diffText = JSON.stringify(diff);
  const knownDiff =
    diffText.includes("site_url") ||
    diffText.includes("additional_redirect_urls") ||
    diffText.includes("uri_allow_list") ||
    diffText.includes("mailer_autoconfirm") ||
    diffText.includes("enable_confirmations");
  if (!knownDiff) {
    console.log(
      JSON.stringify({
        ok: true,
        changed: false,
        message: "URLs de acceso y confirmación de correo ya configuradas.",
      }),
    );
  } else {
    cli(["config", "push"]);
    console.log(
      JSON.stringify({
        ok: true,
        changed: true,
        message:
          "URLs de MiCole y confirmación de correo configuradas. Los demás ajustes remotos se conservan.",
      }),
    );
  }
} catch (e) {
  console.error(
    JSON.stringify({
      ok: false,
      message: e.message?.startsWith("No se")
        ? e.message
        : "No se pudo configurar Auth desde la CLI. Configura el callback /auth/callback desde Supabase Dashboard.",
    }),
  );
  process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
