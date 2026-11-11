import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const folder = "output/qa/2026-10-29-metricas-superadmin",
  file = folder + "/release.json";
const prepared = JSON.parse(
  fs.readFileSync(folder + "/release-preparado.json"),
);
const deployment = "https://micole-11yp1skmz-vincent292s-projects.vercel.app";
const cli =
  "/Users/vincentariassaavedra/.npm/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js";
const report = {
  deployment,
  deploymentId: "dpl_72oARe7SLycmCx3SZi8go5CM7XJr",
  staticOnly: true,
  sourceFilesUploaded: false,
  promoted: false,
  checks: [],
};
for (let i = 0; i < prepared.checks.length; i++) {
  const item = prepared.checks[i],
    temp = path.resolve(`tmp/release-check-${i}.bin`);
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
  const digest = createHash("sha256")
    .update(fs.readFileSync(temp))
    .digest("hex");
  assert.equal(digest, item.sha256, item.path);
  report.checks.push({ ...item, matchesCompiled: true });
}
fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    ok: true,
    checks: report.checks.length,
    deployment,
    promoted: false,
  }),
);
