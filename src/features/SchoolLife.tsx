import {ContentSeen} from '../components/ContentSeen';
import { useState, type FormEvent } from "react";
import { Plus, Heart, Download, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  Button,
  Empty,
  Field,
  FormSection,
  Modal,
  SectionTitle,
  StatCard,
} from "../components/UI";
import type { PageProps } from "./Pages";
import { fullName } from "./Pages";
import { rpc } from "../lib/repository";
import { today } from "../lib/billing";
import { dateLabel, money, uid } from "../lib/format";
import {
  subjectName,
  subjectOptions,
  canManageAssignment,
} from "../lib/learning";
import { useSchoolWorkspace } from "../lib/useSchoolWorkspace";
import {
  annualSubjects,
  careKinds,
  careSummary,
  enrollmentStates,
  foodAmounts,
  hourOptions,
  hygieneKinds,
  importColumns,
  importLabels,
  importTemplate,
  moods,
  parseDirectoryCsv,
  schoolCsv,
  weightedSubject,
  type AcademicTerm,
  type Assessment,
  type CareRecord,
  type ImportKind,
  type ImportResult,
  type ReportCard,
  type SchoolWorkspace,
} from "../lib/school";
import "../styles/school-life.css";
type Values = Record<string, string | boolean>;
type Option = { value: string; label: string };
interface InputDef {
  key: string;
  label: string;
  type?: string;
  options?: Option[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  when?: (values: Values) => boolean;
  hint?: string;
}
interface DialogSpec {
  title: string;
  subtitle?: string;
  initial: Values;
  fields: InputDef[];
  submit: (values: Values) => Promise<unknown>;
  success?: () => void;
  submitLabel?: string;
}
const opts = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));
const select = (
  key: string,
  label: string,
  options: Option[],
  required = true,
): InputDef => ({ key, label, type: "select", options, required });
const input = (
  key: string,
  label: string,
  type = "text",
  required = true,
): InputDef => ({ key, label, type, required });
function Dialog({
  spec,
  close,
  done,
}: {
  spec: DialogSpec;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [values, setValues] = useState(spec.initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fields = spec.fields.filter((f) => !f.when || f.when(values));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await spec.submit(values);
      await done();
      spec.success?.();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={spec.title}
      subtitle={spec.subtitle}
      onClose={close}
      onSubmit={(e) => void submit(e)}
      busy={busy}
      error={error}
      submitLabel={spec.submitLabel}
    >
      {Array.from({ length: Math.ceil(fields.length / 6) }, (_, i) => (
        <FormSection
          key={i}
          title={i === 0 ? "Datos principales" : "Más detalles"}
        >
          <div className="form-grid">
            {fields.slice(i * 6, i * 6 + 6).map((f) => (
              <label className="field" key={f.key}>
                <span>
                  {f.label}
                  {f.required && f.type !== "checkbox" && <sup> *</sup>}
                </span>
                {f.type === "select" ? (
                  <select
                    required={f.required}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  >
                    <option value="">Seleccionar</option>
                    {f.options?.map((o) => (
                      <option value={o.value} key={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    maxLength={4000}
                    required={f.required}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  />
                ) : f.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={values[f.key] === true}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.checked }))
                    }
                  />
                ) : (
                  <input
                    type={f.type || "text"}
                    required={f.required}
                    min={f.min}
                    max={f.max}
                    step={f.step ?? (f.type === "number" ? "0.01" : undefined)}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  />
                )}{" "}
                {f.hint && <small>{f.hint}</small>}
              </label>
            ))}
          </div>
        </FormSection>
      ))}
    </Modal>
  );
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function useLife(p: PageProps, day = today()) {
  const ws = useSchoolWorkspace(p.school?.id, day, p.store.data),
    [dialog, setDialog] = useState<DialogSpec | null>(null);
  const done = async () => {
    await p.store.refresh();
    ws.refresh();
  };
  const action = (fn: () => Promise<unknown>, message: string) =>
    p.act(async () => {
      await fn();
      ws.refresh();
    }, message);
  return {
    ...ws,
    setDialog,
    action,
    dialog: dialog ? (
      <Dialog spec={dialog} close={() => setDialog(null)} done={done} />
    ) : null,
  };
}
function Loading({ loading, error }: { loading: boolean; error: string }) {
  return error ? (
    <div className="message error" role="alert">
      {error}
    </div>
  ) : loading ? (
    <p className="muted" role="status">
      Cargando información…
    </p>
  ) : null;
}
export function Care(p: PageProps) {
  const [day, setDay] = useState(today()),
    [child, setChild] = useState(p.student?.id || p.students[0]?.id || "");
  const life = useLife(p, day),
    canWrite = ["director", "teacher"].includes(p.role),
    studentId = p.role === "guardian" ? p.student?.id : child;
  const records = life.data.care.filter((c) => c.studentId === studentId),
    summary = careSummary(records);
  const edit = (record?: CareRecord) =>
    life.setDialog({
      title: record ? "Editar cuidado" : "Registrar cuidado",
      subtitle: "La familia verá este registro en el resumen diario.",
      initial: {
        student_id: record?.studentId || studentId || "",
        entry_date: record?.entryDate || day,
        kind: record?.kind || "meal",
        occurred_at: record?.occurredAt.slice(0, 5) || "10:00",
        ended_at: record?.endedAt?.slice(0, 5) || "14:00",
        food: record?.food || "",
        amount: record?.amount || "all",
        hygiene: record?.hygiene || "diaper",
        mood: record?.mood || "calm",
        note: record?.note || "",
      },
      fields: [
        select(
          "student_id",
          "Estudiante",
          p.students
            .filter((s) => s.status !== "inactive")
            .map((s) => ({ value: s.id, label: fullName(s) })),
        ),
        input("entry_date", "Fecha", "date"),
        select("kind", "Tipo de cuidado", opts(careKinds)),
        select("occurred_at", "Hora", hourOptions),
        {
          ...select("ended_at", "Fin del descanso", hourOptions),
          when: (v) => v.kind === "rest",
        },
        { ...input("food", "Alimento"), when: (v) => v.kind === "meal" },
        {
          ...select("amount", "Cantidad que comió", opts(foodAmounts)),
          when: (v) => v.kind === "meal",
        },
        {
          ...select("hygiene", "Registro de higiene", opts(hygieneKinds)),
          when: (v) => v.kind === "hygiene",
        },
        {
          ...select("mood", "Estado de ánimo", opts(moods)),
          when: (v) => v.kind === "mood",
        },
        input("note", "Observaciones", "textarea", false),
      ],
      submit: (v) =>
        rpc("save_care_record", {
          p_record: {
            ...v,
            id: record?.id,
            ended_at: v.kind === "rest" ? v.ended_at : "",
            food: v.kind === "meal" ? v.food : "",
            amount: v.kind === "meal" ? v.amount : "",
            hygiene: v.kind === "hygiene" ? v.hygiene : "",
            mood: v.kind === "mood" ? v.mood : "",
          },
        }),
    });
  return (
    <>
      <SectionTitle
        title="Así fue su día"
        subtitle="Alimentación, descanso, higiene y observaciones para compartir con la familia."
        action={
          canWrite && (
            <Button icon={Plus} onClick={() => edit()}>
              Registrar cuidado
            </Button>
          )
        }
      />
      <div className="toolbar">
        <Field label="Día" name="careDay">
          <input
            type="date"
            max={today()}
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        </Field>
        {p.role !== "guardian" && (
          <Field label="Estudiante" name="careChild">
            <select value={child} onChange={(e) => setChild(e.target.value)}>
              {p.students.map((s) => (
                <option value={s.id} key={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Loading {...life} />
      <div className="stats-grid life-stats">
        <StatCard label="Comidas" value={summary.meals} icon={Heart} />
        <StatCard
          label="Minutos de descanso"
          value={summary.restMinutes}
          icon={Heart}
        />
        <StatCard
          label="Registros de higiene"
          value={summary.hygiene}
          icon={Heart}
        />
        <StatCard label="Incidentes" value={summary.incidents} icon={Heart} />
      </div>
      <section className="panel care-timeline">
        {records.map((r) => (
          <article key={r.id} className={`care-item care-${r.kind}`}>
            <time>
              {r.occurredAt.slice(0, 5)}
              {r.endedAt && ` – ${r.endedAt.slice(0, 5)}`}
            </time>
            <div className="grow">
              <h3>{careKinds[r.kind]}</h3>
              <p>
                {r.kind === "meal"
                  ? `${r.food} · ${foodAmounts[r.amount as keyof typeof foodAmounts]}`
                  : r.kind === "hygiene"
                    ? hygieneKinds[r.hygiene as keyof typeof hygieneKinds]
                    : r.kind === "mood"
                      ? moods[r.mood as keyof typeof moods]
                      : ""}
              </p>
              {r.note && <p>{r.note}</p>}
            </div>
            {canWrite && (
              <Button variant="ghost" onClick={() => edit(r)}>
                Editar
              </Button>
            )}
          </article>
        ))}
        {!life.loading && !records.length && (
          <Empty
            title="Sin cuidados registrados para este día"
            subtitle="Los registros del equipo aparecerán aquí."
          />
        )}
      </section>
      {life.dialog}
    </>
  );
}
export function Years(p: PageProps) {
  const life = useLife(p),
    [yearId, setYearId] = useState(""),
    [search, setSearch] = useState("");
  const years = life.data.years,
    year = years.find((y) => y.id === yearId) || years[0],
    director = p.role === "director";
  const records = life.data.enrollments.filter(
    (h) =>
      (!year || h.yearId === year.id) &&
      `${h.studentName} ${h.classroomName}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (p.role !== "guardian" || h.studentId === p.student?.id),
  );
  const addYear = () => {
    const next =
      Math.max(Number(today().slice(0, 4)), ...years.map((y) => y.year)) + 1;
    life.setDialog({
      title: "Nueva gestión",
      initial: {
        year: String(next),
        name: `Gestión ${next}`,
        starts_on: `${next}-01-01`,
        ends_on: `${next}-12-31`,
      },
      fields: [
        { ...input("year", "Año", "number"), min: 2020, max: 2100, step: "1" },
        input("name", "Nombre"),
        input("starts_on", "Inicio", "date"),
        input("ends_on", "Fin", "date"),
      ],
      submit: (v) =>
        rpc("save_academic_year", {
          p_year: { ...v, school_id: p.school?.id },
        }),
    });
  };
  const move = (studentId?: string) =>
    life.setDialog({
      title: "Reinscripción o traslado",
      subtitle:
        "Conserva el expediente, las cuotas y los saldos. El nuevo plan de pagos se crea desde Mensualidades.",
      initial: {
        student_id: studentId || p.students[0]?.id || "",
        classroom_id: "",
        reason: "",
      },
      fields: [
        select(
          "student_id",
          "Estudiante",
          p.students.map((s) => ({ value: s.id, label: fullName(s) })),
        ),
        select(
          "classroom_id",
          "Aula de destino",
          p.store.data.classrooms
            .filter(
              (r) =>
                r.schoolId === p.school?.id &&
                r.active !== false &&
                years.some(
                  (y) => y.year === r.academicYear && y.status === "open",
                ),
            )
            .map((r) => ({
              value: r.id,
              label: `${r.name} · ${r.academicYear}`,
            })),
        ),
        input("reason", "Motivo", "textarea"),
      ],
      submit: (v) =>
        rpc("move_student_year", {
          p_student_id: v.student_id,
          p_classroom_id: v.classroom_id,
          p_reason: v.reason,
        }),
    });
  return (
    <>
      <SectionTitle
        title="Gestiones e historial"
        subtitle="Cada inscripción conserva su aula, fechas y estado anterior."
        action={
          director && (
            <div className="action-group">
              <Button variant="secondary" onClick={() => move()}>
                Reinscribir o trasladar
              </Button>
              <Button icon={Plus} onClick={addYear}>
                Nueva gestión
              </Button>
            </div>
          )
        }
      />
      <Loading {...life} />
      <div className="toolbar">
        <Field label="Gestión" name="historyYear">
          <select
            value={year?.id || ""}
            onChange={(e) => setYearId(e.target.value)}
          >
            {years.map((y) => (
              <option value={y.id} key={y.id}>
                {y.name} · {y.status === "closed" ? "Cerrada" : "Abierta"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Buscar estudiante o aula" name="historySearch">
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Button
          variant="secondary"
          icon={Download}
          onClick={() =>
            download(
              `historial-${year?.year}.csv`,
              schoolCsv([
                [
                  "Estudiante",
                  "Gestión",
                  "Aula",
                  "Estado",
                  "Desde",
                  "Hasta",
                  "Motivo",
                ],
                ...records.map((h) => [
                  h.studentName,
                  year?.year,
                  h.classroomName,
                  enrollmentStates[h.status],
                  h.startedOn,
                  h.endedOn,
                  h.reason,
                ]),
              ]),
            )
          }
        >
          Exportar
        </Button>
      </div>
      {director && year && (
        <div className="soft-note life-actions">
          <span>
            <b>{year.name}</b> · {dateLabel(year.startsOn)} al{" "}
            {dateLabel(year.endsOn)}. Cerrar una gestión conserva los cobros;
            para dejar de cobrar se usa la baja del estudiante.
          </span>
          <Button
            variant="ghost"
            onClick={() =>
              life.setDialog({
                title: "Copiar aulas a esta gestión",
                subtitle:
                  "Copia horarios, materias y docentes. Los estudiantes se reinscriben por separado.",
                initial: { source: "" },
                fields: [
                  select(
                    "source",
                    "Copiar desde",
                    years
                      .filter((y) => y.id !== year.id)
                      .map((y) => ({ value: y.id, label: y.name })),
                  ),
                ],
                submit: (v) =>
                  rpc("copy_year_classrooms", {
                    p_source_year: v.source,
                    p_target_year: year.id,
                  }),
              })
            }
            disabled={year.status === "closed"}
          >
            Copiar aulas
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              life.setDialog({
                title:
                  year.status === "open" ? "Cerrar gestión" : "Reabrir gestión",
                initial: { reason: "" },
                fields: [input("reason", "Motivo", "textarea")],
                submit: (v) =>
                  rpc("set_academic_year_status", {
                    p_year_id: year.id,
                    p_closed: year.status === "open",
                    p_reason: v.reason,
                  }),
              })
            }
          >
            {year.status === "open" ? "Cerrar gestión" : "Reabrir gestión"}
          </Button>
        </div>
      )}
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Aula</th>
                <th>Estado</th>
                <th>Desde / hasta</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {records.map((h) => (
                <tr key={h.id}>
                  <td>{h.studentName}</td>
                  <td>{h.classroomName}</td>
                  <td>{enrollmentStates[h.status]}</td>
                  <td>
                    {dateLabel(h.startedOn)}
                    {h.endedOn && ` / ${dateLabel(h.endedOn)}`}
                  </td>
                  <td>{h.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!records.length && !life.loading && (
          <Empty title="No hay inscripciones en esta gestión" />
        )}
      </section>
      {life.dialog}
    </>
  );
}
function ReportCards({
  cards,
  yearId,
  studentId,
}: {
  cards: ReportCard[];
  yearId: string;
  studentId?: string;
}) {
  const selected = cards.filter(
    (c) =>
      !c.revokedAt &&
      c.content.yearId === yearId &&
      (!studentId || c.studentId === studentId),
  );
  const groups = [
    ...new Set(selected.map((c) => `${c.studentId}:${c.classroomId}`)),
  ];
  return (
    <div className="life-report-cards">
      {groups.map((key) => {
        const group = selected.filter(
            (c) => `${c.studentId}:${c.classroomId}` === key,
          ),
          first = group[0].content;
        return (
          <section className="panel printable-card" key={key}>
            {group.map(c=><ContentSeen key={c.id} kind="report_card" id={c.id}><span>{c.content.termName}</span></ContentSeen>)}
            <SectionTitle
              title={first.studentName}
              subtitle={`${first.schoolName} · ${first.classroomName} · Gestión ${first.year}`}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Materia</th>
                    {group.map((c) => (
                      <th key={c.id}>{c.content.termName}</th>
                    ))}
                    <th>Promedio publicado</th>
                  </tr>
                </thead>
                <tbody>
                  {annualSubjects(group).map((s, i) => (
                    <tr key={`${s.subject}-${i}`}>
                      <td>{s.subject}</td>
                      {group.map((c) => (
                        <td key={c.id}>
                          {(()=>{const line=c.content.subjects.find(l=>l.subject===s.subject);return <>{line?.score!=null?`${line.score} / ${line.maxScore||100}`:line?.qualitative?.length?'':"Exento / sin nota"}{line?.qualitative?.map((q,index)=><div key={index}><b>{q.title}:</b> {q.value||'Pendiente'}{q.comment&&<small> · {q.comment}</small>}</div>)}</>;})()}
                        </td>
                      ))}
                      <td>
                        <b>{s.score ?? "—"}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small>
              Escala de 0 a 100. Promedio ponderado de los periodos publicados;
              puede cambiar hasta el cierre de la gestión.
            </small>
          </section>
        );
      })}
      {!selected.length && (
        <section className="panel">
          <Empty
            title="Sin libretas publicadas"
            subtitle="Las notas se muestran cuando Dirección cierra el periodo."
          />
        </section>
      )}
    </div>
  );
}
export function Gradebook(p: PageProps & {onOpenSheet?:()=>void}) {
  const life = useLife(p),
    [yearId, setYearId] = useState(""),
    [termId, setTermId] = useState(""),
    [roomId, setRoomId] = useState(""),
    [tab, setTab] = useState(p.role === "guardian" ? "cards" : "register"),
    [marking, setMarking] = useState<Assessment | null>(null);
  const director = p.role === "director",
    guardian = p.role === "guardian",
    year = life.data.years.find((y) => y.id === yearId) || life.data.years[0],
    terms = life.data.terms.filter((t) => t.yearId === year?.id),
    term = terms.find((t) => t.id === termId) || terms[0];
  const rooms = p.store.data.classrooms.filter(
      (r) =>
        r.schoolId === p.school?.id &&
        r.academicYear === year?.year &&
        (director ||
          r.teacherIds.some((id) => p.identity.teacherIds.includes(id))),
    ),
    room = rooms.find((r) => r.id === roomId) || rooms[0];
  const assessments = life.data.assessments.filter(
    (a) => a.termId === term?.id && a.classroomId === room?.id,
  );
  const roster = life.data.enrollments
    .filter(
      (h) =>
        h.yearId === year?.id &&
        h.classroomId === room?.id &&
        h.startedOn <= (term?.endsOn || "") &&
        (!h.endedOn || h.endedOn >= (term?.startsOn || "")),
    )
    .filter(
      (h, i, list) => list.findIndex((x) => x.studentId === h.studentId) === i,
    );
  const termDialog = (t?: AcademicTerm) =>
    life.setDialog({
      title: t ? "Editar periodo" : "Nuevo periodo",
      initial: {
        name: t?.name || "",
        starts_on: t?.startsOn || year?.startsOn || "",
        ends_on: t?.endsOn || year?.endsOn || "",
        weight: String(t?.weight || 1),
      },
      fields: [
        input("name", "Nombre del periodo"),
        input("starts_on", "Inicio", "date"),
        input("ends_on", "Fin", "date"),
        {
          ...input("weight", "Peso en el promedio anual", "number"),
          min: 0.01,
          max: 1000,
        },
      ],
      submit: (v) =>
        rpc("save_academic_term", {
          p_term: { ...v, id: t?.id, year_id: year?.id },
        }),
    });
  const assessmentDialog = (a?: Assessment) => {
    if (!room || !term) return;
    const subjects = subjectOptions(p.store.data, room.id, p.identity, p.role),
      allowed = p.store.data.assignments.filter(
        (x) =>
          x.classroomId === room.id &&
          x.status !== "draft" &&
          canManageAssignment(p.store.data, p.identity, p.role, x),
      );
    life.setDialog({
      title: a ? "Editar evaluación" : "Nueva evaluación",
      subtitle:
        "La nota se normaliza a 100 y su peso se aplica dentro de la materia.",
      initial: {
        title: a?.title || "",
        class_subject_id: a?.classSubjectId || "",
        assignment_id: a?.assignmentId || "",
        assessment_date:
          a?.assessmentDate ||
          (today() >= term.startsOn && today() <= term.endsOn
            ? today()
            : term.startsOn),
        max_score: String(a?.maxScore || 100),
        weight: String(a?.weight || 1),
      },
      fields: [
        input("title", "Título"),
        {
          ...select(
            "class_subject_id",
            "Materia",
            subjects,
            room.subjectsEnabled,
          ),
          when: () => !a,
        },
        {
          ...select(
            "assignment_id",
            "Vincular tarea (opcional)",
            allowed.map((x) => ({
              value: x.id,
              label: `${x.title} · ${subjectName(p.store.data, x.classSubjectId)}`,
            })),
            false,
          ),
          when: () => !a,
        },
        input("assessment_date", "Fecha de evaluación", "date"),
        {
          ...input("max_score", "Puntuación máxima", "number"),
          min: 0.01,
          max: 10000,
        },
        {
          ...input("weight", "Peso dentro de la materia", "number"),
          min: 0.01,
          max: 1000,
        },
      ],
      submit: (v) =>
        rpc("save_assessment", {
          p_assessment: {
            ...v,
            id: a?.id,
            term_id: term.id,
            classroom_id: room.id,
          },
        }),
    });
  };
  return (
    <>
      <SectionTitle
        title="Evaluación y libretas"
        subtitle="Periodos, evaluaciones y promedios ponderados. Las familias consultan libretas publicadas."
        action={
          !guardian && (
            <div className="action-group">
              {director && (
                <Button
                  variant="secondary"
                  disabled={!year || year.status === "closed"}
                  onClick={() => termDialog()}
                >
                  Nuevo periodo
                </Button>
              )}
              <Button
                icon={Plus}
                disabled={!term || term.status === "closed" || !room}
                onClick={() => assessmentDialog()}
              >
                Nueva evaluación
              </Button>
            </div>
          )
        }
      />
      <Loading {...life} />
      <div className="toolbar">
        <Field label="Gestión" name="gradeYear">
          <select
            value={year?.id || ""}
            onChange={(e) => {
              setYearId(e.target.value);
              setTermId("");
              setRoomId("");
            }}
          >
            {life.data.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        {!guardian && (
          <>
            <Field label="Periodo" name="gradeTerm">
              <select
                value={term?.id || ""}
                onChange={(e) => setTermId(e.target.value)}
              >
                {terms.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name} · {t.status === "closed" ? "Publicado" : "Abierto"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Aula" name="gradeRoom">
              <select
                value={room?.id || ""}
                onChange={(e) => setRoomId(e.target.value)}
              >
                {rooms.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
      {!guardian && (
        <div className="life-tabs">
          <Button
            variant={tab === "register" ? "primary" : "ghost"}
            onClick={() => setTab("register")}
          >
            Registro de notas
          </Button>
          <Button
            variant={tab === "cards" ? "primary" : "ghost"}
            onClick={() => setTab("cards")}
          >
            Libretas publicadas
          </Button>
        </div>
      )}
      {tab === "cards" ? (
        <>
          <div className="life-actions no-print">
            <Button variant="secondary" onClick={() => window.print()}>
              Imprimir libretas / guardar PDF
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                download(
                  `libretas-${year?.year}.csv`,
                  schoolCsv([
                    ["Estudiante", "Aula", "Periodo", "Materia", "Nota / 100"],
                    ...life.data.cards
                      .filter(
                        (c) =>
                          !c.revokedAt &&
                          c.content.yearId === year?.id &&
                          (!guardian || c.studentId === p.student?.id),
                      )
                      .flatMap((c) =>
                        c.content.subjects.map((s) => [
                          c.content.studentName,
                          c.content.classroomName,
                          c.content.termName,
                          s.subject,
                          s.score ?? "Exento",
                        ]),
                      ),
                  ]),
                )
              }
            >
              Exportar CSV
            </Button>
          </div>
          <ReportCards
            cards={life.data.cards}
            yearId={year?.id || ""}
            studentId={guardian ? p.student?.id : undefined}
          />
        </>
      ) : (
        <>
          {term && (
            <div className="soft-note life-actions">
              <span>
                <b>{term.name}</b> · Peso anual {term.weight}.{" "}
                {term.status === "closed"
                  ? "Libretas publicadas."
                  : "Las notas todavía no son visibles para las familias."}
              </span>
              {director && (
                <>
                  <Button
                    variant="ghost"
                    disabled={term.status === "closed"}
                    onClick={() => termDialog(term)}
                  >
                    Editar periodo
                  </Button>
                  {term.status === "open" ? (
                    <Button
                      onClick={() =>
                        life.setDialog({
                          title: "Cerrar y publicar periodo",
                          subtitle:
                            "Verifica todas las aulas. Se exige cada nota o una exención con motivo. Al cerrar se publican las libretas para las familias.",
                          initial: { confirm: false },
                          fields: [
                            {
                              key: "confirm",
                              label:
                                "He revisado las evaluaciones de todas las aulas",
                              type: "checkbox",
                            },
                          ],
                          submit: (v) => {
                            if (!v.confirm)
                              throw new Error(
                                "Confirma la revisión antes de publicar.",
                              );
                            return rpc("close_academic_term", {
                              p_term_id: term.id,
                            });
                          },
                        })
                      }
                    >
                      Cerrar y publicar
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        life.setDialog({
                          title: "Reabrir periodo",
                          subtitle:
                            "Las libretas anteriores se retiran de la vista familiar hasta volver a publicar.",
                          initial: { reason: "" },
                          fields: [input("reason", "Motivo", "textarea")],
                          submit: (v) =>
                            rpc("reopen_academic_term", {
                              p_term_id: term.id,
                              p_reason: v.reason,
                            }),
                        })
                      }
                    >
                      Reabrir con motivo
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          <div className="card-grid">
            {assessments.map((a) => (
              <article className="entity-card" key={a.id}>
                <span className="category-label">
                  {subjectName(p.store.data, a.classSubjectId)}
                </span>
                <h3>{a.title}</h3>
                <p>
                  {dateLabel(a.assessmentDate)} · Máximo {a.maxScore} · Peso{" "}
                  {a.weight}
                </p>
                <div className="life-actions">
                  <Button
                    disabled={term?.status === "closed"}
                    onClick={() => a.gradingType==='qualitative'?p.onOpenSheet?.():setMarking(a)}
                  >
                    {a.gradingType==='qualitative'?'Calificar en planilla':'Calificar'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={term?.status === "closed"}
                    onClick={() => assessmentDialog(a)}
                  >
                    Editar
                  </Button>
                  {a.assignmentId && (
                    <Button
                      variant="secondary"
                      disabled={term?.status === "closed"}
                      onClick={() =>
                        life.action(
                          () =>
                            rpc("import_assignment_scores", {
                              p_assessment_id: a.id,
                            }),
                          "Notas revisadas copiadas desde la tarea.",
                        )
                      }
                    >
                      Traer notas de tarea
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!assessments.length && !life.loading && (
            <section className="panel">
              <Empty
                title={
                  term
                    ? "Aún no hay evaluaciones"
                    : "Configura los periodos de esta gestión"
                }
                subtitle="Dirección define los periodos; cada docente evalúa sus materias."
              />
            </section>
          )}
          {assessments.length > 0 && (
            <section className="panel table-panel">
              <SectionTitle
                title="Promedios provisionales"
                subtitle="Los faltantes se indican y no se convierten en cero."
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      {[
                        ...new Set(
                          assessments.map((a) => a.classSubjectId || ""),
                        ),
                      ].map((s) => (
                        <th key={s}>{subjectName(p.store.data, s)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((h) => (
                      <tr key={h.studentId}>
                        <td>{h.studentName}</td>
                        {[
                          ...new Set(
                            assessments.map((a) => a.classSubjectId || ""),
                          ),
                        ].map((s) => {
                          const value = weightedSubject(
                            assessments.filter(
                              (a) => (a.classSubjectId || "") === s,
                            ),
                            life.data.scores,
                            h.studentId,
                          );
                          return (
                            <td key={s}>
                              {value.score ?? "—"}
                              {value.missing > 0 && (
                                <small className="grade-missing">
                                  {value.missing} pendientes
                                </small>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      {life.dialog}
      {marking && (
        <ScoresDialog
          assessment={marking}
          roster={roster}
          workspace={life.data}
          close={() => setMarking(null)}
          done={async () => {
            await p.store.refresh();
            life.refresh();
          }}
        />
      )}
    </>
  );
}
function ScoresDialog({
  assessment,
  roster,
  workspace,
  close,
  done,
}: {
  assessment: Assessment;
  roster: SchoolWorkspace["enrollments"];
  workspace: SchoolWorkspace;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [values, setValues] = useState<
      Record<string, { score: string; exempt: boolean; comment: string }>
    >(() =>
      Object.fromEntries(
        roster.map((h) => {
          const s = workspace.scores.find(
            (x) =>
              x.assessmentId === assessment.id && x.studentId === h.studentId,
          );
          return [
            h.studentId,
            {
              score: s?.score === undefined ? "" : String(s.score),
              exempt: s?.exempt || false,
              comment: s?.comment || "",
            },
          ];
        }),
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await rpc("save_assessment_scores", {
        p_assessment_id: assessment.id,
        p_scores: Object.entries(values).map(([student_id, v]) => ({
          student_id,
          score: v.exempt || v.score === "" ? null : Number(v.score),
          exempt: v.exempt,
          comment: v.comment,
        })),
      });
      await done();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Calificar: ${assessment.title}`}
      subtitle={`Puntuación de 0 a ${assessment.maxScore}. Deja vacío si está pendiente.`}
      onClose={close}
      onSubmit={(e) => void submit(e)}
      busy={busy}
      error={error}
    >
      <div className="score-list">
        {roster.map((h) => (
          <section className="score-row" key={h.studentId}>
            <h3>{h.studentName}</h3>
            <div className="form-grid">
              <label className="field">
                <span>Nota de {h.studentName}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={assessment.maxScore}
                  disabled={values[h.studentId].exempt}
                  value={values[h.studentId].score}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [h.studentId]: {
                        ...v[h.studentId],
                        score: e.target.value,
                      },
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Exención</span>
                <input
                  type="checkbox"
                  checked={values[h.studentId].exempt}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [h.studentId]: {
                        ...v[h.studentId],
                        exempt: e.target.checked,
                      },
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Comentario o motivo de exención</span>
                <input
                  required={values[h.studentId].exempt}
                  minLength={values[h.studentId].exempt ? 5 : undefined}
                  maxLength={2000}
                  value={values[h.studentId].comment}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [h.studentId]: {
                        ...v[h.studentId],
                        comment: e.target.value,
                      },
                    }))
                  }
                />
              </label>
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
export function Onboarding(p: PageProps) {
  const [step, setStep] = useState(0),
    [kind, setKind] = useState<ImportKind>("students"),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [result, setResult] = useState<ImportResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [batch, setBatch] = useState(uid);
  const life = useLife(p),
    settings = p.store.data.operationSettings.find(
      (s) => s.schoolId === p.school?.id,
    ),
    rooms = p.store.data.classrooms.filter((r) => r.schoolId === p.school?.id),
    teachers = p.store.data.teachers.filter((t) => t.schoolId === p.school?.id);
  const settingsDialog = () =>
    life.setDialog({
      title: "Requisitos de inscripción",
      subtitle:
        "Solo madre y padre registrados tendrán acceso a sus hijos. El RUDE sigue siendo opcional.",
      initial: {
        family_policy: settings?.familyPolicy || "both",
        child_ci_required: settings?.childCiRequired !== false,
        require_materials: settings?.requireAnnualMaterials !== false,
      },
      fields: [
        select("family_policy", "Responsables obligatorios", [
          { value: "both", label: "Madre y padre" },
          { value: "mother", label: "Madre; padre opcional" },
          { value: "father", label: "Padre; madre opcional" },
        ]),
        {
          key: "child_ci_required",
          label: "Exigir CI del niño",
          type: "checkbox",
        },
        {
          key: "require_materials",
          label: "Exigir lista anual de materiales aprobada antes de inscribir",
          type: "checkbox",
        },
      ],
      submit: (v) =>
        rpc("save_admission_settings", {
          p_school_id: p.school?.id,
          p_family_policy: v.family_policy,
          p_child_ci_required: v.child_ci_required,
          p_require_materials: v.require_materials,
        }),
    });
  const preview = async (content: string) => {
    setBusy(true);
    setError("");
    setResult(null);
    setRows([]);
    try {
      const parsed = parseDirectoryCsv(content, kind);
      setRows(parsed);
      setBatch(uid());
      const value = await rpc<ImportResult>("import_school_directory", {
        p_school_id: p.school?.id,
        p_kind: kind,
        p_rows: parsed,
        p_commit: false,
      });
      setResult(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (busy || !result || result.committed) return;
    setBusy(true);
    setError("");
    try {
      const value = await rpc<ImportResult>("import_school_directory", {
        p_school_id: p.school?.id,
        p_kind: kind,
        p_rows: rows,
        p_commit: true,
        p_batch_id: batch,
        p_activation_quote: result.activationFee,
        p_license_quote: result.licenseFee,
      });
      setResult(value);
      await p.store.refresh();
      life.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const steps = [
    { name: "Identidad y requisitos", done: !!p.school?.name },
    { name: "Aulas y gestiones", done: rooms.length > 0 },
    { name: "Docentes y materias", done: teachers.length > 0 },
    { name: "Estudiantes y familias", done: p.students.length > 0 },
  ];
  return (
    <>
      <SectionTitle
        title="Prepara tu institución"
        subtitle="Avanza por pasos o importa un archivo de hasta 200 filas con validación previa."
      />
      <div className="setup-steps">
        {steps.map((s, i) => (
          <button
            key={s.name}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
          >
            <span>{s.done ? <CheckCircle2 size={18} /> : i + 1}</span>
            {s.name}
          </button>
        ))}
      </div>
      <section className="panel setup-step">
        <span className="category-label">Paso {step + 1} de 4</span>
        <h2>{steps[step].name}</h2>
        {step === 0 ? (
          <>
            <p>
              Revisa los datos de contacto, logo y requisitos para las familias.
            </p>
            <div className="life-actions">
              <Button
                variant="secondary"
                onClick={() => p.open("branding", p.school)}
              >
                Editar institución
              </Button>
              <Button onClick={settingsDialog}>Configurar requisitos</Button>
            </div>
            <p>
              Actual:{" "}
              {settings?.familyPolicy === "mother"
                ? "Madre obligatoria"
                : settings?.familyPolicy === "father"
                  ? "Padre obligatorio"
                  : "Madre y padre obligatorios"}{" "}
              · CI{" "}
              {settings?.childCiRequired === false ? "opcional" : "obligatorio"}
              .
            </p>
          </>
        ) : step === 1 ? (
          <>
            <p>
              Crea primero las aulas y sus paralelos; cada aula tiene gestión,
              capacidad, horarios y precio.
            </p>
            <div className="life-actions">
              <Button onClick={() => p.open("classroom")}>Crear aula</Button>
              <Button variant="secondary" onClick={() => p.go("years")}>
                Gestionar años e historial
              </Button>
            </div>
            <p>{rooms.length} aulas registradas.</p>
          </>
        ) : step === 2 ? (
          <>
            <p>
              Registra docentes, asígnalos a sus aulas y configura las materias
              cuando corresponda.
            </p>
            <div className="life-actions">
              <Button
                disabled={!rooms.length}
                onClick={() => p.open("teacher")}
              >
                Agregar docente
              </Button>
              <Button variant="secondary" onClick={() => p.go("subjects")}>
                Configurar materias
              </Button>
            </div>
            <p>{teachers.length} docentes registrados.</p>
          </>
        ) : (
          <>
            <p>
              Inscribe estudiantes individualmente o carga la plantilla. Las
              familias completan su ficha mediante el enlace de inscripción.
            </p>
            <Button disabled={!rooms.length} onClick={() => p.open("student")}>
              Inscribir estudiante
            </Button>
          </>
        )}
        <div className="life-actions">
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            disabled={step === 3}
            onClick={() => setStep(step + 1)}
            icon={ArrowRight}
          >
            Siguiente
          </Button>
        </div>
      </section>
      <section className="panel">
        <SectionTitle
          title="Importación masiva"
          subtitle="Guarda tu hoja de cálculo como CSV UTF-8. Las fechas usan AAAA-MM-DD y las aulas deben existir en la gestión indicada."
        />
        <div className="toolbar">
          <Field label="Tipo de importación" name="importKind">
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => {
                setKind(e.target.value as ImportKind);
                setRows([]);
                setResult(null);
                setError("");
              }}
            >
              <option value="students">Estudiantes con plan de pagos</option>
              <option value="teachers">Docentes</option>
            </select>
          </Field>
          <Button
            variant="secondary"
            icon={Download}
            onClick={() =>
              download(`plantilla-${kind}.csv`, importTemplate(kind))
            }
          >
            Descargar plantilla
          </Button>
          <label className="file-input-label">
            {busy ? "Validando…" : "Seleccionar CSV"}
            <input
              aria-label="Archivo CSV"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void file
                    .text()
                    .then(preview)
                    .catch((x) => setError(x.message));
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="soft-note">
          {kind === "students"
            ? "Cada fila crea una inscripción y su plan; no marca pagos como realizados. Si no indicas cuotas se usan 10 y vencimiento el día 10. La ficha de cuidados queda pendiente para la familia."
            : "Para varias aulas del mismo docente, separa los nombres con |, por ejemplo: Primero A|Primero B."}
        </div>
        <details>
          <summary>Ver columnas de la plantilla</summary>
          <dl className="import-columns">
            {importColumns[kind].map((key) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{importLabels[key]}</dd>
              </div>
            ))}
          </dl>
        </details>
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        {result && (
          <>
            <p role="status">
              {result.committed
                ? `${result.count} registros importados.`
                : `${result.rows.filter((r) => r.ok).length} de ${result.count} filas válidas. Todavía no se guardó ningún registro.`}
            </p>
            {kind === "students" && !result.committed && (
              <p>
                Activación MiCole: {money(result.activationFee)} por niño.
                Licencia por cuota: {money(result.licenseFee)}. Se utilizarán
                estas tarifas al confirmar.
              </p>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fila del CSV</th>
                    <th>Persona</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row + 1}</td>
                      <td>
                        {rows[r.row - 1]?.first_name || rows[r.row - 1]?.name}{" "}
                        {rows[r.row - 1]?.last_name}
                      </td>
                      <td>
                        {r.ok
                          ? result.committed
                            ? "Importado"
                            : "Válido"
                          : r.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              disabled={
                busy || result.committed || result.rows.some((r) => !r.ok)
              }
              onClick={() => void commit()}
            >
              {busy
                ? "Importando…"
                : result.committed
                  ? "Importación completada"
                  : "Confirmar e importar"}
            </Button>
          </>
        )}
      </section>
      {life.dialog}
    </>
  );
}
