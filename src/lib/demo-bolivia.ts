import { readDemoData, demoRpc } from "./demo";
import { demoRole } from "./demo-config";
import { publishWorkspaceChange } from "./workspaceEvents";
import { readDemoPlanning } from "./demo-academic-planning";
import type {
  BoliviaProfile,
  BoliviaWorkspace,
  PedagogicalDocument,
} from "./bolivia";
import { schoolRoom } from "./bolivia";
import type { SchoolWorkspace } from "./school";
const key = "micole_demo_bolivia_v1";
export const boliviaOperations = [
  "bolivia_workspace",
  "save_bolivia_profile",
  "save_bolivia_document",
  "review_bolivia_document",
];
export async function demoBoliviaRpc(name: string, args: Record<string, any>) {
  const data = readDemoData(),
    director = demoRole() === "director",
    teacher = demoRole() === "teacher";
  if (!director && !teacher)
    throw new Error("Solo Dirección y docentes acceden a estos documentos.");
  const sid = args.p_school_id || "s1",
    life = await demoRpc<SchoolWorkspace>("school_workspace", {
      p_school_id: sid,
      p_from: "2000-01-01",
      p_to: "2100-12-31",
    }),
    planning = readDemoPlanning();
  const rooms = data.classrooms
    .filter(
      (r) =>
        r.schoolId === sid &&
        (director ||
          r.teacherIds.some((id) =>
            data.teachers.some(
              (t) => t.id === id && t.email === "docente@micole.test",
            ),
          )),
    )
    .filter((r) =>
      planning.policies[r.id]?.grade_code === "initial"
        ? false
        : planning.policies[r.id]?.grade_code?.match(/^(primary|secondary)/) ||
          schoolRoom(
            r,
            data.schools.find((s) => s.id === sid),
          ),
    );
  let state: { profiles: BoliviaProfile[]; documents: PedagogicalDocument[] } =
    { profiles: [], documents: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (parsed?.profiles && parsed?.documents) state = parsed;
  } catch {}
  const persist = (table: string) => {
    localStorage.setItem(key, JSON.stringify(state));
    publishWorkspaceChange({ table, schoolId: sid });
  };
  const year =
    life.years.find(
      (y) =>
        y.id ===
        (args.p_year_id || args.p_profile?.year_id || args.p_document?.year_id),
    ) || [...life.years].sort((a, b) => b.year - a.year)[0];
  if (name === "bolivia_workspace")
    return {
      canManage: director,
      year: year
        ? { ...year, starts_on: year.startsOn, ends_on: year.endsOn }
        : null,
      years: life.years,
      profile: state.profiles.find((p) => p.year_id === year?.id) || null,
      rooms: rooms
        .filter((r) => r.academicYear === year?.year)
        .map((r) => ({ id: r.id, name: r.name })),
      documents: state.documents.filter(
        (d) =>
          d.year_id === year?.id &&
          (director ||
            (d.kind === "poa" && d.status === "approved") ||
            rooms.some((r) => r.id === d.classroom_id)),
      ),
      cards: director
        ? life.cards
            .filter(
              (c) =>
                !c.revokedAt &&
                c.content.yearId === year?.id &&
                rooms.some((r) => r.id === c.classroomId),
            )
            .map((c) => ({
              ...c,
              student_id: c.studentId,
              classroom_id: c.classroomId,
              term_id: c.termId,
            }))
        : [],
    } satisfies BoliviaWorkspace;
  if (name === "save_bolivia_profile") {
    if (!director) throw new Error("Solo Dirección configura este perfil.");
    const p = args.p_profile as BoliviaProfile,
      old = state.profiles.find((x) => x.year_id === p.year_id);
    if (old && p.revision !== old.revision)
      throw new Error("El perfil cambió.");
    if (
      p.reviewed &&
      (new Set(p.school_days).size !== 200 ||
        !p.unit_code ||
        !p.district ||
        !p.department ||
        !p.authorization_reference)
    )
      throw new Error("Completa los datos y 200 días antes de confirmar.");
    state.profiles = state.profiles.filter((x) => x.year_id !== p.year_id);
    state.profiles.push({
      ...p,
      id: old?.id || crypto.randomUUID(),
      revision: (old?.revision || 0) + 1,
    });
    persist("bolivia_school_profiles");
    return null;
  }
  if (name === "save_bolivia_document") {
    const doc = args.p_document as PedagogicalDocument,
      old = state.documents.find((v) => v.id === doc.id);
    if (!director && ["poa", "commission"].includes(doc.kind))
      throw new Error("Dirección registra el POA y las actas.");
    if (doc.classroom_id && !rooms.some((r) => r.id === doc.classroom_id))
      throw new Error("Elige un aula asignada.");
    if (
      old &&
      (old.revision !== doc.revision ||
        ["approved", "submitted"].includes(old.status))
    )
      throw new Error("El documento cambió, fue enviado o aprobado.");
    if (
      doc.title.trim().length < 3 ||
      doc.objective.trim().length < 10 ||
      doc.activities.trim().length < 10
    )
      throw new Error("Completa título, objetivo y acciones.");
    state.documents = state.documents.filter((v) => v.id !== doc.id);
    state.documents.push({
      ...doc,
      id: doc.id || crypto.randomUUID(),
      school_id: sid,
      revision: (old?.revision || 0) + 1,
    });
    persist("bolivia_pedagogical_documents");
    return null;
  }
  if (name === "review_bolivia_document") {
    if (!director) throw new Error("Solo Dirección revisa documentos.");
    const doc = state.documents.find((d) => d.id === args.p_id);
    if (!doc || doc.status !== "submitted" || doc.revision !== args.p_revision)
      throw new Error("El documento cambió.");
    if (String(args.p_note).trim().length < 5)
      throw new Error("Registra el fundamento de la revisión.");
    doc.status = args.p_approve ? "approved" : "returned";
    doc.review_note = args.p_note;
    doc.revision = (doc.revision || 0) + 1;
    persist("bolivia_pedagogical_documents");
    return null;
  }
  throw new Error("Operación no disponible.");
}
