import { supabase, recoverExpiredSupport } from "./supabase";
import { initials } from "./format";
import type { AppData, Collection, Identity } from "./types";

export const emptyData = (): AppData => ({
  subjectCatalog: [],
  subjects: [],
  classSubjects: [],
  subjectTeachers: [],
  assignments: [],
  submissions: [],
  assignmentFiles: [],

  academicRequests: [], activityParticipations: [], schoolReceipts: [], invoiceRequests: [], operationSettings: [],
  familyIntakes: [],
  studentDocuments: [],
  institutionRequests: [],
  notifications: [],
  auditEvents: [],
  schools: [],
  classrooms: [],
  teachers: [],
  students: [],
  charges: [],
  platformCharges: [],
  announcements: [],
  dailyEntries: [],
  paymentPlans: [],
  requests: [],
  events: [],
  messages: [],
  grades: [],
  invitations: [],
  media: [],
});
const tables: Record<Collection, string> = {
  subjectCatalog: "subject_catalog",
  subjects: "school_subjects",
  classSubjects: "class_subjects",
  subjectTeachers: "subject_teachers",
  assignments: "assignments",
  submissions: "assignment_submissions",
  assignmentFiles: "assignment_files",

  academicRequests: "academic_requests", activityParticipations: "activity_participations", schoolReceipts: "school_receipts", invoiceRequests: "invoice_requests", operationSettings: "school_operation_settings",
  familyIntakes: "family_intake_forms",
  studentDocuments: "student_documents",
  institutionRequests: "institution_requests",
  notifications: "notifications",
  auditEvents: "audit_events",
  schools: "schools",
  classrooms: "classrooms",
  teachers: "teachers",
  students: "students",
  charges: "school_charges",
  platformCharges: "platform_charges",
  announcements: "announcements",
  dailyEntries: "daily_entries",
  paymentPlans: "payment_plans",
  requests: "family_requests",
  events: "calendar_events",
  messages: "messages",
  grades: "grades",
  invitations: "invitations",
  media: "media_assets",
};
const aliases: Record<string, string> = {
  director: "director_name",
  color: "brand_color",
  guardianName: "primary_guardian_name",
  guardianEmail: "primary_guardian_email",
  date: "entry_date",
};
const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const snake = (key: string) =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export function fromRow(table: Collection, row: Record<string, unknown>) {
  const reverse = Object.fromEntries(
    Object.entries(aliases).map(([a, b]) => [b, a]),
  );
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row))
    result[reverse[key] || camel(key)] = value ?? undefined;
  if (table === "operationSettings") result.id = row.school_id;
  if (table === "activityParticipations") result.id = `${row.request_id}:${row.student_id}`;
  if (table === "schools") result.initials = initials(String(result.name));
  if (table === "dailyEntries") result.date = row.entry_date;
  if (table === "events" || table === "requests")
    result.date = row.event_date || row.request_date;
  for (const field of [
    "maxScore", "score",
    "paidAmount", "minimumAccessRatio", "total",
    "monthlyFee", "licenseFee", "licenseCount", "unitAmount",
    "amount",
    "snackFee",
    "enrollmentFee",
    "baseAmount",
    "snackAmount",
    "licenseAmount",
    "discountAmount",
    "discount",
  ])
    if (result[field] !== undefined && !(table === "grades" && field === "score")) result[field] = Number(result[field]);
  return result;
}
export function toRow(table: Collection, item: object) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (
      [
        "initials",
        "teacherIds",
        "token",
        "localUrl",
        "activeStudentCount", "directorIdentity", "directorPhone",
      ].includes(key) ||
      value === undefined
    )
      continue;
    const column =
      key === "date"
        ? table === "events"
          ? "event_date"
          : table === "requests"
            ? "request_date"
            : "entry_date"
        : aliases[key] || snake(key);
    result[column] =
      value === "" &&
      [
        "classroomId",
        "studentId",
        "teacherId",
        "classSubjectId",
        "userId",
        "accessUntil",
        "withdrawnAt",
        "discountFrom",
        "discountTo",
      ].includes(key)
        ? null
        : value;
  }
  if (table === "schools") {
    const school = item as AppData["schools"][number];
    if (school.directorIdentity !== undefined) result.director_identity = school.directorIdentity;
    if (school.directorPhone !== undefined) result.director_phone = school.directorPhone;
  }
  return result;
}
function client() {
  if (!supabase)
    throw new Error("Configura la URL y la clave pública de Supabase.");
  return supabase;
}
export async function rpc<T>(name: string, params: object): Promise<T> {
  const { data, error } = await client().rpc(name, params);
  if (error) {
    recoverExpiredSupport(error.message);
    throw new Error(error.message);
  }
  return data as T;
}
export async function loadData(platform = false, student = false, collections?: Collection[]): Promise<AppData> {
  const result = emptyData();
  const wanted = collections ? new Set(collections) : null;
  if (student) {
    const portal = await rpc<Pick<AppData, "schools" | "students" | "classrooms" | "events" | "announcements" | "dailyEntries"> & { accessAllowed: boolean; accessMessage: string }>("student_portal", {});
    for (const key of ["schools", "students", "classrooms", "events", "announcements", "dailyEntries"] as const) {
      if (!Array.isArray(portal[key])) throw new Error("No pudimos cargar tu espacio de estudiante.");
      (result[key] as unknown[]) = portal[key];
    }
    result.studentPortalAccess = { allowed: portal.accessAllowed === true, message: portal.accessMessage };
    await loadLearning(result);
    return result;
  }
  await Promise.all(
    (Object.keys(tables) as Collection[])
      .filter(table => !wanted || wanted.has(table))
      .filter(table => !["schoolReceipts", "invoiceRequests"].includes(table))
      .filter(
        (table) =>
          !platform ||
          [
            "schools",
            "platformCharges",
            "institutionRequests",
            "notifications",
            "auditEvents",
          ].includes(table),
      )
      .map(async (table) => {
        let query = client().from(tables[table]).select("*");
        if (["notifications", "auditEvents"].includes(table))
          query = query
            .order("created_at", { ascending: false })
            .limit(table === "notifications" ? 100 : 200);
        const { data, error } = await query;
        if (error) {
          recoverExpiredSupport(error.message);
          throw new Error(`${tables[table]}: ${error.message}`);
        }
        (result[table] as unknown[]) = (data || []).map((row) =>
          fromRow(table, row),
        );
      }),
  );
  if (!platform && (!wanted || wanted.has("charges"))) {
    const extraCharges = await rpc<Record<string, unknown>[]>("teacher_activity_charges", {});
    if (!Array.isArray(extraCharges)) throw new Error("No pudimos cargar los cobros de actividades.");
    result.charges.push(...extraCharges.map(row => fromRow("charges", row) as unknown as AppData["charges"][number]).filter(charge => !result.charges.some(existing => existing.id === charge.id)));
  }
  if (!platform && (!wanted || wanted.has("schoolReceipts") || wanted.has("invoiceRequests"))) {
    const register = await rpc<{ receipts: Record<string, unknown>[]; invoices: Record<string, unknown>[] }>("finance_register", {});
    if (!Array.isArray(register.receipts) || !Array.isArray(register.invoices)) throw new Error("No pudimos cargar el registro financiero.");
    result.schoolReceipts = register.receipts.map(row => fromRow("schoolReceipts", row)) as unknown as AppData["schoolReceipts"];
    result.invoiceRequests = register.invoices.map(row => fromRow("invoiceRequests", row)) as unknown as AppData["invoiceRequests"];
  }
  if (platform) {
    if (wanted && !wanted.has("schools")) return result;
    const counts = await rpc<
      { schoolId: string; activeStudentCount: number }[]
    >("platform_school_counts", {});
    result.schools.forEach(
      (s) =>
        (s.activeStudentCount =
          counts.find((c) => c.schoolId === s.id)?.activeStudentCount || 0),
    );
    return result;
  }
  if (wanted && !wanted.has("classrooms")) return result;
  const { data: assignments, error } = await client()
    .from("teacher_classrooms")
    .select("classroom_id,teacher_id");
  if (error) {
    recoverExpiredSupport(error.message);
    throw new Error(error.message);
  }
  result.classrooms.forEach((room) => {
    room.teacherIds = [
      ...new Set(
        (assignments || [])
          .filter((a) => a.classroom_id === room.id)
          .map((a) => a.teacher_id),
      ),
    ];
  });
  return result;
}
export async function saveRow<K extends Collection>(
  table: K,
  item: AppData[K][number],
) {
  if (table === "classrooms") {
    const room = item as AppData["classrooms"][number];
    await rpc("save_classroom", {
      p_room: toRow(table, room),
      p_teacher_ids: room.teacherIds,
    });
    return;
  }
  if (table === "invitations") {
    await rpc("revoke_invitation", { p_id: item.id });
    return;
  }
  if (table === "teachers") {
    await rpc("save_teacher", { p_teacher: toRow(table, item) });
    return;
  }
  if (table === "students") {
    await rpc("save_student", { p_student: toRow(table, item) });
    return;
  }
  if (table === "schools") {
    await rpc("save_school", { p_school: toRow(table, item) });
    return;
  }
  const row = toRow(table, item);
  if (table === "media") {
    const identity = await getIdentity();
    row.uploaded_by = identity.id;
    row.bucket = "aulanexo-private";
  }
  const { data: existing, error: readError } = await client()
    .from(tables[table])
    .select("id")
    .eq("id", item.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const query = existing
    ? client().from(tables[table]).update(row).eq("id", item.id)
    : client().from(tables[table]).insert(row);
  const { error } = await query.select("id").single();
  if (error) {
    recoverExpiredSupport(error.message);
    throw new Error(error.message);
  }
}
export async function getIdentity(): Promise<Identity> {
  return rpc<Identity>("workspace_identity", {});
}
export async function claimInvitation(token: string) {
  return rpc("claim_invitation", { p_token: token });
}

const learningCollections: Collection[] = ['subjectCatalog','subjects','classSubjects','subjectTeachers','assignments','submissions','assignmentFiles','notifications'];
async function loadLearning(result: AppData) {
 await Promise.all(learningCollections.map(async key=>{
  const {data,error}=await client().from(tables[key]).select('*');
  if(error) throw new Error(`No pudimos cargar tareas y materias: ${error.message}`);
  (result[key] as unknown[])=(data||[]).map(row=>fromRow(key,row));
 }));
}
