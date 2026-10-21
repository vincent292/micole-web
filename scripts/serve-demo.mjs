// Local browser verification uses the exact gate deployed to Vercel.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDemoGate } from "../server/demo-access.js";
const testing = process.env.MICOLE_DEMO_LOCAL_TEST === "1";
const gate = createDemoGate({
  credentialDigest: testing
    ? createHash("sha256")
        .update("invitado@example.test\0AccesoLocalSoloPruebas!")
        .digest("hex")
    : process.env.DEMO_ACCESS_CREDENTIAL_HASH,
  sessionSecret: testing
    ? "local-tests-only-session-signing-secret-2026"
    : process.env.DEMO_SESSION_SECRET,
});
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
http
  .createServer(async (req, res) => {
    try {
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: req, duplex: "half" }
          : {}),
      });
      const response = await gate(request);
      for (const [key, value] of response.headers)
        if (key !== "x-middleware-next") res.setHeader(key, value);
      if (response.headers.get("x-middleware-next") === "1") {
        const name = decodeURIComponent(new URL(request.url).pathname);
        const candidate = path.resolve(root, `.${name}`);
        if (!candidate.startsWith(root)) {
          res.writeHead(400);
          return res.end();
        }
        const file =
          fs.existsSync(candidate) && fs.statSync(candidate).isFile()
            ? candidate
            : path.join(root, "index.html");
        res.setHeader(
          "Content-Type",
          types[path.extname(file)] || "application/octet-stream",
        );
        res.writeHead(200);
        res.end(fs.readFileSync(file));
      } else {
        res.writeHead(response.status);
        res.end(Buffer.from(await response.arrayBuffer()));
      }
    } catch {
      res.writeHead(500);
      res.end("No se pudo atender la solicitud.");
    }
  })
  .listen(4177, "127.0.0.1", () =>
    console.log("Demo privada local disponible en 4177."),
  );
