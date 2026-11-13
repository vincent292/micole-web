import { test, expect, type Page } from "@playwright/test";
import { seed } from "../src/lib/seed";
import { showFormSection } from "./form-sections";

test.use({ reducedMotion: "reduce" });

const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const year = Number(day.slice(0, 4));
const names = ["Sofía Martínez", "Mateo García", "Emma Rivera"];

async function demoFixture(page: Page, mode: "auto" | "kinder" | "school" = "auto", mixed = false) {
  const data = structuredClone(seed);
  data.schools = data.schools.filter(school => school.id === "s1");
  data.schools[0].educationLevels = mixed ? ["Inicial", "Primaria"] : ["Guardería", "Inicial"];
  data.schools[0].workspaceMode = mode;
  data.classrooms = data.classrooms.filter(room => room.schoolId === "s1").map(room => ({ ...room, active: true, academicYear: year }));
  data.students = data.students.filter(student => student.schoolId === "s1").map((student, index) => ({
    ...student, classroomId: index < 3 ? "c1" : student.classroomId, status: "active" as const,
    profileComplete: true, enrolledAt: `${year}-01-01`,
  }));
  await page.addInitScript(({ data }) => {
    if (!localStorage.getItem("kinder_browser_fixture")) {
      localStorage.setItem("aulanexo_demo_v2", JSON.stringify(data));
      localStorage.setItem("micole_public_demo_v1", JSON.stringify(data));
      localStorage.removeItem("micole_public_demo_school_v1");
      localStorage.setItem("kinder_browser_fixture", "ready");
    }
    sessionStorage.setItem("micole_public_demo_session", "director");
  }, { data });
}

