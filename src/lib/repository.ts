import { supabase, recoverExpiredSupport } from "./supabase";
import { initials } from "./format";
import type { AppData, Collection, Identity } from "./types";

export const emptyData = (): AppData => ({
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
  if (table === "schools") result.initials = initials(String(result.name));
  if (table === "dailyEntries") result.date = row.entry_date;
  if (table === "events" || table === "requests")
    result.date = row.event_date || row.request_date;
  for (const field of [
    "monthlyFee",
    "amount",
    "snackFee",
    "enrollmentFee",
    "baseAmount",
    "snackAmount",
    "licenseAmount",
    "discountAmount",
    "discount",
  ])
    if (result[field] !== undefined) result[field] = Number(result[field]);
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
        "activeStudentCount",
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
        "userId",
        "accessUntil",
        "withdrawnAt",
        "discountFrom",
        "discountTo",
      ].includes(key)
        ? null
        : value;
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
export async function loadData(platform = false): Promise<AppData> {
  const result = emptyData();
  await Promise.all(
    (Object.keys(tables) as Collection[])
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
  if (platform) {
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
