import { readDemoData, writeDemoData, demoRpc } from "./demo";
import { demoRole } from "./demo-config";
import { publishWorkspaceChange } from "./workspaceEvents";
import { validateTimetable, type TimetableVersion } from "./timetable";
import type {
  AcademicPolicy,
  PromotionData,
  Reinforcement,
} from "./academicPlanning";
import type { SchoolWorkspace } from "./school";
const key = "micole_public_demo_academic_planning_v1";
interface DemoState {
  versions: TimetableVersion[];
  policies: Record<string, AcademicPolicy>;
  reinforcements: (Reinforcement & {
    term_id: string;
    classroom_id: string;
    class_subject_id: string;
  })[];
  delegates: { email: string; can_approve: boolean; active: boolean }[];
  batches: PromotionData["batches"];
}
export function readDemoPlanning(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null");
    if (s && Array.isArray(s.versions) && s.policies) return s;
  } catch {}
  return {
    versions: [],
    policies: {},
    reinforcements: [],
    delegates: [],
    batches: [],
  };
}
export const academicOperations = [
  "timetable_workspace",
  "save_timetable",
  "publish_timetable",
  "save_timetable_delegate",
  "save_academic_policy",
  "authorize_reinforcement",
  "save_reinforcement",
  "promotion_workspace",
  "apply_annual_promotion",
];
export async function demoAcademicRpc(name: string, args: object) {
  const p = args as Record<string, any>,
    d = readDemoData(),
    state = readDemoPlanning(),
    role = demoRole(),
    director = role === "director",
    sid = p.p_school_id || "s1",
    life = await demoRpc<SchoolWorkspace>("school_workspace", {
      p_school_id: sid,
      p_from: "2000-01-01",
      p_to: "2100-12-31",
    });
  const save = (table = "timetable_versions") => {
    localStorage.setItem(key, JSON.stringify(state));
    publishWorkspaceChange({ table, schoolId: sid });
  };
  const ownRooms = d.classrooms.filter(
    (r) =>
      r.schoolId === sid &&
      (director ||
        (role === "teacher" &&
          r.teacherIds.some((t) =>
            d.teachers.some(
              (x) => x.id === t && x.email === "docente@micole.test",
            ),
          )) ||
        ((role === "guardian" || role === "student") &&
          ["a1", ...(role === "guardian" ? ["a7"] : [])].some((id) =>
            d.students.some((s) => s.id === id && s.classroomId === r.id),
          ))),
  );
  if (name === "timetable_workspace") {
    const y =
        life.years.find((y) => y.id === p.p_year_id) ||
        [...life.years].sort((a, b) => b.year - a.year)[0],
      rooms = ownRooms.filter((r) => r.academicYear === y?.year),
      subjects = d.classSubjects.filter(
        (s) => s.active && rooms.some((r) => r.id === s.classroomId),
      );
    return {
      canManage: director,
      canApprove: director,
      canDelegate: director,
      years: life.years,
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        academic_year: r.academicYear,
      })),
      subjects: subjects.map((s) => ({
        id: s.id,
        classroomId: s.classroomId,
        name: d.subjects.find((x) => x.id === s.subjectId)?.name || "Materia",
        teacherIds: d.subjectTeachers
          .filter((t) => t.classSubjectId === s.id)
          .map((t) => t.teacherId),
      })),
      teachers: d.teachers
        .filter((t) => rooms.some((r) => r.teacherIds.includes(t.id)))
        .map((t) => ({ id: t.id, name: t.name })),
      versions: state.versions
        .filter(
          (v) => v.year_id === y?.id && (director || v.status === "published"),
        )
        .map((v) => ({
          ...v,
          lessons: v.lessons.filter((l) =>
            rooms.some((r) => r.id === l.classroomId),
          ),
        })),
      delegates: director ? state.delegates : [],
      externalBusy: [],
    };
  }
  if (!director && !["save_reinforcement"].includes(name))
    throw new Error("Solo Dirección realiza esta acción en la demo.");
  if (name === "save_timetable") {
    const v = p.p_version as TimetableVersion,
      old = state.versions.find((x) => x.id === v.id);
    if (old && (old.status !== "draft" || old.revision !== v.revision))
      throw new Error("El borrador cambió o está publicado.");
    if (v.lessons.length) {
      const errors = validateTimetable(v.config, v.lessons);
      if (errors.length) throw new Error(errors.join(" "));
    }
    const result = {
      ...v,
      id: old?.id || crypto.randomUUID(),
      school_id: sid,
      status: "draft" as const,
      revision: (old?.revision || 0) + 1,
    };
    state.versions = state.versions.filter((x) => x.id !== result.id);
    state.versions.unshift(result);
    save();
    return result.id;
  }
  if (name === "publish_timetable") {
    const v = state.versions.find((x) => x.id === p.p_id);
    if (!v || v.status !== "draft" || v.revision !== p.p_revision)
      throw new Error("Revisa el borrador actual.");
    const errors = validateTimetable(v.config, v.lessons);
    if (!v.lessons.length || errors.length)
      throw new Error(errors.join(" ") || "Genera primero el horario.");
    state.versions
      .filter((x) => x.year_id === v.year_id && x.status === "published")
      .forEach((x) => (x.status = "archived"));
    v.status = "published";
    v.revision++;
    save();
    return null;
  }
  if (name === "save_timetable_delegate") {
    state.delegates = state.delegates.filter((x) => x.email !== p.p_email);
    state.delegates.push({
      email: p.p_email,
      active: p.p_active,
      can_approve: p.p_approve,
    });
    save("timetable_delegates");
    return null;
  }
  if (name === "save_academic_policy") {
    if (!d.classrooms.some((r) => r.id === p.p_classroom_id))
      throw new Error("Elige un aula de esta demo.");
    if (p.p_grade_code === "initial" && p.p_scheme === "bolivia2026")
      throw new Error("Inicial mantiene evaluación cualitativa.");
    if (
      p.p_scheme === "bolivia2026" &&
      life.assessments.some(
        (a) =>
          a.classroomId === p.p_classroom_id &&
          a.gradingType !== "qualitative" &&
          !a.dimension,
      )
    )
      throw new Error(
        "Asigna primero una dimensión a las columnas numéricas existentes.",
      );
    state.policies[p.p_classroom_id] = {
      grade_code: p.p_grade_code,
      scheme: p.p_scheme,
      reinforcement_method: p.p_reinforcement_method,
    };
    save("academic_class_policies");
    return null;
  }
  if (name === "authorize_reinforcement") {
    const sheet = await demoRpc<any>("gradebook_workspace", {
        p_classroom_id: p.p_classroom_id,
        p_subject_id: p.p_subject_id,
        p_term_id: p.p_term_id,
      }),
      total = sheet.roster.find(
        (s: any) => s.studentId === p.p_student_id,
      )?.total;
    if (!total || total.score == null || total.score >= 51 || total.missing)
      throw new Error(
        "Completa las dimensiones; se habilita para notas menores a 51.",
      );
    if (String(p.p_reason || "").trim().length < 5)
      throw new Error("Explica el motivo del reforzamiento.");
    let r = state.reinforcements.find(
      (r) =>
        r.student_id === p.p_student_id &&
        r.term_id === p.p_term_id &&
        r.class_subject_id === p.p_subject_id,
    );
    if (!r) {
      r = {
        id: crypto.randomUUID(),
        student_id: p.p_student_id,
        term_id: p.p_term_id,
        classroom_id: p.p_classroom_id,
        class_subject_id: p.p_subject_id,
        original_score: total.score,
        score: null,
        status: "pending",
        revision: 1,
        corrections: 0,
        reason: p.p_reason,
        method:
          state.policies[p.p_classroom_id]?.reinforcement_method || "best",
      };
      state.reinforcements.push(r);
    }
    save("academic_reinforcements");
    return r.id;
  }
  if (name === "save_reinforcement") {
    if ((!director && role !== "teacher") || (p.p_approve && !director))
      throw new Error("Dirección aprueba el resultado.");
    const r = state.reinforcements.find((x) => x.id === p.p_id);
    if (!r || r.status === "approved" || r.revision !== p.p_revision)
      throw new Error("El reforzamiento cambió o está aprobado.");
    if (
      p.p_score == null ||
      !Number.isFinite(p.p_score) ||
      p.p_score < 0 ||
      p.p_score > 100
    )
      throw new Error("Registra una nota entre 0 y 100.");
    r.score = p.p_score;
    r.status = p.p_approve ? "approved" : "pending";
    r.revision++;
    save("academic_reinforcements");
    return null;
  }
  if (name === "promotion_workspace") {
    const y =
        life.years.find((y) => y.id === p.p_source_year) ||
        [...life.years].sort((a, b) => b.year - a.year)[0],
      rooms = d.classrooms.filter((r) => r.schoolId === sid),
      terms = life.terms.filter((t) => t.yearId === y?.id);
    return {
      sourceYear: y,
      years: life.years,
      rooms: rooms.map((r) => ({
        ...r,
        academic_year: r.academicYear,
        policy: state.policies[r.id],
      })),
      batches: state.batches,
      students: d.students
        .filter(
          (s) =>
            s.schoolId === sid &&
            s.status !== "inactive" &&
            rooms.some(
              (r) => r.id === s.classroomId && r.academicYear === y?.year,
            ),
        )
        .map((s) => {
          const policy = state.policies[s.classroomId],
            cards = life.cards.filter(
              (c) =>
                c.studentId === s.id &&
                c.classroomId === s.classroomId &&
                terms.some((t) => t.id === c.termId) &&
                !c.revokedAt,
            ),
            subs = d.classSubjects.filter(
              (cs) => cs.classroomId === s.classroomId && cs.active,
            );
          const subjects = subs.map((cs) => {
            const rows = cards.flatMap((c) =>
              c.content.subjects.filter((l) => l.classSubjectId === cs.id),
            );
            const score =
              rows.length === 3 &&
              rows.every((l) => l.score !== null && !l.missing)
                ? Math.round(
                    (rows.reduce(
                      (n, l) => n + (l.score! / (l.maxScore || 100)) * 100,
                      0,
                    ) /
                      3) *
                      100,
                  ) / 100
                : null;
            return {
              subject:
                d.subjects.find((x) => x.id === cs.subjectId)?.name ||
                "Materia",
              score,
              classification:
                score == null
                  ? null
                  : score < 51
                    ? "ED"
                    : score < 69
                      ? "DA"
                      : score < 85
                        ? "DO"
                        : "DP",
            };
          });
          const complete =
              policy?.scheme === "bolivia2026" &&
              terms.length === 3 &&
              terms.every((t) => t.status === "closed") &&
              subjects.length > 0 &&
              subjects.every((s) => s.score !== null),
            outcome = !complete
              ? "pending"
              : subjects.some((s) => s.score! < 51)
                ? "retained"
                : policy.grade_code === "secondary6"
                  ? "graduated"
                  : "passed",
            grade = policy?.grade_code;
          const next =
            grade === "primary6"
              ? "secondary1"
              : grade?.replace(/[1-5]$/, (n) => String(Number(n) + 1));
          return {
            studentId: s.id,
            studentName: `${s.firstName} ${s.lastName}`,
            classroomId: s.classroomId,
            classroomName: rooms.find((r) => r.id === s.classroomId)?.name,
            gradeCode: grade,
            outcome,
            targetGrade: outcome === "retained" ? grade : next,
            subjects,
            fingerprint: JSON.stringify(
              cards.map((c) => [c.id, c.revision, c.content]),
            ),
          };
        }),
    };
  }
  if (name === "apply_annual_promotion") {
    const old = state.batches.find((b) => b.id === p.p_batch_id);
    if (old) return old.items.length;
    const preview = (await demoAcademicRpc("promotion_workspace", {
        p_school_id: sid,
        p_source_year: p.p_source_year,
      })) as PromotionData,
      dest = life.years.find((y) => y.id === p.p_target_year);
    if (
      preview.sourceYear?.status !== "closed" ||
      dest?.status !== "open" ||
      dest.year !== preview.sourceYear.year + 1
    )
      throw new Error("Cierra el origen y elige la siguiente gestión abierta.");
    for (const item of p.p_items) {
      const row = preview.students.find((s) => s.studentId === item.studentId),
        r = d.classrooms.find((r) => r.id === item.targetClassroomId);
      if (
        !row ||
        row.outcome === "pending" ||
        row.fingerprint !== item.fingerprint
      )
        throw new Error("Actualiza los resultados pendientes.");
      if (
        row.outcome !== "graduated" &&
        (!r ||
          r.academicYear !== dest.year ||
          state.policies[r.id]?.grade_code !== row.targetGrade)
      )
        throw new Error("Selecciona un paralelo del grado correspondiente.");
    }
    for (const item of p.p_items) {
      const row = preview.students.find((s) => s.studentId === item.studentId)!;
      if (row.outcome === "graduated") {
        d.students.find((s) => s.id === item.studentId)!.status = "inactive";
        writeDemoData(d);
      } else
        await demoRpc("move_student_year", {
          p_student_id: item.studentId,
          p_classroom_id: item.targetClassroomId,
          p_reason: `Promoción anual: ${row.outcome}`,
        });
    }
    state.batches.push({
      id: p.p_batch_id,
      created_at: new Date().toISOString(),
      items: p.p_items,
    });
    save("promotion_batches");
    return p.p_items.length;
  }
  throw new Error("Operación no disponible.");
}
