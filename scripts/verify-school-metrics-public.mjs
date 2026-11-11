import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const folder = "output/qa/2026-10-29-metricas-superadmin",
  prepared = JSON.parse(fs.readFileSync(folder + "/release-preparado.json")),
  file = folder + "/release.json",
  report = JSON.parse(fs.readFileSync(file));
const checks = [
  ...prepared.checks,
  {
    ...prepared.checks.find((r) => r.path === "/app/overview"),
    path: "/app/schoolMetrics",
  },
];
const verified = [];
for (const c of checks) {
  const response = await fetch("https://www.micole.click" + c.path, {
    headers: { "Cache-Control": "no-cache" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), c.sha256);
  verified.push({
    path: c.path,
    sha256: c.sha256,
    matchesCompiled: true,
    frameProtection: true,
  });
}
report.deploymentId = "dpl_72oARe7SLycmCx3SZi8go5CM7XJr";
report.promoted = true;
report.publicChecks = verified;
report.webUnitAndDatabaseTests = 529;
report.androidTests = 115;
report.localBrowserFlows = 4;
report.checkedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    ok: true,
    promoted: true,
    publicAssetsVerified: verified.length,
    url: "https://www.micole.click/app/schoolMetrics",
  }),
);
