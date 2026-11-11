import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const folder = "output/qa/2026-10-29-landing-editorial",
  prepared = JSON.parse(fs.readFileSync(folder + "/release-preparado.json"));
const [deployment, deploymentId] = process.argv.slice(2);
assert.match(
  deployment || "",
  /^https:\/\/micole-[a-z0-9]+-vincent292s-projects\.vercel\.app$/,
);
assert.match(deploymentId || "", /^dpl_[A-Za-z0-9]+$/);
const cli =
    "/Users/vincentariassaavedra/.npm/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js",
  publicMode = process.argv.includes("--public");
const report = {
  deployment,
  deploymentId,
  staticOnly: true,
  sourceFilesUploaded: false,
  promoted: publicMode,
  checks: [],
  localBrowserFlows: 30,
  unitTests: 19,
};
for (let i = 0; i < prepared.checks.length; i++) {
  const item = prepared.checks[i];
  let bytes;
  if (publicMode) {
    const response = await fetch("https://www.micole.click" + item.path, {
      headers: { "Cache-Control": "no-cache" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    const temp = path.resolve(`tmp/landing-refresh-check-${i}.bin`);
    execFileSync(
      process.execPath,
      [
        cli,
        "curl",
        item.path,
        "--deployment",
        deployment,
        "--",
        "--silent",
        "--show-error",
        "--fail",
        "--output",
        temp,
      ],
      { cwd: path.resolve(prepared.root), stdio: ["ignore", "pipe", "pipe"] },
    );
    bytes = fs.readFileSync(temp);
  }
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    item.sha256,
    item.path,
  );
  report.checks.push({ ...item, matchesCompiled: true, public: publicMode });
}
fs.writeFileSync(
  folder + (publicMode ? "/release.json" : "/candidato-verificado.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    ok: true,
    deployment,
    checks: report.checks.length,
    promoted: publicMode,
  }),
);
