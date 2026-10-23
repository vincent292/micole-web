import { useState } from "react";
import { Button, Field, Modal, SectionTitle } from "../components/UI";
import type { PageProps } from "./Pages";
import { rpc } from "../lib/repository";
import { useAcademicPlanning } from "../lib/useAcademicPlanning";
import {
  gradeOptions,
  schemes,
  reinforcementMethods,
  outcomeNames,
  type AcademicPolicy,
  type PromotionData,
} from "../lib/academicPlanning";
import type { GradeSheetData } from "../lib/gradeSheet";
import "../styles/academic-planning.css";
export function AcademicPolicyButton({
  room,
  data,
  refresh,
}: {
  room: string;
  data: GradeSheetData;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      {data.canConfigure && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Grado y evaluación
        </Button>
      )}
      {data.policy?.scheme === "bolivia2026" && (
        <p className="grade-sheet-hint">
          Ser 10 · Saber 45 · Hacer 40 · Autoevaluación 5. Cada dimensión
          promedia sus evidencias ponderadas. Total sobre 100; aprobar requiere
          51.
        </p>
      )}
      {open && (
        <PolicyDialog
          room={room}
          initial={data.policy || undefined}
          busy={busy}
          error={error}
          close={() => setOpen(false)}
          save={(values) => {
            setBusy(true);
            setError("");
            void rpc("save_academic_policy", {
              p_classroom_id: room,
              ...values,
            })
              .then(() => {
                setOpen(false);
                refresh();
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </>
  );
}
export function PolicyDialog({
  room,
  initial,
  busy,
  error,
  close,
  save,
}: {
  room: string;
  initial?: AcademicPolicy;
  busy: boolean;
  error: string;
  close: () => void;
  save: (values: Record<string, string>) => void;
}) {
  return (
    <Modal
      title="Grado y evaluación del paralelo"
      subtitle="La política corresponde solo a esta aula y gestión."
      onClose={close}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          p_grade_code: String(f.get("grade")),
          p_scheme: String(f.get("scheme")),
          p_reinforcement_method: String(f.get("method")),
        });
      }}
    >
      <input type="hidden" value={room} readOnly />
      <Field label="Grado oficial" name="grade">
        <select name="grade" required defaultValue={initial?.grade_code || ""}>
          <option value="">Seleccionar grado</option>
          {gradeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Modelo de evaluación" name="scheme">
        <select name="scheme" defaultValue={initial?.scheme || "flexible"}>
          {Object.entries(schemes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Regla institucional del reforzamiento" name="method">
        <select
          name="method"
          defaultValue={initial?.reinforcement_method || "best"}
        >
          {Object.entries(reinforcementMethods).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <p>
        El reforzamiento se habilita individualmente antes del cierre del
        trimestre y requiere aprobación de Dirección. La nota original permanece
        registrada. Esta regla debe corresponder al procedimiento aprobado por
        tu institución.
      </p>
      <p>
        Bolivia 2026: tres trimestres y promedio anual simple. Inicial mantiene
        evaluación cualitativa.
      </p>
    </Modal>
  );
}
export function ReinforcementCell({
  data,
  studentId,
  room,
  subject,
  closed,
  refresh,
}: {
  data: GradeSheetData;
  studentId: string;
  room: string;
  subject: string;
  closed: boolean;
  refresh: () => void;
}) {
  const r = data.reinforcements?.find((r) => r.student_id === studentId),
    [text, setText] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [authorize, setAuthorize] = useState(false);
  async function send(method: string, args: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await rpc(method, args);
      refresh();
      setText(undefined);
      setAuthorize(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const total = data.roster.find((s) => s.studentId === studentId)?.total;
  return (
    <div className="grade-cell">
      {r ? (
        <>
          <small>
            Original: {Number(r.original_score)} · mínimo de aprobación: 51
          </small>
          {data.canManage && !closed && r.status === "pending" ? (
            <>
              <input
                aria-label="Nota de reforzamiento"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={text ?? String(r.score ?? "")}
                onChange={(e) => setText(e.target.value)}
              />
              <Button
                disabled={busy || (text ?? String(r.score ?? "")) === ""}
                variant="secondary"
                onClick={() =>
                  void send("save_reinforcement", {
                    p_id: r.id,
                    p_revision: r.revision,
                    p_score: Number(text ?? r.score),
                    p_approve: false,
                  })
                }
              >
                Guardar reforzamiento
              </Button>
              {data.canConfigure && r.score !== null && (
                <Button
                  disabled={busy || text !== undefined}
                  onClick={() =>
                    void send("save_reinforcement", {
                      p_id: r.id,
                      p_revision: r.revision,
                      p_score: r.score,
                      p_approve: true,
                    })
                  }
                >
                  Aprobar resultado
                </Button>
              )}
            </>
          ) : (
            <strong>
              {r.score === null ? "Pendiente" : Number(r.score)} ·{" "}
              {r.status === "approved"
                ? "Aprobado por Dirección"
                : "Por aprobar"}
            </strong>
          )}
        </>
      ) : data.canConfigure &&
        !closed &&
        total?.score != null &&
        total.score < 51 &&
        total.missing === 0 ? (
        <Button variant="secondary" onClick={() => setAuthorize(true)}>
          Habilitar reforzamiento
        </Button>
      ) : (
        <span>—</span>
      )}
      {error && <small role="alert">{error}</small>}
      {authorize && (
        <Modal
          title="Autorizar reforzamiento"
          error={error}
          busy={busy}
          onClose={() => setAuthorize(false)}
          submitLabel="Habilitar evaluación"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send("authorize_reinforcement", {
              p_term_id: data.termId,
              p_classroom_id: room,
              p_subject_id: subject,
              p_student_id: studentId,
              p_reason: f.get("reason"),
            });
          }}
        >
          <p>
            Se añadirá una nota obligatoria para este alumno. Dirección deberá
            aprobar el resultado antes del cierre.
          </p>
          <Field label="Motivo y actividad de apoyo" name="reason">
            <textarea name="reason" minLength={5} maxLength={1000} required />
          </Field>
        </Modal>
      )}
    </div>
  );
}
export function AnnualPromotion(p: PageProps) {
  const [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    [choices, setChoices] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [policy, setPolicy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [batch, setBatch] = useState(() => crypto.randomUUID());
  const ws = useAcademicPlanning<PromotionData>(
      "promotion_workspace",
      {
        p_school_id: p.school?.id,
        p_source_year: source || null,
        p_target_year: target || null,
      },
      p.school?.id,
    ),
    d = ws.data;
  const dest =
    d?.years.find((y) => y.id === target) ||
    d?.years.find(
      (y) => y.year === (d.sourceYear?.year || 0) + 1 && y.status === "open",
    );
  const targetRooms =
    d?.rooms.filter((r) => r.academic_year === dest?.year) || [];
  const resolve = (id: string, grade?: string) =>
    choices[id] ||
    targetRooms.find((r) => r.policy?.grade_code === grade)?.id ||
    "";
  const ready = d?.students.filter(
    (s) =>
      s.outcome !== "pending" &&
      (s.outcome === "graduated" || resolve(s.studentId, s.targetGrade)),
  );
  const items =
    d?.students
      .filter((s) => selected.includes(s.studentId))
      .map((s) => ({
        studentId: s.studentId,
        fingerprint: s.fingerprint,
        targetClassroomId:
          s.outcome === "graduated"
            ? null
            : resolve(s.studentId, s.targetGrade),
      })) || [];
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(message);
      ws.refresh();
      setConfirm(false);
      setPolicy("");
      setSelected([]);
      setBatch(crypto.randomUUID());
      await p.store.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <SectionTitle
        title="Promoción y reinscripción anual"
        subtitle="Revisa resultados publicados de los tres trimestres. Los saldos, familias y expedientes se conservan."
      />
      {(error || ws.error) && (
        <p className="message error" role="alert">
          {error || ws.error}
        </p>
      )}
      {message && (
        <p role="status" className="message success">
          {message}
        </p>
      )}
      {ws.loading && !d ? (
        <p>Cargando gestión…</p>
      ) : (
        d && (
          <>
            <div className="planning-filters">
              <Field label="Gestión de origen" name="sourceYear">
                <select
                  value={d.sourceYear?.id || ""}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setSelected([]);
                    setChoices({});
                  }}
                >
                  {d.years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name} · {y.status === "closed" ? "Cerrada" : "Abierta"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Gestión siguiente" name="targetYear">
                <select
                  value={dest?.id || ""}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setSelected([]);
                  }}
                >
                  <option value="">Crear primero la siguiente gestión</option>
                  {d.years
                    .filter(
                      (y) =>
                        y.year === (d.sourceYear?.year || 0) + 1 &&
                        y.status === "open",
                    )
                    .map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                </select>
              </Field>
              {dest && (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() =>
                    void run(
                      () =>
                        rpc("copy_year_classrooms", {
                          p_source_year: d.sourceYear?.id,
                          p_target_year: dest.id,
                        }),
                      "Aulas y materias copiadas. Revisa grados, precios y asignaciones de la nueva gestión.",
                    )
                  }
                >
                  Preparar aulas de destino
                </Button>
              )}
            </div>
            <details className="planning-access">
              <summary>Configurar grados y modelos de evaluación</summary>
              <p>
                Asigna el grado oficial a cada paralelo. Usa evaluación
                cualitativa para inicial; el proceso automático de promoción
                numérica requiere el modelo Bolivia 2026.
              </p>
              {d.rooms.map((r) => (
                <div className="planning-actions" key={r.id}>
                  <span>
                    {r.name} · {r.academic_year} ·{" "}
                    {gradeOptions.find((o) => o.value === r.policy?.grade_code)
                      ?.label || "Grado sin configurar"}
                  </span>
                  <Button
                    disabled={busy}
                    variant="ghost"
                    onClick={() => setPolicy(r.id)}
                  >
                    Configurar grado
                  </Button>
                </div>
              ))}
            </details>
            <p>
              Origen{" "}
              {d.sourceYear?.status === "closed"
                ? "cerrado"
                : "abierto: cierra los periodos y la gestión desde Gestiones y libretas antes de confirmar"}
              . Las notas incompletas quedan pendientes; no se convierten en
              cero.
            </p>
            <div className="planning-actions">
              <Button
                variant="secondary"
                disabled={!ready?.length}
                onClick={() =>
                  setSelected(ready?.map((s) => s.studentId) || [])
                }
              >
                Seleccionar casos listos
              </Button>
              <Button variant="ghost" onClick={() => setSelected([])}>
                Quitar selección
              </Button>
              <Button
                disabled={
                  busy ||
                  !items.length ||
                  !dest ||
                  d.sourceYear?.status !== "closed"
                }
                onClick={() => setConfirm(true)}
              >
                Revisar {items.length} reinscripciones
              </Button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Seleccionar</th>
                    <th>Estudiante</th>
                    <th>Resultado</th>
                    <th>Destino</th>
                    <th>Notas anuales</th>
                  </tr>
                </thead>
                <tbody>
                  {d.students.map((s) => (
                    <tr key={s.studentId}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${s.studentName}`}
                          checked={selected.includes(s.studentId)}
                          disabled={
                            s.outcome === "pending" ||
                            (s.outcome !== "graduated" &&
                              !resolve(s.studentId, s.targetGrade))
                          }
                          onChange={(e) =>
                            setSelected((old) =>
                              e.target.checked
                                ? [...old, s.studentId]
                                : old.filter((id) => id !== s.studentId),
                            )
                          }
                        />
                      </td>
                      <th scope="row">
                        {s.studentName}
                        <small>{s.classroomName}</small>
                      </th>
                      <td>{outcomeNames[s.outcome]}</td>
                      <td>
                        {s.outcome === "graduated" ? (
                          "Egreso · finalizar inscripción"
                        ) : s.outcome === "pending" ? (
                          "Completar notas, periodos o política"
                        ) : (
                          <select
                            aria-label={`Destino de ${s.studentName}`}
                            value={resolve(s.studentId, s.targetGrade)}
                            onChange={(e) =>
                              setChoices((old) => ({
                                ...old,
                                [s.studentId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Sin paralelo compatible</option>
                            {targetRooms
                              .filter(
                                (r) => r.policy?.grade_code === s.targetGrade,
                              )
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} · {dest?.year}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td>
                        {s.subjects.map((l) => (
                          <div key={l.subject}>
                            {l.subject}:{" "}
                            {l.score === null
                              ? "Pendiente"
                              : `${l.score} · ${l.classification}`}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.students.length && (
              <p>
                Sin estudiantes pendientes de reinscripción en esta gestión.
              </p>
            )}
            <p>
              Este proceso no crea cuotas nuevas ni modifica los planes
              existentes. Dirección prepara el plan de pagos de la nueva gestión
              desde Mensualidades.
            </p>
            {d.batches.map((b) => (
              <p className="muted" key={b.id}>
                Lote confirmado ·{" "}
                {new Date(b.created_at).toLocaleString("es-BO")} ·{" "}
                {b.items.length} estudiantes
              </p>
            ))}
            {policy && (
              <PolicyDialog
                room={policy}
                initial={d.rooms.find((r) => r.id === policy)?.policy}
                busy={busy}
                error={error}
                close={() => setPolicy("")}
                save={(values) =>
                  void run(
                    () =>
                      rpc("save_academic_policy", {
                        p_classroom_id: policy,
                        ...values,
                      }),
                    "Política guardada.",
                  )
                }
              />
            )}
          </>
        )
      )}
      {confirm && (
        <Modal
          title="Confirmar promoción anual"
          busy={busy}
          error={error}
          onClose={() => setConfirm(false)}
          submitLabel="Confirmar lote"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                rpc("apply_annual_promotion", {
                  p_batch_id: batch,
                  p_source_year: d?.sourceYear?.id,
                  p_target_year: dest?.id,
                  p_items: items,
                }),
              "Reinscripciones confirmadas con historial conservado.",
            );
          }}
        >
          <p>
            {items.length} estudiantes · {d?.sourceYear?.name} → {dest?.name}
          </p>
          {d?.students
            .filter((s) => selected.includes(s.studentId))
            .map((s) => (
              <p key={s.studentId}>
                {s.studentName}: {outcomeNames[s.outcome]} →{" "}
                {s.outcome === "graduated"
                  ? "Egreso"
                  : targetRooms.find(
                      (r) => r.id === resolve(s.studentId, s.targetGrade),
                    )?.name}
              </p>
            ))}
          <label className="check-row">
            <input required type="checkbox" />
            Revisé los resultados y los paralelos de destino. Entiendo que los
            egresados finalizan su inscripción.
          </label>
        </Modal>
      )}
    </section>
  );
}
