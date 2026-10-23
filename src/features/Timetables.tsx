import { useState } from "react";
import {
  Button,
  Empty,
  Field,
  FormSection,
  Modal,
  SectionTitle,
} from "../components/UI";
import type { PageProps } from "./Pages";
import { rpc } from "../lib/repository";
import { useAcademicPlanning } from "../lib/useAcademicPlanning";
import {
  clockOptions,
  defaultTimetable,
  generateTimetable,
  minuteLabel,
  validateTimetable,
  weekDays,
  type PlanningData,
  type TimetableVersion,
  type TimetableConfig,
  type Lesson,
} from "../lib/timetable";
import "../styles/academic-planning.css";
export function Timetables(p: PageProps) {
  const [year, setYear] = useState(""),
    [selected, setSelected] = useState(""),
    [room, setRoom] = useState(""),
    [teacher, setTeacher] = useState(""),
    [edit, setEdit] = useState<TimetableVersion | null>(),
    [publish, setPublish] = useState<TimetableVersion>(),
    [delegate, setDelegate] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const ws = useAcademicPlanning<PlanningData>(
      "timetable_workspace",
      { p_school_id: p.school?.id, p_year_id: year || null },
      p.school?.id,
    ),
    d = ws.data;
  const v =
    d?.versions.find((v) => v.id === selected) ||
    d?.versions.find((v) => v.status === "published") ||
    d?.versions[0];
  const currentYear = year || d?.years[0]?.id;
  const act = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await rpc(name, args);
      ws.refresh();
      setPublish(undefined);
      setDelegate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <SectionTitle
        title="Horarios de clases"
        subtitle="Por paralelo y docente. Solo los horarios publicados son visibles para las familias y estudiantes."
        action={
          d?.canManage && (
            <Button disabled={!currentYear} onClick={() => setEdit(null)}>
              Preparar horario
            </Button>
          )
        }
      />
      {(error || ws.error) && (
        <p role="alert" className="message error">
          {error || ws.error}
        </p>
      )}
      {ws.loading && !d ? (
        <p role="status">Cargando horarios…</p>
      ) : (
        d && (
          <>
            <div className="planning-filters">
              <Field label="Gestión" name="timetableYear">
                <select
                  value={currentYear || ""}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setSelected("");
                    setRoom("");
                    setTeacher("");
                  }}
                >
                  {d.years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Versión" name="timetableVersion">
                <select
                  value={v?.id || ""}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {!d.versions.length && <option value="">Sin horarios</option>}
                  {d.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ·{" "}
                      {v.status === "published"
                        ? "Publicado"
                        : v.status === "draft"
                          ? "Borrador"
                          : "Histórico"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Paralelo" name="timetableRoom">
                <select value={room} onChange={(e) => setRoom(e.target.value)}>
                  <option value="">Todos mis paralelos</option>
                  {d.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Docente" name="timetableTeacher">
                <select
                  value={teacher}
                  onChange={(e) => setTeacher(e.target.value)}
                >
                  <option value="">Todos los docentes</option>
                  {d.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {v ? (
              <>
                <div className="planning-actions">
                  <strong>
                    {v.status === "published"
                      ? "Horario publicado"
                      : v.status === "draft"
                        ? "Borrador privado"
                        : "Versión histórica"}
                  </strong>
                  {d.canManage && (
                    <Button variant="secondary" onClick={() => setEdit(v)}>
                      {v.status === "draft"
                        ? "Editar borrador"
                        : "Crear una copia"}
                    </Button>
                  )}
                  {d.canApprove && v.status === "draft" && (
                    <Button
                      disabled={!v.lessons.length}
                      onClick={() => {
                        setError("");
                        setPublish(v);
                      }}
                    >
                      Revisar y publicar
                    </Button>
                  )}
                </div>
                <TimetableView
                  version={v}
                  data={d}
                  room={room}
                  teacher={teacher}
                />
              </>
            ) : (
              <Empty
                title="Aún no hay horarios"
                subtitle={
                  d.canManage
                    ? "Crea materias y asigna sus docentes por paralelo antes de generar el horario."
                    : "Dirección publicará aquí el horario de tu aula."
                }
              />
            )}
            {d.canDelegate && (
              <details className="planning-access">
                <summary>
                  Secretaría académica y permisos de publicación
                </summary>
                <p>
                  Puede preparar horarios. La publicación requiere el permiso
                  adicional que asignas aquí. No obtiene acceso a cobros ni a
                  expedientes.
                </p>
                {d.delegates.map((m) => (
                  <div className="planning-actions" key={m.email}>
                    <span>
                      {m.email} ·{" "}
                      {m.active
                        ? m.can_approve
                          ? "Prepara y publica"
                          : "Solo prepara"
                        : "Sin acceso"}
                    </span>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void act("save_timetable_delegate", {
                          p_school_id: p.school?.id,
                          p_email: m.email,
                          p_active: !m.active,
                          p_approve: m.can_approve,
                        })
                      }
                    >
                      {m.active ? "Retirar acceso" : "Restaurar acceso"}
                    </Button>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => setDelegate(true)}>
                  Asignar acceso
                </Button>
              </details>
            )}
          </>
        )
      )}
      {edit !== undefined && d && currentYear && (
        <TimetableEditor
          key={edit?.id || "new"}
          data={d}
          initial={edit}
          yearId={currentYear}
          close={() => setEdit(undefined)}
          done={(id) => {
            setSelected(id);
            setEdit(undefined);
            ws.refresh();
          }}
        />
      )}
      {publish && (
        <Modal
          title="Aprobar y publicar horario"
          subtitle="Las familias, estudiantes y docentes verán esta versión. La anterior se conserva como histórica."
          busy={busy}
          error={error}
          onClose={() => setPublish(undefined)}
          submitLabel="Aprobar y publicar"
          onSubmit={(e) => {
            e.preventDefault();
            void act("publish_timetable", {
              p_id: publish.id,
              p_revision: publish.revision,
            });
          }}
        >
          <p>
            {publish.name}: {publish.lessons.length} bloques,{" "}
            {publish.config.loads.reduce((n, l) => n + l.periods, 0)} periodos
            semanales.
          </p>
          <label className="check-row">
            <input type="checkbox" required />
            Revisé la jornada, recreos, cargas y asignaciones docentes.
          </label>
          <p>
            El servidor volverá a comprobar cruces y clases publicadas de este
            docente en otras sedes.
          </p>
        </Modal>
      )}
      {delegate && (
        <Modal
          title="Asignar Secretaría académica"
          error={error}
          busy={busy}
          onClose={() => setDelegate(false)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act("save_timetable_delegate", {
              p_school_id: p.school?.id,
              p_email: f.get("email"),
              p_active: true,
              p_approve: f.get("approve") === "on",
            });
          }}
        >
          <Field label="Correo de la persona" name="email">
            <input name="email" type="email" required />
          </Field>
          <label className="check-row">
            <input name="approve" type="checkbox" />
            Permitir aprobar y publicar horarios
          </label>
          <p>Ingresará con este correo verificado desde el login habitual.</p>
        </Modal>
      )}
    </section>
  );
}
function TimetableView({
  version: v,
  data: d,
  room,
  teacher,
}: {
  version: TimetableVersion;
  data: PlanningData;
  room: string;
  teacher: string;
}) {
  const [day, setDay] = useState(v.config.days[0] || 1);
  const lessons = v.lessons.filter(
    (l) =>
      (!room || l.classroomId === room) &&
      (!teacher || l.teacherId === teacher),
  );
  return (
    <>
      <div className="planning-days" role="group" aria-label="Día del horario">
        {v.config.days.map((n) => (
          <Button
            key={n}
            variant={n === day ? "primary" : "secondary"}
            onClick={() => setDay(n)}
          >
            {weekDays[n]}
          </Button>
        ))}
      </div>
      <div className="planning-lessons">
        {[
          ...lessons
            .filter((l) => l.day === day)
            .map((l) => ({ ...l, type: "lesson" })),
          ...v.config.breaks.map((b) => ({
            ...b,
            day,
            type: "break",
            classSubjectId: "",
            classroomId: "",
            teacherId: "",
          })),
        ]
          .sort((a, b) => a.start - b.start)
          .map((l, i) => (
            <article
              key={i}
              className={
                l.type === "break" ? "planning-break" : "planning-lesson"
              }
            >
              <strong>
                {minuteLabel(l.start)}–{minuteLabel(l.end)}
              </strong>
              <div>
                <h3>
                  {l.type === "break"
                    ? "Recreo"
                    : d.subjects.find((s) => s.id === l.classSubjectId)?.name ||
                      "Materia"}
                </h3>
                {l.type !== "break" && (
                  <p>
                    {d.rooms.find((r) => r.id === l.classroomId)?.name} ·{" "}
                    {d.teachers.find((t) => t.id === l.teacherId)?.name}
                  </p>
                )}
              </div>
            </article>
          ))}
        {!lessons.some((l) => l.day === day) && (
          <p className="muted">Sin clases en este día y filtro.</p>
        )}
      </div>
    </>
  );
}
function TimetableEditor({
  data: d,
  initial,
  yearId,
  close,
  done,
}: {
  data: PlanningData;
  initial: TimetableVersion | null;
  yearId: string;
  close: () => void;
  done: (id: string) => void;
}) {
  const copying = initial && initial.status !== "draft";
  const [name, setName] = useState(
      initial
        ? `${initial.name}${copying ? " · copia" : ""}`
        : "Horario semanal",
    ),
    [config, setConfig] = useState<TimetableConfig>(() =>
      structuredClone(initial?.config || defaultTimetable()),
    ),
    [lessons, setLessons] = useState<Lesson[]>(initial?.lessons || []),
    [issues, setIssues] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (next: TimetableConfig) => {
    setConfig(next);
    setLessons([]);
    setIssues([]);
  };
  const setLoad = (id: string, patch: Record<string, unknown>) => {
    const s = d.subjects.find((s) => s.id === id)!;
    const l = config.loads.find((l) => l.classSubjectId === id) || {
      classSubjectId: id,
      classroomId: s.classroomId,
      teacherId: s.teacherIds.length === 1 ? s.teacherIds[0] : "",
      periods: 1,
      blockSize: 1,
    };
    change({
      ...config,
      loads: [
        ...config.loads.filter((l) => l.classSubjectId !== id),
        { ...l, ...patch },
      ],
    });
  };
  const generate = () => {
    setBusy(true);
    setError("");
    setTimeout(() => {
      try {
        if (
          d.subjects.some(
            (s) => !config.loads.some((l) => l.classSubjectId === s.id),
          )
        )
          throw new Error(
            "Configura todas las materias y paralelos de esta gestión.",
          );
        const result = generateTimetable(config, d.externalBusy);
        setLessons(result.lessons);
        setIssues(
          result.issues.map((s) =>
            [...d.teachers, ...d.rooms].reduce(
              (text, p) => text.replaceAll(p.id, p.name),
              s,
            ),
          ),
        );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 0);
  };
  return (
    <Modal
      title={
        initial && !copying ? "Editar borrador de horario" : "Preparar horario"
      }
      subtitle="Completa cada paso. Generar no publica ni cambia la jornada."
      onClose={close}
      busy={busy}
      error={error}
      submitLabel="Guardar borrador"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        void rpc<string>("save_timetable", {
          p_version: {
            id: copying ? undefined : initial?.id,
            revision: initial?.revision,
            year_id: yearId,
            name,
            config,
            lessons,
          },
        })
          .then(done)
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <FormSection title="Jornada y recreos">
        <Field label="Nombre del horario" name="name">
          <input
            required
            value={name}
            minLength={2}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Clock
            label="Inicio de clases"
            value={config.start}
            change={(n) => change({ ...config, start: n })}
          />
          <Clock
            label="Fin de clases"
            value={config.end}
            change={(n) => change({ ...config, end: n })}
          />
          <Field label="Minutos por periodo pedagógico" name="minutes">
            <input
              required
              type="number"
              min={10}
              max={180}
              value={config.periodMinutes}
              onChange={(e) =>
                change({ ...config, periodMinutes: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <p className="muted">
          Referencia Bolivia 2026: periodos de 40 minutos. Para una sesión de 80
          minutos, usa bloques de 2 periodos.
        </p>
        <div className="planning-actions">
          {weekDays.slice(1).map((label, i) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={config.days.includes(i + 1)}
                onChange={(e) =>
                  change({
                    ...config,
                    days: e.target.checked
                      ? [...config.days, i + 1].sort()
                      : config.days.filter((n) => n !== i + 1),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <h4>Recreos</h4>
        {config.breaks.map((b, i) => (
          <div key={i} className="planning-filters">
            <Clock
              label={`Inicio recreo ${i + 1}`}
              value={b.start}
              change={(n) =>
                change({
                  ...config,
                  breaks: config.breaks.map((b, j) =>
                    j === i ? { ...b, start: n } : b,
                  ),
                })
              }
            />
            <Clock
              label={`Fin recreo ${i + 1}`}
              value={b.end}
              change={(n) =>
                change({
                  ...config,
                  breaks: config.breaks.map((b, j) =>
                    j === i ? { ...b, end: n } : b,
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              onClick={() =>
                change({
                  ...config,
                  breaks: config.breaks.filter((_, j) => j !== i),
                })
              }
            >
              Quitar recreo {i + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            change({
              ...config,
              breaks: [
                ...config.breaks,
                { start: config.start + 120, end: config.start + 140 },
              ],
            })
          }
        >
          Añadir recreo
        </Button>
      </FormSection>
      <FormSection title="Materias y disponibilidad">
        <p>
          Asigna el docente de cada materia y paralelo, sus periodos semanales y
          si se agrupan en bloques consecutivos.
        </p>
        {!d.subjects.length && (
          <p role="alert">
            Primero crea las materias del aula y asigna sus docentes.
          </p>
        )}
        {d.subjects.map((s) => {
          const l = config.loads.find((l) => l.classSubjectId === s.id);
          return (
            <fieldset className="planning-load" key={s.id}>
              <legend>
                {d.rooms.find((r) => r.id === s.classroomId)?.name} · {s.name}
              </legend>
              <div className="form-grid">
                <Field label="Docente del paralelo" name={`teacher-${s.id}`}>
                  <select
                    required
                    value={l?.teacherId || ""}
                    onChange={(e) =>
                      setLoad(s.id, { teacherId: e.target.value })
                    }
                  >
                    <option value="">Seleccionar docente</option>
                    {d.teachers
                      .filter((t) => s.teacherIds.includes(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Periodos por semana" name={`load-${s.id}`}>
                  <input
                    required
                    type="number"
                    min={1}
                    max={80}
                    value={l?.periods || ""}
                    onChange={(e) =>
                      setLoad(s.id, { periods: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Periodos por bloque" name={`block-${s.id}`}>
                  <select
                    required
                    value={l?.blockSize || 1}
                    onChange={(e) =>
                      setLoad(s.id, { blockSize: Number(e.target.value) })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </fieldset>
          );
        })}
        <h4>Indisponibilidad docente</h4>
        {config.unavailable.map((b, i) => (
          <div className="planning-load" key={i}>
            <div className="form-grid">
              <Field label="Docente no disponible" name={`unavailable-${i}`}>
                <select
                  required
                  value={b.teacherId}
                  onChange={(e) =>
                    change({
                      ...config,
                      unavailable: config.unavailable.map((b, j) =>
                        j === i ? { ...b, teacherId: e.target.value } : b,
                      ),
                    })
                  }
                >
                  <option value="">Seleccionar</option>
                  {d.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Día" name={`day-${i}`}>
                <select
                  value={b.day}
                  onChange={(e) =>
                    change({
                      ...config,
                      unavailable: config.unavailable.map((b, j) =>
                        j === i ? { ...b, day: Number(e.target.value) } : b,
                      ),
                    })
                  }
                >
                  {weekDays.slice(1).map((label, j) => (
                    <option key={label} value={j + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Clock
                label="Desde"
                value={b.start}
                change={(n) =>
                  change({
                    ...config,
                    unavailable: config.unavailable.map((b, j) =>
                      j === i ? { ...b, start: n } : b,
                    ),
                  })
                }
              />
              <Clock
                label="Hasta"
                value={b.end}
                change={(n) =>
                  change({
                    ...config,
                    unavailable: config.unavailable.map((b, j) =>
                      j === i ? { ...b, end: n } : b,
                    ),
                  })
                }
              />
            </div>
            <Button
              variant="ghost"
              onClick={() =>
                change({
                  ...config,
                  unavailable: config.unavailable.filter((_, j) => j !== i),
                })
              }
            >
              Quitar indisponibilidad
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            change({
              ...config,
              unavailable: [
                ...config.unavailable,
                {
                  teacherId: "",
                  day: 1,
                  start: config.start,
                  end: config.start + 40,
                },
              ],
            })
          }
        >
          Añadir indisponibilidad
        </Button>
      </FormSection>
      <FormSection title="Generar y revisar">
        <p>
          {config.loads.reduce((n, l) => n + l.periods, 0)} periodos semanales ·{" "}
          {config.periodMinutes} minutos por periodo.
        </p>
        <Button disabled={busy} onClick={generate}>
          Generar sin cruces
        </Button>
        {issues.map((s, i) => (
          <p role="alert" key={i} className="message error">
            {s}
          </p>
        ))}
        {lessons.length > 0 && (
          <>
            <p className="message success">
              Horario generado. Revisa las clases antes de guardarlo.
            </p>
            <div className="planning-preview">
              {lessons.map((l, i) => (
                <div key={i} className="planning-load">
                  <strong>
                    {d.rooms.find((r) => r.id === l.classroomId)?.name} ·{" "}
                    {d.subjects.find((s) => s.id === l.classSubjectId)?.name}
                  </strong>
                  <p>{d.teachers.find((t) => t.id === l.teacherId)?.name}</p>
                  <div className="form-grid">
                    <Field label="Día de clase" name={`lessonDay-${i}`}>
                      <select
                        value={l.day}
                        onChange={(e) =>
                          setLessons((old) =>
                            old.map((l, j) =>
                              j === i
                                ? { ...l, day: Number(e.target.value) }
                                : l,
                            ),
                          )
                        }
                      >
                        {config.days.map((n) => (
                          <option key={n} value={n}>
                            {weekDays[n]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Clock
                      label="Hora de clase"
                      value={l.start}
                      change={(n) =>
                        setLessons((old) =>
                          old.map((l, j) =>
                            j === i
                              ? { ...l, start: n, end: n + l.end - l.start }
                              : l,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            {validateTimetable(config, lessons, d.externalBusy).map((s) => (
              <p key={s} role="alert" className="message error">
                {s}
              </p>
            ))}
          </>
        )}
        <p>
          Si no se encuentra solución, ajusta las restricciones expresamente. El
          sistema no ampliará la jornada. Puedes guardar la configuración como
          borrador sin clases.
        </p>
      </FormSection>
    </Modal>
  );
}
function Clock({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: (n: number) => void;
}) {
  return (
    <Field label={label} name={label}>
      <select value={value} onChange={(e) => change(Number(e.target.value))}>
        {clockOptions.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
