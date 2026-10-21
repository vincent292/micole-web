import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export function prepareDemoOutput(
  destination = path.join(root, ".vercel/output"),
) {
  const output = path.resolve(destination);
  const staticRoot = path.join(output, "static");
  const functionRoot = path.join(output, "functions/demo-gate.func");
  fs.mkdirSync(output, { recursive: true });
  fs.rmSync(staticRoot, { force: true, recursive: true });
  fs.cpSync(path.join(root, "dist"), staticRoot, { recursive: true });
  for (const entry of fs.readdirSync(staticRoot, { recursive: true })) {
    if (
      String(entry).endsWith(".js") &&
      fs
        .readFileSync(path.join(staticRoot, String(entry)), "utf8")
        .includes("tpzvrtapyvulghxywtwd.supabase.co")
    )
      throw new Error("La demo contiene una conexión de producción.");
  }
  fs.mkdirSync(functionRoot, { recursive: true });
  fs.copyFileSync(
    path.join(root, "server/demo-access.js"),
    path.join(functionRoot, "demo-access.js"),
  );
  fs.writeFileSync(
    path.join(functionRoot, "index.js"),
    `import { createDemoGate } from './demo-access.js';\nexport default createDemoGate({credentialDigest:process.env.DEMO_ACCESS_CREDENTIAL_HASH,sessionSecret:process.env.DEMO_SESSION_SECRET});\n`,
  );
  fs.writeFileSync(
    path.join(functionRoot, ".vc-config.json"),
    JSON.stringify(
      {
        runtime: "edge",
        entrypoint: "index.js",
        envVarsInUse: ["DEMO_ACCESS_CREDENTIAL_HASH", "DEMO_SESSION_SECRET"],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(output, "config.json"),
    JSON.stringify(
      {
        version: 3,
        routes: [
          {
            src: "/(.*)",
            headers: {
              "Content-Security-Policy":
                "default-src 'self'; script-src 'self'; connect-src 'self' data: blob:; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
              "Cache-Control": "private, no-store, max-age=0",
              "X-Robots-Tag": "noindex, nofollow",
              "Referrer-Policy": "same-origin",
              "X-Content-Type-Options": "nosniff",
              "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            },
            continue: true,
          },
          {
            src: "/(.*)",
            middlewarePath: "demo-gate",
            middlewareRawSrc: ["/(.*)"],
            continue: true,
          },
          { handle: "filesystem" },
          { src: "/(.*)", dest: "/index.html" },
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Demo preparada con validación de acceso en servidor y archivos protegidos.",
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  prepareDemoOutput(process.argv[2]);
