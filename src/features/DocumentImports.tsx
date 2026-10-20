import { useEffect, useRef, useState } from "react";
import {
  FileUp,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Field, SectionTitle } from "../components/UI";
import type { PageProps } from "./Pages";
import type { AdmissionQuestion } from "../lib/admission";
import {
  analyzeDocuments,
  loadAdmissionTemplate,
  saveAdmissionTemplate,
  sourceFromFile,
} from "../lib/documentApi";
import {
  calendarImportError,
  type DocumentDraft,
  type DocumentKind,
  type ImportedEvent,
} from "../lib/documentImport";
import { rpc } from "../lib/repository";
import { publicDemo } from "../lib/demo-config";
import { liveMode } from "../lib/supabase";
import { uid } from "../lib/format";
import { today } from "../lib/billing";
import "../styles/document-import.css";
export function DocumentImports({ school, role, store, go, documentKind }: PageProps & {documentKind: DocumentKind}) {
  const kind = documentKind;
  const [year, setYear] = useState(Number(today().slice(0, 4))),
    [files, setFiles] = useState<File[]>([]),
    [draft, setDraft] = useState<DocumentDraft | null>(null),
    [selected, setSelected] = useState<boolean[]>([]),
    [revision, setRevision] = useState(0),
    [room, setRoom] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [empty, setEmpty] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [requestId, setRequestId] = useState(uid());
  const scope = useRef(0);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(
    () => () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
    [urls],
  );
  useEffect(() => {
    let active = true;
    scope.current++;
    setDraft(null);
    setSelected([]);
    setReviewed(false);
    setReady(false);
    setError("");
    setNotice("");
    setRoom("");
    if (!school?.id) return;
    void loadAdmissionTemplate(school.id, year)
      .then((t) => {
        if (!active) return;
        setRevision(t?.revision || 0);
        if (kind === "form" && t) {
          setDraft({
            kind: "form",
            year,
            title: t.title,
            fields: t.fields,
            instructions: t.instructions,
            warnings: [],
            sourceHash: "",
          });
          setSelected(t.fields.map(() => true));
        }
        setReady(true);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setReady(false);
        }
      });
    return () => {
      active = false;
    };
  }, [school?.id, year, kind]);
  if (role !== "director" || !school)
    return <p>Selecciona una institución con el rol de Dirección.</p>;
  const rows = kind === "form" ? draft?.fields || [] : draft?.events || [];
  const patchField = (i: number, value: Partial<AdmissionQuestion>) => {
    setReviewed(false);
    setDraft((d) =>
      d
        ? {
            ...d,
            fields: d.fields?.map((f, n) => (n === i ? { ...f, ...value } : f)),
          }
        : d,
    );
  };
  const patchEvent = (i: number, value: Partial<ImportedEvent>) => {
    setReviewed(false);
    setDraft((d) =>
      d
        ? {
            ...d,
            events: d.events?.map((e, n) => (n === i ? { ...e, ...value } : e)),
          }
        : d,
    );
  };
  const analyze = async () => {
    if (!empty) {
      setError(
        "Confirma que son plantillas o calendarios sin datos personales.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const current = scope.current;
    try {
      if (
        !files.length ||
        files.length > 3 ||
        files.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024
      )
        throw new Error("Selecciona de 1 a 3 archivos que sumen hasta 10 MB.");
      const sources = await Promise.all(files.map(sourceFromFile));
      const result = await analyzeDocuments(school.id, year, kind, sources);
      if (scope.current !== current) return;
      setDraft(result);
      setSelected((result.fields || result.events || []).map(() => true));
      setReviewed(false);
      setRequestId(uid());
    } catch (e) {
      if (scope.current === current)
        setError(e instanceof Error ? e.message : "No se pudo leer.");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!draft || !reviewed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "form") {
        await saveAdmissionTemplate(
          school.id,
          {
            title: draft.title,
            academicYear: year,
            fields: (draft.fields || [])
              .filter((_, i) => selected[i])
              .map((f) => ({
                ...f,
                options: f.options.map((o) => o.trim()).filter(Boolean),
              })),
            instructions: draft.instructions || "",
          },
          revision,
        );
        setRevision((n) => n + 1);
        setNotice(
          "Formulario publicado. Se usará en los nuevos enlaces y al completar la ficha de esta gestión.",
        );
      } else {
        const events = (draft.events || []).filter((_, i) => selected[i]);
        const invalid = calendarImportError(events, year);
        if (invalid) throw new Error(invalid);
        if (!liveMode) {
          for (const e of events)
            await store.save("events", {
              id: uid(),
              schoolId: school.id,
              classroomId: room,
              title: e.title,
              date: e.date,
              endDate: e.endDate || undefined,
              description: e.description,
              type: "event",
            });
          setNotice(`${events.length} actividades guardadas en esta demo.`);
        } else {
          const result = await rpc<{ added: number; skipped: number }>(
            "confirm_calendar_import",
            {
              p_id: requestId,
              p_school_id: school.id,
              p_year: year,
              p_classroom_id: room || null,
              p_source_hash: draft.sourceHash,
              p_events: events,
            },
          );
          setNotice(
            `${result.added} actividades publicadas; ${result.skipped} duplicadas omitidas.`,
          );
          await store.refresh();
        }
        setSelected(rows.map(() => false));
        setRequestId(uid());
      }
      setReviewed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle
        title={kind === "form" ? "Formulario de inscripción" : "Importar calendario anual"}
        subtitle={`${school?.name || "Institución"}${school?.siteName ? " · " + school.siteName : ""}. Los cambios se publican solo en esta sede y gestión.`}
      />
      <div className="document-import">
        <section className="panel import-controls">
          <div className="form-grid">
            <Field label="Gestión" name="importYear">
              <input
                id="importYear"
                aria-label="Gestión de importación"
                type="number"
                min="2020"
                max="2100"
                value={year}
                disabled={busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 2020 && n <= 2100) setYear(n);
                }}
              />
            </Field>
            {kind === "calendar" && (
              <Field label="Publicar para" name="importRoom">
                <select
                  id="importRoom"
                  value={room}
                  disabled={busy}
                  onChange={(e) => {
                    setRoom(e.target.value);
                    setReviewed(false);
                    setRequestId(uid());
                  }}
                >
                  <option value="">Toda la institución</option>
                  {store.data.classrooms
                    .filter(
                      (c) =>
                        c.schoolId === school.id &&
                        c.academicYear === year &&
                        c.active !== false,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
          <p>
            {kind === "form"
              ? "La ficha ya incluye los datos familiares, salud, emergencias y autorizados de recojo de las fotos. Puedes añadir las preguntas y condiciones propias de tu institución."
              : "Las fechas confirmadas aparecerán en la agenda de docentes y familias del aula o de toda la institución."}
          </p>
          <Field label="PDF o fotografías del documento" name="importFiles">
            <input
              id="importFiles"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              multiple
              disabled={busy}
              onChange={(e) => {
                const next = Array.from(e.target.files || []);
                if (
                  next.length > 3 ||
                  next.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024
                ) {
                  setError(
                    "Selecciona hasta 3 archivos, con un total de hasta 10 MB.",
                  );
                  return;
                }
                setFiles(next);
                setUrls(next.map((f) => URL.createObjectURL(f)));
                setReviewed(false);
                setEmpty(false);
                setError("");
              }}
            />
          </Field>
          <small className="muted">
            Hasta 3 archivos · 5 MB por archivo · 10 MB en total. Las fotos HEIC
            también se pueden interpretar.
          </small>
          <label className="import-check">
            <input
              type="checkbox"
              checked={empty}
              disabled={busy}
              onChange={(e) => setEmpty(e.target.checked)}
            />{" "}
            {publicDemo
              ? "Confirmo que usaré solo archivos ficticios. La demo muestra una interpretación de ejemplo y no envía el archivo a Gemini."
              : "Confirmo que subí plantillas vacías o calendarios sin datos personales. Se enviarán a Google Gemini para su lectura."}
          </label>
          <Button
            icon={FileUp}
            disabled={busy || !ready || !files.length || !empty}
            onClick={() => void analyze()}
          >
            {busy
              ? "Procesando…"
              : publicDemo
                ? "Probar interpretación simulada"
                : "Leer documento con Gemini"}
          </Button>
          {kind === "form" && (
            <Button
              variant="secondary"
              disabled={busy || !ready}
              icon={Plus}
              onClick={() => {
                const field: AdmissionQuestion = {
                  key: `question_${Date.now()}`,
                  label: "Nueva pregunta",
                  section: "Información adicional",
                  type: "text",
                  required: false,
                  options: [],
                };
                setDraft((d) => ({
                  ...d,
                  kind: "form",
                  year,
                  title: d?.title || "Formulario de inscripción",
                  warnings: d?.warnings || [],
                  instructions: d?.instructions || "",
                  sourceHash: d?.sourceHash || "",
                  fields: [...(d?.fields || []), field],
                }));
                setSelected((s) => [...s, true]);
                setReviewed(false);
              }}
            >
              Añadir pregunta manualmente
            </Button>
          )}
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="message success" role="status">
              {notice}
            </p>
          )}
          {notice && kind === "calendar" && (
            <Button variant="secondary" onClick={() => go("calendar")}>
              Ver agenda
            </Button>
          )}
        </section>
        {(files.length > 0 || draft) && (
          <div className="import-comparison">
            <section className="panel import-original">
              <h3>Documento original</h3>
              {files.length ? (
                files.map((f, i) => (
                  <details key={`${f.name}-${i}`} open={i === 0}>
                    <summary>{f.name}</summary>
                    {f.type === "application/pdf" ? (
                      <iframe src={urls[i]} title={`Original ${f.name}`} />
                    ) : !/^image\/hei/.test(f.type) &&
                      !/\.hei[cf]$/i.test(f.name) ? (
                      <img
                        src={urls[i]}
                        alt={`Página del documento ${i + 1}`}
                      />
                    ) : (
                      <p>
                        El navegador puede no mostrar HEIC. Ábrelo para
                        comparar.
                      </p>
                    )}
                    <a href={urls[i]} target="_blank" rel="noopener noreferrer">
                      Abrir original
                    </a>
                  </details>
                ))
              ) : (
                <p className="muted">
                  Selecciona el documento para compararlo, o revisa las
                  preguntas guardadas.
                </p>
              )}
            </section>
            <section className="panel import-review">
              <h3>Revisar antes de publicar</h3>
              {!draft ? (
                <p>
                  La lectura aparecerá aquí. Todavía no se agregó nada al
                  sistema.
                </p>
              ) : (
                <>
                  <Field label="Título" name="importTitle">
                    <input
                      id="importTitle"
                      value={draft.title}
                      maxLength={160}
                      disabled={busy}
                      onChange={(e) => {
                        setDraft({ ...draft, title: e.target.value });
                        setReviewed(false);
                      }}
                    />
                  </Field>
                  {draft.warnings.map((w, i) => (
                    <p className="message warn" key={i}>
                      {w}
                    </p>
                  ))}
                  {!rows.length && (
                    <p>
                      No se detectaron{" "}
                      {kind === "form"
                        ? "preguntas adicionales. Los campos básicos ya están incluidos en la ficha"
                        : "actividades con fecha"}
                      . Puedes revisar el documento o cargar otra página.
                    </p>
                  )}
                  {rows.map((_, i) =>
                    kind === "form" ? (
                      <article
                        className="import-item"
                        key={draft.fields![i].key}
                      >
                        <label className="import-check">
                          <input
                            type="checkbox"
                            checked={!!selected[i]}
                            disabled={busy}
                            onChange={(e) => {
                              setSelected((s) =>
                                s.map((v, n) =>
                                  n === i ? e.target.checked : v,
                                ),
                              );
                              setReviewed(false);
                            }}
                          />{" "}
                          Incluir pregunta {i + 1}
                        </label>
                        <Field label="Pregunta" name={`questionLabel${i}`}>
                          <input
                            id={`questionLabel${i}`}
                            value={draft.fields![i].label}
                            disabled={busy}
                            maxLength={200}
                            onChange={(e) =>
                              patchField(i, { label: e.target.value })
                            }
                          />
                        </Field>
                        <div className="form-grid">
                          <Field label="Sección" name={`questionSection${i}`}>
                            <input
                              id={`questionSection${i}`}
                              value={draft.fields![i].section}
                              disabled={busy}
                              maxLength={100}
                              onChange={(e) =>
                                patchField(i, { section: e.target.value })
                              }
                            />
                          </Field>
                          <Field label="Tipo" name={`questionType${i}`}>
                            <select
                              id={`questionType${i}`}
                              value={draft.fields![i].type}
                              disabled={busy}
                              onChange={(e) =>
                                patchField(i, {
                                  type: e.target
                                    .value as AdmissionQuestion["type"],
                                })
                              }
                            >
                              {[
                                ["text", "Texto"],
                                ["textarea", "Texto largo"],
                                ["tel", "Teléfono"],
                                ["date", "Fecha"],
                                ["select", "Selección"],
                              ].map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        {draft.fields![i].type === "select" && (
                          <Field
                            label="Opciones (una por línea)"
                            name={`questionOptions${i}`}
                          >
                            <textarea
                              id={`questionOptions${i}`}
                              value={draft.fields![i].options.join("\n")}
                              disabled={busy}
                              onChange={(e) =>
                                patchField(i, {
                                  options: e.target.value.split("\n"),
                                })
                              }
                            />
                          </Field>
                        )}
                        <label className="import-check">
                          <input
                            type="checkbox"
                            checked={draft.fields![i].required}
                            disabled={busy}
                            onChange={(e) =>
                              patchField(i, { required: e.target.checked })
                            }
                          />{" "}
                          Respuesta obligatoria
                        </label>
                        {draft.fields![i].source && (
                          <small className="import-source">
                            Detectado: {draft.fields![i].source}
                          </small>
                        )}
                      </article>
                    ) : (
                      <article className="import-item" key={i}>
                        <label className="import-check">
                          <input
                            type="checkbox"
                            checked={!!selected[i]}
                            disabled={busy}
                            onChange={(e) => {
                              setSelected((s) =>
                                s.map((v, n) =>
                                  n === i ? e.target.checked : v,
                                ),
                              );
                              setReviewed(false);
                            }}
                          />{" "}
                          Publicar actividad {i + 1}
                        </label>
                        <Field label="Actividad" name={`eventTitle${i}`}>
                          <input
                            id={`eventTitle${i}`}
                            value={draft.events![i].title}
                            disabled={busy}
                            maxLength={200}
                            onChange={(e) =>
                              patchEvent(i, { title: e.target.value })
                            }
                          />
                        </Field>
                        <div className="form-grid">
                          <Field label="Fecha inicial" name={`eventDate${i}`}>
                            <input
                              id={`eventDate${i}`}
                              type="date"
                              value={draft.events![i].date}
                              disabled={busy}
                              onChange={(e) =>
                                patchEvent(i, { date: e.target.value })
                              }
                            />
                          </Field>
                          <Field
                            label="Fecha final (opcional)"
                            name={`eventEnd${i}`}
                          >
                            <input
                              id={`eventEnd${i}`}
                              type="date"
                              value={draft.events![i].endDate}
                              disabled={busy}
                              onChange={(e) =>
                                patchEvent(i, { endDate: e.target.value })
                              }
                            />
                          </Field>
                        </div>
                        <Field
                          label="Descripción"
                          name={`eventDescription${i}`}
                        >
                          <textarea
                            id={`eventDescription${i}`}
                            value={draft.events![i].description}
                            disabled={busy}
                            maxLength={3000}
                            onChange={(e) =>
                              patchEvent(i, { description: e.target.value })
                            }
                          />
                        </Field>
                        <small className="import-source">
                          Detectado: {draft.events![i].source}
                        </small>
                      </article>
                    ),
                  )}
                  {kind === "form" && (
                    <Field
                      label="Condiciones e indicaciones de la institución"
                      name="importInstructions"
                    >
                      <textarea
                        id="importInstructions"
                        rows={6}
                        value={draft.instructions || ""}
                        maxLength={12000}
                        disabled={busy}
                        onChange={(e) => {
                          setDraft({ ...draft, instructions: e.target.value });
                          setReviewed(false);
                        }}
                      />
                    </Field>
                  )}
                  {kind === "form" && (
                    <p className="muted">
                      Las condiciones son texto informativo. Publicarlas no
                      modifica cuotas, multas ni autorizaciones.
                    </p>
                  )}
                  <label className="import-check">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      disabled={busy}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />{" "}
                    Comparé el contenido con el original y revisé las preguntas
                    o fechas seleccionadas.
                  </label>
                  <Button
                    disabled={
                      busy ||
                      !ready ||
                      !reviewed ||
                      (kind === "calendar" && !selected.some(Boolean))
                    }
                    onClick={() => void save()}
                  >
                    {busy
                      ? "Guardando…"
                      : kind === "form"
                        ? "Publicar formulario de esta gestión"
                        : "Confirmar y publicar actividades"}
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    disabled={busy}
                    onClick={() => {
                      setDraft(null);
                      setSelected([]);
                      setReviewed(false);
                    }}
                  >
                    Descartar esta revisión
                  </Button>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
