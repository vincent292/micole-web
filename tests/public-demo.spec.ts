import { test, expect, type Page } from "@playwright/test";
import { showFormSection } from "./form-sections";
const key = "micole_public_demo_v1";
async function finishWizard(page:Page) {
 const d=page.getByRole('dialog');
 for(let i=0;i<15 && await d.getByRole('button',{name:'Siguiente',exact:true}).count();i++) await d.getByRole('button',{name:'Siguiente',exact:true}).click();
 await d.getByRole('button',{name:'Guardar',exact:true}).click();
}
const accessEmail = process.env.MICOLE_DEMO_TEST_EMAIL || "invitado@example.test";
const accessPassword = process.env.MICOLE_DEMO_TEST_PASSWORD || "AccesoLocalSoloPruebas!";
async function login(page: Page, selectedRole = "director") {
  await page.goto("/");
  if (await page.getByLabel("Correo de acceso", {exact:true}).count()) {
    await page.getByLabel("Correo de acceso", {exact:true}).fill(accessEmail);
    await page.getByLabel("Clave de acceso", {exact:true}).fill(accessPassword);
    await page.getByRole("button", {name:"Entrar a la demo",exact:true}).click();
  }
  await expect(page.getByRole("combobox", {name:"Rol de demostración"})).toBeVisible();
  await page.getByRole("combobox", {name:"Rol de demostración"}).selectOption(selectedRole);
  await expect(page.getByRole("combobox", {name:"Rol de demostración"})).toHaveValue(selectedRole);
}

