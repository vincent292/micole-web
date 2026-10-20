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
    if (name === "platform_tariffs")
      json = { activationFee: 50, monthlyLicenseFee: 29, inherited: true };
    else if (name === "workspace_identity")
      json = {
        id: userId,
        email: user.email,
        name: "Cuenta Operaciones",
        roles: [role],
        memberships: [{ schoolId, role }],
        teacherIds: role === "teacher" ? [teacherId] : [],
        guardianStudentIds: role === "guardian" ? [studentId] : [],
      };
    else if (name === "schools") json = [state.school];
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

async function support(page: Page) {
  await page.route("**/rpc/financial_support_register", (r) =>
    r.fulfill({ json: { submissions: [], files: [] } }),
  );
}
for (const width of [390, 768])
  test(`estado de cuenta ${width}px: abonos, saldos y CSV para la familia con deuda`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state } = await setup(page, "guardian");
    await support(page);
    state.charges.forEach((c) =>
      Object.assign(c, {
        due_date: "2020-01-01",
        paid_amount: c.id === id(100) ? 40 : 0,
      }),
    );
    await page.route("**/rpc/student_account_statement", (r) =>
      r.fulfill({
        json: {
          studentName: "Lucía Prueba",
          schoolName: "Colegio Operaciones",
          classroomName: "Primero A",
          generatedAt: date,
          charges: state.charges.map((c) => ({
            id: c.id,
            concept: c.concept,
            dueDate: c.due_date,
            period: c.period,
            amount: c.amount,
            paidAmount: c.paid_amount,
            balance: c.amount - c.paid_amount,
            status: "pending",
          })),
          receipts: [],
          invoices: [],
        },
      }),
    );
    await page.goto("/app/cash");
    await page
      .getByRole("button", { name: "Estado de cuenta por niño" })
      .click();
    const d = page.getByRole("dialog", {
      name: "Estado de cuenta · Lucía Prueba",
    });
    await expect(d).toContainText("1 parciales");
    await expect(d).toContainText("2 pendientes");
    const download = page.waitForEvent("download");
    await d.getByRole("button", { name: "Exportar cuotas CSV" }).click();
    expect((await download).suggestedFilename()).toBe("estado-de-cuenta.csv");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/private/tmp/micole-evidence-work/statement-${width}.png`,
    });
  });
test("la familia informa un depósito con factura y archivo pero no altera el saldo", async ({
  page,
}) => {
  const { state, calls } = await setup(page, "guardian");
  const submissions: any[] = [];
  let draft: any;
  await page.route("**/rpc/financial_support_register", (r) =>
    r.fulfill({ json: { submissions, files: [] } }),
  );
  await page.route("**/rpc/create_payment_submission", (r) => {
    draft = r.request().postDataJSON();
    calls.push({ name: "create_payment_submission", body: draft });
    return r.fulfill({ json: draft.p_id });
  });
  await page.route("**/rpc/submit_payment_submission", (r) => {
    submissions.push({
      id: draft.p_id,
      school_id: schoolId,
      student_id: studentId,
      items: draft.p_items,
      payment_method: draft.p_method,
      reference: draft.p_reference,
      paid_on: draft.p_paid_on,
      invoice_details: draft.p_invoice,
      status: "pending",
      created_at: date,
      review_note: "",
    });
    return r.fulfill({ json: null });
  });
  await page.route("https://storage.test/financial*", (r) =>
    r.fulfill({ status: 200, body: "" }),
  );
  await page.route("**/functions/v1/r2-media", (r) => {
    const b = r.request().postDataJSON();
    calls.push({ name: "r2-media", body: b });
    return r.fulfill({
      json:
        b.action === "financial_upload"
          ? { id: id(2500), url: "https://storage.test/financial" }
          : { id: id(2500) },
    });
  });
  await page.goto("/app/cash");
  await page
    .getByRole("checkbox", { name: "Seleccionar Mensualidad octubre" })
    .check();
  await page
    .getByRole("spinbutton", { name: "Abono para Mensualidad octubre" })
    .fill("40");
  await page.getByRole("button", { name: "Informar pago realizado" }).click();
  const d = page.getByRole("dialog", {
    name: "Informar depósito o transferencia",
  });
  await d.getByLabel("Referencia bancaria").fill("DEP-PRUEBA-001");
  await d
    .getByLabel("Comprobante PDF o foto")
    .setInputFiles({
      name: "deposito.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n%%EOF"),
    });
  await d.getByRole("checkbox", { name: "Necesito factura" }).check();
  await d.getByLabel("Nombre o razón social").fill("Madre de prueba");
  await d.getByLabel("NIT o CI").fill("1234567");
  await d.getByLabel("Celular para factura").fill("70000000");
  await d.getByRole("button", { name: "Enviar para verificación" }).click();
  await expect(d).toHaveCount(0);
  await expect(page.getByText(/Pendiente de verificación/)).toBeVisible();
  expect(draft.p_invoice).toMatchObject({
    invoiceName: "Madre de prueba",
    invoiceNit: "1234567",
  });
  expect(state.charges[0].paid_amount).toBe(0);
  expect(calls.some((c) => c.name === "checkout_school_payment")).toBe(false);
});
test("una factura emitida permite descargar el PDF adjunto sin acceso académico", async ({
  page,
}) => {
  await setup(page, "guardian");
  await support(page);
  await page.route("**/rpc/finance_register", (r) =>
    r.fulfill({
      json: {
        receipts: [],
        invoices: [
          {
            id: id(2600),
            school_id: schoolId,
            student_id: studentId,
            receipt_id: id(2601),
            legal_name: "Madre prueba",
            nit_ci: "1234567",
            phone: "70000000",
            amount: 40,
            status: "issued",
            invoice_number: "F-001",
            created_at: date,
            files: [
              {
                id: id(2602),
                fileName: "factura.pdf",
                mimeType: "application/pdf",
              },
            ],
          },
        ],
      },
    }),
  );
  const bodies: any[] = [];
  await page.route("**/functions/v1/r2-media", (r) => {
    bodies.push(r.request().postDataJSON());
    return r.fulfill({
      json: { url: "https://storage.test/factura", fileName: "factura.pdf" },
    });
  });
  await page.route("https://storage.test/factura", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: { "Content-Disposition": 'attachment; filename="factura.pdf"' },
      body: Buffer.from("%PDF-1.4\n%%EOF"),
    }),
  );
  await page.goto("/app/invoices");
  await page
    .getByRole("combobox", { name: "Estado de facturas" })
    .selectOption("issued");
  await expect(page.getByText("Emitida · F-001")).toBeVisible();
  await page
    .getByRole("button", { name: "Descargar factura · factura.pdf" })
    .click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({
    action: "financial_download",
    assetId: id(2602),
    client: "web",
  });
});
test("consultar notas registra la vista visible una vez y muestra el reporte a Dirección", async ({
  page,
}) => {
  const { calls } = await setup(page, "guardian");
  await support(page);
  await page.route("**/rest/v1/grades*", (r) =>
    r.fulfill({
      json: [
        {
          id: id(2700),
          school_id: schoolId,
          student_id: studentId,
          subject: "Lenguaje",
          period: "Octubre",
          score: "90",
          recommendation: "Excelente avance",
          created_at: date,
        },
      ],
    }),
  );
  await page.route("**/rpc/record_content_view", (r) => {
    calls.push({
      name: "record_content_view",
      body: r.request().postDataJSON(),
    });
    return r.fulfill({ json: r.request().postDataJSON().p_id });
  });
  await page.goto("/app/grades");
  await expect(page.getByText("Excelente avance")).toBeVisible();
  await expect
    .poll(
      () =>
        calls.filter(
          (c) => c.name === "record_content_view" && c.body.p_kind === "grade",
        ).length,
    )
    .toBe(1);
  await page.waitForTimeout(1000);
  expect(
    calls.filter(
      (c) => c.name === "record_content_view" && c.body.p_kind === "grade",
    ),
  ).toHaveLength(1);
});

test("Dirección filtra y exporta el historial de consultas autorizado", async ({
  page,
}) => {
  await setup(page);
  const row = {
    id: id(2800),
    studentId,
    studentName: "Lucía Prueba",
    classroomName: "Primero A",
    viewerName: "Madre Prueba",
    viewerRole: "guardian",
    kind: "grade",
    contentId: id(2700),
    title: "Lenguaje · Octubre",
    viewedAt: new Date().toISOString(),
    action: "open",
    client: "web",
    contentHash: "a".repeat(64),
  };
  await page.route("**/rpc/content_view_report", (r) =>
    r.fulfill({ json: { total: 1, rows: [row] } }),
  );
  await page.goto("/app/viewHistory");
  await expect(
    page.getByRole("heading", { name: "Historial de consultas", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Madre Prueba", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar historial CSV" }).click();
  expect((await download).suggestedFilename()).toBe("consultas-micole.csv");
});
test("la profesora consulta confirmados y pendientes del comunicado con exportación", async ({
  page,
}) => {
  const { state } = await setup(page, "teacher");
  const aid = id(2850);
  state.notices.push({
    id: aid,
    school_id: schoolId,
    classroom_id: roomId,
    title: "Salida al parque",
    content: "Indicaciones de la salida",
    audience: "families",
    category: "general",
    requires_acknowledgment: true,
    created_by: userId,
    created_at: date,
  });
  await page.route("**/rpc/announcement_view", (r) =>
    r.fulfill({
      json: {
        id: aid,
        schoolId,
        classroomId: roomId,
        title: "Salida al parque",
        content: "Indicaciones de la salida",
        audience: "families",
        category: "general",
        requiresAcknowledgment: true,
        canManage: true,
        canAcknowledge: false,
      },
    }),
  );
  await page.route("**/rpc/announcement_report", (r) =>
    r.fulfill({
      json: [
        {
          name: "Madre Prueba",
          email: "madre@test.invalid",
          children: ["Lucía Prueba"],
          readAt: date,
          acknowledgedAt: date,
        },
        {
          name: "Padre Prueba",
          email: "padre@test.invalid",
          children: ["Lucía Prueba"],
          readAt: date,
        },
      ],
    }),
  );
  await page.goto("/app/announcements");
  await page.getByRole("button", { name: "Ver aviso y lecturas" }).click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("button", { name: "Ver lecturas y confirmaciones" })
    .click();
  await expect(d).toContainText("1 confirmados");
  await expect(d).toContainText("1 sin confirmar");
  await d.getByLabel("Estado de confirmación").selectOption("pending");
  await expect(d.getByText("Padre Prueba", { exact: true })).toBeVisible();
  await expect(d.getByText("Madre Prueba", { exact: true })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await d.getByRole("button", { name: "Exportar confirmaciones CSV" }).click();
  expect((await download).suggestedFilename()).toBe("confirmaciones-aviso.csv");
});
