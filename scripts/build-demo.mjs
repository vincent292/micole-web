import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
// Explicit overrides: .env.local / production settings cannot connect this build.
const env = {
  ...process.env,
  VITE_PUBLIC_DEMO: "true",
  VITE_APP_MODE: "demo",
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_PUBLISHABLE_KEY: "",
  VITE_R2_ENABLED: "false",
  VITE_GOOGLE_MAPS_EMBED_KEY: "",
  VITE_DEMO_URL: "",
  VITE_SITE_URL: "",
};
const result = spawnSync("npm", ["run", "build"], { stdio: "inherit", env });
if (result.status !== 0) process.exit(result.status || 1);
const file = new URL("../dist/index.html", import.meta.url);
writeFileSync(
  file,
  readFileSync(file, "utf8")
    .replace(
      /<title>[^<]*<\/title>/,
      "<title>Demo MiCole · Explora tu comunidad</title>",
    ),
);
console.log(
  "Demo aislada compilada en dist/. Publicar únicamente en el proyecto de demostración.",
);
