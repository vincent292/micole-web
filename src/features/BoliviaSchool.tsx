import { useState } from "react";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  SectionTitle,
} from "../components/UI";
import type { PageProps } from "./Pages";
import { rpc } from "../lib/repository";
import { useAcademicPlanning } from "../lib/useAcademicPlanning";
import {
  centralizerCsv,
  dateRange,
  documentKinds,
  documentStatuses,
  ministerialReference,
  ministerialUrl,
  weekdays,
  type BoliviaProfile,
  type BoliviaWorkspace,
  type PedagogicalDocument,
} from "../lib/bolivia";
import "../styles/bolivia.css";

export function BoliviaSchool(p: PageProps) {
  const [year, setYear] = useState(""),
    [tab, setTab] = useState("profile"),
    [edit, setEdit] = useState<PedagogicalDocument>(),
    [profileOpen, setProfileOpen] = useState(false),
    [review, setReview] = useState<PedagogicalDocument>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ws = useAcademicPlanning<BoliviaWorkspace>(
      "bolivia_workspace",
      { p_school_id: p.school?.id, p_year_id: year || null },
      p.school?.id,
    ),
    d = ws.data;
  async function act(name: string, args: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await rpc(name, args);
      setEdit(undefined);
      setReview(undefined);
      setProfileOpen(false);
      ws.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const documents =
    d?.documents.filter((v) =>
      tab === "support"
        ? ["support", "commission"].includes(v.kind)
        : ["poa", "pdc"].includes(v.kind),
    ) || [];
  function create(kind: PedagogicalDocument["kind"]) {
    if (!d?.year) return;
    setError("");
    setEdit({
      year_id: d.year.id,
      kind,
      title: "",
      classroom_id:
        kind === "pdc" || kind === "support" ? d.rooms[0]?.id : null,
      starts_on: d.year.starts_on,
      ends_on: d.year.ends_on,
      objective: "",
      activities: "",
      evidence: "",
      adaptations: "",
      participants: "",
      status: "draft",
    });
  }
  return (
    <section className="bolivia-school">
      <SectionTitle
        title="Gestión educativa Bolivia"
        subtitle="Primaria y secundaria · planificación, seguimiento y registros de esta sede."
      />
      {(error || ws.error) && (
        <p role="alert" className="message error">
          {error || ws.error}
        </p>
      )}
      {ws.loading && !d && <p role="status">Cargando gestión educativa…</p>}
      {d && (
        <>
          <div className="planning-filters">
            <Field label="Gestión" name="boliviaYear">
              <select
                value={year || d.year?.id || ""}
                onChange={(e) => {
                  setYear(e.target.value);
                  setError("");
                }}
              >
                {d.years.map((y) => (
                  <option value={y.id} key={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!d.rooms.length ? (
            <Empty
              title="Configura los niveles del colegio"
              subtitle="Indica Primaria o Secundaria en la sede y en el nivel del aula, o asigna el grado oficial desde Evaluación. Kínder y guardería conservan su funcionamiento."
            />
          ) : (
            <>
              <div
                className="bolivia-tabs"
                role="tablist"
                aria-label="Gestión educativa"
              >
                {[
                  ["profile", "Perfil y calendario"],
                  ["plans", "POA y planificación"],
                  ["support", "Apoyo pedagógico"],
                  ...(d.canManage ? [["records", "Centralizadores"]] : []),
                ].map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "profile" && (
                <article className="bolivia-panel">
                  <div className="planning-actions">
                    <h3>Perfil de la gestión</h3>
                    <Badge
                      status={d.profile?.reviewed ? "approved" : "pending"}
                      label={
                        d.profile?.reviewed
                          ? "Revisado por Dirección"
                          : "Pendiente de revisión"
                      }
                    />
                    {d.canManage && (
                      <Button
                        disabled={d.year?.status !== "open"}
                        onClick={() => {
                          setError("");
                          setProfileOpen(true);
                        }}
                      >
                        Configurar perfil y días de clase
                      </Button>
                    )}
                  </div>
                  <p>
                    Aplicable a {d.rooms.map((r) => r.name).join(", ")}. Inicial
                    y guardería quedan fuera de estos ajustes.
                  </p>
                  <dl className="bolivia-facts">
                    <div>
                      <dt>Código de unidad educativa</dt>
                      <dd>{d.profile?.unit_code || "Por completar"}</dd>
                    </div>
                    <div>
                      <dt>Distrito / departamento</dt>
                      <dd>
                        {[d.profile?.district, d.profile?.department]
                          .filter(Boolean)
                          .join(" · ") || "Por completar"}
                      </dd>
                    </div>
                    <div>
                      <dt>Días efectivos seleccionados</dt>
                      <dd>{d.profile?.school_days.length || 0} / 200</dd>
                    </div>
                    <div>
                      <dt>Respaldo de funcionamiento</dt>
                      <dd>
                        {d.profile?.authorization_reference || "Por completar"}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {d.profile?.reference ||
                      "Pendiente de registrar la normativa de esta gestión."}
                  </p>
                  <a
                    href={d.profile?.reference_url || ministerialUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Consultar referencia oficial
                  </a>
                  <p className="message info">
                    Los cobros y deudas se conservan. La mora familiar no
                    bloquea el contenido académico de primaria/secundaria. Los
                    nuevos planes usan hasta diez pensiones, sin matrícula ni
                    licencia adicional para las familias; el crédito MiCole de
                    la institución se administra aparte.
                  </p>
                  {!!d.profile?.calendar_note && (
                    <p>{d.profile.calendar_note}</p>
                  )}
                </article>
              )}
              {(tab === "plans" || tab === "support") && (
                <>
                  <div className="planning-actions">
                    {tab === "plans" ? (
                      <>
                        {d.canManage && (
                          <Button
                            onClick={() => create("poa")}
                            disabled={d.year?.status !== "open"}
                          >
                            Crear POA
                          </Button>
                        )}
                        <Button
                          onClick={() => create("pdc")}
                          disabled={d.year?.status !== "open"}
                        >
                          Crear planificación curricular
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => create("support")}
                          disabled={d.year?.status !== "open"}
                        >
                          Nuevo plan de apoyo
                        </Button>
                        {d.canManage && (
                          <Button
                            variant="secondary"
                            onClick={() => create("commission")}
                            disabled={d.year?.status !== "open"}
                          >
                            Registrar acta de Comisión
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  <p>
                    {tab === "plans"
                      ? "Guarda el borrador, envíalo a revisión y Dirección lo aprueba. Una aprobación conserva su contenido; las modificaciones se preparan como nueva versión."
                      : "Registra la dificultad, las acciones, las adaptaciones y la evidencia del seguimiento. Este registro no concede puntos ni modifica notas automáticamente."}
                  </p>
                  {!documents.length && (
                    <Empty
                      title="Aún no hay documentos"
                      subtitle="Cada registro corresponde únicamente a esta sede y gestión."
                    />
                  )}
                  {documents.map((doc) => (
                    <article className="bolivia-panel" key={doc.id}>
                      <div className="planning-actions">
                        <h3>{doc.title}</h3>
                        <Badge
                          status={doc.status}
                          label={documentStatuses[doc.status]}
                        />
                      </div>
                      <p>
                        {documentKinds[doc.kind]} ·{" "}
                        {d.rooms.find((r) => r.id === doc.classroom_id)?.name ||
                          "Institucional"}{" "}
                        · {doc.starts_on} — {doc.ends_on}
                      </p>
                      <p>{doc.objective}</p>
                      <details>
                        <summary>Actividades, evidencias y revisión</summary>
                        <p className="preserve-lines">{doc.activities}</p>
                        {doc.adaptations && (
                          <p>Adaptaciones: {doc.adaptations}</p>
                        )}
                        {doc.evidence && (
                          <p>Evidencias y seguimiento: {doc.evidence}</p>
                        )}
                        {doc.participants && (
                          <p>Participantes: {doc.participants}</p>
                        )}
                        {doc.review_note && <p>Revisión: {doc.review_note}</p>}
                      </details>
                      <div className="planning-actions">
                        {["draft", "returned"].includes(doc.status) && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setError("");
                              setEdit(doc);
                            }}
                          >
                            Editar y enviar
                          </Button>
                        )}
                        {doc.status === "approved" && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setError("");
                              setEdit({
                                ...doc,
                                id: undefined,
                                revision: undefined,
                                status: "draft",
                                title: `${doc.title.slice(0, 140)} · nueva versión`,
                              });
                            }}
                          >
                            Preparar nueva versión
                          </Button>
                        )}
                        {d.canManage && doc.status === "submitted" && (
                          <Button
                            onClick={() => {
                              setError("");
                              setReview(doc);
                            }}
                          >
                            Revisar documento
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                </>
              )}
              {tab === "records" && d.canManage && (
                <article className="bolivia-panel">
                  <h3>Centralizador de notas publicadas</h3>
                  <p>
                    Informe interno MiCole. No sustituye la Libreta Escolar
                    Electrónica del SIE. Incluye las publicaciones vigentes de
                    primaria/secundaria; no convierte datos faltantes en cero.
                  </p>
                  <Button
                    disabled={!d.cards.length}
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob([centralizerCsv(d.cards)], {
                          type: "text/csv;charset=utf-8",
                        }),
                      );
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `centralizador-interno-${d.year?.year}.csv`;
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Descargar centralizador CSV
                  </Button>
                  <p>
                    {d.cards.length} publicaciones disponibles. La integración y
                    el formato de envío al SIE quedan pendientes de
                    documentación oficial.
                  </p>
                </article>
              )}
            </>
          )}
          {profileOpen && d.year && (
            <ProfileForm
              key={d.year.id}
              data={d}
              busy={busy}
              error={error}
              close={() => setProfileOpen(false)}
              save={(v) => void act("save_bolivia_profile", { p_profile: v })}
            />
          )}
          {edit && (
            <DocumentForm
              key={edit.id || `${edit.kind}-${edit.title}`}
              initial={edit}
              data={d}
              p={p}
              busy={busy}
              error={error}
              close={() => setEdit(undefined)}
              save={(v) => void act("save_bolivia_document", { p_document: v })}
            />
          )}
          {review && (
            <Modal
              title="Revisar documento pedagógico"
              subtitle={review.title}
              onClose={() => setReview(undefined)}
              busy={busy}
              error={error}
              submitLabel="Confirmar revisión"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("review_bolivia_document", {
                  p_id: review.id,
                  p_revision: review.revision,
                  p_approve: f.get("decision") === "approve",
                  p_note: f.get("note"),
                });
              }}
            >
              <Field name="decision" label="Decisión">
                <select name="decision" required>
                  <option value="">Seleccionar</option>
                  <option value="approve">Aprobar</option>
                  <option value="return">Devolver con observaciones</option>
                </select>
              </Field>
              <Field name="note" label="Fundamento u observaciones">
                <textarea name="note" required minLength={5} maxLength={2000} />
              </Field>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
function ProfileForm({
  data: d,
  busy,
  error,
  close,
  save,
}: {
  data: BoliviaWorkspace;
  busy: boolean;
  error: string;
  close: () => void;
  save: (v: BoliviaProfile) => void;
}) {
  const y = d.year!,
    [days, setDays] = useState<string[]>(d.profile?.school_days || []),
    [start, setStart] = useState(y.starts_on),
    [end, setEnd] = useState(y.ends_on),
    [excluded, setExcluded] = useState(""),
    [showDays, setShowDays] = useState(false);
  return (
    <Modal
      title="Perfil y calendario de primaria/secundaria"
      subtitle="Dirección debe revisar la normativa y el calendario autorizado para cada gestión."
      onClose={close}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          year_id: y.id,
          revision: d.profile?.revision,
          unit_code: String(f.get("unit_code")),
          district: String(f.get("district")),
          department: String(f.get("department")),
          authorization_reference: String(f.get("authorization_reference")),
          reference: String(f.get("reference")),
          reference_url: String(f.get("reference_url")),
          calendar_note: String(f.get("calendar_note")),
          school_days: days,
          reviewed: f.get("reviewed") === "on",
        });
      }}
    >
      <div className="form-grid">
        {[
          ["unit_code", "Código de unidad educativa"],
          ["district", "Distrito educativo"],
          ["department", "Departamento"],
          [
            "authorization_reference",
            "Resolución / autorización de funcionamiento",
          ],
        ].map(([name, label]) => (
          <Field
            key={name}
            label={label}
            name={name}
            defaultValue={String(
              d.profile?.[name as keyof BoliviaProfile] || "",
            )}
            maxLength={160}
          />
        ))}
      </div>
      <Field
        name="reference"
        label="Normativa aplicable a esta gestión"
        defaultValue={
          d.profile?.reference || (y.year === 2026 ? ministerialReference : "")
        }
        maxLength={500}
        required
      />
      <Field
        name="reference_url"
        label="Enlace oficial de referencia"
        type="url"
        defaultValue={d.profile?.reference_url || ministerialUrl}
        required
      />
      <div className="form-grid">
        <Field
          label="Primer día de clases"
          name="calendarStart"
          type="date"
          min={y.starts_on}
          max={y.ends_on}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <Field
          label="Último día de clases"
          name="calendarEnd"
          type="date"
          min={y.starts_on}
          max={y.ends_on}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <Field
        label="Feriados, descanso y suspensiones (AAAA-MM-DD, una fecha por línea)"
        name="excluded"
      >
        <textarea
          value={excluded}
          onChange={(e) => setExcluded(e.target.value)}
        />
      </Field>
      <Button
        variant="secondary"
        onClick={() => {
          setDays(
            weekdays(start, end, excluded.split(/[\s,;]+/).filter(Boolean)),
          );
          setShowDays(true);
        }}
      >
        Preparar días de lunes a viernes
      </Button>
      <p>
        <strong>{days.length} / 200 días efectivos</strong>. Revisa las fechas;
        preparar una lista no publica eventos ni reemplaza el calendario
        aprobado.
      </p>
      <Button variant="ghost" onClick={() => setShowDays((v) => !v)}>
        {showDays ? "Ocultar fechas" : "Revisar y ajustar fechas"}
      </Button>
      {showDays && (
        <div className="bolivia-dates">
          {dateRange(start, end).map((date) => (
            <label key={date}>
              <input
                type="checkbox"
                checked={days.includes(date)}
                onChange={(e) =>
                  setDays((v) =>
                    e.target.checked
                      ? [...new Set([...v, date])].sort()
                      : v.filter((x) => x !== date),
                  )
                }
              />
              {date}
            </label>
          ))}
        </div>
      )}
      <Field
        label="Respaldo del calendario regional y observaciones"
        name="calendar_note"
      >
        <textarea
          name="calendar_note"
          defaultValue={d.profile?.calendar_note || ""}
          maxLength={6000}
        />
      </Field>
      <label className="check-field">
        <input
          type="checkbox"
          name="reviewed"
          defaultChecked={d.profile?.reviewed}
        />{" "}
        He comparado los datos y los 200 días con el calendario autorizado de
        esta gestión.
      </label>
    </Modal>
  );
}
function DocumentForm({
  initial,
  data: d,
  p,
  busy,
  error,
  close,
  save,
}: {
  initial: PedagogicalDocument;
  data: BoliviaWorkspace;
  p: PageProps;
  busy: boolean;
  error: string;
  close: () => void;
  save: (v: PedagogicalDocument) => void;
}) {
  const [room, setRoom] = useState(initial.classroom_id || ""),
    [student, setStudent] = useState(initial.student_id || ""),
    [subject, setSubject] = useState(initial.class_subject_id || "");
  const existing = !!initial.id,
    needsRoom = ["pdc", "support"].includes(initial.kind),
    subjects = p.store.data.classSubjects.filter(
      (s) => s.classroomId === room && s.active,
    );
  return (
    <Modal
      title={documentKinds[initial.kind]}
      subtitle="El borrador queda privado. Envíalo a revisión para que Dirección pueda aprobarlo."
      onClose={close}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          ...initial,
          title: String(f.get("title")),
          classroom_id: room || null,
          student_id: student || null,
          class_subject_id: subject || null,
          starts_on: String(f.get("starts_on")),
          ends_on: String(f.get("ends_on")),
          objective: String(f.get("objective")),
          activities: String(f.get("activities")),
          evidence: String(f.get("evidence")),
          adaptations: String(f.get("adaptations")),
          participants: String(f.get("participants")),
          status: f.get("submitReview") === "on" ? "submitted" : "draft",
        });
      }}
    >
      <Field
        label="Título"
        name="title"
        defaultValue={initial.title}
        required
        minLength={3}
        maxLength={160}
      />
      {initial.kind !== "poa" && (
        <Field label="Aula" name="classroom">
          <select
            required={needsRoom}
            disabled={existing}
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setStudent("");
              setSubject("");
            }}
          >
            <option value="">Institucional</option>
            {d.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {room && (
        <Field label="Área / materia" name="subject">
          <select
            disabled={existing}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">Seguimiento general del aula</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {p.store.data.subjects.find((ss) => ss.id === s.subjectId)
                  ?.name || "Materia"}
              </option>
            ))}
          </select>
        </Field>
      )}
      {initial.kind === "support" && (
        <Field label="Estudiante" name="student">
          <select
            required
            disabled={existing}
            value={student}
            onChange={(e) => setStudent(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {p.students
              .filter((s) => s.classroomId === room)
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field
          label="Desde"
          name="starts_on"
          type="date"
          defaultValue={initial.starts_on}
          required
          min={d.year?.starts_on}
          max={d.year?.ends_on}
        />
        <Field
          label="Hasta"
          name="ends_on"
          type="date"
          defaultValue={initial.ends_on}
          required
          min={d.year?.starts_on}
          max={d.year?.ends_on}
        />
      </div>
      {(
        [
          [
            "objective",
            initial.kind === "support"
              ? "Dificultad identificada y objetivo"
              : "Objetivo y resultados esperados",
            10,
            6000,
          ],
          ["activities", "Acciones, responsables y cronograma", 10, 12000],
          [
            "adaptations",
            "Adaptaciones curriculares y medidas de apoyo",
            0,
            6000,
          ],
          ["evidence", "Evidencias, resultados y próximos pasos", 0, 12000],
          [
            "participants",
            "Participantes y cargos de la Comisión",
            initial.kind === "commission" ? 10 : 0,
            3000,
          ],
        ] as const
      ).map(([name, label, min, max]) => (
        <Field key={name} label={label} name={name}>
          <textarea
            name={name}
            defaultValue={initial[name]}
            required={min > 0}
            minLength={min || undefined}
            maxLength={max}
          />
        </Field>
      ))}
      <label className="check-field">
        <input name="submitReview" type="checkbox" /> Enviar a revisión de
        Dirección al guardar
      </label>
    </Modal>
  );
}
