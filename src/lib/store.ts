import { useCallback, useEffect, useRef, useState } from "react";
import { seed } from "./seed";
import { uid } from "./format";
export { uid, money, dateLabel, initials } from "./format";
import { buildSchedule, today } from "./billing";
import { emptyData, loadData, rpc, saveRow, toRow } from "./repository";
import { liveMode } from "./supabase";
import type {
  AppData,
  Collection,
  Invitation,
  PaymentPlan,
  Student,
  CareProfile,
  FamilyIntake,
} from "./types";
const KEY = "aulanexo_demo_v2";
const clone = <T>(value: T): T => structuredClone(value);
function read(): AppData {
  try {
    const serialized =
      localStorage.getItem(KEY) || localStorage.getItem("aulanexo_demo_v1");
    if (serialized) {
      const parsed = JSON.parse(serialized) as Partial<AppData>;
      if (!Array.isArray(parsed.schools) || !Array.isArray(parsed.students))
        return clone(seed);
      const restored = { ...clone(seed), ...parsed };
      restored.charges = restored.charges.map((c) =>
        !c.period && c.concept.startsWith("Mensualidad")
          ? { ...c, period: c.dueDate.slice(0, 7) }
          : c,
      );
      return restored;
    }
  } catch {
    /* use seed */
  }
  return clone(seed);
}
export function useAppStore(
  userId: string | null,
  platform = false,
  context = "",
) {
  const [data, setData] = useState<AppData>(() =>
    liveMode ? emptyData() : read(),
  );
  const [loading, setLoading] = useState(liveMode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef(data);
  current.current = data;
  const scope = `${userId || ""}:${platform}:${context}`;
  const [loadedScope, setLoadedScope] = useState("");
  const session = useRef(scope);
  session.current = scope;
  const inflight = useRef(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!liveMode || !userId) return;
    const sequence = ++refreshSequence.current;
    try {
      const next = await loadData(platform);
      if (session.current === scope && sequence === refreshSequence.current) {
        setData(next);
        setLoadedScope(scope);
        setError("");
      }
    } catch (e) {
      if (session.current === scope && sequence === refreshSequence.current)
        setError(
          e instanceof Error ? e.message : "No pudimos cargar los datos.",
        );
    } finally {
      if (session.current === scope && sequence === refreshSequence.current)
        setLoading(false);
    }
  }, [userId, platform, context, scope]);
  useEffect(() => {
    if (liveMode) {
      setData(emptyData());
      setLoading(!!userId);
      setError("");
      void refresh();
    }
  }, [refresh, userId]);
  useEffect(() => {
    if (!liveMode) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        setError(
          "No hay espacio para guardar. Exporta tus datos antes de continuar.",
        );
      }
    }
  }, [data]);
  useEffect(() => {
    if (!liveMode || !userId) return;
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => {
      window.removeEventListener("focus", focus);
      window.clearInterval(timer);
    };
  }, [refresh, userId]);
  async function run(
    remote: () => Promise<unknown>,
    local: (prev: AppData) => AppData,
  ) {
    if (inflight.current)
      throw new Error("Espera a que termine la operación actual.");
    inflight.current = true;
    setBusy(true);
    try {
      if (liveMode) {
        await remote();
        await refresh();
      } else setData((prev) => local(prev));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function save<K extends Collection>(
    table: K,
    item: AppData[K][number],
  ) {
    await run(
      () => saveRow(table, item),
      (prev) => ({
        ...prev,
        [table]: [...prev[table].filter((x) => x.id !== item.id), item],
      }),
    );
  }
  async function enroll(student: Student) {
    if (
      !student.motherName ||
      !student.motherEmail ||
      !student.fatherName ||
      !student.fatherEmail ||
      !student.identityNumber
    )
      throw new Error("Completa CI, nombres y correos de madre y padre.");
    if (student.motherEmail === student.fatherEmail)
      throw new Error("Madre y padre deben tener correos diferentes.");
    if (
      current.current.students.some(
        (s) =>
          s.schoolId === student.schoolId &&
          ((student.rude &&
            s.rude?.replace(/\s/g, "").toUpperCase() ===
              student.rude.replace(/\s/g, "").toUpperCase()) ||
            s.identityNumber?.replace(/\s/g, "").toUpperCase() ===
              student.identityNumber?.replace(/\s/g, "").toUpperCase()),
      )
    )
      throw new Error("El RUDE o CI ya está registrado en esta institución.");
    await run(
      () => rpc("enroll_student", { p_student: toRow("students", student) }),
      (prev) => ({
        ...prev,
        students: [...prev.students, student],
        platformCharges: [
          ...prev.platformCharges,
          {
            id: uid(),
            schoolId: student.schoolId,
            studentId: student.id,
            concept: `Activación de ${student.firstName} ${student.lastName}`,
            period: today().slice(0, 7),
            amount: 50,
            status: "pending",
          },
        ],
      }),
    );
  }
  async function createPlan(plan: PaymentPlan) {
    const charges = buildSchedule(plan, uid);
    const student = current.current.students.find(
      (s) => s.id === plan.studentId,
    );
    if (!student || student.status === "inactive")
      throw new Error("El estudiante está dado de baja.");
    if (
      charges.some(
        (c) =>
          c.period &&
          current.current.charges.some(
            (existing) =>
              existing.studentId === plan.studentId &&
              existing.period === c.period &&
              existing.status !== "cancelled",
          ),
      )
    )
      throw new Error(
        "Ya existen cuotas para este estudiante en los meses del plan.",
      );
    await run(
      () => rpc("create_payment_plan", { p_plan: toRow("paymentPlans", plan) }),
      (prev) => ({
        ...prev,
        paymentPlans: [...prev.paymentPlans, plan],
        charges: [...prev.charges, ...charges],
        students: prev.students.map((s) =>
          s.id === plan.studentId
            ? {
                ...s,
                monthlyFee: plan.monthlyFee,
                snackFee: plan.snackFee,
                enrollmentFee: plan.enrollmentFee,
              }
            : s,
        ),
      }),
    );
  }
  async function studentStatus(student: Student, status: Student["status"]) {
    if (
      status === "active" &&
      current.current.platformCharges.some(
        (p) => p.studentId === student.id && p.status !== "paid",
      )
    )
      throw new Error(
        "Primero registra el pago de activación de Bs 50 desde la plataforma.",
      );
    await run(
      () =>
        rpc("set_student_status", {
          p_student_id: student.id,
          p_status: status,
        }),
      (prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === student.id
            ? {
                ...s,
                status,
                withdrawnAt: status === "inactive" ? today() : undefined,
              }
            : s,
        ),
        charges: prev.charges.map((c) =>
          status === "inactive" &&
          c.studentId === student.id &&
          c.dueDate > today() &&
          c.status !== "paid"
            ? { ...c, status: "cancelled" }
            : c,
        ),
      }),
    );
  }
  async function recordPayment(
    id: string,
    platform: boolean,
    method = "cash",
    reference = "",
  ) {
    await run(
      () =>
        rpc(platform ? "record_platform_payment" : "record_school_payment", {
          p_charge_id: id,
          p_method: method,
          p_reference: reference,
        }),
      (prev) => ({
        ...prev,
        [platform ? "platformCharges" : "charges"]: prev[
          platform ? "platformCharges" : "charges"
        ].map((c) =>
          c.id === id && c.status !== "cancelled"
            ? { ...c, status: "paid", paidAt: today() }
            : c,
        ),
      }),
    );
  }
  async function invoicePlatform(schoolId: string, period: string) {
    if (
      current.current.platformCharges.some(
        (c) => c.schoolId === schoolId && !c.studentId && c.period === period,
      )
    )
      throw new Error("Ya existe una liquidación para ese período.");
    const count =
      current.current.schools.find((s) => s.id === schoolId)
        ?.activeStudentCount ??
      current.current.students.filter(
        (s) => s.schoolId === schoolId && s.status === "active",
      ).length;
    if (!liveMode && !count)
      throw new Error("No hay estudiantes activos para facturar.");
    await run(
      () =>
        rpc("generate_platform_invoice", {
          p_school_id: schoolId,
          p_period: period,
        }),
      (prev) => ({
        ...prev,
        platformCharges: [
          ...prev.platformCharges,
          {
            id: uid(),
            schoolId,
            period,
            concept: `Licencia ${period} · ${count} alumnos`,
            amount: count * 29,
            status: "pending",
          },
        ],
      }),
    );
  }
  async function invite(item: Invitation) {
    let token = uid() + uid();
    await run(
      async () => {
        token = await rpc<string>("create_invitation", {
          p_invite: toRow("invitations", item),
        });
      },
      (prev) => ({
        ...prev,
        invitations: [...prev.invitations, { ...item, token }],
      }),
    );
    return `${window.location.origin}/invite/${token}`;
  }
  async function grantAccess(student: Student, until: string) {
    if (!until || until < today())
      throw new Error("Indica una fecha de acceso válida.");
    await run(
      () =>
        rpc("set_student_access_until", {
          p_student_id: student.id,
          p_until: until,
        }),
      (prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === student.id ? { ...s, accessUntil: until } : s,
        ),
      }),
    );
  }
  async function publishClassEntry(
    schoolId: string,
    classroomId: string,
    category: string,
    note: string,
    date: string,
  ) {
    const entries = current.current.students
      .filter(
        (s) =>
          s.schoolId === schoolId &&
          s.classroomId === classroomId &&
          s.status === "active",
      )
      .map((s) => ({
        id: uid(),
        schoolId,
        studentId: s.id,
        category: category as AppData["dailyEntries"][number]["category"],
        note,
        date,
      }));
    if (!entries.length)
      throw new Error("No hay estudiantes activos en esta aula.");
    await run(
      () =>
        rpc("publish_class_entry", {
          p_school_id: schoolId,
          p_classroom_id: classroomId,
          p_category: category,
          p_note: note,
          p_date: date,
        }),
      (prev) => ({ ...prev, dailyEntries: [...prev.dailyEntries, ...entries] }),
    );
  }
  async function adjustDiscount(
    plan: PaymentPlan,
    discount: number,
    from: string,
    to: string,
  ) {
    if (discount < 0 || (discount > 0 && (!from || !to || from > to)))
      throw new Error("Indica un descuento y fechas válidas.");
    await run(
      () =>
        rpc("adjust_plan_discount", {
          p_plan_id: plan.id,
          p_discount: discount,
          p_from: from || null,
          p_to: to || null,
        }),
      (prev) => ({
        ...prev,
        paymentPlans: prev.paymentPlans.map((p) =>
          p.id === plan.id
            ? { ...p, discount, discountFrom: from, discountTo: to }
            : p,
        ),
        charges: prev.charges.map((c) => {
          if (
            c.planId !== plan.id ||
            !c.period ||
            ["paid", "cancelled"].includes(c.status)
          )
            return c;
          const deduction =
            c.dueDate >= from && c.dueDate <= to
              ? Math.min(discount, (c.baseAmount || 0) + (c.snackAmount || 0))
              : 0;
          return {
            ...c,
            discountAmount: deduction,
            amount:
              Math.round(
                ((c.baseAmount || 0) +
                  (c.snackAmount || 0) +
                  (c.licenseAmount || 0) -
                  deduction) *
                  100,
              ) / 100,
          };
        }),
      }),
    );
  }
  async function billingCycle() {
    const date = today(),
      period = date.slice(0, 7);
    await run(
      () => rpc("run_billing_cycle", {}),
      (prev) => {
        const next = clone(prev);
        for (const s of next.students.filter(
          (s) => s.status === "active" && s.enrolledAt <= date,
        )) {
          if (
            next.charges.some(
              (c) =>
                c.studentId === s.id &&
                c.status !== "cancelled" &&
                (c.period === period ||
                  (!c.period &&
                    c.concept.startsWith("Mensualidad") &&
                    c.dueDate.startsWith(period))),
            )
          )
            continue;
          const plan = next.paymentPlans
            .filter((p) => p.studentId === s.id && p.startDate <= date)
            .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
          const cyclePlan: PaymentPlan = {
            id: plan?.id || uid(),
            schoolId: s.schoolId,
            studentId: s.id,
            startDate: period + "-01",
            months: 1,
            monthlyFee: s.monthlyFee,
            snackFee: s.snackFee || 0,
            enrollmentFee: 0,
            dueDay: plan?.dueDay || 10,
            discount: plan?.discount || 0,
            discountFrom: plan?.discountFrom || "",
            discountTo: plan?.discountTo || "",
            prorate: false,
            createdAt: date,
          };
          const charge = buildSchedule(cyclePlan, uid)[0];
          if (!plan) delete charge.planId;
          if (s.enrolledAt.startsWith(period) && s.enrolledAt > charge.dueDate)
            charge.dueDate = s.enrolledAt;
          next.charges.push(charge);
        }
        for (const school of next.schools) {
          if (
            next.platformCharges.some(
              (c) =>
                c.schoolId === school.id && !c.studentId && c.period === period,
            )
          )
            continue;
          const count = next.students.filter(
            (s) =>
              s.schoolId === school.id &&
              s.status === "active" &&
              s.enrolledAt <= date,
          ).length;
          if (count)
            next.platformCharges.push({
              id: uid(),
              schoolId: school.id,
              concept: `Licencia ${period} · ${count} alumnos`,
              period,
              amount: count * 29,
              status: "pending",
            });
        }
        return next;
      },
    );
  }
  async function requestInstitution(
    request: {
      schoolName: string;
      city: string;
      contactName: string;
      phone: string;
      message: string;
    },
    identity: { id: string; email: string },
  ) {
    await run(
      () =>
        rpc("request_institution", {
          p_request: toRow("institutionRequests", request),
        }),
      (prev) => ({
        ...prev,
        institutionRequests: [
          ...prev.institutionRequests,
          {
            ...request,
            id: uid(),
            userId: identity.id,
            email: identity.email,
            status: "pending",
            response: "",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
  }
  async function reviewInstitution(
    id: string,
    approve: boolean,
    response: string,
  ) {
    await run(
      () =>
        rpc("review_institution_request", {
          p_id: id,
          p_approve: approve,
          p_response: response,
        }),
      (prev) => ({
        ...prev,
        institutionRequests: prev.institutionRequests.map((r) =>
          r.id === id
            ? { ...r, status: approve ? "approved" : "rejected", response }
            : r,
        ),
      }),
    );
  }
  async function readNotification(id?: string) {
    await run(
      () => rpc("mark_notification_read", { p_id: id || null }),
      (prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          !id || n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      }),
    );
  }
  async function createIntake(
    studentId: string,
    recipient: "mother" | "father",
  ) {
    const student = current.current.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Selecciona un estudiante.");
    const email =
      recipient === "mother"
        ? student.motherEmail || student.guardianEmail
        : student.fatherEmail;
    if (!email)
      throw new Error("Registra primero el correo de ese responsable.");
    let token = (uid() + uid()).replace(/-/g, "");
    await run(
      async () => {
        token = await rpc<string>("create_family_intake", {
          p_student_id: studentId,
          p_recipient: recipient,
        });
      },
      (prev) => ({
        ...prev,
        familyIntakes: [
          ...prev.familyIntakes.map((f) =>
            f.studentId === studentId &&
            ["open", "submitted"].includes(f.status)
              ? { ...f, status: "revoked" as const }
              : f,
          ),
          {
            id: uid(),
            schoolId: student.schoolId,
            studentId,
            recipient,
            recipientEmail: email,
            status: "open",
            token,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          } as FamilyIntake,
        ],
      }),
    );
    return `${window.location.origin}/inscripcion/${token}`;
  }
  async function reviewIntake(form: FamilyIntake, approve: boolean) {
    if (!form.profile || form.status !== "submitted")
      throw new Error("Esta ficha no está pendiente de revisión.");
    await run(
      () => rpc("review_family_intake", { p_id: form.id, p_approve: approve }),
      (prev) => ({
        ...prev,
        familyIntakes: prev.familyIntakes.map((f) =>
          f.id === form.id
            ? {
                ...f,
                status: approve ? ("approved" as const) : ("revoked" as const),
              }
            : f,
        ),
        students: prev.students.map((s) =>
          s.id === form.studentId && approve
            ? { ...s, ...form.profile, profileComplete: true }
            : s,
        ),
      }),
    );
  }
  async function revokeIntake(id: string) {
    await run(
      () => rpc("revoke_family_intake", { p_id: id }),
      (prev) => ({
        ...prev,
        familyIntakes: prev.familyIntakes.map((f) =>
          f.id === id ? { ...f, status: "revoked" as const } : f,
        ),
      }),
    );
  }
  async function completeCare(student: Student, profile: CareProfile) {
    await run(
      () =>
        rpc("complete_student_profile", {
          p_student_id: student.id,
          p_profile: profile,
        }),
      (prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === student.id ? { ...s, ...profile, profileComplete: true } : s,
        ),
        familyIntakes: prev.familyIntakes.map((f) =>
          f.studentId === student.id && ["open", "submitted"].includes(f.status)
            ? { ...f, status: "revoked" as const }
            : f,
        ),
      }),
    );
  }
  function reset() {
    if (!liveMode) setData(clone(seed));
  }
  const ready = !liveMode || loadedScope === scope;
  return {
    data: ready ? data : emptyData(),
    loading: loading || (!ready && !!userId && !error),
    error,
    busy,
    refresh,
    save,
    enroll,
    createPlan,
    studentStatus,
    recordPayment,
    invoicePlatform,
    invite,
    billingCycle,
    publishClassEntry,
    grantAccess,
    adjustDiscount,
    requestInstitution,
    reviewInstitution,
    readNotification,
    createIntake,
    reviewIntake,
    revokeIntake,
    completeCare,
    reset,
  };
}
export type AppStore = ReturnType<typeof useAppStore>;
