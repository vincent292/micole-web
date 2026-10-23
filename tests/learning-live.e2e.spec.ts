import { showFormSection } from "./form-sections";
import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
const id = (n: number) =>
  `ca000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [
  userId,
  schoolId,
  roomId,
  otherRoomId,
  studentId,
  otherStudentId,
  teacherId,
] = [1, 20, 30, 31, 40, 41, 50].map(id);
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
test.use({ baseURL: "http://localhost:4174", reducedMotion: "reduce" });
async function setup(page: Page, role = "director") {
  const calls: { name: string; body: any }[] = [];
  const state = {
    life: {
     years:[{id:id(800),school_id:schoolId,year:2026,name:'Gestión 2026',starts_on:'2026-01-01',ends_on:'2026-12-31',status:'open'}],
     enrollments:[{id:id(801),school_id:schoolId,year_id:id(800),student_id:studentId,classroom_id:roomId,student_name:'Lucía Prueba',classroom_name:'Primero A',started_on:'2026-01-01',status:'enrolled',monthly_fee:400}],
     care:[] as any[], terms:[{id:id(802),school_id:schoolId,year_id:id(800),name:'Tercer periodo',starts_on:'2026-10-01',ends_on:'2026-12-31',weight:1,status:'open',revision:0}],
     assessments:[{id:id(803),school_id:schoolId,term_id:id(802),classroom_id:roomId,title:'Evaluación de lectura',assessment_date:'2026-10-18',max_score:20,weight:1}],scores:[] as any[],cards:[] as any[],
    },
    admissionSettings: [] as any[],
    grades: [] as any[],
    catalog: [
      { id: id(300), name: "Matemáticas" },
      { id: id(301), name: "Lenguaje" },
    ],
    subjects: [] as any[],
    classSubjects: [] as any[],
    subjectTeachers: [] as any[],
    assignments: [] as any[],
    submissions: [] as any[],
    files: [] as any[],
    school: {
      id: schoolId,
      name: "Colegio Operaciones",
      slug: "operaciones",
      city: "La Paz",
      status: "active",
      brand_color: "#3D6EF7",
      director_name: "Directora",
      address: "Av. Arce",
      banner_url: "",
      maps_url: "",
    },
    rooms: [
      {
        id: roomId,
        school_id: schoolId,
        name: "Primero A",
        level: "Primaria",
        academic_year: 2026,
        schedule: "08:00 – 12:00",
        start_time: "08:00:00",
        end_time: "12:00:00",
        weekdays: [1, 2, 3, 4, 5],
        capacity: 20,
        monthly_fee: 400,
        active: true,
      },
      {
        id: otherRoomId,
        school_id: schoolId,
        name: "Primero B",
        level: "Primaria",
        academic_year: 2026,
        schedule: "08:00 – 12:00",
        start_time: "08:00:00",
        end_time: "12:00:00",
        weekdays: [1, 2, 3, 4, 5],
        capacity: 20,
        monthly_fee: 450,
        active: true,
      },
    ],
    students: [
      {
        id: studentId,
        school_id: schoolId,
        classroom_id: roomId,
        first_name: "Lucía",
        last_name: "Prueba",
        birth_date: "2020-01-01",
        status: "active",
        enrolled_at: date,
        profile_complete: true,
        monthly_fee: 400,
        mother_name: "Madre",
        mother_email: "madre@example.invalid",
        mother_phone: "70000000",
        father_name: "Padre",
        father_email: "padre@example.invalid",
      },
      {
        id: otherStudentId,
        school_id: schoolId,
        classroom_id: otherRoomId,
        first_name: "Mateo",
        last_name: "Prueba",
        birth_date: "2020-01-01",
        status: "active",
        enrolled_at: date,
        profile_complete: true,
        monthly_fee: 450,
        mother_name: "Madre",
        mother_email: "madre@example.invalid",
        father_name: "Padre",
        father_email: "padre@example.invalid",
      },
    ],
    charges: [
      {
        id: id(100),
        school_id: schoolId,
        student_id: studentId,
        concept: "Mensualidad octubre",
        due_date: date,
        period: date.slice(0, 7),
        amount: 100,
        paid_amount: 0,
        minimum_access_ratio: 0.5,
        status: "pending",
      },
      {
        id: id(101),
        school_id: schoolId,
        student_id: studentId,
        concept: "Mensualidad noviembre",
        due_date: "2026-11-10",
        period: "2026-11",
        amount: 100,
        paid_amount: 0,
        minimum_access_ratio: 1,
        status: "pending",
      },
    ] as any[],
    receipts: [] as any[],
    invoices: [] as any[],
    requests: [] as any[],
    events: [] as any[],
    notices: [] as any[],
    contact: { directorIdentity: "1234567 LP", directorPhone: "70000000" },
  };
  const user = {
    id: userId,
    email: `${role}@example.invalid`,
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { full_name: "Cuenta Operaciones" },
    app_metadata: { provider: "email" },
    created_at: new Date().toISOString(),
  };
  const seconds = Math.floor(Date.now() / 1000);
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: seconds + 3600, iat: seconds, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
  await page.addInitScript(
    ({ user, jwt, seconds }) =>
      localStorage.setItem(
        "sb-micole-test-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "test",
          expires_at: seconds + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ),
    { user, jwt, seconds },
  );
  let socket: WebSocketRoute | undefined,
    topic = "",
    joinRef = "";
  await page.routeWebSocket("**/realtime/v1/websocket*", (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw));
      const message = Array.isArray(frame)
        ? {
            join_ref: frame[0],
            ref: frame[1],
            topic: frame[2],
            event: frame[3],
            payload: frame[4],
          }
        : frame;
      if (message.event === "phx_join") {
        topic = message.topic;
        joinRef = message.join_ref;
        ws.send(
          JSON.stringify([
            message.join_ref,
            message.ref,
            topic,
            "phx_reply",
            {
              status: "ok",
              response: {
                postgres_changes: [
                  {
                    id: 1,
                    event: "*",
                    schema: "public",
                    table: "workspace_signals",
                  },
                ],
              },
            },
          ]),
        );
      }
      if (message.event === "heartbeat")
        ws.send(
          JSON.stringify([
            message.join_ref,
            message.ref,
            message.topic,
            "phx_reply",
            { status: "ok", response: {} },
          ]),
        );
    });
  });
  const signal = (changedTable = "students") =>
    socket?.send(
      JSON.stringify([
        joinRef,
        null,
        topic,
        "postgres_changes",
        {
          ids: [1],
          data: {
            schema: "public",
            table: "workspace_signals",
            type: "UPDATE",
            columns: [
              { name: "school_id", type: "uuid" },
              { name: "revision", type: "int8" },
              { name: "changed_at", type: "timestamptz" },
            ],
            commit_timestamp: new Date().toISOString(),
            record: {
              school_id: schoolId,
              revision: 2,
              changed_table: changedTable,
              changed_at: new Date().toISOString(),
            },
            old_record: { school_id: schoolId },
            errors: null,
          },
        },
      ]),
    );
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/settings")
        ? { external: { email: true, google: true } }
        : user,
    }),
  );
  await page.route("**/rest/v1/**", async (route) => {
    const req = route.request(),
      name = new URL(req.url()).pathname.split("/").at(-1)!;
    let body: any;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    calls.push({ name, body });
    let json: unknown = [];
    if (name === "platform_tariffs") json={activationFee:50,monthlyLicenseFee:29,inherited:true};else if (name === "workspace_identity")
      json = {
        id: userId,
        email: user.email,
        name: "Cuenta Operaciones",
        roles: [role],
        memberships: [{ schoolId, role }],
        teacherIds: role === "teacher" ? [teacherId] : [],
        guardianStudentIds: role === "guardian" ? [studentId] : [],
        studentIds: role === "student" ? [studentId] : [],
      };
    else if(name==='school_workspace')json=state.life;
    else if(name==='save_care_record'){const row={...body.p_record,id:id(810),school_id:schoolId,classroom_id:roomId};state.life.care.push(row);json=row.id;}
    else if(name==='save_academic_term'){const row={...body.p_term,id:id(811),school_id:schoolId,status:'open',revision:0};state.life.terms.push(row);json=row.id;}
    else if(name==='save_assessment_scores'){state.life.scores=body.p_scores.map((v:any)=>({...v,id:id(812),assessment_id:body.p_assessment_id}));json=body.p_scores.length;}
    else if(name==='save_admission_settings'){state.admissionSettings=[{school_id:schoolId,family_policy:body.p_family_policy,child_ci_required:body.p_child_ci_required,require_annual_materials:body.p_require_materials,final_full_installments:2}];json=null;}
    else if(name==='school_operation_settings')json=state.admissionSettings;
    else if(name==='import_school_directory')json={rows:body.p_rows.map((_:any,i:number)=>({row:i+1,ok:true})),committed:body.p_commit,count:body.p_rows.length,activationFee:50,licenseFee:29};
    else if(name==='grades') {if(body&&['POST','PATCH'].includes(req.method())){const row={...body,created_at:date};state.grades.push(row);json=row;}else json=state.grades;}
    else if (name === "subject_catalog") json = state.catalog;
    else if (name === "school_subjects") json = state.subjects;
    else if (name === "class_subjects") json = state.classSubjects;
    else if (name === "subject_teachers") json = state.subjectTeachers;
    else if (name === "assignments") json = state.assignments;
    else if (name === "assignment_submissions") json = state.submissions;
    else if (name === "assignment_files") json = state.files;
    else if (name === "student_portal")
      json = {
        accessAllowed: true,
        accessMessage: "",
        schools: [{ id: schoolId, name: state.school.name, status: "active" }],
        students: [
          {
            id: studentId,
            schoolId,
            classroomId: roomId,
            firstName: "Lucía",
            lastName: "Prueba",
            status: "active",
          },
        ],
        classrooms: [
          {
            id: roomId,
            schoolId,
            name: "Primero A",
            teacherIds: [],
            subjectsEnabled: true,
          },
        ],
        events: [],
        announcements: [],
        dailyEntries: [],
      };
    else if (name === "configure_class_subject") {
      const subject = id(310),
        cs = id(311);
      state.subjects.push({
        id: subject,
        school_id: schoolId,
        name: body.p_name,
      });
      state.classSubjects.push({
        id: cs,
        school_id: schoolId,
        classroom_id: body.p_classroom_id,
        subject_id: subject,
        active: body.p_active,
      });
      state.subjectTeachers = body.p_teacher_ids.map(
        (idTeacher: string, i: number) => ({
          id: id(320 + i),
          school_id: schoolId,
          class_subject_id: cs,
          teacher_id: idTeacher,
        }),
      );
      Object.assign(state.rooms[0], { subjects_enabled: true });
      json = cs;
    } else if (name === "save_assignment") {
      const old = state.assignments.find((a) => a.id === body.p_assignment.id);
      if (old) Object.assign(old, body.p_assignment);
      else
        state.assignments.push({
          ...body.p_assignment,
          school_id: schoolId,
          created_at: date,
          created_by: userId,
        });
      json = body.p_assignment.id;
    } else if (name === "save_assignment_submission") {
      let sub = state.submissions.find(
        (s) => s.assignment_id === body.p_assignment_id,
      );
      if (!sub) {
        sub = {
          id: id(410),
          assignment_id: body.p_assignment_id,
          school_id: schoolId,
          student_id: studentId,
          revision: 0,
        };
        state.submissions.push(sub);
      }
      Object.assign(sub, {
        body: body.p_body,
        status: body.p_submit ? "submitted" : "draft",
        submitted_by: userId,
        submitted_at: date,
        updated_at: date,
        feedback: "",
        revision: sub.revision + 1,
      });
      json = sub.id;
    } else if (name === "review_assignment_submission") {
      const sub = state.submissions.find((s) => s.id === body.p_id);
      Object.assign(sub, {
        status: body.p_decision,
        feedback: body.p_feedback,
        score: body.p_score,
      });
      json = null;
    } else if (name === "schools") json = [state.school];
    else if (name === "students") json = state.students;
    else if (name === "classrooms") json = state.rooms;
    else if (name === "teachers")
      json = [
        {
          id: teacherId,
          school_id: schoolId,
          name: "Profesora Prueba",
          email: "profesora@example.invalid",
          status: "active",
          specialty: "Titular",
        },
      ];
    else if (name === "teacher_classrooms")
      json = [{ classroom_id: roomId, teacher_id: teacherId }];
    else if (name === "school_charges") json = state.charges;
    else if (name === "platform_charges")
      json = state.students.map((s, i) => ({
        id: id(120 + i),
        school_id: schoolId,
        student_id: s.id,
        concept: "Activación",
        period: date.slice(0, 7),
        amount: 50,
        status: "paid",
      }));
    else if (name === "finance_register")
      json = { receipts: state.receipts, invoices: state.invoices };
    else if (name === "academic_requests") json = state.requests;
    else if (name === "calendar_events") json = state.events;
    else if (name === "announcements") json = state.notices;
    else if (name === "institution_private_contact") json = state.contact;
    else if (name === "payment_connection_status")
      json = {
        provider: "",
        accountReference: "",
        environment: "test",
        credentialsStored: false,
        integrationReady: false,
      };
    else if (name === "save_school") {
      Object.assign(
        state.school,
        Object.fromEntries(
          Object.entries(body.p_school).filter(
            ([key]) => !["director_identity", "director_phone"].includes(key),
          ),
        ),
      );
      state.contact = {
        directorIdentity: body.p_school.director_identity,
        directorPhone: body.p_school.director_phone,
      };
      json = null;
    } else if (name === "save_classroom") {
      Object.assign(
        state.rooms.find((r) => r.id === body.p_room.id)!,
        body.p_room,
      );
      json = null;
    } else if (name === "enroll_student_with_plan") {
      state.students.push(body.p_student);
      json = null;
    } else if (name === "save_academic_request") {
      state.requests.push({
        ...body.p_request,
        status: "pending",
        created_at: date,
        review_note: "",
      });
      json = body.p_request.id;
    } else if (name === "review_academic_request") {
      const request = state.requests.find((r) => r.id === body.p_id)!;
      request.status = body.p_approve ? "approved" : "rejected";
      if (body.p_approve) {
        state.events.push({
          id: request.id,
          school_id: schoolId,
          classroom_id: request.classroom_id,
          title: request.title,
          description: request.details,
          event_date: request.event_date,
          type: "materials",
        });
        state.notices.push({
          id: request.id,
          school_id: schoolId,
          classroom_id: request.classroom_id,
          title: request.title,
          content: request.details,
          audience: "families",
          created_at: date,
        });
      }
      json = null;
    } else if (name === "checkout_school_payment") {
      if (!state.receipts.some((r) => r.id === body.p_receipt_id)) {
        let total = 0;
        for (const item of body.p_items) {
          const charge = state.charges.find((c) => c.id === item.chargeId)!;
          charge.paid_amount += item.amount;
          if (charge.paid_amount >= charge.amount) charge.status = "paid";
          total += item.amount;
        }
        state.receipts.push({
          id: body.p_receipt_id,
          school_id: schoolId,
          student_id: body.p_student_id,
          total,
          payment_method: body.p_method,
          reference: body.p_reference,
          verification_source: "manual",
          recorded_by: userId,
          created_at: new Date().toISOString(),
        });
        if (body.p_invoice?.invoiceName)
          state.invoices.push({
            id: id(200),
            school_id: schoolId,
            student_id: studentId,
            receipt_id: body.p_receipt_id,
            legal_name: body.p_invoice.invoiceName,
            nit_ci: body.p_invoice.invoiceNit,
            phone: body.p_invoice.invoicePhone,
            amount: total,
            status: "pending",
            invoice_number: "",
            created_at: new Date().toISOString(),
          });
      }
      json = body.p_receipt_id;
    } else if (name === "mark_invoice_issued") {
      Object.assign(
        state.invoices.find((i) => i.id === body.p_id),
        { status: "issued", invoice_number: body.p_number },
      );
      json = null;
    } else if (name === "create_payment_link") json = "a".repeat(64);
    else if (name === "withdraw_student") {
      Object.assign(
        state.students.find((s) => s.id === body.p_student_id)!,
        { status: "inactive", withdrawal_reason: body.p_reason },
      );
      json = null;
    }
    await route.fulfill({ json });
  });
  return { state, calls, signal, ready: () => !!topic };
}

function seedLearning(state: any) {
  Object.assign(state.rooms[0], { subjects_enabled: true });
  state.subjects.push({
    id: id(310),
    school_id: schoolId,
    name: "Matemáticas",
  });
  state.classSubjects.push({
    id: id(311),
    school_id: schoolId,
    classroom_id: roomId,
    subject_id: id(310),
    active: true,
  });
  state.subjectTeachers.push({
    id: id(320),
    school_id: schoolId,
    class_subject_id: id(311),
    teacher_id: teacherId,
  });
  state.assignments.push({
    id: id(400),
    school_id: schoolId,
    classroom_id: roomId,
    class_subject_id: id(311),
    title: "Sumamos jugando",
    instructions: "Resuelve y explica cómo llegaste al resultado.",
    due_at: "2030-12-02T03:59:59Z",
    allow_late: true,
    max_score: 100,
    status: "published",
    created_by: userId,
    created_at: date,
    updated_at: date,
  });
}

test("Dirección busca materias y crea una personalizada con sus docentes", async ({
  page,
}) => {
  const { calls } = await setup(page);
  await page.goto("/app/subjects");
  await page
    .getByRole("button", { name: "Asignar materia", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Materia", { exact: true }).fill("Robótica y lógica");
  await modal.getByLabel("Profesora Prueba", { exact: true }).check();
  await modal.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Robótica y lógica", exact: true }),
  ).toBeVisible();
  expect(
    calls.find((c) => c.name === "configure_class_subject")?.body,
  ).toMatchObject({ p_name: "Robótica y lógica", p_teacher_ids: [teacherId] });
});
test("docente publica una tarea ligada a aula, materia y fecha de entrega", async ({
  page,
}) => {
  const { calls, state } = await setup(page, "teacher");
  seedLearning(state);
  await page.goto("/app/assignments");
  await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("combobox", { name: "Materia", exact: true })
    .selectOption(id(311));
  await d.getByLabel("Título", { exact: false }).fill("Resolver problemas");
  await d
    .getByLabel("Instrucciones", { exact: true })
    .fill("Explica cómo resuelves cada problema.");
  await d.getByRole("button",{name:"Siguiente",exact:true}).click();
  await d
    .getByLabel("Fecha límite (opcional)", { exact: true })
    .fill("2030-12-01");
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Resolver problemas", exact: true }),
  ).toBeVisible();
  expect(
    calls.find((c) => c.name === "save_assignment")?.body.p_assignment,
  ).toMatchObject({
    classroom_id: roomId,
    class_subject_id: id(311),
    due_at: "2030-12-01T23:59:59.999-04:00",
    status: "published",
  });
});
test("el estudiante entrega y la familia consulta sin botones de escritura", async ({
  page,
}) => {
  const { calls, state } = await setup(page, "student");
  seedLearning(state);
  await page.goto("/app/assignments");
  await page
    .getByRole("button", { name: "Entregar tarea", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d
    .getByLabel("Tu respuesta", { exact: true })
    .fill("Mi solución usa tres grupos de objetos.");
  await d.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  await expect(page.getByText("Entregada", { exact: true })).toBeVisible();
  expect(
    calls.find((c) => c.name === "save_assignment_submission")?.body.p_submit,
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Nueva tarea", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver tarea", exact: true }).click();
  await expect(
    page.getByText("Mi solución usa tres grupos de objetos.", { exact: true }),
  ).toBeVisible();
});
test("la familia ve respuestas y comentarios y no puede entregar o revisar", async ({
  page,
}) => {
  const { state } = await setup(page, "guardian");
  seedLearning(state);
  state.submissions.push({
    id: id(410),
    school_id: schoolId,
    assignment_id: id(400),
    student_id: studentId,
    status: "reviewed",
    body: "Respuesta de Lucía",
    score: 85,
    feedback: "Buen razonamiento",
    revision: 1,
  });
  await page.goto("/app/assignments");
  await page.getByRole("button", { name: "Ver tarea", exact: true }).click();
  await expect(
    page.getByText("Comentarios: Buen razonamiento", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Entregar tarea|Revisar entrega|Nueva tarea/,
    }),
  ).toHaveCount(0);
});
test("docente devuelve la entrega con instrucciones para corregir", async ({
  page,
}) => {
  const { calls, state } = await setup(page, "teacher");
  seedLearning(state);
  state.submissions.push({
    id: id(410),
    school_id: schoolId,
    assignment_id: id(400),
    student_id: studentId,
    status: "submitted",
    body: "Respuesta de Lucía",
    feedback: "",
    revision: 1,
  });
  await page.goto("/app/assignments");
  await page.getByRole("button", { name: /Ver tarea y entregas/ }).click();
  await page
    .getByRole("button", { name: "Revisar entrega", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("combobox", { name: "Resultado de la revisión", exact: true })
    .selectOption("returned");
  await d
    .getByLabel("Comentarios", { exact: true })
    .fill("Explica el último ejercicio.");
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Para corregir", { exact: true })).toBeVisible();
  expect(
    calls.find((c) => c.name === "review_assignment_submission")?.body
      .p_decision,
  ).toBe("returned");
});
for (const width of [390, 768, 1280])
  test(`formulario institucional por secciones y acciones visibles a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    const { calls } = await setup(page);
    await page.goto("/app/settings");
    await page
      .getByRole("button", { name: "Editar identidad", exact: true })
      .click();
    const d = page.getByRole("dialog");
    await d
      .getByLabel("Nombre de la institución", { exact: false })
      .fill("Institución con nombre completo");
    await showFormSection(page, "NIT");
    await d.getByLabel("NIT (opcional)").fill("123456789");
    const button = d.getByRole("button", { name: /^(Guardar|Siguiente)$/ }).last(),
      box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(780);
    await showFormSection(page, "Nombre de la institución");
    await expect(
      d.getByLabel("Nombre de la institución", { exact: false }),
    ).toHaveValue("Institución con nombre completo");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await d.screenshot({
      path: `/private/tmp/micole-academics/form-web-${width}.png`,
    });
    for(let i=0;i<10 && await d.getByRole("button",{name:"Siguiente",exact:true}).count();i++) await d.getByRole("button",{name:"Siguiente",exact:true}).click();
    await d.getByRole("button",{name:"Guardar",exact:true}).click();
    await expect(d).toHaveCount(0);
    expect(calls.find((c) => c.name === "save_school")?.body.p_school.nit).toBe(
      "123456789",
    );
  });

