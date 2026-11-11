// Only compiled static assets are staged; no source, environment or private credentials.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root = "tmp/web-registration-release",
  out = root + "/.vercel/output";
assert.ok(fs.existsSync("dist/app.html"));
fs.mkdirSync(out, { recursive: true });
fs.rmSync(out + "/static", {recursive:true, force:true});
fs.cpSync("dist", out + "/static", { recursive: true });
fs.copyFileSync(".vercel/project.json", root + "/.vercel/project.json");
const routes = [
  {
    src: "^/(.*)$",
    headers: { Location: "https://www.micole.click/$1" },
    status: 308,
    has: [{ type: "host", value: "micole.click" }],
  },
  {
    src: "^/(.*)$",
    headers: {
      "Content-Security-Policy":
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    continue: true,
  },
  {
    src: "^/(.*)$",
    headers: { "X-Robots-Tag": "noindex, nofollow" },
    has: [{ type: "host", value: ".*\\.vercel\\.app" }],
    continue: true,
  },
  {
    src: "^/robots\\.txt$",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    continue: true,
  },
  {
    src: "^/sitemap\\.xml$",
    headers: { "Content-Type": "application/xml; charset=utf-8" },
    continue: true,
  },
  { handle: "filesystem" },
  { src: "^/$", dest: "/index.html", check: true },
  { src: "^/(.*)$", dest: "/app.html", check: true },
];
fs.writeFileSync(
  out + "/config.json",
  JSON.stringify({ version: 3, routes }, null, 2) + "\n",
);
const files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else {
      assert.ok(!/\.env|\.map$|\.tsx?$|\.sql$|\.jks$|\.keystore$/.test(name));
      files.push(p);
    }
  }
}
walk(out + "/static");
const assets = fs
  .readdirSync("dist/assets")
  .filter((n) => /\.(js|css)$/.test(n));
const checks = assets.map((name) => ({
  path: "/assets/" + name,
  sha256: createHash("sha256")
    .update(fs.readFileSync("dist/assets/" + name))
    .digest("hex"),
}));
checks.push({
  path: "/app/overview",
  sha256: createHash("sha256")
    .update(fs.readFileSync("dist/app.html"))
    .digest("hex"),
});
fs.writeFileSync(
  "output/qa/2026-11-09-registration/release-preparado.json",
  JSON.stringify(
    {
      project: JSON.parse(fs.readFileSync(".vercel/project.json")).projectName,
      root,
      staticOnly: true,
      files: files.length,
      checks,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    root,
    staticOnly: true,
    files: files.length,
    sourceFilesUploaded: false,
  }),
);
