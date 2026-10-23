import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Button, Empty, Field, Modal, SectionTitle } from "../components/UI";
import type { PageProps } from "./Pages";
import { Gradebook as PeriodsAndCards } from "./SchoolLife";
import { subjectOptions } from "../lib/learning";
import { useGradeSheet } from "../lib/useGradeSheet";
import { rpc } from "../lib/repository";
import { today } from "../lib/billing";
import {
  validateGradeMutation,
  gradeDisplay,
  gradeMethods,
  scoreInput,
  totalLabel,
  type GradeColumn,
  type GradeValue,
  type GradeSheetData,
} from "../lib/gradeSheet";
import "../styles/grade-sheet.css";
export function Gradebook(p: PageProps) {
  const params = new URLSearchParams(useLocation().search);
  const [view, setView] = useState("sheet"),
    [roomId, setRoomId] = useState(params.get("classroom")||""),
    [subjectId, setSubjectId] = useState(params.get("subject")||""),
    [termId, setTermId] = useState(""),
    [dialog, setDialog] = useState<"column" | "settings" | null>(null),
    [editing, setEditing] = useState<GradeColumn | null>(null),
    [kind, setKind] = useState("numeric"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const family = p.role === "guardian";
  const rooms = p.store.data.classrooms.filter(
    (r) =>
      r.schoolId === p.school?.id &&
      (family
        ? r.id === p.student?.classroomId
        : p.role === "director" ||
          r.teacherIds.some((id) => p.identity.teacherIds.includes(id))),
  );
  const room = rooms.find((r) => r.id === roomId) || rooms[0];
  const subjects = room
    ? subjectOptions(p.store.data, room.id, p.identity, p.role, true)
    : [];
  const subject =
    subjects.find((s) => s.value === subjectId)?.value ||
    (room?.subjectsEnabled ? subjects[0]?.value || "" : "");
  const ws = useGradeSheet(
      room?.id || "",
      subject,
      termId,
      family ? p.student?.id : undefined,
      p.school?.id,
    ),
    data = ws.data,
    term = data?.terms.find((t) => t.id === data.termId),
    closed = term?.status === "closed";
  const write = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      validateGradeMutation(name,args);
      await rpc(name, args);
      setDialog(null);
      setEditing(null);
      ws.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const chooseColumn = (column?: GradeColumn) => {
    setEditing(column || null);
    setKind(column?.grading_type || "numeric");
    setError("");
    setDialog("column");
  };
  return (
    <section className="grade-sheet-page">
      <SectionTitle
        title="Evaluación y libretas"
        subtitle="Una fila por estudiante y una columna por evaluación. Los datos se actualizan sin reiniciar la planilla."
      />
      <div className="grade-sheet-tabs">
        <Button
          variant={view === "sheet" ? "primary" : "secondary"}
          onClick={() => setView("sheet")}
        >
          Planilla de notas
        </Button>
        <Button
          variant={view === "cards" ? "primary" : "secondary"}
          onClick={() => setView("cards")}
        >
          Periodos y libretas
        </Button>
      </div>
      {view === "cards" ? (
        <PeriodsAndCards {...p} onOpenSheet={() => setView("sheet")} />
      ) : (
        <>
          <div className="grade-sheet-filters">
            <Field label="Aula" name="sheetRoom">
              <select
                value={room?.id || ""}
                disabled={family}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  setSubjectId("");
                  setTermId("");
                }}
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.academicYear}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Materia" name="sheetSubject">
              <select
                value={subject}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setTermId("");
                }}
              >
                {!room?.subjectsEnabled && (
                  <option value="">Desarrollo integral</option>
                )}
                {subjects.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Periodo" name="sheetTerm">
              <select
                value={data?.termId || ""}
                onChange={(e) => setTermId(e.target.value)}
              >
                {!data?.terms.length && <option value="">Sin periodos</option>}
                {data?.terms.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name} · {t.status === "closed" ? "Cerrado" : "Abierto"}
                  </option>
                ))}
              </select>
            </Field>
            {data?.canManage && (
              <Button
                disabled={!term || closed || busy}
                onClick={() => chooseColumn()}
              >
                Añadir columna
              </Button>
            )}
            {data?.canConfigure && (
              <Button
                variant="secondary"
                onClick={() => {
                  setError("");
                  setDialog("settings");
                }}
              >
                Reglas de notas
              </Button>
            )}
          </div>
          {(ws.error || error) && (
            <div role="alert" className="message error">
              {ws.error || error}
              <Button variant="ghost" onClick={ws.refresh}>
                Reintentar
              </Button>
            </div>
          )}
          {ws.loading && !data ? (
            <p role="status">Cargando planilla…</p>
          ) : !room ? (
            <Empty
              title="Sin aulas disponibles"
              subtitle="Selecciona un aula asignada para consultar sus notas."
            />
          ) : data && !term ? (
            <Empty
              title="Primero configura un periodo"
              subtitle="Dirección puede crear parciales, bimestres o trimestres desde Periodos y libretas."
            />
          ) : (
            data && (
              <>
                <div className="grade-sheet-summary">
                  <span>
                    {data.roster.length} estudiantes · {data.assessments.length}{" "}
                    columnas
                  </span>
                  <span>
                    {closed
                      ? "Periodo cerrado · Solo lectura"
                      : data.canManage
                        ? `Hasta ${data.settings.maxCorrections} correcciones por nota después del primer guardado`
                        : "Consulta de notas · Solo lectura"}
                  </span>
                  <Field label="Cálculo de notas numéricas" name="sheetMethod">
                    <select
                      value={data.method}
                      disabled={!data.canManage || closed || busy}
                      onChange={(e) =>
                        void write("save_gradebook_rule", {
                          p_term_id: data.termId,
                          p_classroom_id: room.id,
                          p_subject_id: subject || null,
                          p_method: e.target.value,
                        })
                      }
                    >
                      {Object.entries(gradeMethods).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <input
                    className="grade-sheet-search"
                    aria-label="Buscar estudiante en la planilla"
                    placeholder="Buscar estudiante…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <SheetTable
                  key={ws.key}
                  data={data}
                  search={search}
                  closed={closed}
                  refresh={ws.refresh}
                  editColumn={chooseColumn}
                />
                <p className="grade-sheet-hint">
                  {data.canManage
                    ? "Las notas se guardan al salir de la casilla o pulsar Enter. "
                    : ""}
                  Las casillas vacías quedan pendientes. Las etiquetas
                  cualitativas se muestran por separado y no se convierten en
                  números.
                </p>
              </>
            )
          )}
        </>
      )}
      {dialog && data && (
        <Modal
          title={
            dialog === "settings"
              ? "Reglas de notas de la institución"
              : editing
                ? "Editar columna"
                : "Añadir columna de evaluación"
          }
          onClose={() => !busy && setDialog(null)}
          busy={busy}
          error={error}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (dialog === "settings") {
              void write("save_gradebook_settings", {
                p_school_id: p.school?.id,
                p_limit: Number(f.get("limit")),
                p_labels: String(f.get("labels"))
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              return;
            }
            void write("save_assessment", {
              p_assessment: {
                id: editing?.id,
                term_id: data.termId,
                classroom_id: room?.id,
                class_subject_id: subject || null,
                assignment_id: editing?.assignment_id || null,
                title: f.get("title"),
                assessment_date: f.get("date"),
                max_score: kind === "qualitative" ? 100 : Number(f.get("max")),
                weight: Number(f.get("weight")),
                grading_type: kind,
                qualitative_options:
                  kind === "qualitative"
                    ? String(f.get("options"))
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [],
              },
            });
          }}
        >
          {dialog === "settings" ? (
            <>
              <Field label="Correcciones permitidas por nota" name="limit">
                <input
                  type="number"
                  name="limit"
                  min={0}
                  max={100}
                  required
                  defaultValue={data.settings.maxCorrections}
                />
              </Field>
              <Field
                label="Etiquetas cualitativas (una por línea)"
                name="labels"
              >
                <textarea
                  name="labels"
                  required
                  rows={5}
                  defaultValue={data.settings.labels.join("\n")}
                />
              </Field>
              <p>
                El límite se aplica a cada nota guardada y cada cambio queda en
                el historial. Las nuevas etiquetas se usan al crear columnas;
                las columnas con notas conservan su escala.
              </p>
            </>
          ) : (
            <>
              <Field label="Nombre de la evaluación" name="title">
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={editing?.title}
                />
              </Field>
              <div className="form-grid">
                <Field label="Tipo de calificación" name="type">
                  <select
                    name="type"
                    value={kind}
                    disabled={
                      !!editing &&
                      data.scores.some((s) => s.assessment_id === editing.id)
                    }
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="numeric">Numérica</option>
                    <option value="qualitative">Cualitativa</option>
                  </select>
                </Field>
                <Field label="Fecha de evaluación" name="date">
                  <input
                    name="date"
                    type="date"
                    required
                    min={term?.starts_on}
                    max={term?.ends_on}
                    defaultValue={
                      editing?.assessment_date ||
                      (term &&
                      today() >= term.starts_on &&
                      today() <= term.ends_on
                        ? today()
                        : term?.starts_on)
                    }
                  />
                </Field>
              </div>
              {kind === "qualitative" ? (
                <Field label="Opciones (una por línea)" name="options">
                  <textarea
                    name="options"
                    rows={4}
                    required
                    defaultValue={(editing?.qualitative_options.length
                      ? editing.qualitative_options
                      : data.settings.labels
                    ).join("\n")}
                  />
                </Field>
              ) : (
                <Field label="Puntuación máxima" name="max">
                  <input
                    name="max"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10000"
                    required
                    defaultValue={editing?.max_score || 100}
                  />
                </Field>
              )}
              <Field label="Peso en el promedio ponderado" name="weight">
                <input
                  name="weight"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1000"
                  required
                  defaultValue={editing?.weight || 1}
                />
              </Field>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
function SheetTable({
  data,
  search,
  closed,
  refresh,
  editColumn,
}: {
  data: GradeSheetData;
  search: string;
  closed: boolean;
  refresh: () => void;
  editColumn: (column: GradeColumn) => void;
}) {
  const scoreIndex=new Map(data.scores.map(value=>[`${value.assessment_id}:${value.student_id}`,value]));
  return (
    <div
      className="grade-sheet-scroll"
      role="region"
      aria-label="Planilla de calificaciones"
      tabIndex={0}
    >
      <table className="grade-sheet-table">
        <thead>
          <tr>
            <th className="grade-sheet-name">Estudiante</th>
            {data.assessments.map((a) => (
              <th key={a.id}>
                <span>{a.title}</span>
                <small>
                  {a.grading_type === "qualitative"
                    ? "Cualitativa"
                    : `Máx. ${a.max_score} · Peso ${a.weight}`}
                </small>
                {data.canManage && !closed && (
                  <button
                    type="button"
                    onClick={() => editColumn(a)}
                    aria-label={`Editar columna ${a.title}`}
                  >
                    Editar columna
                  </button>
                )}
              </th>
            ))}
            <th>
              Resultado<small>{gradeMethods[data.method]}</small>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.roster
            .filter((s) =>
              s.studentName
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            )
            .map((student) => (
              <tr key={student.studentId}>
                <th className="grade-sheet-name" scope="row">
                  {student.studentName}
                </th>
                {data.assessments.map((column) => (
                  <td key={column.id}>
                    <GradeCell
                      column={column}
                      student={student}
                      record={scoreIndex.get(`${column.id}:${student.studentId}`)}
                      limit={data.settings.maxCorrections}
                      readonly={!data.canManage || closed}
                      refresh={refresh}
                    />
                  </td>
                ))}
                <td className="grade-sheet-result">
                  <strong>{totalLabel(student.total)}</strong>
                  <small>
                    {student.total.missing
                      ? `${student.total.missing} pendientes`
                      : "Completo"}
                  </small>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {!data.assessments.length && (
        <p className="grade-sheet-hint">
          Añade una columna para comenzar a evaluar.
        </p>
      )}
    </div>
  );
}
function GradeCell({
  column,
  student,
  record,
  limit,
  readonly,
  refresh,
}: {
  column: GradeColumn;
  student: { studentId: string; studentName: string };
  record?: GradeValue;
  limit: number;
  readonly: boolean;
  refresh: () => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(),
    [state, setState] = useState(""),
    [note, setNote] = useState(false),
    [error, setError] = useState(""),
    pending = useRef(false),
    saved = useRef<{ revision: number; value: string } | undefined>(undefined),
    editingRevision = useRef<number | undefined>(undefined);
  const locked = readonly || state === "Guardando…" || (!!record && record.corrections >= limit),
    base = gradeDisplay(record),
    text = draft ?? base;
  useEffect(() => {
    if (saved.current && record && record.revision >= saved.current.revision) {
      const value = saved.current.value;
      setDraft((old) => (old === value ? undefined : old));
      saved.current = undefined;
    }
  }, [record]);
  async function save(
    value = text,
    extra?: { comment: string; exempt: boolean },
  ) {
    if (pending.current || locked) return;
    if (!extra && value === base) {
      setDraft(undefined);
      return;
    }
    pending.current = true;
    setState("Guardando…");
    setError("");
    try {
      const parsed = scoreInput(column, value);
      const changed = await rpc<number>("save_assessment_scores", {
        p_assessment_id: column.id,
        p_scores: [
          {
            student_id: student.studentId,
            ...parsed,
            exempt: extra?.exempt ?? false,
            comment: extra?.comment ?? record?.comment ?? "",
            revision: editingRevision.current ?? record?.revision ?? 0,
          },
        ],
      });
      if (changed)
        saved.current = { revision: (record?.revision || 0) + 1, value };
      else setDraft(undefined);
      setState("Guardado");
      setNote(false);
      refresh();
    } catch (e) {
      setState("");
      setError((e as Error).message);
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="grade-sheet-cell">
      {readonly || record?.exempt ? (
        <span>{base || "Pendiente"}</span>
      ) : column.grading_type === "qualitative" ? (
        <select
          aria-label={`${column.title}: ${student.studentName}`}
          value={text}
          disabled={locked}
          onFocus={() => {
            editingRevision.current = record?.revision || 0;
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            void save(e.target.value);
          }}
        >
          <option value="">Pendiente</option>
          {column.qualitative_options.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={`${column.title}: ${student.studentName}`}
          type="number"
          inputMode="decimal"
          min={0}
          max={column.max_score}
          step="0.01"
          value={text}
          disabled={locked}
          onFocus={() => {
            editingRevision.current = record?.revision || 0;
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setState("Sin guardar");
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
      {!readonly && (
        <div className="grade-sheet-cell-meta">
          <small aria-live="polite">
            {error
              ? "Revisar"
              : state || `${record?.corrections || 0}/${limit} correcciones`}
          </small>
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              editingRevision.current = record?.revision || 0;
              setError("");
              setNote(true);
            }}
            aria-label={`Observación de ${student.studentName} en ${column.title}`}
          >
            ···
          </button>
        </div>
      )}
      {record?.comment && (
        <small title={record.comment}>{record.comment}</small>
      )}
      {error && (
        <small role="alert" className="grade-sheet-error">
          {error}
        </small>
      )}
      {note && (
        <Modal
          title={`Observación: ${student.studentName}`}
          onClose={() => setNote(false)}
          error={error}
          busy={state === "Guardando…"}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void save(record?.exempt ? "" : text, {
              comment: String(form.get("comment") || ""),
              exempt: form.get("exempt") === "on",
            });
          }}
        >
          <Field label="Comentario o motivo" name="comment">
            <textarea
              name="comment"
              maxLength={2000}
              defaultValue={record?.comment || ""}
            />
          </Field>
          <label>
            <input
              name="exempt"
              type="checkbox"
              defaultChecked={record?.exempt}
            />{" "}
            Exento (requiere motivo de al menos 5 caracteres)
          </label>
        </Modal>
      )}
    </div>
  );
}