test('Siguiente impide saltar datos obligatorios sin perder el texto',async({page})=>{
 const {calls,state}=await setup(page,'teacher');seedLearning(state);await page.goto('/app/assignments');await page.getByRole('button',{name:'Nueva tarea',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Título',{exact:false}).fill('Una tarea con texto conservado');await d.getByLabel('Instrucciones',{exact:true}).fill('La materia sigue pendiente de seleccionar.');await d.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(d.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);await expect(d.getByRole('combobox',{name:'Materia',exact:true})).toBeVisible();await expect(d.getByLabel('Título',{exact:false})).toHaveValue('Una tarea con texto conservado');expect(calls.some(c=>c.name==='save_assignment')).toBe(false);
});

test('las notas se registran con la materia asignada y no solo con un texto libre',async({page})=>{
 const {state,calls}=await setup(page,'teacher');seedLearning(state);await page.goto('/app/grades');await page.getByRole('button',{name:'Registrar evaluación',exact:true}).click();const d=page.getByRole('dialog');await d.getByRole('combobox',{name:'Materia',exact:false}).selectOption(id(311));await d.getByLabel('Período',{exact:false}).fill('Primer trimestre');await d.getByLabel('Nota o valoración',{exact:false}).fill('90');await d.getByLabel('Recomendación',{exact:false}).fill('Continúa practicando.');await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);const row=calls.find(c=>c.name==='grades'&&c.body?.class_subject_id===id(311))?.body;expect(row).toMatchObject({student_id:studentId,subject:'Matemáticas'});
});


test('cuidados registra comida y conserva la nota al cambiar de sección a 390px',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {calls}=await setup(page,'teacher');await page.goto('/app/care');
 await page.getByRole('button',{name:'Registrar cuidado',exact:true}).click();const d=page.getByRole('dialog');
 await d.getByLabel('Alimento',{exact:false}).fill('Sopa de verduras');
 await d.getByRole('button',{name:'Siguiente',exact:true}).click();await d.getByLabel('Observaciones',{exact:true}).fill('Comió con tranquilidad y pidió agua.');
 await d.getByRole('navigation',{name:'Secciones del formulario'}).getByRole('button',{name:/Datos principales$/}).click();await expect(d.getByLabel('Alimento',{exact:false})).toHaveValue('Sopa de verduras');
 await d.getByRole('button',{name:'Siguiente',exact:true}).click();const box=await d.getByRole('button',{name:'Guardar',exact:true}).boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(844);
 await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect.poll(()=>calls.some(c=>c.name==='save_care_record')).toBe(true);
 expect(calls.find(c=>c.name==='save_care_record')?.body.p_record).toMatchObject({kind:'meal',food:'Sopa de verduras',note:'Comió con tranquilidad y pidió agua.'});
 await expect(page.getByText('Sopa de verduras · Todo',{exact:true})).toBeVisible();
});
test('docente califica evaluación y ve el promedio normalizado',async({page})=>{
 const {calls}=await setup(page,'teacher');await page.goto('/app/gradebook');await page.getByRole('button',{name:'Periodos y libretas',exact:true}).click();await page.getByRole('button',{name:'Calificar',exact:true}).click();
 const d=page.getByRole('dialog');await d.getByLabel('Nota de Lucía Prueba',{exact:true}).fill('15');await d.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect.poll(()=>calls.some(c=>c.name==='save_assessment_scores')).toBe(true);expect(calls.find(c=>c.name==='save_assessment_scores')?.body.p_scores[0].score).toBe(15);
 await expect(page.getByRole('cell',{name:'75',exact:true})).toBeVisible();
});
test('familia consulta cuidados e historial sin acciones de escritura',async({page})=>{
 const {state}=await setup(page,'guardian');state.life.care.push({id:id(810),student_id:studentId,classroom_id:roomId,entry_date:date,kind:'rest',occurred_at:'12:30',ended_at:'14:00',note:'Descanso tranquilo'});
 await page.goto('/app/care');await expect(page.getByText('Descanso tranquilo',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Registrar cuidado',exact:true})).toHaveCount(0);
 await page.goto('/app/years');await expect(page.getByRole('cell',{name:'Inscrito',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Nueva gestión',exact:true})).toHaveCount(0);
});
test('importación muestra previsualización y requiere confirmación antes de guardar',async({page})=>{
 const {calls}=await setup(page);await page.goto('/app/onboarding');await page.getByRole('combobox',{name:'Tipo de importación',exact:true}).selectOption('teachers');
 await page.getByLabel('Archivo CSV',{exact:true}).setInputFiles({name:'docentes.csv',mimeType:'text/csv',buffer:Buffer.from('name,email,specialty,year,classroom\nMaría Importación,maria@example.invalid,Inglés,2026,Primero A\n')});
 await expect(page.getByText('1 de 1 filas válidas. Todavía no se guardó ningún registro.',{exact:true})).toBeVisible();expect(calls.some(c=>c.name==='import_school_directory'&&c.body.p_commit)).toBe(false);
 await page.getByRole('button',{name:'Confirmar e importar',exact:true}).click();await expect(page.getByText('1 registros importados.',{exact:true})).toBeVisible();
 expect(calls.find(c=>c.name==='import_school_directory'&&c.body.p_commit)?.body.p_rows[0].name).toBe('María Importación');
});
test('requisitos configurables permiten inscripción con solo padre y CI opcional',async({page})=>{
 const {state}=await setup(page);state.admissionSettings=[{school_id:schoolId,family_policy:'father',child_ci_required:false,require_annual_materials:false}];
 await page.goto('/app/students');await page.getByRole('button',{name:'Inscribir estudiante',exact:true}).click();const d=page.getByRole('dialog');
 await expect(d.getByLabel('Número de CI del niño',{exact:true})).not.toHaveAttribute('required','');
 await d.getByLabel('Nombres').fill('Ejemplo');await d.getByLabel('Apellidos').fill('Familia');await d.getByLabel('Fecha de nacimiento').fill('2020-01-01');await d.getByLabel('Aula',{exact:false}).selectOption(roomId);await showFormSection(page,'Madre y padre');await expect(d.getByLabel('Nombre completo de la madre',{exact:true})).not.toHaveAttribute('required','');await expect(d.getByLabel('Correo del padre',{exact:false})).toHaveAttribute('required','');
});

async function sheetFixture(page:Page,role='teacher'){
 const base=await setup(page,role),column=id(910),qual=id(911);
 const data:any={canManage:role!=='guardian',canConfigure:role==='director',schoolId,termId:id(802),terms:base.state.life.terms,settings:{maxCorrections:3,labels:['Destacado','Logrado','En proceso','Necesita apoyo']},method:'weighted',assessments:[{id:column,term_id:id(802),classroom_id:roomId,title:'Lectura',assessment_date:date,max_score:20,weight:1,grading_type:'numeric',qualitative_options:[]},{id:qual,term_id:id(802),classroom_id:roomId,title:'Participación',assessment_date:date,max_score:100,weight:1,grading_type:'qualitative',qualitative_options:['Destacado','Logrado','En proceso','Necesita apoyo']}],roster:[{studentId,studentName:'Lucía Prueba',total:{score:null,max_score:100,missing:2,qualitative:[]}}],scores:[]};
 let reads=0;await page.route('**/rest/v1/rpc/gradebook_workspace',r=>{reads++;return r.fulfill({json:data});});
 await page.route('**/rest/v1/rpc/save_assessment_scores',r=>{const body=r.request().postDataJSON();base.calls.push({name:'save_assessment_scores',body});const item=body.p_scores[0],existing=data.scores.find((s:any)=>s.assessment_id===body.p_assessment_id&&s.student_id===item.student_id);if(existing){Object.assign(existing,item,{revision:existing.revision+1,corrections:existing.corrections+1});}else data.scores.push({...item,id:id(912+data.scores.length),assessment_id:body.p_assessment_id,corrections:0,revision:1});return r.fulfill({json:1});});
 return {...base,data,reads:()=>reads};
}
test('planilla guarda una nota por casilla y una etiqueta cualitativa',async({page})=>{
 const {calls}=await sheetFixture(page);await page.goto('/app/gradebook');
 const score=page.getByLabel('Lectura: Lucía Prueba',{exact:true});await score.fill('16');await score.press('Enter');
 await expect.poll(()=>calls.filter(c=>c.name==='save_assessment_scores').length).toBe(1);
 expect(calls.find(c=>c.name==='save_assessment_scores')?.body.p_scores[0]).toMatchObject({student_id:studentId,score:16,revision:0});
 await page.getByLabel('Participación: Lucía Prueba',{exact:true}).selectOption('Logrado');
 await expect.poll(()=>calls.filter(c=>c.name==='save_assessment_scores').length).toBe(2);
 expect(calls.filter(c=>c.name==='save_assessment_scores')[1].body.p_scores[0]).toMatchObject({score:null,qualitative_score:'Logrado'});
});
test('planilla conserva texto y foco mientras llegan cambios de Realtime',async({page})=>{
 const {signal,ready}=await sheetFixture(page);await page.goto('/app/gradebook');await expect.poll(ready).toBe(true);
 const score=page.getByLabel('Lectura: Lucía Prueba',{exact:true});await score.fill('12');signal('assessment_scores');
 await expect(score).toHaveValue('12');await expect(score).toBeFocused();await expect(page.getByText('Cargando planilla…',{exact:true})).toHaveCount(0);
});
test('familia ve sus notas en la planilla sin controles de escritura',async({page})=>{
 const {data}=await sheetFixture(page,'guardian');data.scores.push({id:id(930),assessment_id:id(910),student_id:studentId,score:17,comment:'Buen avance',revision:1,corrections:0});
 await page.goto('/app/gradebook');await expect(page.getByRole('region',{name:'Planilla de calificaciones'})).toBeVisible();await expect(page.getByText('17',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Añadir columna',exact:true})).toHaveCount(0);await expect(page.getByLabel('Lectura: Lucía Prueba',{exact:true})).toHaveCount(0);
});
async function tutoringFixture(page:Page,role='teacher'){
 const base=await sheetFixture(page,role),subject=id(970),math=id(971);
 Object.assign(base.state.rooms[0],{tutor_teacher_id:teacherId,subjects_enabled:true});
 base.state.subjects.push({id:id(972),school_id:schoolId,name:'Matemáticas'});base.state.classSubjects.push({id:subject,school_id:schoolId,classroom_id:roomId,subject_id:id(972),active:true});base.state.subjectTeachers.push({id:id(973),school_id:schoolId,class_subject_id:subject,teacher_id:math});
 const coordination:any={interviews:[],messages:[]};
 const overview={studentId,termName:'Tercer periodo',students:[{id:studentId,name:'Lucía Prueba',pendingTasks:2,overdueTasks:1}],subjects:[{id:subject,name:'Matemáticas',total:{score:42,max_score:100,missing:0,qualitative:[]},teachers:[{id:math,name:'Profesor de Matemáticas',hasAccount:true}],pendingTasks:2}],care:[],recommendations:[],feedback:[{title:'Fracciones',subject:'Matemáticas',assessment_date:date,comment:'Necesita practicar fracciones'}],pending:[{id:id(974),title:'Ejercicios de fracciones',class_subject_id:subject,due_at:date+'T14:00:00Z',subject:'Matemáticas',submission_status:'missing'}]};
 base.data.canManage=role==='director';base.data.scores.push({id:id(975),assessment_id:id(910),student_id:studentId,score:8,comment:'Practicar',revision:1,corrections:0});
 await page.route('**/rest/v1/teachers?*',r=>r.fulfill({json:[{id:teacherId,school_id:schoolId,user_id:userId,name:'Tutora de aula',email:'tutora@test.invalid',status:'active'},{id:math,school_id:schoolId,user_id:id(976),name:'Profesor de Matemáticas',email:'math@test.invalid',status:'active'}]}));
 await page.route('**/rest/v1/teacher_classrooms*',r=>r.fulfill({json:[{classroom_id:roomId,teacher_id:teacherId},{classroom_id:roomId,teacher_id:math}]}));
 await page.route('**/rest/v1/rpc/classroom_tutor_overview',r=>r.fulfill({json:overview}));
 await page.route('**/rest/v1/rpc/classroom_coordination_workspace',r=>r.fulfill({json:coordination}));
 await page.route('**/rest/v1/rpc/save_classroom_interview',r=>{const body=r.request().postDataJSON();base.calls.push({name:'save_classroom_interview',body});coordination.interviews.push({...body.p_interview,status:'scheduled',revision:1,school_id:schoolId,studentName:'Lucía Prueba',classroomName:'Primero A',teacherName:'Profesor de Matemáticas',subjectName:'Matemáticas',canManage:role!=='guardian',responses:[],participants:[{userId,name:'Familia Prueba'}]});return r.fulfill({json:body.p_interview.id});});
 await page.route('**/rest/v1/rpc/respond_classroom_interview',r=>{const body=r.request().postDataJSON();base.calls.push({name:'respond_classroom_interview',body});coordination.interviews[0].responses.push({userId,name:'Familia Prueba',response:body.p_response,note:body.p_note,revision:1});return r.fulfill({json:null});});
 return {...base,subject,math,coordination};
}
test('la tutora abre el seguimiento por alumno y las notas de otra materia son de solo lectura',async({page})=>{
 const {subject}=await tutoringFixture(page);await page.goto(`/app/classrooms?classroom=${roomId}&tab=tutoring`);await expect(page.getByRole('heading',{name:'Seguimiento de tutoría',exact:true})).toBeVisible();await expect(page.getByText('Necesita practicar fracciones',{exact:false})).toBeVisible();await expect(page.getByText('Ejercicios de fracciones',{exact:false})).toBeVisible();
 await page.screenshot({path:'/private/tmp/micole-tutor-web.png',fullPage:true});await page.getByRole('button',{name:'Ver notas',exact:true}).click();await expect(page).toHaveURL(new RegExp(`subject=${subject}`));await expect(page.getByRole('region',{name:'Planilla de calificaciones'})).toBeVisible();await expect(page.getByRole('button',{name:'Añadir columna',exact:true})).toHaveCount(0);await expect(page.getByLabel('Lectura: Lucía Prueba',{exact:true})).toHaveCount(0);
});
test('convocar entrevista exige los tres pasos y conserva el motivo durante Realtime',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {calls,subject,math,signal}=await tutoringFixture(page,'director');await page.goto('/app/interviews');await page.getByRole('button',{name:'Convocar entrevista',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:'Enviar convocatoria',exact:true})).toHaveCount(0);
 await d.getByLabel('Estudiante',{exact:false}).selectOption(studentId);await d.getByRole('combobox',{name:'Materia',exact:true}).selectOption({label:'Matemáticas'});await d.getByLabel('Docente participante',{exact:false}).selectOption(math);await d.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(d.getByRole('button',{name:'Enviar convocatoria',exact:true})).toHaveCount(0);
 await d.getByLabel('Fecha',{exact:false}).fill(new Date(Date.now()+86400000).toISOString().slice(0,10));await d.getByLabel('Lugar o enlace de reunión',{exact:false}).fill('Dirección');await d.getByRole('button',{name:'Siguiente',exact:true}).click();await d.getByLabel('Título de la entrevista',{exact:false}).fill('Apoyo en Matemáticas');const reason=d.getByLabel('Motivo y temas para conversar',{exact:false});await reason.fill('Coordinar tareas pendientes');signal('classroom_interviews');await expect(reason).toHaveValue('Coordinar tareas pendientes');await page.screenshot({path:'/private/tmp/micole-interview-mobile-web.png',fullPage:true});await d.getByRole('button',{name:'Enviar convocatoria',exact:true}).click();await expect(d).toHaveCount(0);expect(calls.find(c=>c.name==='save_classroom_interview')?.body.p_interview).toMatchObject({student_id:studentId,class_subject_id:subject,teacher_id:math,reason:'Coordinar tareas pendientes'});await expect(page.getByRole('heading',{name:'Apoyo en Matemáticas',exact:true})).toBeVisible();
});
test('la familia responde a su entrevista sin controles de convocatoria ni mensajes internos',async({page})=>{
 const {coordination,calls}=await tutoringFixture(page,'guardian');coordination.interviews.push({id:id(980),school_id:schoolId,classroom_id:roomId,student_id:studentId,class_subject_id:id(970),teacher_id:id(971),title:'Entrevista de Matemáticas',reason:'Coordinar apoyo en las tareas.',starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+88200000).toISOString(),location:'Dirección',status:'scheduled',revision:1,studentName:'Lucía Prueba',classroomName:'Primero A',teacherName:'Profesor de Matemáticas',subjectName:'Matemáticas',canManage:false,responses:[]});await page.goto('/app/interviews');await expect(page.getByRole('heading',{name:'Entrevista de Matemáticas',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Convocar entrevista',exact:true})).toHaveCount(0);await expect(page.getByText('Coordinación privada entre docentes',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Responder convocatoria',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Enviar respuesta',exact:true}).click();await expect.poll(()=>calls.some(c=>c.name==='respond_classroom_interview')).toBe(true);expect(calls.find(c=>c.name==='respond_classroom_interview')?.body).toMatchObject({p_revision:1,p_response:'confirmed'});
});