async function setMode(page: Page, mode: "auto" | "kinder" | "school") {
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Editar identidad", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await showFormSection(page, "Niveles educativos");
  const levels = mode === "kinder" ? ["Inicial / kínder"] : mode === "school" ? ["Primaria", "Secundaria"] : ["Inicial / kínder", "Primaria"];
  for (const level of ["Inicial / kínder", "Primaria", "Secundaria", "Guardería", "Educación especial", "Otros"]) {
    await dialog.getByRole("checkbox", { name: level, exact: true }).setChecked(levels.includes(level));
  }
  while (await dialog.getByRole("button", { name: "Siguiente", exact: true }).count()) {
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function prepareMeal(page: Page, food: string) {
  await page.goto("/app/care");
  await page.getByRole("button", { name: "Registrar para el aula", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar para el aula", exact: true });
  await dialog.getByRole("combobox", { name: "Tipo de cuidado", exact: true }).selectOption("meal");
  await dialog.getByLabel("Alimento", { exact: true }).fill(food);
  await dialog.getByRole("combobox", { name: "Hora", exact: true }).selectOption("08:00");
  return dialog;
}

test("el modo automático prioriza kínder, conserva otros módulos y el cambio de modo persiste", async ({ page }) => {
  await demoFixture(page);
  await page.goto("/app/overview");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("button", { name: "Mi jornada", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Así fue su día", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Materias", exact: true })).toBeHidden();
  await nav.getByText("Más opciones", { exact: true }).click();
  await expect(nav.getByRole("button", { name: "Materias", exact: true })).toBeVisible();
  await page.goto("/app/subjects");
  await expect(page.getByRole("heading", { name: "Materias", exact: true }).first()).toBeVisible();
  await setMode(page, "school");
  await page.reload();
  await expect(nav.getByRole("button", { name: "Resumen", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Mi jornada", exact: true })).toHaveCount(0);
  await setMode(page, "kinder");
  await page.reload();
  await expect(nav.getByRole("button", { name: "Mi jornada", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("aulanexo_demo_v2") || "{}").schools[0].workspaceMode)).toBe("kinder");
});

test("una sede mixta conserva su navegación escolar en modo automático", async ({ page }) => {
  await demoFixture(page, "auto", true);
  await page.goto("/app/overview");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("button", { name: "Resumen", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Mi jornada", exact: true })).toHaveCount(0);
  await page.goto("/app/classrooms?classroom=c1&tab=care");
  await expect(page.getByRole("heading", { name: "Así fue su día", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar para el aula", exact: true })).toBeVisible();
});

test("el lote exige selección, excluye niños y conserva cantidades y observaciones individuales", async ({ page }) => {
  await demoFixture(page, "kinder");
  const food = "Merienda compartida del aula";
  const dialog = await prepareMeal(page, food);
  await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Seleccionar todos", exact: true }).click();
  await dialog.locator(".care-batch-select-row").filter({ hasText: names[2] }).getByRole("checkbox").uncheck();
  await dialog.getByRole("button", { name: "Revisar registros", exact: true }).click();
  await expect(dialog.locator(".care-batch-review-row")).toHaveCount(2);
  await expect(dialog.locator(".care-batch-review-row").filter({ hasText: names[2] })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: `Cantidad para ${names[1]}`, exact: true }).selectOption("half");
  await dialog.getByLabel(`Observación para ${names[1]}`, { exact: true }).fill("Pidió una porción más pequeña.");
  await dialog.getByRole("button", { name: "Guardar cuidados", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "2 cuidados guardados." })).toBeVisible();
  await expect(page.locator(".care-timeline")).toContainText(food);
  await page.getByRole("combobox", { name: "Estudiante", exact: true }).selectOption("a2");
  await expect(page.locator(".care-timeline")).toContainText("La mitad");
  await expect(page.locator(".care-timeline")).toContainText("Pidió una porción más pequeña.");
  await page.getByRole("combobox", { name: "Estudiante", exact: true }).selectOption("a3");
  await expect(page.locator(".care-timeline")).not.toContainText(food);
  await page.reload();
  await page.getByRole("combobox", { name: "Estudiante", exact: true }).selectOption("a2");
  await expect(page.locator(".care-timeline")).toContainText(food);
  const records = await page.evaluate(food => JSON.parse(localStorage.getItem("micole_public_demo_school_v1") || "{}").workspace.care.filter((record: { food: string }) => record.food === food), food);
  expect(records.map((record: { studentId: string }) => record.studentId).sort()).toEqual(["a1", "a2"]);
});

test("selección y revisión del aula se adaptan al celular sin perder las acciones", async ({ page }, testInfo) => {
  await demoFixture(page, "kinder");
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const dialog = await prepareMeal(page, "Fruta picada");
  await dialog.getByRole("button", { name: "Seleccionar todos", exact: true }).click();
  await expect(dialog.locator(".modal-footer")).toBeInViewport();
  await dialog.getByRole("button", { name: "Revisar registros", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Guardar cuidados", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("kinder-cuidados-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

const uuid = (n: number) => `cb000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function liveFixture(page: Page, role: "director" | "guardian" = "director") {
  const [userId, schoolId, roomId] = [1, 20, 30].map(uuid);
  const pupilIds = [40, 41, 42].map(uuid);
  const user = { id: userId, email: "kinder@example.invalid", aud: "authenticated", role: "authenticated", user_metadata: { full_name: "Cuenta de pruebas" }, app_metadata: { provider: "email" } };
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
  await page.addInitScript(session => localStorage.setItem("sb-micole-test-auth-token", JSON.stringify(session)), { access_token: jwt, refresh_token: "test-refresh", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user });
  await page.route("**/auth/v1/**", route => route.fulfill({ json: route.request().url().includes("/settings") ? { external: { email: true } } : user }));
  const state = {
    care: [] as Record<string, unknown>[],
    writes: [] as Record<string, unknown>[],
    failed: false,
    loseFirstResponse: false,
    rejectFirst: false,
    rejected: false,
    schoolId, roomId, pupilIds,
  };
  await page.route("**/rest/v1/**", async route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").at(-1);
    const body = request.method() === "POST" ? request.postDataJSON() || {} : {};
    let json: unknown = [];
    if (name === "workspace_identity") json = { id: userId, email: user.email, name: "Cuenta de pruebas", roles: [role], memberships: [{ schoolId, role }], teacherIds: [], guardianStudentIds: role === "guardian" ? [pupilIds[0]] : [], support: null };
    else if (name === "schools") json = [{ id: schoolId, name: "Kínder de pruebas", slug: "kinder-pruebas", city: "Cochabamba", status: "active", platform_enabled: true, brand_color: "#24916a", education_levels: ["Inicial"], workspace_mode: "kinder" }];
    else if (name === "classrooms") json = [{ id: roomId, school_id: schoolId, name: "Inicial A", level: "Inicial", academic_year: year, schedule: "08:00 – 12:00", active: true }];
    else if (name === "student_directory") json = names.map((name, index) => ({ id: pupilIds[index], school_id: schoolId, classroom_id: roomId, first_name: name.split(" ")[0], last_name: name.split(" ")[1], birth_date: `${year - 4}-01-01`, status: "active", enrolled_at: `${year}-01-01`, profile_complete: true, monthly_fee: 400, primary_guardian_name: "Familia de pruebas", primary_guardian_email: user.email }));
    else if (name === "finance_register") json = { receipts: [], invoices: [] };
    else if (name === "platform_tariffs") json = { activationFee: 50, monthlyLicenseFee: 29, inherited: true };
    else if (name === "school_workspace") json = { years: [], enrollments: [], care: state.care, terms: [], assessments: [], scores: [], cards: [] };
    else if (name === "save_care_batch") {
      state.writes.push(body);
      if (state.rejectFirst && !state.rejected) {
        state.rejected = true;
        await route.fulfill({ status: 400, json: { code: "P0001", message: "Selecciona únicamente niños activos que pertenezcan a esta aula." } });
        return;
      }
      if (!state.care.some(record => record.request_id === body.p_request_id)) {
        state.care.push(...body.p_records.map((record: Record<string, unknown>, index: number) => ({ ...record, id: uuid(800 + index), school_id: schoolId, classroom_id: roomId, entry_date: body.p_day, request_id: body.p_request_id })));
      }
      if (state.loseFirstResponse && !state.failed) { state.failed = true; await route.fulfill({ status: 503, json: { message: "Se perdió la respuesta después de guardar." } }); return; }
      json = { saved: body.p_records.length };
    }
    await route.fulfill({ json });
  });
  return state;
}

test("un fallo después de guardar conserva el pedido al cerrar y reabrir, y permite reintentar sin duplicar", async ({ page }) => {
  const state = await liveFixture(page); state.loseFirstResponse = true;
  await page.goto("http://localhost:4174/app/care");
  await page.getByRole("button", { name: "Registrar para el aula", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar para el aula", exact: true });
  await dialog.getByLabel("Alimento", { exact: true }).fill("Merienda con reintento");
  await dialog.getByRole("button", { name: "Seleccionar todos", exact: true }).click();
  await dialog.getByRole("button", { name: "Revisar registros", exact: true }).click();
  await dialog.getByRole("button", { name: "Guardar cuidados", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: `Cantidad para ${names[0]}`, exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Volver a la selección", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await dialog.getByRole("button", { name: "Descartar y cerrar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Registrar para el aula", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Reintentar guardado", exact: true })).toBeVisible();
  await expect(dialog.locator(".care-batch-review-row")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.care).toHaveLength(3);
  await expect(page.getByRole("status").filter({ hasText: "3 cuidados guardados." })).toBeVisible();
});

test("un rechazo definitivo permite corregir la selección y guardar un lote nuevo", async ({ page }) => {
  const state = await liveFixture(page); state.rejectFirst = true;
  await page.goto("http://localhost:4174/app/care");
  await page.getByRole("button", { name: "Registrar para el aula", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar para el aula", exact: true });
  await dialog.getByLabel("Alimento", { exact: true }).fill("Merienda con selección corregida");
  await dialog.getByRole("button", { name: "Seleccionar todos", exact: true }).click();
  await dialog.getByRole("button", { name: "Revisar registros", exact: true }).click();
  await dialog.getByRole("button", { name: "Guardar cuidados", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Selecciona únicamente niños activos que pertenezcan a esta aula.");
  expect(state.care).toHaveLength(0);
  await expect(dialog.getByRole("combobox", { name: `Cantidad para ${names[0]}`, exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Volver a la selección", exact: true }).click();
  await dialog.locator(".care-batch-select-row").filter({ hasText: names[2] }).getByRole("checkbox").uncheck();
  await dialog.getByRole("button", { name: "Revisar registros", exact: true }).click();
  await expect(dialog.locator(".care-batch-review-row")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Guardar cuidados", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0].p_request_id).not.toBe(state.writes[1].p_request_id);
  expect(state.care).toHaveLength(2);
  expect(state.care.some(record => record.student_id === state.pupilIds[2])).toBe(false);
  await expect(page.getByRole("status").filter({ hasText: "2 cuidados guardados." })).toBeVisible();
});

test("la familia consulta el resumen de su hijo y no recibe acciones de registro en lote", async ({ page }) => {
  const state = await liveFixture(page, "guardian");
  state.care.push(
    { id: uuid(901), student_id: state.pupilIds[0], classroom_id: state.roomId, entry_date: day, kind: "meal", occurred_at: "09:00", food: "Merienda de Sofía", amount: "all", note: "Resumen para su familia." },
    { id: uuid(902), student_id: state.pupilIds[1], classroom_id: state.roomId, entry_date: day, kind: "meal", occurred_at: "09:00", food: "Merienda privada de Mateo", amount: "half", note: "Observación de otra familia." },
  );
  await page.goto("http://localhost:4174/app/care");
  await expect(page.locator(".care-timeline")).toContainText("Merienda de Sofía");
  await expect(page.locator(".care-timeline")).not.toContainText("Merienda privada de Mateo");
  await expect(page.getByRole("button", { name: "Registrar para el aula", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar cuidado", exact: true })).toHaveCount(0);
});
