import { officialFields } from "../lib/institutionOfficial";
import { ArrowRight, FileText, CalendarDays, Users } from "lucide-react";
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
  documentKinds,
  documentStatuses,
  type BoliviaWorkspace,
  type PedagogicalDocument,
} from "../lib/bolivia";
import "../styles/bolivia.css";

export function BoliviaSchool(p: PageProps & {initialTab?: string}) {
  const [year, setYear] = useState(""),
    [tab, setTab] = useState(p.initialTab || "summary"),
    [edit, setEdit] = useState<PedagogicalDocument>(),
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
      ws.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [recordRoom,setRecordRoom] = useState(""), [recordTerm,setRecordTerm] = useState(""), [recordPage,setRecordPage] = useState(0);
  const cards = d?.cards.filter(card => (!recordRoom || card.classroom_id === recordRoom) && (!recordTerm || card.term_id === recordTerm)) || [];
  const orderedCards = [...cards].sort((a,b)=>a.content.studentName.localeCompare(b.content.studentName,"es"));
  const pageCount = Math.max(1,Math.ceil(orderedCards.length/50));
  const currentPage = Math.min(recordPage,pageCount-1);
  const shownCards = orderedCards.slice(currentPage*50,(currentPage+1)*50);
  const subjects = [...new Set(cards.flatMap(card => card.content.subjects.map(subject => subject.subject)))];
  const terms = [...new Map((d?.cards || []).map(card => [card.term_id,card.content.termName])).entries()];
  const structure = useAcademicPlanning<{settings:{pass_mark:number}}>("academic_structure",{p_school:p.school?.id},d?.canManage ? p.school?.id : undefined);
  const passMark = structure.data?.settings?.pass_mark ?? null;
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
        title={p.initialTab === "records" ? "Centralizadores de notas" : "Planificación y apoyo"}
        subtitle={p.initialTab === "records" ? "Consulta y descarga las notas publicadas por curso y período." : "Planificación, apoyo pedagógico y documentos de la gestión."}
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
                  setRecordRoom("");setRecordTerm("");setRecordPage(0);
                  setError("");
                }}
              >
                {d.years.map((y) => (
                  <option value={y.id} key={y.id}>
                    Gestión {y.year}
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
              {p.initialTab !== "records" && <div
                className="bolivia-tabs"
                role="tablist"
                aria-label="Gestión educativa"
              >
                {[
                  ["summary", "Resumen académico"],
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
              </div>}
              {tab === "summary" && <>
                <div className="academic-overview-grid">
                  {[
                    {title:'POA y planificación',detail:`${d.documents.filter(doc => ['poa','pdc'].includes(doc.kind)).length} documentos de esta gestión`,tab:'plans',icon:FileText},
                    {title:'Apoyo pedagógico',detail:`${d.documents.filter(doc => ['support','commission'].includes(doc.kind)).length} planes y actas de seguimiento`,tab:'support',icon:Users},
                    ...(d.canManage ? [{title:'Centralizadores',detail:`${d.cards.length} libretas publicadas para consultar`,tab:'records',icon:FileText}] : []),
                  ].map(item => <button className="bolivia-panel academic-overview-card" key={item.tab} onClick={()=>setTab(item.tab)}><item.icon size={23}/><strong>{item.title}</strong><span>{item.detail}</span><ArrowRight size={18}/></button>)}
                </div>
                <article className="bolivia-panel"><div className="planning-actions"><h3>Calendario de toda la institución</h3><Button variant="secondary" icon={CalendarDays} onClick={()=>p.go('schoolCalendar')}>Ver calendario escolar</Button></div><p>Feriados, descansos y suspensiones se gestionan una sola vez y se aplican a todos los cursos, incluido Inicial cuando la institución lo ofrece.</p></article>
                <article className="bolivia-panel"><div className="planning-actions"><h3>Información institucional</h3>{d.canManage && <Button variant="secondary" onClick={()=>p.open('branding',p.school)}>Editar información institucional</Button>}</div>
                  <p>Estos datos se toman de la configuración de la institución. El respaldo puede completarse posteriormente.</p>
                  <dl className="bolivia-facts">{officialFields.filter(([key])=>key !== 'educationReferenceUrl').map(([key,label])=><div key={key}><dt>{label}</dt><dd>{p.school?.officialInfo?.[key] || 'Por completar'}</dd></div>)}</dl>
                  {p.school?.officialInfo?.educationReferenceUrl && <a href={p.school.officialInfo.educationReferenceUrl} target="_blank" rel="noreferrer">Consultar normativa registrada</a>}
                </article>
              </>}
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
                  <Button
                    disabled={!cards.length}
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob([centralizerCsv(cards)], {
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
                  <div className="planning-filters">
                    <Field label="Curso del centralizador" name="centralizerRoom"><select value={recordRoom} onChange={e=>{setRecordRoom(e.target.value);setRecordPage(0);}}><option value="">Todos los cursos</option>{d.rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
                    <Field label="Período del centralizador" name="centralizerTerm"><select value={recordTerm} onChange={e=>{setRecordTerm(e.target.value);setRecordPage(0);}}><option value="">Todos los períodos</option>{terms.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>
                  </div>
                  {cards.length ? <div className="responsive-table centralizer-table"><table><caption>Notas publicadas · Gestión {d.year?.year}</caption><thead><tr><th>Estudiante</th><th>Curso</th><th>Período</th>{subjects.map(name=><th key={name}>{name}</th>)}</tr></thead><tbody>{shownCards.map(card=><tr key={card.id}><th scope="row">{card.content.studentName}</th><td>{card.content.classroomName}</td><td>{card.content.termName}</td>{subjects.map(name=>{const subject=card.content.subjects.find(subject=>subject.subject===name),score=subject?.score,complete=!!subject && subject.missing===0 && score != null;return <td key={name} className={complete && passMark !== null && score < passMark ? 'grade-below-minimum' : ''}>{complete ? score.toFixed(1) : subject ? 'Pendiente' : '—'}</td>;})}</tr>)}</tbody></table></div> : <Empty title="Sin libretas publicadas para esta selección" subtitle="Las notas aparecerán cuando se publiquen las libretas del período."/>}
                  {pageCount > 1 && <div className="planning-actions"><Button variant="secondary" disabled={currentPage===0} onClick={()=>setRecordPage(currentPage-1)}>Anterior</Button><span>Página {currentPage+1} de {pageCount}</span><Button variant="secondary" disabled={currentPage+1>=pageCount} onClick={()=>setRecordPage(currentPage+1)}>Siguiente</Button></div>}
                  {structure.error && <p role="alert" className="message error">No pudimos cargar la nota mínima de aprobación. Actualiza la página antes de interpretar los colores.</p>}
                  <p>Las notas completas inferiores al mínimo de aprobación se destacan en rojo. Los resultados pendientes conservan su estado.</p>
                  <p>{cards.length} publicaciones en esta selección.</p>
                  <details><summary>Sobre este informe</summary><p>Informe interno MiCole. No sustituye la Libreta Escolar Electrónica del SIE. La integración y el formato de envío al SIE quedan pendientes de documentación oficial.</p></details>
                </article>
              )}
            </>
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
