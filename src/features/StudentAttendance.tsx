import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarCheck, Download, CheckCheck, RefreshCw } from "lucide-react";
import {
  Button,
  Empty,
  Field,
  Modal,
  SearchBox,
  SectionTitle,
} from "../components/UI";
import { rpc } from "../lib/repository";
import { today } from "../lib/billing";
import { dateLabel } from "../lib/format";
import {
  attendanceCounts,
  attendanceMarks,
  attendanceLabels,
  attendanceCsv,
  type AttendanceMark,
  type AttendanceStatus,
} from "../lib/studentAttendance";
import { useStudentAttendance } from "../lib/useStudentAttendance";
import type { PageProps } from "./Pages";
import "../styles/student-attendance.css";
export function StudentAttendance({
  store,
  school,
  role,
  identity,
  student,
}: PageProps) {
  const location = useLocation();
  const family = role === "guardian";
  const rooms = store.data.classrooms.filter(
    (r) =>
      r.schoolId === school?.id &&
      (family
        ? r.id === student?.classroomId
        : role !== "teacher" ||
          r.teacherIds.some((t) => identity.teacherIds.includes(t))),
  );
  const [roomId, setRoomId] = useState(
      new URLSearchParams(location.search).get("classroom") || "",
    ),
    [day, setDay] = useState(today()),
    [tab, setTab] = useState<"register" | "history">(
      family ? "history" : "register",
    ),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const room = rooms.find((r) => r.id === roomId) || rooms[0];
  const {
    data,
    error: loadError,
    loading,
    refresh,
  } = useStudentAttendance(
    room?.id || "",
    day,
    family ? student?.id : undefined,
    store.data.notifications,
  );
  const key = `${room?.id}:${day}`;
  const [draft, setDraft] = useState<{
      key: string;
      marks: AttendanceMark[];
      revision: number;
    } | null>(null),
    [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dirty = draft?.key === key;
  const marks = dirty ? draft.marks : data ? attendanceMarks(data, day) : [];
  const counts = attendanceCounts(marks),
    confirmed = data?.session?.status === "confirmed";
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const block = (e: Event) => {
      e.preventDefault();
      setError(
        "Guarda el borrador o descarta los cambios antes de salir de la lista.",
      );
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("micole:before-navigate", block);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("micole:before-navigate", block);
    };
  }, [dirty]);
  function change(id: string, value: Partial<AttendanceMark>) {
    if (!data) return;
    setNotice("");
    setDraft({
      key,
      revision: dirty ? draft.revision : data.session?.revision || 0,
      marks: marks.map((m) => (m.studentId === id ? { ...m, ...value } : m)),
    });
  }
  function navigate(task: () => void) {
    if (dirty) {
      setError(
        "Tienes cambios sin guardar. Guarda el borrador o descarta los cambios antes de cambiar de aula o fecha.",
      );
      return;
    }
    setError("");
    setNotice("");
    task();
  }
  async function save(final: boolean) {
    if (!room || !data || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await rpc<{ notifications: number }>(
        "save_student_attendance",
        {
          p_classroom_id: room.id,
          p_day: day,
          p_records: marks,
          p_revision: dirty ? draft.revision : data.session?.revision || 0,
          p_confirm: final,
          p_reason: reason,
        },
      );
      setDraft(null);
      setConfirm(false);
      setReason("");
      setNotice(
        final
          ? `Lista confirmada. ${result.notifications} aviso(s) preparado(s) para las familias.`
          : "Borrador guardado. Todavía no se enviaron avisos.",
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([attendanceCsv(data?.records || [])], {
          type: "text/csv;charset=utf-8",
        }),
      );
    a.href = url;
    a.download = `asistencia-${day.slice(0, 7)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visible = marks.filter(
    (m) =>
      !search ||
      (
        data?.roster.find((s) => s.student_id === m.studentId)?.student_name ||
        ""
      )
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const history = (data?.records || []).filter(
    (r) =>
      r.confirmed &&
      (!status || r.status === status) &&
      (!search ||
        r.studentName.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  return (
    <>
      <SectionTitle
        title={family ? "Asistencia de mi hijo/a" : "Asistencia de alumnos"}
        subtitle={
          family
            ? "Consulta los días registrados. Los días sin lista confirmada no se consideran faltas."
            : "Pasa lista por aula y confirma al terminar. Las faltas se avisan automáticamente a madre y padre vinculados."
        }
      />
      <div className="attendance-toolbar">
        <Field label="Aula" name="attendanceRoom">
          <select
            value={room?.id || ""}
            disabled={busy || family}
            onChange={(e) => navigate(() => setRoomId(e.target.value))}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.academicYear}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            tab === "register" ? "Fecha de asistencia" : "Mes del historial"
          }
          name="attendanceDate"
        >
          <input
            type={tab === "register" ? "date" : "month"}
            value={tab === "register" ? day : day.slice(0, 7)}
            max={tab === "register" ? today() : today().slice(0, 7)}
            onChange={(e) =>
              navigate(() =>
                setDay(
                  tab === "register" ? e.target.value : e.target.value + "-01",
                ),
              )
            }
            required
            disabled={busy}
          />
        </Field>
        <Button
          variant="ghost"
          disabled={busy || loading}
          onClick={() => navigate(refresh)}
          icon={RefreshCw}
        >
          Actualizar
        </Button>
      </div>
      {!family && (
        <div
          className="attendance-tabs"
          role="group"
          aria-label="Vista de asistencia"
        >
          <Button
            variant={tab === "register" ? "primary" : "secondary"}
            onClick={() =>
              navigate(() => {
                setTab("register");
                setSearch("");
              })
            }
          >
            Pasar lista
          </Button>
          <Button
            variant={tab === "history" ? "primary" : "secondary"}
            onClick={() =>
              navigate(() => {
                setTab("history");
                setSearch("");
              })
            }
          >
            Historial del mes
          </Button>
        </div>
      )}
      {(error || loadError) && (
        <div className="message error" role="alert">
          {error || loadError}
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}
      {!rooms.length ? (
        <Empty
          title="Sin aula disponible"
          subtitle="Asigna docentes y estudiantes a un aula para comenzar."
        />
      ) : loading ? (
        <p role="status">Cargando asistencia…</p>
      ) : (
        data && (
          <>
            {tab === "register" && !family ? (
              <>
                <div className="attendance-summary" role="status">
                  <span>{counts.present} presentes</span>
                  <span>{counts.absent} faltas</span>
                  <span>{counts.late} tardanzas</span>
                  <span>{counts.excused} permisos</span>
                  <strong>{counts.pending} sin marcar</strong>
                  <span>
                    {confirmed
                      ? "Lista confirmada"
                      : data.session
                        ? "Borrador"
                        : "Lista sin iniciar"}
                  </span>
                </div>
                <div className="attendance-toolbar">
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar estudiante en la lista"
                  />
                  <Button
                    variant="secondary"
                    icon={CheckCheck}
                    disabled={busy || !marks.length}
                    onClick={() => {
                      setDraft({
                        key,
                        revision: dirty
                          ? draft.revision
                          : data.session?.revision || 0,
                        marks: marks.map((m) => ({
                          ...m,
                          status: m.status || "present",
                        })),
                      });
                      setNotice("");
                    }}
                  >
                    Marcar pendientes como presentes
                  </Button>
                </div>
                <p className="attendance-help">
                  Marca la casilla si asistió; para falta, tardanza o permiso
                  elige un estado. Las observaciones serán visibles para su
                  familia.
                </p>
                <div className="attendance-list">
                  {visible.map((m) => (
                    <article className="attendance-row" key={m.studentId}>
                      <label className="attendance-person">
                        <input
                          type="checkbox"
                          aria-label={`Presente: ${data.roster.find((s) => s.student_id === m.studentId)?.student_name}`}
                          checked={m.status === "present"}
                          disabled={busy}
                          onChange={(e) =>
                            change(m.studentId, {
                              status: e.target.checked ? "present" : "",
                            })
                          }
                        />
                        <strong>
                          {
                            data.roster.find(
                              (s) => s.student_id === m.studentId,
                            )?.student_name
                          }
                        </strong>
                      </label>
                      <div className="attendance-row-fields">
                        <label className="field">
                          <span>Estado</span>
                          <select
                            aria-label={`Estado de ${data.roster.find((s) => s.student_id === m.studentId)?.student_name}`}
                            value={m.status}
                            disabled={busy}
                            onChange={(e) =>
                              change(m.studentId, {
                                status: e.target.value as AttendanceStatus | "",
                              })
                            }
                          >
                            <option value="">Sin marcar</option>
                            {Object.entries(attendanceLabels).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <details className="attendance-note"><summary>{m.note ? "Editar observación" : "Añadir observación"}</summary><label className="field">
                          <span>Observación opcional</span>
                          <input
                            aria-label={`Observación de ${data.roster.find((s) => s.student_id === m.studentId)?.student_name}`}
                            maxLength={1000}
                            value={m.note}
                            disabled={busy}
                            onChange={(e) =>
                              change(m.studentId, { note: e.target.value })
                            }
                          />
                        </label></details>
                      </div>
                    </article>
                  ))}
                </div>
                {!marks.length && (
                  <Empty
                    title="Sin inscritos en esta fecha"
                    subtitle="Revisa el aula y la fecha de inscripción de los estudiantes."
                  />
                )}
                <div className="attendance-savebar">
                  <span>
                    {dirty
                      ? "Cambios sin guardar"
                      : confirmed
                        ? "Las correcciones conservan el historial."
                        : "Guardar borrador no envía notificaciones."}
                  </span>
                  {dirty && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setDraft(null);
                        setError("");
                      }}
                    >
                      Descartar cambios
                    </Button>
                  )}
                  {!confirmed && (
                    <Button
                      variant="secondary"
                      disabled={busy || !marks.length || !dirty}
                      onClick={() => void save(false)}
                    >
                      Guardar borrador
                    </Button>
                  )}
                  <Button
                    icon={CalendarCheck}
                    disabled={
                      busy ||
                      !marks.length ||
                      counts.pending > 0 ||
                      (confirmed && !dirty)
                    }
                    onClick={() => {
                      setReason("");
                      setConfirm(true);
                      setError("");
                    }}
                  >
                    {confirmed ? "Revisar corrección" : "Revisar y confirmar"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="attendance-toolbar">
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar en el historial"
                  />
                  <Field label="Estado" name="historyStatus">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">Todos los estados</option>
                      {Object.entries(attendanceLabels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    icon={Download}
                    variant="secondary"
                    disabled={!data.records.some((r) => r.confirmed)}
                    onClick={download}
                  >
                    Exportar CSV
                  </Button>
                </div>
                <div className="attendance-summary">
                  {Object.entries(attendanceCounts(history))
                    .filter(([k]) => k !== "pending")
                    .map(([k, n]) => (
                      <span key={k}>
                        {n}{" "}
                        {attendanceLabels[
                          k as AttendanceStatus
                        ].toLocaleLowerCase()}
                      </span>
                    ))}
                </div>
                {history.length ? (
                  <div className="attendance-list">
                    {history.map((r) => (
                      <article
                        key={r.id}
                        className={`attendance-history attendance-${r.status}`}
                      >
                        <div>
                          <b>{dateLabel(r.date)}</b>
                          <span>{r.studentName}</span>
                        </div>
                        <strong>
                          {r.status ? attendanceLabels[r.status] : "Sin marcar"}
                        </strong>
                        {r.note && <p>{r.note}</p>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Sin registros confirmados"
                    subtitle="No se presume una falta si no se pasó lista. Selecciona otro mes para consultar el historial."
                  />
                )}
              </>
            )}
          </>
        )
      )}
      {confirm && (
        <Modal
          title={
            confirmed ? "Confirmar corrección" : "Confirmar asistencia del día"
          }
          subtitle={`${room?.name} · ${dateLabel(day)}`}
          onClose={() => setConfirm(false)}
          busy={busy}
          error={error}
          submitLabel={confirmed ? "Guardar corrección" : "Confirmar y avisar"}
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          <p>
            {counts.present} presentes · {counts.absent} faltas · {counts.late}{" "}
            tardanzas · {counts.excused} permisos.
          </p>
          <div className="soft-note">
            Se avisará a las familias de las faltas confirmadas. Si corriges una
            falta previamente notificada también recibirán un aviso de
            corrección. Guardar de nuevo no duplica los avisos.
          </div>
          {confirmed && (
            <Field label="Motivo de la corrección" name="attendanceReason">
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
        </Modal>
      )}
    </>
  );
}
