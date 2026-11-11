import { test, expect, type Page } from "@playwright/test";
import { seed } from "../src/lib/seed";
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
async function fixture(page: Page, role = "teacher", permission = true, customNames = false, longNames = false) {
  const data = structuredClone(seed);
  data.schools = data.schools.filter((s) => s.id === "s1");
  data.classrooms = data.classrooms
    .filter((r) => r.id === "c1")
    .map((r) => ({
      ...r,
      academicYear: Number(day.slice(0, 4)),
      active: true,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    }));
  data.students = data.students
    .filter((s) => s.id === "a1" || s.id === "a2")
    .map((s) => ({
      ...s,
      ...(customNames ? (s.id === "a1" ? {firstName:"Zoé",lastName:"Álvarez"} : {firstName:"Ana",lastName:"de la Cruz"}) : {}),
      ...(longNames && s.id === "a1" ? {firstName:"María Fernanda Alejandra",lastName:"de la Torre Arias Bustillos"} : {}),
      classroomId: "c1",
      enrolledAt: day.slice(0, 4) + "-01-01",
      status: "active" as const,
      profileComplete: true,
    }));
  data.requests = permission
    ? [
        {
          id: "permission-qa",
          schoolId: "s1",
          studentId: "a1",
          type: "absence",
          date: day,
          reason: "Cita médica ficticia solicitada por su mamá",
          pickupName: "",
          pickupId: "",
          vehiclePlate: "",
          status: "pending",
          response: "",
          createdAt: new Date().toISOString(),
        },
      ]
    : [];
  await page.addInitScript(
    ({ data, role }) => {
      if (!localStorage.getItem("attendance-permission-fixture")) {
        localStorage.setItem("aulanexo_demo_v2", JSON.stringify(data));
        localStorage.setItem("micole_public_demo_v1", JSON.stringify(data));
        localStorage.setItem("attendance-permission-fixture", "ready");
      }
      if (!sessionStorage.getItem("micole_public_demo_session"))
        sessionStorage.setItem("micole_public_demo_session", role);
    },
    { data, role },
  );
  await page.goto("/app/studentAttendance");
  if (role === "teacher") {
    await page
      .getByRole("button", { name: "Menú de perfil", exact: true })
      .click();
    await page.getByRole("button", { name: "Docente", exact: true }).click();
    const menu = page.getByRole("button", {name:"Abrir menú",exact:true});
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("navigation", {name:"Navegación principal"}).getByRole("button", {name:"Asistencia de alumnos",exact:true}).click();
  }
}
for (const width of [390, 1440]) test(`hoja semanal ordena, conserva marcas y abre otra semana vacía a ${width}px`, async ({page}, info) => {
  await page.setViewportSize({width,height:900});
  await fixture(page,'teacher',false,true);
  await page.getByRole('button',{name:'Hoja semanal',exact:true}).click();
  const sheet=page.getByRole('region',{name:'Hoja semanal de asistencia',exact:true});
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('tbody th>strong')).toHaveText(['Álvarez','de la Cruz']);
  await page.getByRole('combobox',{name:'Ordenar estudiantes',exact:true}).selectOption('firstName');
  await expect(sheet.locator('tbody th>strong')).toHaveText(['Ana','Zoé']);
  await page.getByRole('checkbox',{name:'Presente: Zoé Álvarez',exact:true}).check();
  await page.getByRole('combobox',{name:'Ordenar estudiantes',exact:true}).selectOption('lastName');
  await expect(page.getByRole('checkbox',{name:'Presente: Zoé Álvarez',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Presente: Ana de la Cruz',exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'Semana siguiente',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Tienes cambios sin guardar');
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Borrador guardado'})).toBeVisible();
  await page.screenshot({path:info.outputPath('weekly-sheet.png'),fullPage:false});
  const previous=await page.getByLabel('Fecha de asistencia',{exact:true}).inputValue();
  await page.getByRole('button',{name:'Semana siguiente',exact:true}).click();
  await expect(page.getByLabel('Fecha de asistencia',{exact:true})).not.toHaveValue(previous);
  await expect(page.getByRole('checkbox',{name:'Presente: Zoé Álvarez',exact:true})).not.toBeChecked();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('micole_public_demo_student_attendance_v1')||'{}'));
  expect(saved.sessions).toHaveLength(1);expect(saved.sessions[0].day).toBe(previous);expect(saved.notified).toEqual([]);
});

