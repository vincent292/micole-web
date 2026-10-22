import {useSchoolWorkspace} from "../lib/useSchoolWorkspace";
import {today} from "../lib/billing";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import type { FormEvent } from "react";
import { Plus, BookOpen } from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  Field,
  FormSection,
  Modal,
  SectionTitle,
  SearchBox,
} from "../components/UI";
import { rpc } from "../lib/repository";
import { publicDemo } from "../lib/demo-config";
import { liveMode } from "../lib/supabase";
import { dateLabel, uid } from "../lib/format";
import {
  assignmentDate,
  learningDay,
  assignmentLabels,
  canManageAssignment,
  canSubmitAssignment,
  subjectName,
  subjectOptions,
  subjectSuggestions,
  submissionLabels,
} from "../lib/learning";
import {
  assignmentFilesEnabled,
  openAssignmentFile,
  uploadAssignmentFile,
} from "../lib/assignment-files";
import type {
  Assignment,
  AssignmentSubmission,
  ClassSubject,
} from "../lib/types";
import { fullName, type PageProps } from "./Pages";
const read = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
export function Subjects({
  store,
  school,
  role,
  identity,
  student,
  go,
}: PageProps) {
  const location = useLocation();
  const data = store.data,
    [roomId, setRoomId] = useState(
      new URLSearchParams(location.search).get("classroom") || "",
    ),
    [edit, setEdit] = useState<ClassSubject | "new" | null>(null),
    [name, setName] = useState(""),
    [query, setQuery] = useState(""),
    [availability, setAvailability] = useState("active"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rooms = data.classrooms.filter(
    (r) =>
      r.schoolId === school?.id &&
      (["guardian", "student"].includes(role)
        ? r.id === student?.classroomId
        : role !== "teacher" ||
          r.teacherIds.some((t) => identity.teacherIds.includes(t))),
  );
  const room = rooms.find((r) => r.id === roomId) || rooms[0],
    director = role === "director";
  const courses = data.classSubjects.filter(
      (cs) => cs.classroomId === room?.id && (director ? (!availability || (availability === "active" ? cs.active : !cs.active)) : cs.active) && subjectName(data,cs.id).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ),
    suggestions = subjectSuggestions(data, name);
  const open = (cs: ClassSubject | "new") => {
    setEdit(cs);
    setName(cs === "new" ? "" : subjectName(data, cs.id));
    setError("");
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !room) return;
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!liveMode && !publicDemo)
        throw new Error("Conecta Supabase para administrar las materias.");
      await rpc("configure_class_subject", {
        p_classroom_id: room.id,
        p_name: name,
        p_teacher_ids: f.getAll("teacherIds"),
        p_active: f.get("active") === "on",
      });
      await store.refresh();
      setEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionTitle
        title="Materias del aula"
        subtitle="Cada curso puede trabajar por materias o mantener actividades generales."
        action={
          director &&
          room && (
            <Button icon={Plus} onClick={() => open("new")}>
              Asignar materia
            </Button>
          )
        }
      />
      <div className="academic-filters">
        <Field label="Aula" name="subjectRoom">
          <select
            value={room?.id || ""}
            onChange={(e) => setRoomId(e.target.value)}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.academicYear || ""}
              </option>
            ))}
          </select>
        </Field>
        <SearchBox value={query} onChange={setQuery} placeholder="Buscar materia del aula"/>
        {director && <Field label="Mostrar materias" name="subjectAvailability"><select value={availability} onChange={e=>setAvailability(e.target.value)}><option value="active">Disponibles</option><option value="archived">Archivadas</option><option value="">Todas</option></select></Field>}
      </div>
      <div className="subject-summary"><span>{courses.length} materia(s) en esta vista</span><span>{courses.filter(cs=>!data.subjectTeachers.some(t=>t.classSubjectId===cs.id)).length} sin docente asignado</span></div>
      {error && !edit && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {room && (
        <div className="soft-note">
          <strong>
            {room.subjectsEnabled
              ? "Este curso trabaja por materias."
              : "Este curso trabaja con actividades generales, sin materias obligatorias."}
          </strong>
          {director && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void rpc("set_class_subjects_enabled", {
                  p_classroom_id: room.id,
                  p_enabled: !room.subjectsEnabled,
                })
                  .then(() => store.refresh())
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {room.subjectsEnabled
                ? "Usar actividades generales"
                : "Trabajar por materias"}
            </Button>
          )}
        </div>
      )}
      <div className="card-grid">
        {courses.map((cs) => (
          <article className="entity-card" key={cs.id}>
            <div className="entity-top">
              <BookOpen size={23} />
              <Badge
                status={cs.active ? "active" : "inactive"}
                label={cs.active ? "Disponible" : "Archivada"}
              />
            </div>
            <h3>{subjectName(data, cs.id)}</h3>
            <p>
              {data.subjectTeachers
                .filter((t) => t.classSubjectId === cs.id)
                .map(
                  (t) => data.teachers.find((x) => x.id === t.teacherId)?.name || "Docente asignado",
                )
                .filter(Boolean)
                .join(", ") || "Sin docente asignado"}
            </p>
            <div className="subject-card-actions">
              <Button variant="secondary" onClick={()=>go(`assignments?classroom=${cs.classroomId}&subject=${cs.id}`)}>Ver tareas</Button>
              {director && <Button variant="ghost" onClick={() => open(cs)}>Docentes y estado</Button>}
            </div>
          </article>
        ))}
      </div>
      {!courses.length && (
        <Empty
          title="Organiza las materias cuando las necesites"
          subtitle={
            director
              ? "Busca una del catálogo o escribe un nombre nuevo. Se creará al guardar."
              : "Dirección puede habilitar materias para este curso."
          }
        />
      )}
      {edit && (
        <Modal
          title={edit === "new" ? "Asignar materia" : "Docentes de la materia"}
          onClose={() => setEdit(null)}
          onSubmit={save}
          busy={busy}
          error={error}
        >
          <Field label="Materia" name="name">
            <input
              name="name"
              value={name}
              readOnly={edit !== "new"}
              required
              minLength={2}
              maxLength={100}
              list="subject-suggestions"
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              placeholder="Buscar o escribir una nueva materia"
            />
            <datalist id="subject-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          {edit === "new" && (
            <p>Si no existe, se crea para esta institución al guardar.</p>
          )}
          <fieldset className="academic-checkboxes">
            <legend>Docentes asignados al aula</legend>
            {!data.teachers.some(t=>room?.teacherIds.includes(t.id)&&t.status!=="inactive") && <p>Primero asigna docentes al aula desde Aulas y cursos. Después podrás vincularlos a esta materia.</p>}
            {data.teachers
              .filter(
                (t) =>
                  room?.teacherIds.includes(t.id) && t.status !== "inactive",
              )
              .map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    name="teacherIds"
                    value={t.id}
                    defaultChecked={
                      edit !== "new" &&
                      data.subjectTeachers.some(
                        (st) =>
                          st.classSubjectId === edit.id &&
                          st.teacherId === t.id,
                      )
                    }
                  />
                  {t.name}
                </label>
              ))}
          </fieldset>
          <label className="check-field">
            <input
              type="checkbox"
              name="active"
              defaultChecked={edit === "new" || edit.active}
            />
            Materia disponible
          </label>
        </Modal>
      )}
    </>
  );
}
type TaskDialog =
  | { kind: "assignment"; task?: Assignment }
  | { kind: "submission"; task: Assignment }
  | { kind: "review"; task: Assignment; submission: AssignmentSubmission };
