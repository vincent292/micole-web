import { makeDemoSeed, makeDemoWorkspace, demoCards } from "./demo-seed";
import { demoRole } from "./demo-config";
import { today, buildSchedule } from "./billing";
import { chargeBalance } from "./operations";
import type { AppData } from "./types";
import type { SchoolWorkspace } from "./school";
import type { BankPayment } from "./bank";
export const demoDataKey = "micole_public_demo_v1";
const extraKey = "micole_public_demo_school_v1";
const change = "micole:demo-data";
const id = () => crypto.randomUUID(),
  stamp = () => new Date().toISOString();
export function readDemoData(): AppData {
  try {
    const parsed = JSON.parse(localStorage.getItem(demoDataKey) || "null");
    if (
      parsed &&
      Array.isArray(parsed.students) &&
      Array.isArray(parsed.assignments)
    )
      return {...makeDemoSeed(),...parsed,demoRequests:parsed.demoRequests||[],schools:parsed.schools.map((s: AppData["schools"][number])=>({...s,platformEnabled:true,activationEnabled:false}))};
  } catch {
    /* reset corrupted local data */
  }
  return makeDemoSeed();
}
interface Extras {
  workspace: SchoolWorkspace;
  payments: (BankPayment & {
    items: { chargeId: string; amount: number }[];
    invoice?: Record<string, string>;
  })[];
  links: Record<
    string,
    {
      studentId: string;
      items: { chargeId: string; amount: number }[];
      expiresAt: string;
      paymentId?: string;
    }
  >;
  files: Record<string, string>;
  batches: Record<string, unknown>;
}
function readExtras(data = readDemoData()): Extras {
  let extra: Extras | undefined;
  try {
    const parsed = JSON.parse(localStorage.getItem(extraKey) || "null");
    if (parsed?.workspace?.years) extra = parsed;
  } catch {
    /* reset corrupted data */
  }
  extra ||= {
    workspace: makeDemoWorkspace(data),
    payments: [],
    links: {},
    files: {},
    batches: {},
  };
  for (const s of data.students) {
    const room = data.classrooms.find((r) => r.id === s.classroomId);
    if (!room) continue;
    const year = extra.workspace.years.find(
      (y) =>
        y.year === (room.academicYear || Number(today().slice(0, 4))) &&
        y.schoolId === s.schoolId,
    );
    if (!year) continue;
    const enrolled = extra.workspace.enrollments.find(
      (e) =>
        e.studentId === s.id && e.yearId === year.id && e.status === "enrolled",
    );
    if (s.status === "inactive") {
      if (enrolled) {
        enrolled.status = "withdrawn";
        enrolled.endedOn = s.withdrawnAt || today();
        enrolled.reason = s.withdrawalReason || "Baja de inscripción";
      }
      continue;
    }
    if (!enrolled)
      extra.workspace.enrollments.push({
        id: `enrollment-${s.id}-${year.id}`,
        studentId: s.id,
        schoolId: s.schoolId,
        classroomId: room.id,
        yearId: year.id,
        studentName: `${s.firstName} ${s.lastName}`,
        classroomName: room.name,
        level: room.level,
        startedOn: s.enrolledAt,
        status: "enrolled",
        reason: "Inscripción de demostración",
        monthlyFee: s.monthlyFee,
      });
  }
  return extra;
}
export function readDemoWorkspace() { return readExtras().workspace; }
export function writeDemoData(data: AppData, notify = false) {
  try {
    localStorage.setItem(demoDataKey, JSON.stringify(data));
  } catch {
    throw new Error(
      "No queda espacio en el navegador. Restablece la demo para continuar.",
    );
  }
  if (notify) window.dispatchEvent(new Event(change));
}
export function subscribeDemo(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (
      event.key === demoDataKey ||
      event.key === extraKey ||
      event.key === null
    )
      listener();
  };
  window.addEventListener(change, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(change, listener);
    window.removeEventListener("storage", storage);
  };
}
export function resetDemo() {
  const data = makeDemoSeed();
  localStorage.removeItem(extraKey);
  localStorage.removeItem("micole_public_demo_features_v1");
  localStorage.removeItem("micole_public_demo_sites_v1");
  localStorage.removeItem("micole_public_demo_staff_v1");
  writeDemoData(data, true);
  return data;
}
const camel = (value: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      v === null ? undefined : v,
    ]),
  );
