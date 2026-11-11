import { AttendanceWeekSheet } from "./AttendanceWeekSheet";
import { useAttendanceWeek } from "../lib/useAttendanceWeek";
import {
  moveAttendanceDay,
  attendanceWeekDates,
  sortAttendancePupils,
  type AttendanceSort,
} from "../lib/attendanceWeek";
import {
  attendanceSubmissionId,
  clearAttendanceSubmission,
} from "../lib/attendanceSubmission";
import { AttendanceCorrections } from "./AttendanceCorrections";
import { AttendancePermissions } from "./AttendancePermissions";
import { useAttendanceDraft } from "../lib/useAttendanceDraft";
import { draftKey } from "../lib/sessionDraft";
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
  const [order, setOrder] = useState<AttendanceSort>("lastName");
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
    school?.id,
  );
  const week = useAttendanceWeek(family ? "" : room?.id || "", day, school?.id);
  const key = draftKey(
    `${identity.id}:${identity.support?.id || ""}`,
    role,
    school?.id || "",
    `${room?.id}:${day}`,
    "student-attendance",
  );
  const confirmed = data?.session?.status === "confirmed";
  const canMark = role === "teacher" && data?.canMark !== false;
  const [draft, setDraft] = useAttendanceDraft(key, confirmed);
  const [confirm, setConfirm] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dirty = !!data && canMark && draft?.key === key && !confirmed;
  const marks = data
    ? attendanceMarks(data, day, dirty ? draft.marks : undefined)
    : [];
  const counts = attendanceCounts(marks);
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
    if (!data || confirmed || !canMark) return;
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
    if (!room || !data || busy || confirmed || !canMark) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        p_classroom_id: room.id,
        p_day: day,
        p_records: marks,
        p_revision: dirty ? draft.revision : data.session?.revision || 0,
        p_confirm: final,
        p_reason: "",
        p_permission_revision: data.permissionRevision || null,
      };
      const result = await rpc<{ notifications: number }>(
        "save_student_attendance",
        {
          ...payload,
          p_request_id: attendanceSubmissionId(key, payload, () =>
            crypto.randomUUID(),
          ),
        },
      );
      clearAttendanceSubmission(key);
      setDraft(null);
      setConfirm(null);

      setNotice(
        final
          ? `Lista confirmada. ${result.notifications} aviso(s) preparado(s) para las familias.`
          : "Borrador guardado. Todavía no se enviaron avisos.",
      );
      refresh();
      week.refresh();
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
  const orderedIds = sortAttendancePupils(
    (data?.roster || []).map((row) => {
      const pupil = store.data.students.find(
        (value) => value.id === row.student_id,
      );
      return {
        ...row,
        first_name: row.first_name || pupil?.firstName,
        last_name: row.last_name || pupil?.lastName,
      };
    }),
    order,
  ).map((row) => row.student_id);
  const visible = [...marks]
    .sort(
      (a, b) =>
        orderedIds.indexOf(a.studentId) - orderedIds.indexOf(b.studentId),
    )
    .filter(
      (m) =>
        !search ||
        (
          data?.roster.find((s) => s.student_id === m.studentId)
            ?.student_name || ""
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
            : role === "director"
              ? "Consulta la asistencia y sus justificativos. Solo el docente asignado puede marcar y corregir."
              : "Revisa los permisos de las familias, pasa lista y confirma al terminar."
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
      {data?.schoolDay && !data.schoolDay.isSchoolDay && (
        <p role="status" className="message">
          {data.schoolDay.label} · Día sin clases. No se registran faltas ni se
          envían avisos de ausencia.
        </p>
      )}
      {data && (
        <AttendancePermissions
          data={data}
          context={key}
          canMark={canMark}
          active={tab === "register" && !confirmed}
          refresh={refresh}
          onReviewed={(ids) => {
            if (!canMark || confirmed) return;
            const next = marks.map((m) =>
              ids.includes(m.studentId) && (!m.status || m.status === "absent")
                ? { ...m, status: "excused" as const }
                : m,
            );
            if (next.some((m, i) => m.status !== marks[i].status))
              setDraft({
                key,
                revision: dirty ? draft.revision : data.session?.revision || 0,
                marks: next,
              });
          }}
        />
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
                      ? "Lista confirmada · Registro definitivo"
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
                    disabled={busy || confirmed || !canMark || !marks.length}
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
                <div className="attendance-toolbar">
                  <Field label="Ordenar estudiantes" name="attendanceOrder">
                    <select
                      value={order}
                      onChange={(e) =>
                        setOrder(e.target.value as AttendanceSort)
                      }
                    >
                      <option value="lastName">Apellido, luego nombre</option>
                      <option value="firstName">Nombre, luego apellido</option>
                    </select>
                  </Field>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate(() => setDay(moveAttendanceDay(day, -7)))
                    }
                  >
                    Semana anterior
                  </Button>
                  <span>
                    Semana: {attendanceWeekDates(day)[0]} al{" "}
                    {attendanceWeekDates(day)[6]}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate(() => setDay(moveAttendanceDay(day, 7)))
                    }
                  >
                    Semana siguiente
                  </Button>
                </div>
                {week.error && (
                  <p className="message error" role="alert">
                    No se pudo actualizar la hoja semanal. Puedes revisar la
                    lista del día.
                  </p>
                )}
                {week.data ? (
                  <AttendanceWeekSheet
                    week={week.data}
                    day={day}
                    marks={marks}
                    order={order}
                    search={search}
                    disabled={busy || confirmed || !canMark}
                    change={change}
                    selectDay={(date) => navigate(() => setDay(date))}
                  />
                ) : (
                  <div className="attendance-list">
                    {visible.map((m) => (
                      <article className="attendance-row" key={m.studentId}>
                        <label className="attendance-person">
                          <input
                            type="checkbox"
                            aria-label={`Presente: ${data.roster.find((s) => s.student_id === m.studentId)?.student_name}`}
                            checked={m.status === "present"}
                            disabled={busy || confirmed || !canMark}
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
                              disabled={busy || confirmed || !canMark}
                              onChange={(e) =>
                                change(m.studentId, {
                                  status: e.target.value as
                                    AttendanceStatus | "",
                                })
                              }
                            >
                              <option value="">Sin marcar</option>
                              {Object.entries(attendanceLabels).map(
                                ([v, l]) => (
                                  <option key={v} value={v}>
                                    {l}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          {confirmed || !canMark ? (
                            m.note ? (
                              <p className="attendance-help">{m.note}</p>
                            ) : null
                          ) : (
                            <details className="attendance-note">
                              <summary>
                                {m.note
                                  ? "Editar observación"
                                  : "Añadir observación"}
                              </summary>
                              <label className="field">
                                <span>Observación opcional</span>
                                <input
                                  aria-label={`Observación de ${data.roster.find((s) => s.student_id === m.studentId)?.student_name}`}
                                  maxLength={1000}
                                  value={m.note}
                                  disabled={busy || confirmed || !canMark}
                                  onChange={(e) =>
                                    change(m.studentId, {
                                      note: e.target.value,
                                    })
                                  }
                                />
                              </label>
                            </details>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {!marks.length && (
                  <Empty
                    title="Sin inscritos en esta fecha"
                    subtitle="Revisa el aula y la fecha de inscripción de los estudiantes."
                  />
                )}
                {!confirmed && canMark && (
                  <div className="attendance-savebar">
                    <span>
                      {dirty
                        ? "Cambios sin enviar · se conservan durante esta sesión"
                        : confirmed
                          ? "Lista confirmada. Registro definitivo y de solo lectura."
                          : "Guardar borrador no envía notificaciones."}
                    </span>
                    {dirty && (
                      <Button
                        variant="ghost"
                        disabled={busy || confirmed}
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
                        confirmed ||
                        !marks.length ||
                        counts.pending > 0 ||
                        (confirmed && !dirty)
                      }
                      onClick={() => {
                        setConfirm(key);
                        setError("");
                      }}
                    >
                      Revisar y confirmar
                    </Button>
                  </div>
                )}
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
                        {r.correctionId && (
                          <small>
                            Corrección con justificativo · consulta el historial
                          </small>
                        )}
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
      {data && (
        <AttendanceCorrections
          data={data}
          refresh={refresh}
          canCorrect={canMark && !!data.canCorrect}
        />
      )}
      {confirm === key && !confirmed && canMark && (
        <Modal
          title="Confirmar asistencia del día"
          subtitle={`${room?.name} · ${dateLabel(day)}`}
          onClose={() => setConfirm(null)}
          busy={busy}
          error={error}
          submitLabel="Confirmar y avisar"
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
            Se avisará a las familias de las faltas confirmadas. Al confirmar,
            la lista quedará cerrada. Solo el docente podrá corregir con
            justificativo e historial. Revisa los datos antes de continuar.
          </div>
        </Modal>
      )}
    </>
  );
}