export function Assignments(props: PageProps) {
  const { store, school, role, identity, student, students } = props,
    data = store.data;
  const location = useLocation();
  const [roomId, setRoomId] = useState(
      new URLSearchParams(location.search).get("classroom") || "",
    ),
    [subjectId, setSubjectId] = useState(new URLSearchParams(location.search).get("subject") || ""),
    [state, setState] = useState(""),
    [expanded, setExpanded] = useState(""),
    [dialog, setDialog] = useState<TaskDialog | null>(null),
    [error, setError] = useState("");
  const rooms = data.classrooms.filter(
    (r) =>
      r.schoolId === school?.id &&
      (role !== "teacher" ||
        r.teacherIds.some((t) => identity.teacherIds.includes(t))) &&
      (!["student", "guardian"].includes(role) ||
        r.id === student?.classroomId),
  );
  const staff = role === "director" || role === "teacher";
  const list = data.assignments
    .filter(
      (a) =>
        a.schoolId === school?.id &&
        rooms.some((r) => r.id === a.classroomId) &&
        (!roomId || a.classroomId === roomId) &&
        (!subjectId || a.classSubjectId === subjectId) &&
        (!state || a.status === state),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = (value: TaskDialog) => {
    setError("");
    setDialog(value);
  };
  const files = (submission: AssignmentSubmission) =>
    data.assignmentFiles
      .filter((f) => f.submissionId === submission.id && f.status === "ready")
      .map((f) => (
        <Button
          key={f.id}
          variant="ghost"
          onClick={() => {
            void openAssignmentFile(f.id).catch((e) => setError(e.message));
          }}
        >
          {f.fileName}
        </Button>
      ));
  return (
    <>
      <SectionTitle
        title="Tareas y entregas"
        subtitle={
          staff
            ? "Publica instrucciones, recibe trabajos y devuelve comentarios."
            : "Consulta tus tareas por curso y materia y revisa los comentarios del docente."
        }
        action={
          staff && (
            <Button icon={Plus} onClick={() => open({ kind: "assignment" })}>
              Nueva tarea
            </Button>
          )
        }
      />
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      <div className="academic-filters">
        <Field label="Aula" name="taskRoom">
          <select
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setSubjectId("");
            }}
          >
            <option value="">Todas mis aulas</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Materia" name="taskSubject">
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Todas las materias</option>
            {data.classSubjects
              .filter(
                (cs) =>
                  rooms.some((r) => r.id === cs.classroomId) &&
                  (!roomId || cs.classroomId === roomId),
              )
              .map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {subjectName(data, cs.id)} ·{" "}
                  {rooms.find((r) => r.id === cs.classroomId)?.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Estado" name="taskState">
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(assignmentLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!list.length && (
        <Empty
          title="Todavía no hay tareas"
          subtitle={
            staff
              ? "Publica una tarea para un aula y, si corresponde, una materia."
              : "Las tareas de tu curso aparecerán aquí."
          }
        />
      )}
      <div className="academic-task-list">
        {list.map((task) => {
          const managed = canManageAssignment(data, identity, role, task),
            own = data.submissions.find(
              (s) => s.assignmentId === task.id && s.studentId === student?.id,
            ),
            roster = students.filter(
              (s) =>
                s.classroomId === task.classroomId && s.status !== "inactive",
            ),
            delivered = data.submissions.filter(
              (s) => s.assignmentId === task.id && s.status !== "draft",
            );
          return (
            <article key={task.id} className="entity-card">
              <div className="entity-top">
                <span className="course-tag">
                  {subjectName(data, task.classSubjectId)} ·{" "}
                  {rooms.find((r) => r.id === task.classroomId)?.name}
                </span>
                <Badge
                  status={task.status}
                  label={assignmentLabels[task.status]}
                />
              </div>
              <h3>{task.title}</h3>
              <p>
                {task.dueAt
                  ? `Entrega hasta ${dateLabel(task.dueAt)} · ${task.allowLate ? "Admite entregas atrasadas" : "Plazo estricto"}`
                  : "Sin fecha límite"}{" "}
                · {task.maxScore} puntos
              </p>
              {!staff && (
                <Badge
                  status={own?.status || "pending"}
                  label={own ? submissionLabels[own.status] : "Sin entregar"}
                />
              )}
              <div className="table-actions">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setExpanded(expanded === task.id ? "" : task.id)
                  }
                >
                  {expanded === task.id
                    ? "Cerrar detalle"
                    : managed
                      ? `Ver tarea y entregas (${delivered.length}/${roster.length})`
                      : "Ver tarea"}
                </Button>
                {managed && (
                  <Button
                    variant="ghost"
                    onClick={() => open({ kind: "assignment", task })}
                  >
                    Editar tarea
                  </Button>
                )}
                {role === "student" && canSubmitAssignment(task, own) && (
                  <Button onClick={() => open({ kind: "submission", task })}>
                    {own?.status === "submitted"
                      ? "Actualizar entrega"
                      : "Entregar tarea"}
                  </Button>
                )}
              </div>
              {expanded === task.id && (
                <div className="academic-task-detail">
                  <p className="preserve-lines">{task.instructions}</p>
                  {managed ? (
                    <>
                      <h4>Entregas del aula</h4>
                      {roster.map((child) => {
                        const sub = delivered.find(
                          (s) => s.studentId === child.id,
                        );
                        return (
                          <div className="academic-submission" key={child.id}>
                            <strong>{fullName(child)}</strong>
                            <Badge
                              status={sub?.status || "pending"}
                              label={
                                sub
                                  ? submissionLabels[sub.status]
                                  : "Sin entregar"
                              }
                            />
                            {sub && (
                              <>
                                <p className="preserve-lines">{sub.body}</p>
                                {files(sub)}
                                {sub.score !== undefined && (
                                  <p>
                                    Nota: {sub.score} / {task.maxScore}
                                  </p>
                                )}
                                {sub.feedback && (
                                  <p className="preserve-lines">
                                    {sub.feedback}
                                  </p>
                                )}
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    open({
                                      kind: "review",
                                      task,
                                      submission: sub,
                                    })
                                  }
                                >
                                  Revisar entrega
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    own && (
                      <div className="academic-submission">
                        <strong>Tu entrega</strong>
                        <p className="preserve-lines">{own.body}</p>
                        {files(own)}
                        {own.score !== undefined && (
                          <p>
                            Nota: {own.score} / {task.maxScore}
                          </p>
                        )}
                        {own.feedback && (
                          <p className="preserve-lines">
                            Comentarios: {own.feedback}
                          </p>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {dialog && (
        <AcademicDialog
          key={`${dialog.kind}-${dialog.task?.id || "new"}`}
          {...props}
          dialog={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
function AcademicDialog({
  dialog,
  onClose,
  store,
  school,
  role,
  identity,
  student,
}: PageProps & { dialog: TaskDialog; onClose: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [roomId, setRoomId] = useState(dialog.task?.classroomId || ""),
    [body, setBody] = useState(
      store.data.submissions.find(
        (s) =>
          s.assignmentId === dialog.task?.id && s.studentId === student?.id,
      )?.body || "",
    );
  const data = store.data,
    rooms = data.classrooms.filter(
      (r) =>
        r.schoolId === school?.id &&
        (role !== "teacher" ||
          r.teacherIds.some((id) => identity.teacherIds.includes(id))),
    ),
    room = rooms.find((r) => r.id === roomId) || rooms[0];
  const life=useSchoolWorkspace(dialog.kind==='assignment'?school?.id:undefined,today());
  const linked=life.data.assessments.find(a=>a.assignmentId===dialog.task?.id);
  const [gradeable,setGradeable]=useState(false);
  const scoreTask=gradeable||!!linked;
  const gradeYear=life.data.years.find(y=>y.year===room?.academicYear);
  const gradeTerms=life.data.terms.filter(t=>t.yearId===gradeYear?.id&&t.status==='open');
  const own = data.submissions.find(
      (s) => s.assignmentId === dialog.task?.id && s.studentId === student?.id,
    ),
    attachments = data.assignmentFiles.filter(
      (f) => f.submissionId === own?.id && f.status === "ready",
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!liveMode && !publicDemo)
        throw new Error("Conecta Supabase para guardar tareas y entregas.");
      if (dialog.kind === "assignment") {
        await rpc("save_assignment", {
          p_assignment: {
            id: dialog.task?.id || uid(),
            classroom_id: room?.id,
            class_subject_id: read(f, "classSubjectId"),
            title: read(f, "title"),
            instructions: read(f, "instructions"),
            due_at: assignmentDate(read(f, "dueDate")),
            allow_late: f.get("allowLate") === "on",
            max_score: Number(read(f, "maxScore")),
            status: read(f, "status"),
            gradeable:scoreTask,term_id:read(f,"gradeTerm"),assessment_date:read(f,"gradeDate"),grade_weight:Number(read(f,"gradeWeight")||1),
          },
        });
      } else if (dialog.kind === "submission") {
        await rpc("save_assignment_submission", {
          p_assignment_id: dialog.task.id,
          p_body: body,
          p_submit: true,
        });
      } else {
        await rpc("review_assignment_submission", {
          p_id: dialog.submission.id,
          p_decision: read(f, "decision"),
          p_feedback: read(f, "feedback"),
          p_score: read(f, "score") ? Number(read(f, "score")) : null,
        });
      }
      await store.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        dialog.kind === "assignment"
          ? dialog.task
            ? "Editar tarea"
            : "Nueva tarea"
          : dialog.kind === "submission"
            ? "Entregar tarea"
            : "Revisar entrega"
      }
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      error={error}
      submitLabel={dialog.kind === "submission" ? "Entregar tarea" : "Guardar"}
    >
      {dialog.kind === "assignment" ? (
        <>
          <FormSection title="Aula e instrucciones">
            <Field label="Aula" name="classroomId">
              <select
                name="classroomId"
                value={room?.id || ""}
                disabled={!!dialog.task}
                onChange={(e) => setRoomId(e.target.value)}
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Materia" name="classSubjectId">
              <select
                key={room?.id}
                name="classSubjectId"
                required={room?.subjectsEnabled}
                defaultValue={dialog.task?.classSubjectId || ""}
                disabled={!!dialog.task}
              >
                <option value="">
                  {room?.subjectsEnabled
                    ? "Selecciona una materia"
                    : "Actividad general"}
                </option>
                {subjectOptions(data, room?.id || "", identity, role).map(
                  (s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ),
                )}
              </select>
            </Field>
            {dialog.task?.classSubjectId && (
              <input
                type="hidden"
                name="classSubjectId"
                value={dialog.task.classSubjectId}
              />
            )}
            <Field
              label="Título"
              name="title"
              defaultValue={dialog.task?.title}
              required
            />
            <Field label="Instrucciones" name="instructions">
              <textarea
                name="instructions"
                required
                rows={5}
                maxLength={20000}
                defaultValue={dialog.task?.instructions}
              />
            </Field>
          </FormSection>
          <FormSection title="Entrega y publicación">
            <label className="check-field"><input type="checkbox" checked={scoreTask} disabled={!!linked} onChange={e=>setGradeable(e.target.checked)}/> Puntuable: crear columna en notas al publicar</label>
            {scoreTask&&<><Field label="Periodo de la nota" name="gradeTerm"><select name="gradeTerm" required defaultValue={linked?.termId||''}><option value="">Selecciona periodo</option>{gradeTerms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><Field label="Fecha de evaluación" name="gradeDate" type="date" required defaultValue={linked?.assessmentDate||today()}/><Field label="Peso de la tarea" name="gradeWeight" type="number" min={0.01} max={1000} step="0.01" required defaultValue={linked?.weight||1}/><p className="auth-hint">Al revisar una entrega, su puntuación se guardará en la planilla. La tarea debe estar publicada y pertenecer a un periodo abierto.</p></>}

            <Field
              label="Fecha límite (opcional)"
              name="dueDate"
              type="date"
              defaultValue={learningDay(dialog.task?.dueAt)}
            />
            <Field
              label="Puntuación máxima"
              name="maxScore"
              type="number"
              required
              min={0.01}
              max={10000}
              step="0.01"
              defaultValue={dialog.task?.maxScore || 100}
            />
            <Field label="Estado" name="status">
              <select
                name="status"
                defaultValue={dialog.task?.status || "published"}
              >
                {(!dialog.task || dialog.task.status === "draft") && (
                  <option value="draft">Borrador</option>
                )}
                <option value="published">Publicar</option>
                <option value="closed">Cerrar entregas</option>
              </select>
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                name="allowLate"
                defaultChecked={dialog.task?.allowLate !== false}
              />
              Permitir entregas atrasadas
            </label>
          </FormSection>
        </>
      ) : dialog.kind === "submission" ? (
        <>
          <p>
            <strong>{dialog.task.title}</strong>
          </p>
          <p className="preserve-lines">{dialog.task.instructions}</p>
          <Field label="Tu respuesta" name="body">
            <textarea
              name="body"
              rows={6}
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          {attachments.map((f) => (
            <p key={f.id}>Adjunto: {f.fileName}</p>
          ))}
          {assignmentFilesEnabled ? (
            <Field
              label="Adjuntar PDF o imagen (hasta 5 MB, máximo 5)"
              name="attachment"
            >
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={busy || attachments.length >= 5}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  void uploadAssignmentFile(dialog.task.id, body, file)
                    .then(() => store.refresh())
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                  e.target.value = "";
                }}
              />
            </Field>
          ) : (
            <div className="soft-note">
              Los archivos aún no están habilitados por tu institución. Puedes
              entregar tu respuesta por escrito.
            </div>
          )}
          <p>
            Tu entrega y los comentarios solo son visibles para ti, tu familia y
            el equipo autorizado.
          </p>
        </>
      ) : (
        <>
          <p className="preserve-lines">{dialog.submission.body}</p>
          <Field label="Resultado de la revisión" name="decision">
            <select name="decision" defaultValue="reviewed">
              <option value="reviewed">Revisada</option>
              <option value="returned">Devolver para corregir</option>
            </select>
          </Field>
          <Field
            label={`Nota (opcional, hasta ${dialog.task.maxScore})`}
            name="score"
            type="number"
            min={0}
            max={dialog.task.maxScore}
            step="0.01"
            defaultValue={dialog.submission.score}
          />
          <Field label="Comentarios" name="feedback">
            <textarea
              name="feedback"
              maxLength={4000}
              rows={4}
              defaultValue={dialog.submission.feedback}
            />
          </Field>
        </>
      )}
    </Modal>
  );
}
