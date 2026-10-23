import { useState } from "react";
import "../styles/tutoring.css";
import {
  Button,
  Empty,
  Field,
  FormSection,
  Modal,
  SectionTitle,
} from "../components/UI";
import type { PageProps } from "./Pages";
import { fullName } from "./Pages";
import { rpc } from "../lib/repository";
import { uid, dateLabel } from "../lib/format";
import { today } from "../lib/billing";
import { subjectOptions } from "../lib/learning";
import { useCoordination, useTutorOverview } from "../lib/useTutoring";
import {
  interviewClock,
  interviewDay,
  interviewDates,
  interviewStatuses,
  interviewTime,
  interviewTimes,
  isClassroomTutor,
  responseLabels,
  type Interview,
} from "../lib/tutoring";
import { totalLabel } from "../lib/gradeSheet";
export function Interviews(
  p: PageProps & { roomId?: string; childId?: string },
) {
  const [roomFilter, setRoomFilter] = useState(p.roomId || ""),
    [childFilter, setChildFilter] = useState(p.childId || ""),
    [query, setQuery] = useState(""),
    [form, setForm] = useState<"interview" | "message" | null>(null),
    [reply, setReply] = useState<Interview | null>(null),
    [editing, setEditing] = useState<Interview | undefined>(),
    [response, setResponse] = useState("confirmed"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const family = p.role === "guardian",
    roomId = p.roomId || roomFilter,
    childId = family ? p.student?.id : p.childId || childFilter;
  const ws = useCoordination(
    p.school?.id,
    roomId,
    childId,
    p.role !== "student" && p.role !== "superadmin",
  );
  const rooms = p.store.data.classrooms.filter(
    (r) =>
      r.schoolId === p.school?.id &&
      (p.role === "director" ||
        r.teacherIds.some((t) => p.identity.teacherIds.includes(t))),
  );
  const students = p.students.filter(
    (s) => !roomId || s.classroomId === roomId,
  );
  const matches = (s: string) =>
    s.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const items = (ws.data?.interviews || []).filter((i) =>
    matches(`${i.title} ${i.studentName} ${i.subjectName} ${i.teacherName}`),
  );
  async function close(i: Interview, status: string) {
    setBusy(true);
    setError("");
    try {
      await rpc("close_classroom_interview", {
        p_id: i.id,
        p_revision: i.revision,
        p_status: status,
      });
      ws.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Entrevistas y coordinación">
      <SectionTitle
        title="Entrevistas con las familias"
        subtitle="Citas privadas con la familia y el docente correspondiente. Cada participante confirma con su propia cuenta."
        action={
          !family && (
            <Button
              onClick={() => {
                setEditing(undefined);
                setForm("interview");
              }}
            >
              Convocar entrevista
            </Button>
          )
        }
      />
      <div className="academic-filters">
        {!family && !p.roomId && (
          <Field label="Aula" name="interviewRoom">
            <select
              value={roomFilter}
              onChange={(e) => {
                setRoomFilter(e.target.value);
                setChildFilter("");
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
        )}
        {!family && !p.childId && (
          <Field label="Estudiante" name="interviewChild">
            <select
              value={childFilter}
              onChange={(e) => setChildFilter(e.target.value)}
            >
              <option value="">Todos los alumnos</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Buscar entrevistas" name="interviewSearch">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Alumno, materia o docente"
          />
        </Field>
      </div>
      {(error || ws.error) && (
        <p className="message error" role="alert">
          {error || ws.error}
          <Button variant="ghost" onClick={ws.refresh}>
            Reintentar
          </Button>
        </p>
      )}
      {ws.loading ? (
        <p role="status">Cargando entrevistas…</p>
      ) : !items.length ? (
        <Empty
          title="Sin entrevistas en esta vista"
          subtitle={
            family
              ? "Las convocatorias de tus hijos aparecerán aquí y en tu calendario."
              : "Convoca una entrevista cuando necesites coordinar el seguimiento de un alumno."
          }
        />
      ) : (
        <div className="card-grid">
          {items.map((i) => (
            <article className="entity-card" key={i.id}>
              <div className="entity-top">
                <strong>{interviewStatuses[i.status]}</strong>
                <small>Convocatoria {i.revision}</small>
              </div>
              <h3>{i.title}</h3>
              <p>
                <b>{i.studentName}</b> · {i.classroomName}
              </p>
              <p>
                {i.subjectName} · {i.teacherName}
              </p>
              <p>
                <b>{interviewTime(i.starts_at)}</b>
                <br />
                {i.location}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{i.reason}</p>
              {i.participants?.length ? (
                <p className="soft-note">
                  {i.participants
                    .map(
                      (person) =>
                        `${person.name}: ${responseLabels[i.responses.find((r) => r.userId === person.userId)?.response || ""] || "Pendiente"}`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
              <details>
                <summary>
                  Confirmaciones (
                  {i.responses.filter((r) => r.response === "confirmed").length}
                  )
                </summary>
                {i.responses.length ? (
                  i.responses.map((r) => (
                    <p key={r.userId}>
                      <b>{r.name}</b>: {responseLabels[r.response]}
                      {r.note && ` · ${r.note}`}
                    </p>
                  ))
                ) : (
                  <p className="muted">
                    Todavía no hay respuestas. La lectura del aviso no confirma
                    asistencia.
                  </p>
                )}
              </details>
              {i.status === "scheduled" && (
                <div className="request-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setReply(i);
                      setResponse("confirmed");
                      setError("");
                    }}
                  >
                    Responder convocatoria
                  </Button>
                  {i.canManage && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditing(i);
                          setForm("interview");
                        }}
                      >
                        Reprogramar
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void close(i, "cancelled")}
                      >
                        Cancelar entrevista
                      </Button>
                      {new Date(i.starts_at).getTime() <= Date.now() && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void close(i, "completed")}
                        >
                          Marcar realizada
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!family && (
        <>
          <SectionTitle
            title="Coordinación privada entre docentes"
            subtitle="Los mensajes de esta sección no se comparten con las familias."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(undefined);
                  setForm("message");
                }}
              >
                Mensaje al docente
              </Button>
            }
          />
          {!ws.data?.messages.length ? (
            <p className="muted">Sin mensajes para tu cuenta en esta vista.</p>
          ) : (
            ws.data.messages.map((m) => (
              <article key={m.id} className="panel">
                <small>
                  {interviewTime(m.created_at)} · {m.studentName} ·{" "}
                  {m.subjectName}
                </small>
                <h3>
                  {m.senderName} → {m.recipientName}
                </h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p>
              </article>
            ))
          )}
        </>
      )}
      {form && (
        <CoordinationDialog
          p={p}
          kind={form}
          initialRoom={roomId}
          initialStudent={childId}
          existing={editing}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            ws.refresh();
          }}
        />
      )}
      {reply && (
        <Modal
          title="Responder a la entrevista"
          submitLabel={busy ? "Guardando…" : "Enviar respuesta"}
          onClose={() => setReply(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            void rpc("respond_classroom_interview", {
              p_id: reply.id,
              p_revision: reply.revision,
              p_response: response,
              p_note: String(f.get("note") || ""),
            })
              .then(() => {
                setReply(null);
                ws.refresh();
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <p>
            <b>{reply.studentName}</b> · {interviewTime(reply.starts_at)}
          </p>
          <Field label="Tu respuesta" name="response">
            <select
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            >
              {Object.entries(responseLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observación" name="note">
            <textarea
              name="note"
              required={response !== "confirmed"}
              minLength={response !== "confirmed" ? 5 : 0}
              maxLength={1000}
            />
          </Field>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </section>
  );
}
export function CoordinationDialog({
  p,
  kind,
  initialRoom,
  initialStudent,
  initialSubject,
  existing,
  onClose,
  onSaved,
}: {
  existing?: Interview;
  p: PageProps;
  kind: "interview" | "message";
  initialRoom?: string;
  initialStudent?: string;
  initialSubject?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id] = useState(() => existing?.id || uid()),
    [roomId, setRoom] = useState(existing?.classroom_id || initialRoom || ""),
    [subjectId, setSubject] = useState(
      existing?.class_subject_id || initialSubject || "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const data = p.store.data,
    rooms = data.classrooms.filter(
      (r) =>
        r.schoolId === p.school?.id &&
        (p.role === "director" ||
          r.teacherIds.some((t) => p.identity.teacherIds.includes(t))),
    ),
    room = rooms.find((r) => r.id === roomId) || rooms[0];
  const tutor = room && isClassroomTutor(data, p.identity, p.role, room.id),
    subjects = room
      ? subjectOptions(data, room.id, p.identity, p.role, true)
      : [];
  const subject =
    subjects.find((s) => s.value === subjectId)?.value ||
    (room?.subjectsEnabled && !tutor && p.role !== "director"
      ? subjects[0]?.value || ""
      : "");
  const teachers = data.teachers.filter(
    (t) =>
      t.schoolId === p.school?.id &&
      t.status === "active" &&
      room?.teacherIds.includes(t.id) &&
      (!subject ||
        data.subjectTeachers.some(
          (st) => st.teacherId === t.id && st.classSubjectId === subject,
        ) ||
        (kind === "message" && t.id === room.tutorTeacherId)),
  );
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !room) return;
    const f = new FormData(e.currentTarget),
      get = (key: string) => String(f.get(key) || "").trim();
    setBusy(true);
    setError("");
    try {
      const scope = {
        id,
        classroom_id: room.id,
        student_id: existing?.student_id || get("student"),
        class_subject_id: subject || null,
      };
      if (kind === "interview")
        await rpc("save_classroom_interview", {
          p_interview: {
            ...scope,
            revision: existing?.revision,
            teacher_id: get("teacher"),
            title: get("title"),
            reason: get("reason"),
            location: get("location"),
            ...interviewDates(
              get("date"),
              get("time"),
              Number(get("duration")),
            ),
          },
        });
      else
        await rpc("send_classroom_staff_message", {
          p_message: {
            ...scope,
            recipient_teacher_id: get("teacher"),
            body: get("body"),
          },
        });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        kind === "interview"
          ? "Convocar entrevista familiar"
          : "Mensaje privado al docente"
      }
      subtitle="Los datos se guardan al completar todos los pasos."
      submitLabel={
        busy
          ? "Guardando…"
          : kind === "interview"
            ? "Enviar convocatoria"
            : "Enviar mensaje"
      }
      onClose={onClose}
      onSubmit={save}
    >
      <FormSection title="Personas">
        <Field label="Aula" name="room" required>
          <select
            required
            disabled={!!existing}
            value={room?.id || ""}
            onChange={(e) => {
              setRoom(e.target.value);
              setSubject("");
            }}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estudiante" name="student" required>
          <select
            key={room?.id}
            required
            name="student"
            disabled={!!existing}
            defaultValue={existing?.student_id || initialStudent || ""}
          >
            <option value="">Seleccionar alumno</option>
            {p.students
              .filter(
                (s) => s.classroomId === room?.id && s.status !== "inactive",
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Materia" name="subject">
          <select
            disabled={!!existing}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            {(!room?.subjectsEnabled || tutor || p.role === "director") && (
              <option value="">Seguimiento general</option>
            )}
            {subjects.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            kind === "interview"
              ? "Docente participante"
              : "Docente destinatario"
          }
          name="teacher"
          required
        >
          <select
            key={`${room?.id}:${subject}`}
            name="teacher"
            required
            defaultValue={existing?.teacher_id || ""}
          >
            <option value="">Seleccionar docente</option>
            {teachers.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
                {!t.userId ? " · Cuenta por vincular" : ""}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted">
          La convocatoria avisa a madre y padre con acceso vinculado y al
          docente elegido. No se publica para todo el curso.
        </p>
      </FormSection>
      {kind === "interview" ? (
        <>
          <FormSection title="Fecha y lugar">
            <Field label="Fecha" name="date" required>
              <input
                type="date"
                name="date"
                required
                min={today()}
                defaultValue={existing ? interviewDay(existing.starts_at) : ""}
              />
            </Field>
            <div className="form-grid">
              <Field label="Hora" name="time" required>
                <select
                  name="time"
                  defaultValue={
                    existing ? interviewClock(existing.starts_at) : "08:00"
                  }
                >
                  {interviewTimes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duración" name="duration">
                <select
                  name="duration"
                  defaultValue={
                    existing
                      ? String(
                          Math.round(
                            (Date.parse(existing.ends_at) -
                              Date.parse(existing.starts_at)) /
                              60000,
                          ),
                        )
                      : "30"
                  }
                >
                  {[15, 30, 45, 60, 90, 120].map((n) => (
                    <option value={n} key={n}>
                      {n} minutos
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Lugar o enlace de reunión" name="location" required>
              <input
                name="location"
                required
                maxLength={500}
                defaultValue={existing?.location}
              />
            </Field>
          </FormSection>
          <FormSection title="Motivo">
            <Field label="Título de la entrevista" name="title" required>
              <input
                name="title"
                required
                minLength={3}
                maxLength={180}
                defaultValue={existing?.title}
              />
            </Field>
            <Field label="Motivo y temas para conversar" name="reason" required>
              <textarea
                name="reason"
                required
                minLength={5}
                maxLength={4000}
                defaultValue={existing?.reason}
              />
            </Field>
            <p className="soft-note">
              Las familias verán este motivo. Las notas y calificaciones se
              mantienen bajo los permisos académicos existentes.
            </p>
          </FormSection>
        </>
      ) : (
        <FormSection title="Mensaje">
          <Field label="Mensaje para el docente" name="body" required>
            <textarea name="body" required maxLength={4000} />
          </Field>
          <p className="soft-note">
            Solo lo ven emisor, destinatario y Dirección.
          </p>
        </FormSection>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
export function Tutoring(p: PageProps & { roomId: string; childId?: string }) {
  const [selected, setSelected] = useState(p.childId || ""),
    [form, setForm] = useState<{
      kind: "interview" | "message";
      subject?: string;
    } | null>(null);
  const ws = useTutorOverview(p.school?.id, p.roomId, selected),
    data = ws.data;
  if (ws.error)
    return (
      <p className="message error" role="alert">
        {ws.error}
        <Button onClick={ws.refresh}>Reintentar</Button>
      </p>
    );
  if (!data) return <p role="status">Cargando seguimiento del aula…</p>;
  const child = data.students.find((s) => s.id === data.studentId);
  return (
    <section className="tutor-workspace" aria-label="Seguimiento de tutoría">
      <SectionTitle
        title="Seguimiento de tutoría"
        subtitle="Consulta el trabajo de todas las materias y coordina el apoyo a cada alumno. Las notas de otras materias son de solo lectura."
      />
      {!p.childId && (
        <Field label="Alumno para seguimiento" name="tutorStudent">
          <select
            value={data.studentId || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {data.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.pendingTasks} pendientes
                {s.overdueTasks ? ` (${s.overdueTasks} vencidas)` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!child ? (
        <Empty
          title="Aula sin alumnos activos"
          subtitle="El seguimiento aparecerá al inscribir alumnos en el curso."
        />
      ) : (
        <>
          <p>
            <b>{child.name}</b> · {child.pendingTasks} tareas pendientes ·{" "}
            {child.overdueTasks} vencidas ·{" "}
            {data.termName || "Sin periodo configurado"}
          </p>
          <div className="tutor-subjects">
            {data.subjects.map((s) => (
              <article className="entity-card" key={s.id}>
                <h3>{s.name}</h3>
                <p>
                  {s.teachers.map((t) => t.name).join(", ") ||
                    "Sin docente asignado"}
                </p>
                <p>
                  <b>{s.total ? totalLabel(s.total) : "Sin evaluaciones"}</b> ·{" "}
                  {s.pendingTasks} tareas pendientes
                </p>
                <div className="request-actions">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      p.go(
                        `classrooms?classroom=${p.roomId}&tab=gradebook&subject=${s.id}`,
                      )
                    }
                  >
                    Ver notas
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setForm({ kind: "interview", subject: s.id })
                    }
                  >
                    Convocar entrevista
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setForm({ kind: "message", subject: s.id })}
                  >
                    Mensaje al profesor
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <section className="panel">
            <h3>Tareas por entregar o corregir</h3>
            {data.pending.length ? (
              data.pending.map((t) => (
                <p key={t.id}>
                  <b>
                    {t.subject} · {t.title}
                  </b>
                  <br />
                  {t.due_at
                    ? `Entrega: ${interviewTime(t.due_at)}`
                    : "Sin fecha límite"}{" "}
                  ·{" "}
                  {t.submission_status === "returned"
                    ? "Devuelta para corregir"
                    : "Sin entrega enviada"}
                </p>
              ))
            ) : (
              <p>No hay tareas pendientes para este alumno.</p>
            )}
          </section>
          <section className="panel">
            <h3>Comentarios de evaluaciones</h3>
            {data.feedback.length ? (
              data.feedback.map((f, i) => (
                <p key={i}>
                  <b>
                    {f.subject} · {f.title}
                  </b>
                  <br />
                  {f.comment}
                </p>
              ))
            ) : (
              <p>Sin comentarios registrados.</p>
            )}
            {data.recommendations.map((g) => (
              <p key={g.id}>
                <b>
                  {g.subject} · {g.period} · {g.score}
                </b>
                <br />
                {g.recommendation}
              </p>
            ))}
          </section>
          <section className="panel">
            <h3>Cuidados y observaciones recientes</h3>
            {data.care.length ? (
              data.care.map((c) => (
                <p key={c.id}>
                  <b>{dateLabel(c.entry_date)}</b> ·{" "}
                  {c.note || c.food || c.mood || "Cuidado registrado"}
                </p>
              ))
            ) : (
              <p>Sin cuidados registrados para este alumno.</p>
            )}
          </section>
          <Button variant="secondary" onClick={()=>p.go(`classrooms?classroom=${p.roomId}&tab=interviews&student=${child.id}`)}>Ver entrevistas y coordinación de este alumno</Button>
          {form && (
            <CoordinationDialog
              p={p}
              kind={form.kind}
              initialRoom={p.roomId}
              initialStudent={child.id}
              initialSubject={form.subject}
              onClose={() => setForm(null)}
              onSaved={() => {
                setForm(null);
                ws.refresh();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
