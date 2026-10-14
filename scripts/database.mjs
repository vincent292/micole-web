import fs from "node:fs";
import pg from "pg";
export function environment() {
  for (const file of [".env", ".env.local"])
    if (fs.existsSync(file)) process.loadEnvFile(file);
}
export function databaseClient() {
  environment();
  const password =
    process.env.SUPABASE_DB_PASSWORD || process.env.databasepasword;
  const project = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
  if (!password)
    throw new Error(
      "Configura SUPABASE_DB_PASSWORD en .env para administrar tu base.",
    );
  const pooler = new URL(
    fs.readFileSync("supabase/.temp/pooler-url", "utf8").trim(),
  );
  // La URL de Supabase exige TLS. Las credenciales nunca se imprimen ni se exponen a Vite.
  return new pg.Client({
    host: pooler.hostname,
    port: Number(pooler.port || 5432),
    database: "postgres",
    user: `postgres.${project}`,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}
export function reportFailure(error) {
  console.error(
    JSON.stringify({
      ok: false,
      code: error.code || null,
      message:
        error.message?.replace(
          /postgres(?:ql)?:\/\/[^\s]+/g,
          "[conexión omitida]",
        ) || "No se pudo conectar con Supabase.",
    }),
  );
  process.exitCode = 1;
}