const upsert = (rows: any[], row: any) => {
  const index = rows.findIndex((r) => r.id === row.id);
  if (index < 0) rows.push(row);
  else rows[index] = { ...rows[index], ...row };
};
function number(value: unknown, min = 0, max = 1e8) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error("Revisa los importes y las puntuaciones.");
  return n;
}
function required(value: unknown) {
  const s = String(value || "").trim();
  if (!s) throw new Error("Completa los campos obligatorios.");
  return s;
}
function requireStaff(director = false) {
  if (
    !demoRole() ||
    !(director ? ["director"] : ["director", "teacher"]).includes(demoRole()!)
  )
    throw new Error(
      "Cambia al rol de " +
        (director ? "Dirección" : "Dirección o Docente") +
        " para realizar esta acción.",
    );
}
export async function demoRpc<T>(name: string, parameters: object): Promise<T> {
  const staff=await import("./demo-staff");
  if(staff.staffOperations.includes(name)) return staff.demoStaffRpc(name,parameters) as Promise<T>;
  const sites = await import("./demo-sites");
  if(sites.siteOperations.includes(name)) return sites.demoSiteRpc(name,parameters) as Promise<T>;
  const feature = await import("./demo-features");
  if(feature.demoFeatureOperations.includes(name)) return feature.demoFeatureRpc(name,parameters) as Promise<T>;
  const p = parameters as Record<string, any>,
    data = readDemoData(),
    extra = readExtras(data),
    w = extra.workspace;
  let result: unknown = null,
    mutation = true;
  const schoolId = p.p_school_id || "s1";
  const findStudent = (studentId: string) => {
    const s = data.students.find((s) => s.id === studentId);
    if (!s) throw new Error("Estudiante no encontrado en esta demo.");
    return s;
  };
  const findTerm = (termId: string) => {
    const t = w.terms.find((t) => t.id === termId);
    if (!t) throw new Error("Selecciona un periodo.");
    return t;
  };
  const mutableTerm = (termId: string) => {
    const t = findTerm(termId);
    if (t.status === "closed")
      throw new Error(
        "El periodo está cerrado. Dirección debe reabrirlo con un motivo.",
      );
    return t;
  };
  switch (name) {
    case "school_workspace": {
      mutation = false;
      const clone = structuredClone(w),
        role = demoRole(),
        students =
          role === "guardian"
            ? ["a1", "a7"]
            : role === "student"
              ? ["a1"]
              : role === "teacher"
                ? data.students
                    .filter((s) => ["c1", "c4"].includes(s.classroomId))
                    .map((s) => s.id)
                : data.students.map((s) => s.id);
      clone.years = clone.years.filter((y) => y.schoolId === schoolId);
      clone.enrollments = clone.enrollments.filter(
        (e) => e.schoolId === schoolId && students.includes(e.studentId),
      );
      clone.care = clone.care.filter(
        (c) =>
          students.includes(c.studentId) &&
          c.entryDate >= p.p_from &&
          c.entryDate <= p.p_to,
      );
      clone.terms = clone.terms.filter((t) => t.schoolId === schoolId);
      clone.assessments = clone.assessments.filter(
        (a) =>
          a.schoolId === schoolId &&
          (!["guardian", "student"].includes(role || "") ||
            findTerm(a.termId).status === "closed"),
      );
      clone.scores = clone.scores.filter(
        (s) =>
          students.includes(s.studentId) &&
          clone.assessments.some((a) => a.id === s.assessmentId),
      );
      clone.cards = clone.cards.filter(
        (c) => students.includes(c.studentId) && !c.revokedAt,
      );
      result = clone;
      break;
    }
    case "configure_class_subject": {
      requireStaff(true);
      const room = data.classrooms.find((r) => r.id === p.p_classroom_id);
      if (!room) throw new Error("Selecciona un aula.");
      const name = required(p.p_name);
      let subject = data.subjects.find(
        (s) => s.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      if (!subject) {
        subject = { id: id(), schoolId: room.schoolId, name };
        data.subjects.push(subject);
      }
      const cs = data.classSubjects.find(
        (c) => c.classroomId === room.id && c.subjectId === subject!.id,
      ) || {
        id: id(),
        schoolId: room.schoolId,
        classroomId: room.id,
        subjectId: subject.id,
        active: true,
      };
      cs.active = !!p.p_active;
      upsert(data.classSubjects, cs);
      room.subjectsEnabled = true;
      data.subjectTeachers = data.subjectTeachers.filter(
        (t) => t.classSubjectId !== cs.id,
      );
      for (const teacherId of p.p_teacher_ids || []) {
        data.subjectTeachers.push({
          id: id(),
          schoolId: room.schoolId,
          classSubjectId: cs.id,
          teacherId,
        });
        if (!room.teacherIds.includes(teacherId))
          room.teacherIds.push(teacherId);
      }
      result = cs.id;
      break;
    }
    case "set_class_subjects_enabled":
      requireStaff(true);
      data.classrooms.find((r) => r.id === p.p_classroom_id)!.subjectsEnabled =
        p.p_enabled;
      break;
    case "save_assignment": {
      requireStaff();
      const a = camel(p.p_assignment),
        room = data.classrooms.find((r) => r.id === a.classroomId);
      if (!room) throw new Error("Selecciona un aula.");
      number(a.maxScore, 0.01, 10000);
      upsert(data.assignments, {
        ...a,
        id: a.id || id(),
        schoolId: room.schoolId,
        classSubjectId: a.classSubjectId || undefined,
        title: required(a.title),
        instructions: required(a.instructions),
        createdBy: "demo-teacher",
        createdAt: stamp(),
        updatedAt: stamp(),
      });
      break;
    }
    case "save_assignment_submission": {
      if (demoRole() !== "student")
        throw new Error(
          "Solo el rol Estudiante puede entregar tareas propias.",
        );
      const task = data.assignments.find((a) => a.id === p.p_assignment_id);
      if (
        !task ||
        task.classroomId !== findStudent("a1").classroomId ||
        task.status !== "published"
      )
        throw new Error("Esta tarea no recibe entregas.");
      if (!task.allowLate && task.dueAt && new Date(task.dueAt) < new Date())
        throw new Error("El plazo de entrega terminó.");
      const prior = data.submissions.find(
        (s) => s.assignmentId === task.id && s.studentId === "a1",
      );
      if (prior?.status === "reviewed")
        throw new Error("La entrega ya fue revisada.");
      const submission = {
        ...prior,
        id: prior?.id || id(),
        schoolId: task.schoolId,
        assignmentId: task.id,
        studentId: "a1",
        body: String(p.p_body || ""),
        status: p.p_submit ? "submitted" : "draft",
        score: undefined,
        feedback: "",
        submittedBy: "demo-student",
        submittedAt: p.p_submit ? stamp() : undefined,
        updatedAt: stamp(),
        revision: (prior?.revision || 0) + 1,
      };
      if (
        p.p_submit &&
        !submission.body.trim() &&
        !data.assignmentFiles.some((f) => f.submissionId === submission.id)
      )
        throw new Error("Escribe tu respuesta o adjunta un archivo.");
      upsert(data.submissions, submission);
      result = submission.id;
      break;
    }
    case "review_assignment_submission": {
      requireStaff();
      const s = data.submissions.find((s) => s.id === p.p_id);
      if (!s) throw new Error("Entrega no encontrada.");
      const task = data.assignments.find((a) => a.id === s.assignmentId)!;
      s.status = p.p_decision === "returned" ? "returned" : "reviewed";
      s.score =
        p.p_score === null ? undefined : number(p.p_score, 0, task.maxScore);
      s.feedback = String(p.p_feedback || "");
      s.reviewedAt = stamp();
      break;
    }
    case "save_care_record": {
      requireStaff();
      const r = camel(p.p_record),
        s = findStudent(r.studentId);
      if (r.kind === "rest" && r.endedAt <= r.occurredAt)
        throw new Error("La hora de fin debe ser posterior al inicio.");
      upsert(w.care, { ...r, id: r.id || id(), classroomId: s.classroomId });
      break;
    }
    case "save_academic_year": {
      requireStaff(true);
      const y = camel(p.p_year);
      number(y.year, 2020, 2100);
      if (y.startsOn > y.endsOn)
        throw new Error("Revisa las fechas de la gestión.");
      if (w.years.some((old) => old.year === Number(y.year) && old.id !== y.id))
        throw new Error("Esta gestión ya existe.");
      upsert(w.years, {
        ...y,
        id: y.id || id(),
        year: Number(y.year),
        status: "open",
      });
      break;
    }
    case "set_academic_year_status": {
      requireStaff(true);
      required(p.p_reason);
      const y = w.years.find((y) => y.id === p.p_year_id)!;
      if (!y) throw new Error("Gestión no encontrada.");
      y.status = p.p_closed ? "closed" : "open";
      break;
    }
    case "copy_year_classrooms": {
      requireStaff(true);
      const source = w.years.find((y) => y.id === p.p_source_year),
        target = w.years.find((y) => y.id === p.p_target_year);
      if (!source || !target || target.status === "closed")
        throw new Error("Selecciona una gestión de destino abierta.");
      for (const room of data.classrooms.filter(
        (r) => r.academicYear === source.year,
      )) {
        if (
          data.classrooms.some(
            (r) => r.academicYear === target.year && r.name === room.name,
          )
        )
          continue;
        const roomId = id();
        data.classrooms.push({
          ...room,
          id: roomId,
          academicYear: target.year,
        });
        for (const cs of data.classSubjects.filter(
          (c) => c.classroomId === room.id,
        )) {
          const csId = id();
          data.classSubjects.push({ ...cs, id: csId, classroomId: roomId });
          for (const t of data.subjectTeachers.filter(
            (t) => t.classSubjectId === cs.id,
          ))
            data.subjectTeachers.push({ ...t, id: id(), classSubjectId: csId });
        }
      }
      break;
    }
    case "move_student_year": {
      requireStaff(true);
      required(p.p_reason);
      const s = findStudent(p.p_student_id),
        room = data.classrooms.find((r) => r.id === p.p_classroom_id),
        year = w.years.find(
          (y) => y.year === room?.academicYear && y.status === "open",
        );
      if (!room || !year)
        throw new Error("Selecciona un aula de una gestión abierta.");
      for (const e of w.enrollments.filter(
        (e) => e.studentId === s.id && e.status === "enrolled",
      )) {
        e.endedOn = today();
        e.status = e.yearId === year.id ? "transferred" : "completed";
        e.reason = p.p_reason;
      }
      s.classroomId = room.id;
      s.status = "active";
      w.enrollments.push({
        id: id(),
        studentId: s.id,
        schoolId: s.schoolId,
        classroomId: room.id,
        yearId: year.id,
        studentName: `${s.firstName} ${s.lastName}`,
        classroomName: room.name,
        level: room.level,
        startedOn: today(),
        status: "enrolled",
        reason: p.p_reason,
        monthlyFee: s.monthlyFee,
      });
      break;
    }
    case "save_academic_term": {
      requireStaff(true);
      const t = camel(p.p_term),
        year = w.years.find((y) => y.id === t.yearId);
      if (!year || year.status === "closed")
        throw new Error("La gestión debe estar abierta.");
      if (
        t.startsOn > t.endsOn ||
        t.startsOn < year.startsOn ||
        t.endsOn > year.endsOn
      )
        throw new Error("El periodo debe estar dentro de su gestión.");
      const prior = w.terms.find((old) => old.id === t.id);
      if (prior?.status === "closed")
        throw new Error("Reabre el periodo antes de editarlo.");
      upsert(w.terms, {
        ...t,
        id: t.id || id(),
        schoolId: year.schoolId,
        weight: number(t.weight, 0.01, 1000),
        status: "open",
        revision: prior?.revision || 1,
      });
      break;
    }
    case "save_assessment": {
      requireStaff();
      const a = camel(p.p_assessment),
        term = mutableTerm(a.termId);
      if (a.assessmentDate < term.startsOn || a.assessmentDate > term.endsOn)
        throw new Error("La evaluación debe estar dentro del periodo.");
      number(a.maxScore, 0.01, 10000);
      number(a.weight, 0.01, 1000);
      upsert(w.assessments, {
        ...a,
        id: a.id || id(),
        schoolId: term.schoolId,
        classSubjectId: a.classSubjectId || undefined,
        assignmentId: a.assignmentId || undefined,
        maxScore: Number(a.maxScore),
        weight: Number(a.weight),
      });
      break;
    }
    case "save_assessment_scores": {
      requireStaff();
      const a = w.assessments.find((a) => a.id === p.p_assessment_id)!;
      mutableTerm(a.termId);
      for (const raw of p.p_scores) {
        const s = camel(raw);
        if (s.exempt) required(s.comment);
        upsert(w.scores, {
          ...s,
          id:
            w.scores.find(
              (old) =>
                old.assessmentId === a.id && old.studentId === s.studentId,
            )?.id || id(),
          assessmentId: a.id,
          score:
            s.exempt || s.score === undefined
              ? undefined
              : number(s.score, 0, a.maxScore),
        });
      }
      break;
    }
    case "import_assignment_scores": {
      requireStaff();
      const a = w.assessments.find((a) => a.id === p.p_assessment_id)!;
      mutableTerm(a.termId);
      const task = data.assignments.find((t) => t.id === a.assignmentId)!;
      if (!task)
        throw new Error("Esta evaluación no tiene una tarea vinculada.");
      for (const s of data.submissions.filter(
        (s) =>
          s.assignmentId === task.id &&
          s.status === "reviewed" &&
          s.score !== undefined,
      ))
        upsert(w.scores, {
          id:
            w.scores.find(
              (old) =>
                old.assessmentId === a.id && old.studentId === s.studentId,
            )?.id || id(),
          assessmentId: a.id,
          studentId: s.studentId,
          score:
            Math.round((s.score! / task.maxScore) * a.maxScore * 100) / 100,
          exempt: false,
          comment: s.feedback,
        });
      break;
    }
    case "close_academic_term": {
      requireStaff(true);
      const term = mutableTerm(p.p_term_id),
        cards = demoCards(data, w, term.id);
      if (cards.some((c) => !c.content.complete))
        throw new Error(
          "Completa las notas o registra las exenciones antes de publicar.",
        );
      term.status = "closed";
      w.cards.push(...cards);
      break;
    }
    case "reopen_academic_term": {
      requireStaff(true);
      required(p.p_reason);
      const term = findTerm(p.p_term_id);
      term.status = "open";
      term.revision++;
      for (const c of w.cards.filter(
        (c) => c.termId === term.id && !c.revokedAt,
      ))
        c.revokedAt = stamp();
      break;
    }
    case "save_admission_settings":
      requireStaff(true);
      upsert(data.operationSettings, {
        id: schoolId,
        schoolId,
        finalFullInstallments: 2,
        requireAnnualMaterials: !!p.p_require_materials,
        familyPolicy: p.p_family_policy,
        childCiRequired: !!p.p_child_ci_required,
      });
      break;
    case "import_school_directory": {
      requireStaff(true);
      const kind = p.p_kind,
        rows = p.p_rows as Record<string, string>[];
      if (!rows?.length || rows.length > 200)
        throw new Error("Importa de 1 a 200 filas.");
      if (p.p_commit && extra.batches[p.p_batch_id]) {
        result = extra.batches[p.p_batch_id];
        mutation = false;
        break;
      }
      const settings = data.operationSettings[0],
        seen = new Set<string>();
      const report = rows.map((r, i) => {
        let error = "";
        const room = data.classrooms.find(
          (c) =>
            c.name.toLowerCase() === r.classroom?.toLowerCase() &&
            c.academicYear === Number(r.year),
        );
        if (!room) error = "El aula o gestión no existe.";
        else if (kind === "teachers") {
          if (!r.name || !/^\S+@\S+\.\S+$/.test(r.email || ""))
            error = "Revisa nombre y correo.";
          else if (
            seen.has(r.email.toLowerCase()) ||
            data.teachers.some((t) => t.email === r.email.toLowerCase())
          )
            error = "Correo docente repetido.";
          seen.add(r.email?.toLowerCase());
        } else {
          if (
            !r.first_name ||
            !r.last_name ||
            !/^\d{4}-\d{2}-\d{2}$/.test(r.birth_date || "")
          )
            error = "Completa nombres, apellidos y nacimiento.";
          else if (
            (settings.familyPolicy !== "father" &&
              (!r.mother_name ||
                !/^\S+@\S+\.\S+$/.test(r.mother_email || ""))) ||
            (settings.familyPolicy !== "mother" &&
              (!r.father_name || !/^\S+@\S+\.\S+$/.test(r.father_email || "")))
          )
            error = "Completa los responsables requeridos.";
          else if (settings.childCiRequired && !r.identity_number)
            error = "CI requerido.";
          else if (r.mother_email && r.mother_email === r.father_email)
            error = "Madre y padre deben tener correos diferentes.";
          else if (
            Number(r.monthly_fee || room.monthlyFee) < 0 ||
            Number(r.months || 1) < 1 ||
            Number(r.months || 1) > 36
          )
            error = "Revisa el plan de cuotas.";
          const key = r.identity_number || r.rude;
          if (
            key &&
            (seen.has(key) ||
              data.students.some(
                (s) => s.identityNumber === key || s.rude === key,
              ))
          )
            error = "CI o RUDE duplicado.";
          if (key) seen.add(key);
        }
        return { row: i + 2, ok: !error, error: error || undefined };
      });
      result = {
        rows: report,
        committed: false,
        count: report.filter((r) => r.ok).length,
        activationFee: 0,
        licenseFee: 29,
      };
      if (p.p_commit) {
        if (report.some((r) => !r.ok))
          throw new Error("Corrige todas las filas antes de importar.");
        rows.forEach((r) => {
          const room = data.classrooms.find(
            (c) =>
              c.name.toLowerCase() === r.classroom.toLowerCase() &&
              c.academicYear === Number(r.year),
          )!;
          if (kind === "teachers") {
            const teacherId = id();
            data.teachers.push({
              id: teacherId,
              schoolId,
              name: r.name,
              email: r.email.toLowerCase(),
              specialty: r.specialty || "",
              status: "active",
            });
            room.teacherIds.push(teacherId);
          } else {
            const studentId = id(),
              fee = Number(r.monthly_fee || room.monthlyFee || 0);
            data.students.push({
              id: studentId,
              schoolId,
              classroomId: room.id,
              firstName: r.first_name,
              lastName: r.last_name,
              birthDate: r.birth_date,
              identityNumber: r.identity_number,
              rude: r.rude,
              motherName: r.mother_name,
              motherEmail: r.mother_email,
              motherPhone: r.mother_phone,
              fatherName: r.father_name,
              fatherEmail: r.father_email,
              fatherPhone: r.father_phone,
              guardianName: r.mother_name || r.father_name,
              guardianEmail: r.mother_email || r.father_email,
              allergies: "",
              monthlyFee: fee,
              status: "active",
              enrolledAt: today(),
            });
            const plan = {
              id: id(),
              schoolId,
              studentId,
              startDate: r.start_date || today(),
              months: Number(r.months || 1),
              monthlyFee: fee,
              snackFee: Number(r.snack_fee || 0),
              enrollmentFee: Number(r.enrollment_fee || 0),
              dueDay: Number(r.due_day || 10),
              discount: 0,
              discountFrom: "",
              discountTo: "",
              prorate: false,
              createdAt: today(),
            };
            data.paymentPlans.push(plan);
            data.charges.push(
              ...buildSchedule(plan, id).map((c, i, all) => ({
                ...c,
                minimumAccessRatio: i >= all.length - 2 ? 1 : 0.5,
              })),
            );

          }
        });
        result = { ...(result as object), committed: true, count: rows.length };
        extra.batches[p.p_batch_id] = result;
      } else mutation = false;
      break;
    }
    case "increase_issued_charge": {
      requireStaff(true);
      required(p.p_reason);
      const rows =
          p.p_kind === "platform" ? data.platformCharges : data.charges,
        c = rows.find((c) => c.id === p.p_charge_id);
      if (!c) throw new Error("Cuota no encontrada.");
      const amount = number(p.p_amount, 0.01);
      if (amount < c.amount)
        throw new Error("Una cuota emitida no puede disminuir.");
      if (["paid", "cancelled"].includes(c.status))
        throw new Error("Esta cuota ya está cerrada.");
      c.amount = amount;
      break;
    }
    case "set_student_fees": {
      requireStaff(true);
      required(p.p_reason);
      const s = findStudent(p.p_student_id);
      s.monthlyFee = number(p.p_monthly_fee);
      s.snackFee = number(p.p_snack_fee);
      s.enrollmentFee = number(p.p_enrollment_fee);
      break;
    }
    case "platform_tariffs":
      result = { activationFee: 0, configuredActivationFee:50,activationEnabled:false,initialCredit:500, monthlyLicenseFee: 29, inherited: true };
      mutation = false;
      break;
    case "baneco_payment_register":
      result = extra.payments;
      mutation = false;
      break;
    case "baneco_payment_context":
      result = extra.payments.find((b) => b.id === p.p_id);
      mutation = false;
      break;
    case "create_payment_link": {
      findStudent(p.p_student_id);
      const token = id().replaceAll("-", "") + id().replaceAll("-", "");
      extra.links[token] = {
        studentId: p.p_student_id,
        items: p.p_items,
        expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
      };
      result = token;
      break;
    }
    case "payment_link_context": {
      const link = extra.links[p.p_token];
      if (!link || new Date(link.expiresAt) < new Date())
        throw new Error(
          "Este enlace de demo venció o pertenece a otro navegador.",
        );
      const s = findStudent(link.studentId),
        items = link.items.map((i) => ({
          ...i,
          concept:
            data.charges.find((c) => c.id === i.chargeId)?.concept || "Cuota",
        }));
      const paid = link.items.every(
          (i) =>
            chargeBalance(data.charges.find((c) => c.id === i.chargeId)!) === 0,
        ),
        changed = link.items.some(
          (i) =>
            i.amount >
            chargeBalance(data.charges.find((c) => c.id === i.chargeId)!),
        );
      result = {
        schoolName: data.schools[0].name,
        studentName: `${s.firstName} ${s.lastName}`,
        items,
        total: items.reduce((n, i) => n + Math.round(i.amount * 100), 0) / 100,
        status: paid ? "paid" : changed ? "changed" : "pending",
        expiresAt: link.expiresAt,
        qrAvailable: true,
        bankPayment: extra.payments.find((b) => b.id === link.paymentId),
      };
      mutation = false;
      break;
    }
    case "demo_bank_action": {
      const action = p.action as string,
        link = p.token ? extra.links[p.token] : undefined;
      if (action.includes("generate")) {
        const items = (link?.items || p.items) as {
            chargeId: string;
            amount: number;
          }[],
          studentId = link?.studentId || p.studentId;
        if (!items?.length) throw new Error("Selecciona al menos una cuota.");
        const rows =
          p.kind === "platform" ? data.platformCharges : data.charges;
        for (const i of items) {
          const c = rows.find((c) => c.id === i.chargeId);
          if (
            !c ||
            i.amount <= 0 ||
            i.amount >
              (p.kind === "platform"
                ? c.amount
                : chargeBalance(c as AppData["charges"][number]))
          )
            throw new Error(
              "Los saldos cambiaron. Selecciona las cuotas nuevamente.",
            );
        }
        const payment: Extras["payments"][number] = {
          id: id(),
          kind: p.kind || "school",
          schoolId: "s1",
          studentId,
          amount:
            items.reduce((n, i) => n + Math.round(i.amount * 100), 0) / 100,
          currency: "BOB",
          environment: "test",
          status: "pending",
          applicationStatus: "waiting",
          dueDate: today(),
          reference: "DEMO-" + id().slice(0, 8),
          qrId: "SIMULADO",
          invoiceRequested: !!p.invoice?.invoiceName,
          invoice: p.invoice,
          createdAt: stamp(),
          items,
        };
        extra.payments.push(payment);
        if (link) link.paymentId = payment.id;
        result = { payment };
      } else {
        const payment = extra.payments.find(
          (b) => b.id === (p.id || link?.paymentId),
        );
        if (!payment) throw new Error("Solicitud de demo no encontrada.");
        if (action.includes("cancel") && payment.status !== "paid")
          payment.status = "cancelled";
        if (action === "demo_confirm" && payment.status === "pending") {
          if (payment.kind === "platform") {
            for (const item of payment.items)
              data.platformCharges.find((c) => c.id === item.chargeId)!.status =
                "paid";
          } else {
            for (const item of payment.items) {
              const c = data.charges.find((c) => c.id === item.chargeId)!;
              if (item.amount > chargeBalance(c))
                throw new Error(
                  "Los saldos cambiaron. Genera otra simulación.",
                );
              c.paidAmount =
                Math.round(
                  ((c.paidAmount || (c.status === "paid" ? c.amount : 0)) +
                    item.amount) *
                    100,
                ) / 100;
              c.status = c.paidAmount >= c.amount ? "paid" : "pending";
              if (c.status === "paid") c.paidAt = today();
            }
            data.schoolReceipts.push({
              id: payment.id,
              schoolId: payment.schoolId,
              studentId: payment.studentId!,
              total: payment.amount,
              paymentMethod: "qr",
              reference: payment.reference!,
              items: payment.items.map((i) => ({
                ...i,
                concept: data.charges.find((c) => c.id === i.chargeId)!.concept,
              })),
              verificationSource: "manual",
              recordedBy: "demo",
              createdAt: stamp(),
            });
            if (payment.invoiceRequested)
              data.invoiceRequests.push({
                id: id(),
                schoolId: payment.schoolId,
                studentId: payment.studentId!,
                receiptId: payment.id,
                legalName: payment.invoice!.invoiceName,
                nitCi: payment.invoice!.invoiceNit,
                phone: payment.invoice!.invoicePhone,
                amount: payment.amount,
                status: "pending",
                invoiceNumber: "",
                createdAt: stamp(),
              });
          }
          payment.status = "paid";
          payment.applicationStatus = "applied";
        }
        result = { payment };
      }
      break;
    }
    default:
      throw new Error(
        "Esta operación externa no se ejecuta en la demo. Puedes explorarla sin conectar servicios reales.",
      );
  }
  if (mutation) {
    localStorage.setItem(extraKey, JSON.stringify(extra));
    writeDemoData(data, true);
  }
  return structuredClone(result) as T;
}
export async function saveDemoFile(submissionId: string, file: File) {
  if (file.size > 1024 * 1024)
    throw new Error("En la demo utiliza archivos ficticios de hasta 1 MB.");
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const data = readDemoData(),
    extra = readExtras(data),
    fileId = id();
  extra.files[fileId] = url;
  data.assignmentFiles.push({
    id: fileId,
    schoolId: "s1",
    submissionId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    status: "ready",
    uploadedBy: "demo-student",
    createdAt: stamp(),
  });
  localStorage.setItem(extraKey, JSON.stringify(extra));
  writeDemoData(data, true);
}
export function demoFile(id: string) {
  return readExtras().files[id];
}
