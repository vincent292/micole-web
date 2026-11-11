// Existing owner identity for SQL read-only verification; ordinary QA Auth for denial checks.
import fs from "node:fs";
import assert from "node:assert/strict";
import { databaseClient } from "./database.mjs";
import { qa, session, day } from "./qa-session.mjs";
const db = databaseClient(),
  checks = [];
const from = day.slice(0, 7) + "-01";
try {
  await db.connect();
  await db.query("begin read only");
  const owner = (
    await db.query(
      "select user_id from public.platform_admins order by user_id limit 1",
    )
  ).rows[0]?.user_id;
  assert.ok(owner, "No hay propietario registrado");
  await db.query("set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)",
    [owner],
  );
  for (const env of ["production", "testing", "all"])
    for (const group of ["week", "month"]) {
      const m = (
        await db.query(
          "select public.platform_school_metrics($1,$2,$3,null,null,$4) m",
          [from, day, group, env],
        )
      ).rows[0].m;
      assert.equal(m.scope, "platform-school-metrics");
      assert.equal(m.environment, env);
      assert.equal(m.group, group);
      assert.equal(
        m.summary.activeStudents,
        m.institutions.reduce((n, r) => n + r.activeStudents, 0),
      );
      assert.equal(
        m.summary.newStudents,
        m.trend.reduce((n, r) => n + r.newStudents, 0),
      );
      assert.ok(
        Math.abs(
          m.summary.collected - m.trend.reduce((n, r) => n + r.collected, 0),
        ) < 0.01,
      );
      if (env !== "all")
        assert.ok(m.schools.every((s) => s.testing === (env === "testing")));
      const serialized = JSON.stringify(m);
      assert.ok(
        !/"(studentId|student_name|first_name|last_name|email|actor_id|viewer_id)":/.test(
          serialized,
        ),
      );
      checks.push({
        environment: env,
        group,
        institutions: m.institutions.length,
        aggregateTotalsMatch: true,
        individualDataReturned: false,
      });
    }
  const m = (
    await db.query(
      "select public.platform_school_metrics($1,$2,'week',$3,null,'testing') m",
      [from, day, qa.schoolId],
    )
  ).rows[0].m;
  assert.equal(m.institutions.length, 1);
  assert.equal(m.institutions[0].id, qa.schoolId);
  const course = m.classrooms[0];
  if (course) {
    const c = (
      await db.query(
        "select public.platform_school_metrics($1,$2,'week',$3,$4,'testing') m",
        [from, day, qa.schoolId, course.id],
      )
    ).rows[0].m;
    assert.equal(c.classroomId, course.id);
    assert.ok(c.summary.activeStudents <= m.summary.activeStudents);
  }
  await db.query("rollback");
  const denials = [];
  for (const a of qa.accounts) {
    const c = await session(a.key);
    try {
      const { error } = await c.rpc("platform_school_metrics", {
        p_from: from,
        p_to: day,
      });
      assert.ok(error?.message.includes("Solo Superadministración"));
      denials.push({ role: a.role, account: a.key, denied: true });
    } finally {
      await c.auth.signOut({ scope: "local" });
    }
  }
  fs.writeFileSync(
    "output/qa/2026-10-29-metricas-superadmin/api.json",
    JSON.stringify(
      {
        status: "passed",
        date: day,
        ownerVerification:
          "SQL authenticated role, existing owner, read-only transaction rolled back",
        checks,
        qaCourseChecked: !!course,
        normalAuthRoleDenials: denials,
        individualDataReturned: false,
        financialOrAcademicWrites: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      ok: true,
      ownerAggregateChecks: checks.length,
      normalAuthRoleDenials: denials.length,
      courseChecked: !!course,
      financialOrAcademicWrites: false,
    }),
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