test('Dirección revisa la fuente boliviana, conserva ajustes y publica un comunicado solo al confirmar', async ({page}) => {
  await fixture(page,'director',false);
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Horarios de clases',exact:true}).click();
  await page.getByRole('button',{name:'Abrir calendario escolar',exact:true}).click();
  await page.route('https://date.nager.at/api/v3/PublicHolidays/2026/BO',r=>r.fulfill({json:[{date:'2026-06-21',localName:'Año Nuevo Andino',countryCode:'BO',global:true,types:['Public']}]}));
  await page.getByRole('button',{name:'Consultar feriados nacionales de Bolivia',exact:true}).click();
  const modal=page.getByRole('dialog');
  await expect(modal).toContainText('calendario oficial');
  await expect(modal.getByRole('button',{name:'Aplicar feriados revisados',exact:true})).toBeDisabled();
  await modal.getByRole('checkbox',{name:'Revisé las fechas que aplicaré a esta institución.',exact:true}).check();
  await modal.getByRole('button',{name:'Aplicar feriados revisados',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const cards=page.locator('.calendar-day');await expect(cards).toHaveCount(13);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aulanexo_demo_v2')||'{}').announcements.filter((row:any)=>String(row.id).startsWith('calendar-')).length)).toBe(0);
  await cards.first().getByRole('button',{name:'Preparar comunicado',exact:true}).click();
  await expect(modal.getByRole('textbox',{name:'Contenido del comunicado',exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Publicar comunicado',exact:true}).click();
  await expect(cards.first().getByRole('button',{name:'Comunicado publicado',exact:true})).toBeDisabled();
});
test("el docente ve primero el permiso, lo acepta y confirma sin convertirlo en falta", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const modal = page.getByRole("dialog", {
    name: "Permisos antes de pasar lista",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Cita médica ficticia");
  await expect(modal.getByRole("button", { name: "Continuar con la lista", exact: true })).toBeDisabled();
  await expect(modal).toContainText("Responde todos los pedidos pendientes");
  await modal
    .getByRole("textbox")
    .fill("Permiso recibido y aceptado para la fecha solicitada");
  await modal
    .getByRole("button", { name: "Aceptar permiso", exact: true })
    .click();
  await expect(modal).toContainText("Aceptado");
  await modal
    .getByRole("button", { name: "Continuar con la lista", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("combobox", {name:"Estado de Sofía Martínez",exact:true})).toHaveValue("excused");
  await page
    .getByRole("button", {
      name: "Marcar pendientes como presentes",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Revisar y confirmar", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar y avisar", exact: true })
    .click();
  await expect(page.locator(".attendance-summary")).toContainText(
    "Lista confirmada",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("micole_public_demo_v1") || "{}",
        ).notifications.filter(
          (n: { kind: string }) => n.kind === "attendance_absent",
        ).length,
    ),
  ).toBe(0);
  await expect(page.getByRole("combobox",{name:"Estado de Sofía Martínez",exact:true})).toBeDisabled();
  await page.screenshot({
    path: "output/qa/2026-10-29-asistencia/local-web-permiso-confirmado.png",
    fullPage: true,
  });
});
test("Dirección consulta la lista y el permiso sin controles para marcar o corregir", async ({
  page,
}) => {
  await fixture(page, "director");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Revisar y confirmar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guardar borrador", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Corregir con justificativo",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox",{name:/^Estado de /}).first()).toBeDisabled();
  await page
    .getByRole("button", { name: "Ver permisos de la familia", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("Cita médica ficticia");
  await expect(
    modal.getByRole("button", { name: "Aceptar permiso", exact: true }),
  ).toHaveCount(0);
});
test("docente corrige solo con justificativo y conserva el original en el historial", async ({
  page,
}) => {
  await fixture(page, "teacher", false);
  await page
    .getByRole("button", {
      name: "Marcar pendientes como presentes",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Revisar y confirmar", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar y avisar", exact: true })
    .click();
  await expect(page.locator(".attendance-summary")).toContainText(
    "Lista confirmada",
  );
  await page
    .getByText("Correcciones con justificativo · 0 registro(s)", {
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Corregir con justificativo", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("combobox", { name: /Estado corregido/ })
    .selectOption("late");
  expect((await modal.getByRole("combobox", {name:/Estado corregido/}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await modal
    .getByRole("button", { name: "Guardar corrección y avisar", exact: true })
    .click();
  await expect(modal).toBeVisible();
  await modal
    .getByRole("textbox", { name: /Justificativo obligatorio/ })
    .fill("Se verificó la hora real de llegada con el registro del aula");
  await modal
    .getByRole("button", { name: "Guardar corrección y avisar", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  const state = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("micole_public_demo_student_attendance_v1") || "{}",
    ),
  );
  expect(state.records[0].status).toBe("present");
  expect(state.corrections[0].proposed_status).toBe("late");
  expect(state.corrections[0].reason).toContain("hora real");
  await expect(
    page.getByText(
      "Justificativo: Se verificó la hora real de llegada con el registro del aula",
      { exact: true },
    ),
  ).toBeVisible();
});

test("una actualización en segundo plano no autoriza sobrescribir una corrección que el docente no revisó", async ({page}) => {
  await fixture(page, "teacher", false);
  await page.getByRole("button", {name:"Marcar pendientes como presentes",exact:true}).click();
  await page.getByRole("button", {name:"Revisar y confirmar",exact:true}).click();
  await page.getByRole("dialog").getByRole("button", {name:"Confirmar y avisar",exact:true}).click();
  await expect(page.locator(".attendance-summary")).toContainText("Lista confirmada");
  await page.getByText("Correcciones con justificativo · 0 registro(s)",{exact:true}).click();
  await page.getByRole("button",{name:"Corregir con justificativo",exact:true}).click();
  const modal=page.getByRole("dialog");
  await modal.getByRole("combobox",{name:/Estado corregido/}).selectOption("late");
  await modal.getByRole("textbox",{name:/Justificativo obligatorio/}).fill("Formulario abierto antes de revisar la nueva corrección");
  // Another session corrects the same record while this form stays open.
  await page.evaluate(async()=>{
    const state=JSON.parse(localStorage.getItem("micole_public_demo_student_attendance_v1")||"{}");
    const repositoryPath="/src/lib/repository.ts", eventsPath="/src/lib/workspaceEvents.ts";
    const {rpc}=await import(repositoryPath),{publishWorkspaceChange}=await import(eventsPath);
    await rpc("request_attendance_correction",{p_id:crypto.randomUUID(),p_record_id:state.records[0].id,p_base_correction_id:null,p_status:"excused",p_note:"Permiso contrastado por la otra sesión",p_reason:"Otra sesión verificó el permiso familiar primero"});
    publishWorkspaceChange({table:"student_attendance_corrections"});
  });
  await expect(page.locator("summary").filter({hasText:"Correcciones con justificativo"})).toContainText("1 registro(s)");
  await modal.getByRole("button",{name:"Guardar corrección y avisar",exact:true}).click();
  await expect(modal).toContainText("La asistencia cambió");
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("micole_public_demo_student_attendance_v1")||"{}"));
  expect(state.corrections).toHaveLength(1);
  expect(state.corrections[0].proposed_status).toBe("excused");
  expect(state.records[0].status).toBe("present");
});

for (const [width,height] of [[320,568],[390,844],[430,932],[768,1024],[1024,768],[1440,1000]]) test(`asistencia cómoda sin desbordamiento a ${width}x${height}`,async({page},info)=>{
 await page.setViewportSize({width,height});await fixture(page,'teacher',false,true);
 const mode=page.getByRole('button',{name:width<1100?'Lista del día':'Hoja semanal',exact:true});await expect(mode).toHaveAttribute('aria-pressed','true');
 if(width>=1100)await page.getByRole('button',{name:'Lista del día',exact:true}).click();
 const list=page.getByRole('region',{name:'Lista del día',exact:true});await expect(list).toBeVisible();
 await expect(list.locator('.attendance-day-name strong')).toHaveText(['Álvarez','de la Cruz']);
 const present=page.getByRole('checkbox',{name:'Presente: Zoé Álvarez',exact:true});await present.check();
 const action=present.locator('..');const box=await action.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(100);
 await page.getByRole('combobox',{name:'Estado de Ana de la Cruz',exact:true}).selectOption('late');
 const statusBox=await page.getByRole('combobox',{name:'Estado de Ana de la Cruz',exact:true}).boundingBox();expect(statusBox!.height).toBeGreaterThanOrEqual(44);
 await page.getByRole('button',{name:'Hoja semanal',exact:true}).click();await expect(present).toBeChecked();
 await page.getByRole('button',{name:'Lista del día',exact:true}).click();await expect(page.getByRole('combobox',{name:'Estado de Ana de la Cruz',exact:true})).toHaveValue('late');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await list.locator('.attendance-day-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('responsive-roll-call.png')});
});

test('nombres completos y zoom conservan los controles en móvil',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,'teacher',false,false,true);
 await page.evaluate(()=>{document.documentElement.style.zoom='1.25';});
 const list=page.getByRole('region',{name:'Lista del día',exact:true});await expect(list.getByText('de la Torre Arias Bustillos',{exact:true})).toBeVisible();
 await expect(list.getByText('María Fernanda Alejandra',{exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:'Presente: María Fernanda Alejandra de la Torre Arias Bustillos',exact:true}).check();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await list.locator('.attendance-day-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('responsive-long-names.png')});
});
