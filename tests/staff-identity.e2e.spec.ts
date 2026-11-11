import { test, expect, type Page } from "@playwright/test";

const id = (n: number) => `bd000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = id(1), school = id(20), teacher = id(50), other = id(51), support = id(80);
test.use({ baseURL: "http://localhost:4174", geolocation: { latitude: -16.5, longitude: -68.1 }, permissions: ["geolocation"] });

async function setup(page: Page, role: string, testing: boolean, selected = teacher) {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: account, email: "persona@example.invalid", aud: "authenticated", role: "authenticated", user_metadata: { full_name: "Cuenta de prueba" }, app_metadata: { provider: "email" }, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated" })).toString('base64url')}.test`;
  await page.addInitScript(({ user, jwt, now, testing, support }) => {
    localStorage.setItem('sb-micole-test-auth-token', JSON.stringify({ user, access_token: jwt, refresh_token: 'test', expires_at: now + 3600, expires_in: 3600, token_type: 'bearer' }));
    if (testing) sessionStorage.setItem('micole_support_session', support);
  }, { user, jwt, now, testing, support });
  await page.route('**/auth/v1/**', r => r.fulfill({ json: r.request().url().includes('/settings') ? { external: { email: true } } : user }));
  const calls: { name: string | undefined; body: any; support?: string }[] = [];
  await page.route('**/rest/v1/**', async r => {
    const req = r.request(), name = new URL(req.url()).pathname.split('/').pop();
    let body: any = {}; try { body = req.postDataJSON() || {}; } catch { /* GET */ }
    calls.push({ name, body, support: req.headers()['x-micole-support'] });
    let json: unknown = [];
    if (name === 'workspace_identity') json = {
      id: account, name: selected === teacher ? 'Janeth Arias' : 'Otra profesora', email: user.email, roles: [role], canSupport: testing,
      memberships: [{ schoolId: school, role }], teacherIds: role === 'teacher' ? [selected] : [], guardianStudentIds: [], studentIds: [],
      support: testing ? { id: support, schoolId: school, role, mode: 'test', reason: 'Prueba de identidad', expiresAt: new Date(Date.now() + 7200000).toISOString(), adminId: account } : null,
    };
    else if (name === 'schools') json = [{ id: school, name: 'Institución ficticia', slug: 'identity-test', status: 'active', platform_enabled: true, city: 'La Paz' }];
    else if (name === 'student_portal') json = { accessAllowed: true, accessMessage: '', schools: [{id: school, name: 'Institución ficticia', status: 'active', platformEnabled: true}], students: [], classrooms: [], events: [], announcements: [], dailyEntries: [] };
    else if (name === 'staff_workspace') json = {
      // Deliberately broader than a teacher response: the personal UI must still
      // use its verified identity, including accounts with more than one role.
      canManage: true,
      settings: { school_id: school, arrival_enabled: true, latitude: -16.5, longitude: -68.1, radius_m: 150, max_accuracy_m: 50, deductions_enabled: false },
      teachers: [{ id: teacher, name: 'Janeth Arias' }, { id: other, name: 'Otra profesora' }],
      profiles: [teacher, other].map(t => ({ id: t, school_id: school, teacher_id: t, pay_type: 'monthly', monthly_salary: 3000, hourly_rate: 60, active: true, schedule: [] })),
      records: [], openRecords: [], payrolls: [],
    };
    else if (name === 'mark_staff_attendance') json = body.p_id;
    else if (name === 'finance_register') json = { receipts: [], invoices: [] };
    await r.fulfill({ json });
  });
  return calls;
}

for (const width of [390, 1440]) for (const testing of [false, true]) {
  test(`docente marca automáticamente para su cuenta ${testing ? 'en pruebas' : 'normal'} a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const selected = testing ? teacher : other;
    const calls = await setup(page, 'teacher', testing, selected);
    await page.goto('/app/staffAttendance');
    await expect(page.getByRole('heading', { name: 'Mi asistencia', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Docente', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registrar corrección', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Configurar ubicación y reglas' })).toHaveCount(0);
    await expect(page.locator('.staff-clock')).toHaveCount(1);
    await expect(page.locator('.staff-clock h2')).toHaveText(testing ? 'Janeth Arias' : 'Otra profesora');
    await page.getByLabel('Mes', { exact: true }).fill('2026-08');
    await page.getByRole('button', { name: 'Marcar entrada', exact: true }).click();
    await expect.poll(() => calls.filter(c => c.name === 'mark_staff_attendance').length).toBe(1);
    const mark = calls.find(c => c.name === 'mark_staff_attendance')!;
    expect(Object.keys(mark.body).sort()).toEqual(['p_id', 'p_kind', 'p_location', 'p_teacher_id']);
    expect(mark.body).toMatchObject({ p_teacher_id: selected, p_kind: 'in', p_location: { latitude: -16.5, longitude: -68.1 } });
    expect(mark.support).toBe(testing ? support : undefined);
    await page.goto('/app/staffPayroll');
    await expect(page.getByRole('heading', { name: 'Mis boletas de pago', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Docente', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Preparar y revisar' })).toHaveCount(0);
  });
}

test('Dirección filtra el equipo y corrige con su rol, sin marcar GPS por un docente', async ({ page }) => {
  await setup(page, 'director', true);
  await page.goto('/app/staffAttendance');
  await expect(page.getByRole('combobox', { name: 'Docente', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar corrección', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar entrada', exact: true })).toHaveCount(0);
});

for (const role of ['guardian', 'student']) test(`${role} no tiene acceso a la marcación del personal`, async ({ page }) => {
  const calls = await setup(page, role, true);
  await page.goto('/app/staffAttendance');
  await expect(page).not.toHaveURL(/staffAttendance/);
  await expect(page.getByRole('button', { name: 'Marcar entrada', exact: true })).toHaveCount(0);
  expect(calls.some(c => c.name === 'staff_workspace')).toBe(false);
});