async function role(page: Page, value: string) {
  await page
    .getByRole("combobox", { name: "Rol de demostración" })
    .selectOption(value);
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo", exact: true }),
  ).toBeVisible();
}
async function route(page: Page, path: string) {
  await page.goto(`/app/${path}`);
  await expect(page.locator("main h1:visible, main h2:visible").first()).toBeVisible();
}
async function local(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), key);
}
test("acceso privado, cuatro roles y pantallas sin conexiones externas", async ({
  page,
}) => {
  const requests: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      ["http:", "https:"].includes(u.protocol) &&
      u.origin !==
        new URL(process.env.MICOLE_DEMO_TEST_URL || "http://127.0.0.1:4177")
          .origin
    )
      requests.push(u.origin + u.pathname);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/students");
  await expect(
    page.getByRole("heading", { name: "Entrar a la demo", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Correo de acceso", {exact:true}).fill(accessEmail);
  await page
    .getByLabel("Clave de acceso", { exact: true })
    .fill("incorrecta");
  await page
    .getByRole("button", { name: "Entrar a la demo", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("no son correctos");
  await login(page);
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  await expect(page.locator(".profile-menu")).not.toContainText(
    "Superadministración",
  );
  await page.getByRole("button", { name: "Menú de perfil" }).click();
  for (const path of [
    "students",
    "teachers",
    "classrooms",
    "subjects",
    "assignments",
    "care",
    "gradebook",
    "years",
    "onboarding",
    "cash",
    "invoices",
    "reports",
    "journal",
    "calendar",
    "announcements",
    "messages",
    "requests",
    "grades",
    "gallery",
    "materials",
    "activities",
    "settings", "sites", "admissionForms", "calendarImport",
  ]) {
    await route(page, path);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".loading-screen")).toHaveCount(0);
  }
  for (const r of ["teacher", "guardian", "student"]) {
    await role(page, r);
    await route(page, "assignments");
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (r !== "teacher")
      await expect(
        page.getByRole("button", { name: "Nueva tarea", exact: true }),
      ).toHaveCount(0);
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
test("estudiante entrega archivo local, docente revisa y familia consulta sin editar", async ({
  page,
}) => {
  await login(page, "student");
  await route(page, "assignments");
  await page
    .getByRole("button", { name: "Entregar tarea", exact: true })
    .first()
    .click();
  let d = page.getByRole("dialog");
  await d
    .getByLabel("Tu respuesta", { exact: true })
    .fill("Mi color favorito es azul. Esta respuesta solo existe en la demo.");
  await d.locator("input[type=file]").setInputFiles({
    name: "tarea-demo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nArchivo ficticio para probar adjuntos."),
  });
  await expect(d).toContainText("Adjunto: tarea-demo.pdf");
  await d.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  await expect(d).toHaveCount(0);
  await role(page, "teacher");
  await route(page, "assignments");
  await page
    .getByRole("button", { name: /Ver tarea y entregas/ })
    .first()
    .click();
  const row = page
    .locator(".academic-submission")
    .filter({ hasText: "Sofía Martínez" });
  await row
    .getByRole("button", { name: "Revisar entrega", exact: true })
    .first()
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Nota (opcional, hasta 100)", { exact: true }).fill("95");
  await d
    .getByLabel("Comentarios", { exact: true })
    .fill("Excelente trabajo de demostración.");
  await finishWizard(page);
  await expect(d).toHaveCount(0);
  await role(page, "guardian");
  await route(page, "assignments");
  await page
    .getByRole("button", { name: "Ver tarea", exact: true })
    .first()
    .click();
  await expect(page.locator("main")).toContainText(
    "Excelente trabajo de demostración.",
  );
  await expect(
    page.getByRole("button", { name: "Entregar tarea", exact: true }),
  ).toHaveCount(0);
  const data = await local(page);
  expect(data.submissions.find((s: any) => s.studentId === "a1")).toMatchObject(
    { status: "reviewed", score: 95 },
  );
  expect(data.assignmentFiles).toHaveLength(1);
});
test("pago simulado acredita abono, genera recibo y conserva el saldo", async ({
  page,
}) => {
  await login(page);
  await route(page, "cash");
  await page.getByLabel("Estudiante para el cobro").selectOption("a2");
  const first = page
    .getByRole("checkbox", { name: /Seleccionar Mensualidad/ })
    .first();
  await first.check();
  const amount = page
    .getByRole("spinbutton", { name: /Abono para Mensualidad/ })
    .first();
  await amount.fill("210");
  await page
    .getByRole("button", { name: "Generar QR bancario", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("button", { name: "Preparar pago simulado", exact: true })
    .click();
  await expect(d).toContainText("SIMULACIÓN · SIN COBRO");
  await d
    .getByRole("button", { name: "Simular pago recibido", exact: true })
    .click();
  await expect(d).toContainText("Pago simulado registrado");
  await d.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  await expect
    .poll(async () => {
      const data = await local(page);
      return data.charges.find((c: any) => c.id === "p2")?.paidAmount;
    })
    .toBe(210);
  const data = await local(page);
  expect(data.charges.find((c: any) => c.id === "p2")).toMatchObject({
    amount: 420,
    paidAmount: 210,
    status: "pending",
  });
  expect(
    data.schoolReceipts.some(
      (r: any) => r.total === 210 && r.paymentMethod === "qr",
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Estudiante para el cobro")).toBeVisible();
  expect(
    (await local(page)).charges.find((c: any) => c.id === "p2").paidAmount,
  ).toBe(210);
});
test("cuidados, materias y gestiones se guardan localmente y se restablecen", async ({
  page,
  browser,
}) => {
  await login(page, "teacher");
  await route(page, "care");
  await page
    .getByRole("button", { name: "Registrar cuidado", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d
    .getByLabel("Alimento", { exact: false })
    .fill("Sopa de verduras de ejemplo");
  await finishWizard(page);
  await expect(d).toHaveCount(0);
  await expect(page.locator("main")).toContainText(
    "Sopa de verduras de ejemplo",
  );
  await role(page, "guardian");
  await route(page, "care");
  await expect(page.locator("main")).toContainText(
    "Sopa de verduras de ejemplo",
  );
  await expect(
    page.getByRole("button", { name: "Registrar cuidado", exact: true }),
  ).toHaveCount(0);
  await role(page, "director");
  await route(page, "subjects");
  await page
    .getByRole("button", { name: "Asignar materia", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Materia", { exact: true }).fill("Robótica de ejemplo");
  await finishWizard(page);
  await expect(
    page.getByRole("heading", { name: "Robótica de ejemplo", exact: true }),
  ).toBeVisible();
  await route(page, "years");
  await page
    .getByRole("button", { name: "Nueva gestión", exact: true })
    .click();
  d = page.getByRole("dialog");
  await finishWizard(page);
  await expect(d).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Gestión 2027/ })).toHaveCount(
    1,
  );
  const other = await browser.newContext(),
    visitor = await other.newPage();
  await visitor.goto(page.url());
  await expect(
    visitor.getByRole("heading", { name: "Entrar a la demo", exact: true }),
  ).toBeVisible();
  await login(visitor);
  expect(
    (await local(visitor)).subjects.some(
      (s: any) => s.name === "Robótica de ejemplo",
    ),
  ).toBe(false);
  await other.close();
  await page
    .getByRole("button", { name: "Restablecer demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sí, restablecer", exact: true })
    .click();
  await route(page, "subjects");
  await expect(
    page.getByRole("heading", { name: "Robótica de ejemplo", exact: true }),
  ).toHaveCount(0);
  await route(page, "care");
  await expect(page.locator("main")).not.toContainText(
    "Sopa de verduras de ejemplo",
  );
});
test("inscripción y plan crean cuotas y formulario familiar local", async ({
  page,
  context,
}) => {
  await login(page);
  await route(page, "students");
  await page
    .getByRole("button", { name: "Inscribir estudiante", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Aula",{exact:false}).selectOption("c1");
  for (const [label, value] of [
    ["Nombres", "Valeria"],
    ["Apellidos", "Familia Demo"],
    ["Fecha de nacimiento", "2023-02-01"],
    ["Nombre completo de la madre", "Madre Demo"],
    ["Correo de la madre", "madre-valeria@micole.test"],
    ["Nombre completo del padre", "Padre Demo"],
    ["Correo del padre", "padre-valeria@micole.test"],
    ["Mensualidad fija", "490"],
  ]) {
    await showFormSection(page, label);
    await d.getByLabel(label, { exact: false }).fill(value);
  }
  await finishWizard(page);
  await expect(d).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "Valeria Familia Demo" });
  await row.getByRole("button", { name: "Ficha familiar y WhatsApp" }).click();
  d = page.getByRole("dialog");
  await d
    .getByRole("button", { name: "Crear enlace de ficha", exact: true })
    .click();
  const link = await d.getByLabel("Enlace de ficha familiar").inputValue();
  const parent = await context.newPage();
  await parent.goto(link);
  await expect(
    parent.getByRole("heading", { name: "Ayúdanos a cuidar a Valeria" }),
  ).toBeVisible();
  const data = await local(page),
    child = data.students.find((s: any) => s.firstName === "Valeria");
  expect(
    data.charges.filter((c: any) => c.studentId === child.id).length,
  ).toBeGreaterThan(0);
  await parent.close();
});
for (const width of [360, 390, 768, 1024])
  test(`demo adaptable a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Entrar a la demo", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await login(page);
    await expect(
      page.getByRole("combobox", { name: "Rol de demostración" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await route(page, "care");
    await page
      .getByRole("button", { name: "Registrar cuidado", exact: true })
      .click();
    const d = page.getByRole("dialog"),
      box = await d.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    await expect(
      d.getByRole("button", { name: /^(Guardar|Siguiente)$/ }).last(),
    ).toBeInViewport();
  });

test('no muestra ni precarga credenciales y requiere acceso antes de abrir un perfil',async({page})=>{
 await page.goto('/?perfil=guardian');
 await expect(page.getByLabel('Correo de acceso',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Clave de acceso',{exact:true})).toHaveValue('');
 await expect(page.getByRole('button',{name:'Usar esta clave'})).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText('direccion@micole.test');
 await expect(page.locator('body')).not.toContainText(accessPassword);
 await page.evaluate(()=>sessionStorage.setItem('micole_public_demo_session','director'));
 await page.goto('/app/students');
 await expect(page.getByLabel('Correo de acceso',{exact:true})).toBeVisible();
 await login(page,'guardian');
 await page.getByRole('button',{name:'Salir',exact:true}).click();
 await expect(page.getByLabel('Correo de acceso',{exact:true})).toBeVisible();
 await page.goto('/app/students');
 await expect(page.getByLabel('Correo de acceso',{exact:true})).toBeVisible();
});

test('aviso obligatorio registra aceptación de la familia y reporte del docente autor',async({page})=>{
 test.setTimeout(30000);
 await login(page,'teacher');await route(page,'announcements');
 await page.getByRole('button',{name:'Nuevo comunicado',exact:true}).click();let d=page.getByRole('dialog');
 await d.getByLabel('Título').fill('Confirmar excursión de ejemplo');
 await d.getByLabel('Comunicado',{exact:true}).fill('Salida ficticia para probar la confirmación de lectura personal.');
 await d.getByRole('button',{name:'Siguiente',exact:true}).click();await d.getByLabel('Aula destinataria').selectOption('c1');
 await d.getByRole('button',{name:'Siguiente',exact:true}).click();await d.getByRole('checkbox',{name:/Exigir confirmación/}).check();
 await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);
 await role(page,'guardian');d=page.getByRole('dialog');await expect(d).toContainText('Confirmar excursión de ejemplo');
 await expect(d.getByRole('button',{name:'Confirmar lectura',exact:true})).toBeDisabled();
 await d.getByRole('checkbox',{name:'He leído el aviso.'}).check();await d.getByRole('button',{name:'Confirmar lectura',exact:true}).click();await expect(d).toHaveCount(0);
 await role(page,'teacher');await route(page,'announcements');
 await page.locator('article').filter({has:page.getByRole('heading',{name:'Confirmar excursión de ejemplo',exact:true})}).getByRole('button',{name:'Ver aviso y lecturas'}).click();
 d=page.getByRole('dialog');await d.getByRole('button',{name:'Ver lecturas y confirmaciones'}).click();await expect(d).toContainText('1 confirmados');await expect(d).toContainText('Daniela Martínez');await expect(d).toContainText('Sofía Martínez');await expect(d).toContainText('sin confirmar');
});

test('depósito con archivo local requiere revisión, genera recibo y conserva el saldo',async({page})=>{
 test.setTimeout(30000);
 const external:string[]=[];page.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==new URL(process.env.MICOLE_DEMO_TEST_URL||'http://127.0.0.1:4177').origin)external.push(u.origin);});
 await login(page);await route(page,'cash');await page.getByLabel('Estudiante para el cobro').selectOption('a2');
 await page.getByRole('checkbox',{name:/Seleccionar Mensualidad/}).first().check();await page.getByRole('spinbutton',{name:/Abono para Mensualidad/}).first().fill('210');
 await page.getByRole('button',{name:'Informar pago realizado',exact:true}).click();let d=page.getByRole('dialog');
 await d.getByLabel('Referencia bancaria').fill('DEPOSITO-DEMO');
 await d.getByLabel('Comprobante PDF o foto',{exact:true}).setInputFiles({name:'deposito-ficticio.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nComprobante ficticio de demostración')});
 await d.getByRole('button',{name:'Enviar para verificación',exact:true}).click();await expect(d).toHaveCount(0);await expect(page.getByText('Pendiente de verificación',{exact:false}).first()).toBeVisible();
 expect((await local(page)).charges.find((c:any)=>c.id==='p2').paidAmount).toBe(0);
 await page.getByRole('button',{name:'Revisar ingreso',exact:true}).click();d=page.getByRole('dialog');
 await d.getByRole('checkbox').check();await d.getByRole('button',{name:'Confirmar ingreso y aplicar abonos',exact:true}).click();await expect(d).toHaveCount(0);
 await expect.poll(async()=> (await local(page)).charges.find((c:any)=>c.id==='p2').paidAmount).toBe(210);
 await page.getByRole('button',{name:'Estado de cuenta por niño',exact:true}).click();d=page.getByRole('dialog');await expect(d).toContainText('DEPOSITO-DEMO');await expect(d).toContainText('parciales');
 const download=page.waitForEvent('download');await d.getByRole('button',{name:'Exportar cuotas CSV',exact:true}).click();expect((await download).suggestedFilename()).toBe('estado-de-cuenta.csv');
 expect(external).toEqual([]);
});

test('factura adjunta se publica para la familia y sus consultas aparecen en el historial',async({page})=>{
 test.setTimeout(30000);
 await login(page);await route(page,'invoices');
 await page.getByLabel('Adjuntar factura',{exact:true}).first().setInputFiles({name:'factura-ejemplo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nFactura de ejemplo sin validez fiscal')});
 await expect(page.getByRole('button',{name:/Descargar factura · factura-ejemplo.pdf/})).toBeVisible();
 await page.getByRole('button',{name:'Registrar emisión',exact:true}).click();let d=page.getByRole('dialog');await d.getByLabel('Número de factura emitida').fill('DEMO-FACTURA-01');await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);
 await role(page,'guardian');await route(page,'invoices');await page.getByLabel('Estado de facturas').selectOption('issued');const file=page.getByRole('button',{name:/Descargar factura · factura-ejemplo.pdf/});await expect(file).toBeVisible();const download=page.waitForEvent('download');await file.click();expect((await download).suggestedFilename()).toBe('factura-ejemplo.pdf');
 await route(page,'grades');await expect(page.getByText('Participa con entusiasmo y comparte sus materiales.')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('micole_public_demo_features_v1')||'{}').views?.some((v:any)=>v.kind==='grade'&&v.viewerRole==='guardian'))).toBe(true);
 await role(page,'director');await route(page,'viewHistory');await expect(page.locator('main')).toContainText('Daniela · Demo');await expect(page.locator('main')).toContainText('Desarrollo personal');
});

test('interpreta un calendario de ejemplo sin Gemini y lo publica solo tras revisión',async({page})=>{
 test.setTimeout(30000);
 await login(page);await route(page,'calendarImport');
 await page.getByLabel('PDF o fotografías del documento',{exact:true}).setInputFiles({name:'calendario-ficticio.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nCalendario de prueba')});
 await page.getByRole('checkbox',{name:/Confirmo que usaré solo archivos ficticios/}).check();await page.getByRole('button',{name:'Probar interpretación simulada'}).click();
 await expect(page.getByText(/INTERPRETACIÓN SIMULADA:/)).toBeVisible();const publish=page.getByRole('button',{name:'Confirmar y publicar actividades'});await expect(publish).toBeDisabled();
 await page.getByRole('checkbox',{name:/Comparé el contenido con el original/}).check();await publish.click();await expect(page.getByRole('status')).toContainText('actividades guardadas en esta demo');
 expect((await local(page)).events.some((e:any)=>e.title==='Encuentro de familias · Demo')).toBe(true);
});

for(const width of [390,768,1280])test(`modal permite scroll real y exige pasos a ${width}px`,async({page})=>{
 test.setTimeout(30000);await page.setViewportSize({width,height:700});await login(page);await route(page,'students');await page.getByRole('button',{name:'Inscribir estudiante',exact:true}).click();const d=page.getByRole('dialog'),nav=d.getByRole('navigation',{name:'Secciones del formulario'});
 await expect(nav.getByRole('button',{name:/Plan de pagos$/})).toBeDisabled();await expect(d.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);
 await d.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(nav.locator('[aria-current]')).toContainText('Estudiante');
 await d.getByLabel('Nombres').fill('Prueba');await d.getByLabel('Apellidos').fill('Scroll');await d.getByLabel('Fecha de nacimiento').fill('2022-01-01');await d.getByLabel('Aula',{exact:false}).selectOption('c1');await d.getByRole('button',{name:'Siguiente',exact:true}).click();
 await d.getByLabel('Nombre completo de la madre').fill('Madre Demo');await d.getByLabel('Correo de la madre').fill('madre@micole.test');await d.getByLabel('Nombre completo del padre').fill('Padre Demo');await d.getByLabel('Correo del padre').fill('padre@micole.test');await d.getByRole('button',{name:'Siguiente',exact:true}).click();
 const content=d.locator('.modal-content');expect(await content.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);await content.hover({position:{x:5,y:50}});await page.mouse.wheel(0,800);await expect.poll(()=>content.evaluate(e=>e.scrollTop)).toBeGreaterThan(100);await expect(d.getByRole('button',{name:'Guardar',exact:true})).toBeInViewport();
 await d.getByRole('button',{name:'Anterior',exact:true}).click();await expect(d.getByLabel('Correo de la madre')).toHaveValue('madre@micole.test');
});
test('crea sede independiente e importa calendario únicamente en esa sede',async({page})=>{
 test.setTimeout(30000);await login(page);await route(page,'sites');await page.getByRole('button',{name:'Nueva sede',exact:true}).click();let d=page.getByRole('dialog');await d.getByLabel('Nombre de la sede').fill('Sede Primaria Demo');await expect(d.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);await d.getByRole('button',{name:'Siguiente',exact:true}).click();await d.getByRole('checkbox',{name:'Primaria',exact:true}).check();await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Sede Primaria Demo',exact:true})});await card.getByRole('button',{name:'Abrir sede',exact:true}).click();const data=await local(page),site=data.schools.find((s:any)=>s.siteName==='Sede Primaria Demo');expect(site.institutionId).toBe('s1');await expect(page.getByLabel('Institución',{exact:true})).toHaveValue(site.id);
 await route(page,'calendar');await page.getByRole('button',{name:'Importar calendario',exact:true}).click();await expect(page.getByRole('heading',{name:'Importar calendario anual',exact:true})).toBeVisible();await expect(page.locator('.document-import').getByRole('button',{name:'Formulario de inscripción',exact:true})).toHaveCount(0);
 await page.getByLabel('PDF o fotografías del documento').setInputFiles({name:'calendario-sede.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 demo')});await page.getByRole('checkbox',{name:/Confirmo que usaré/}).check();await page.getByRole('button',{name:'Probar interpretación simulada'}).click();await page.getByRole('checkbox',{name:/Comparé el contenido/}).check();await page.getByRole('button',{name:'Confirmar y publicar actividades'}).click();await expect(page.getByRole('status')).toContainText('actividades guardadas');
 const after=await local(page),imported=after.events.filter((e:any)=>e.title==='Encuentro de familias · Demo');expect(imported).toHaveLength(1);expect(imported[0].schoolId).toBe(site.id);await route(page,'admissionForms');await expect(page.getByRole('heading',{name:'Formulario de inscripción',exact:true,level:1})).toBeVisible();await expect(page.getByRole('button',{name:'Calendario anual',exact:true})).toHaveCount(0);
});
test('asistente guía a Dirección y abre el formulario sin guardar comunicados',async({page})=>{
 test.setTimeout(30000);await login(page);const before=(await local(page)).announcements.length;await page.getByRole('button',{name:'Ayuda MiCole',exact:true}).click();let d=page.getByRole('dialog',{name:'Asistente MiCole',exact:true});await d.getByRole('button',{name:'¿Cómo publico un comunicado obligatorio?',exact:true}).click();await expect(d).toContainText('tres pasos');await d.getByRole('button',{name:'Preparar comunicado',exact:true}).click();d=page.getByRole('dialog');await expect(d.getByLabel('Título')).toBeVisible();await expect(d.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);expect((await local(page)).announcements.length).toBe(before);await d.getByRole('button',{name:'Cancelar',exact:true}).click();await role(page,'teacher');await expect(page.getByRole('button',{name:'Ayuda MiCole',exact:true})).toHaveCount(0);
});
