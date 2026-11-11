import { useState } from "react";
import { Button, Field, Modal, SectionTitle } from "../components/UI";
import { useAcademicPlanning } from "../lib/useAcademicPlanning";
import { rpc } from "../lib/repository";
import { today } from "../lib/billing";
import { dateLabel } from "../lib/format";
import {
  fetchBoliviaHolidays,
  type BoliviaHoliday,
  type SchoolCalendarDay,
  type SchoolCalendarWorkspace,
} from "../lib/schoolCalendar";
import type { Role } from "../lib/types";
const kindNames = {
  holiday: "Feriado",
  suspension: "Suspensión de clases",
  school_day: "Sí hay clases (excepción)",
};

export function SchoolCalendar({
  schoolId,
  role,
}: {
  schoolId?: string;
  role: Role;
}) {
  const [expanded, setExpanded] = useState(false);
  const [year, setYear] = useState(today().slice(0, 4));
  const ws = useAcademicPlanning<SchoolCalendarWorkspace>(
    "school_calendar_workspace",
    { p_school_id: schoolId, p_year: Number(year) },
    expanded ? schoolId : undefined,
  );
  const data = ws.data && Array.isArray(ws.data.days) ? ws.data : undefined;
  const manager = ["director", "scheduler"].includes(role) && data?.canManage;
  const [edit, setEdit] = useState<Partial<SchoolCalendarDay> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [proposed, setProposed] = useState<BoliviaHoliday[] | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false);
  const [announce, setAnnounce] = useState<SchoolCalendarDay | null>(null);
  async function act(method: string, values: object, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await rpc(method, values);
      setEdit(null);
      setProposed(null);
      setAnnounce(null);
      ws.refresh();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!schoolId) return null;
  return (
    <section
      className="school-calendar panel"
      aria-label="Calendario escolar y feriados"
    >
      <SectionTitle
        title="Calendario escolar y feriados"
        subtitle="Bolivia. Los días sin clases no generan faltas; importar o guardar el calendario no envía comunicados automáticamente."
      />
      <Button
        variant="secondary"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Ocultar calendario" : "Abrir calendario escolar"}
      </Button>
      {expanded && (
        <>
          <div className="attendance-toolbar">
            <Field label="Gestión del calendario" name="calendarYear">
              <input
                type="number"
                min="2020"
                max="2100"
                value={year}
                disabled={busy}
                onChange={(e) => setYear(e.target.value)}
              />
            </Field>
            <Button variant="secondary" disabled={busy} onClick={ws.refresh}>
              Actualizar calendario
            </Button>
            {manager && (
              <>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setEdit({
                      date:
                        year === today().slice(0, 4)
                          ? today()
                          : `${year}-01-01`,
                      kind: "holiday",
                      active: true,
                      label: "",
                      sourceUrl: "",
                    });
                  }}
                >
                  Agregar día al calendario
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    setReviewed(false);
                    void fetchBoliviaHolidays(Number(year))
                      .then((rows) => {
                        setProposed(rows);
                        setSelected(rows.map((row) => row.date));
                      })
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Consultar feriados nacionales de Bolivia
                </Button>
              </>
            )}
          </div>
          {(error || ws.error) && (
            <p className="message error" role="alert">
              {error || ws.error}
            </p>
          )}
          {notice && (
            <p className="message success" role="status">
              {notice}
            </p>
          )}
          {!data && !ws.error && <p role="status">Consultando calendario…</p>}
          {data && !data.days.length && (
            <p>
              No hay días especiales guardados en esta gestión. Se usa el
              horario habitual de cada aula.
            </p>
          )}
          <div className="calendar-day-list">
            {data?.days.map((day) => (
              <article
                key={day.id}
                className={`calendar-day ${day.active ? "" : "calendar-inactive"}`}
              >
                <div>
                  <strong>
                    {dateLabel(day.date)} · {day.label}
                  </strong>
                  <p>
                    {kindNames[day.kind]}
                    {!day.active && " · Desactivado"}
                    {day.source === "national" && " · Nacional (Bolivia)"}
                  </p>
                  {day.sourceUrl && (
                    <a href={day.sourceUrl} target="_blank" rel="noreferrer">
                      Consultar fuente
                    </a>
                  )}
                </div>
                {manager && (
                  <div className="calendar-day-actions">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setEdit(day);
                      }}
                    >
                      Editar día
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={
                        busy ||
                        !data.canPublish ||
                        !day.active ||
                        day.announcedRevision === day.revision
                      }
                      onClick={() => {
                        setError("");
                        setAnnounce(day);
                      }}
                    >
                      {day.announcedRevision === day.revision
                        ? "Comunicado publicado"
                        : "Preparar comunicado"}
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {manager && !data.canPublish && (
            <p className="attendance-help">
              Dirección debe habilitar tu permiso de publicación para enviar
              comunicados. Puedes mantener el calendario sin enviar avisos.
            </p>
          )}
          {edit && ["director", "scheduler"].includes(role) && (
            <Modal
              title="Día del calendario escolar"
              busy={busy}
              error={error}
              onClose={() => setEdit(null)}
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void act(
                  "save_school_calendar_day",
                  {
                    p_school_id: schoolId,
                    p_values: {
                      date: form.get("date"),
                      label: form.get("label"),
                      kind: form.get("kind"),
                      active: form.has("active"),
                      sourceUrl: form.get("sourceUrl"),
                      revision: edit.revision,
                    },
                  },
                  "Calendario actualizado. No se enviaron comunicados.",
                );
              }}
            >
              <Field label="Fecha" name="date">
                <input
                  type="date"
                  name="date"
                  required
                  readOnly={!!edit.id}
                  defaultValue={edit.date}
                />
              </Field>
              <Field label="Motivo o nombre del día" name="label">
                <input
                  name="label"
                  minLength={2}
                  maxLength={160}
                  required
                  defaultValue={edit.label}
                />
              </Field>
              <Field label="Actividad del día" name="kind">
                <select name="kind" defaultValue={edit.kind}>
                  {Object.entries(kindNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Fuente o comunicado oficial (opcional)"
                name="sourceUrl"
              >
                <input
                  name="sourceUrl"
                  type="url"
                  maxLength={1000}
                  placeholder="https://…"
                  defaultValue={edit.sourceUrl}
                />
              </Field>
              <label className="check-row">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={edit.active}
                />{" "}
                Aplicar este día al calendario
              </label>
              <p>
                Las excepciones de «Sí hay clases» permiten registrar una
                jornada especial aunque caiga en un día sin horario habitual. Se
                conserva el historial de los cambios.
              </p>
            </Modal>
          )}
          {proposed && ["director", "scheduler"].includes(role) && (
            <Modal
              title="Revisar feriados nacionales de Bolivia"
              busy={busy}
              error={error}
              submitLabel="Aplicar feriados revisados"
              submitDisabled={!reviewed || !selected.length}
              onClose={() => setProposed(null)}
              onSubmit={(e) => {
                e.preventDefault();
                if (!reviewed) return;
                void act(
                  "import_bolivia_holidays",
                  {
                    p_school_id: schoolId,
                    p_year: Number(year),
                    p_days: proposed.filter((row) =>
                      selected.includes(row.date),
                    ),
                  },
                  "Feriados aplicados. Se conservaron los ajustes manuales de la institución y no se enviaron comunicados.",
                );
              }}
            >
              <p>
                Revisa las fechas y sus traslados antes de aplicarlas. Los
                feriados departamentales, vacaciones o suspensiones de tu
                institución se agregan manualmente.
              </p>
              {Number(year) === 2026 && (
                <p>
                  La propuesta 2026 se contrastó con el calendario oficial del
                  Ministerio de Trabajo, incluidos sus traslados y días
                  adicionales.
                </p>
              )}
              {proposed.map((row) => (
                <label className="check-row" key={row.date}>
                  <input
                    type="checkbox"
                    checked={selected.includes(row.date)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, row.date]
                          : old.filter((value) => value !== row.date),
                      )
                    }
                  />
                  {dateLabel(row.date)} · {row.label}
                </label>
              ))}
              <a href={proposed[0]?.sourceUrl} target="_blank" rel="noreferrer">
                Consultar fuente del calendario
              </a>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{" "}
                Revisé las fechas que aplicaré a esta institución.
              </label>
            </Modal>
          )}
          {announce && ["director", "scheduler"].includes(role) && (
            <Modal
              title="Revisar comunicado del calendario"
              busy={busy}
              error={error}
              submitLabel="Publicar comunicado"
              onClose={() => setAnnounce(null)}
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void act(
                  "publish_school_calendar_notice",
                  {
                    p_id: announce.id,
                    p_revision: announce.revision,
                    p_content: form.get("content"),
                  },
                  "Comunicado publicado para la comunidad de esta sede.",
                );
              }}
            >
              <p>
                {dateLabel(announce.date)} · {announce.label}. El comunicado se
                enviará a la comunidad de esta sede después de publicar.
              </p>
              <Field label="Contenido del comunicado" name="content">
                <textarea
                  name="content"
                  minLength={10}
                  maxLength={10000}
                  required
                  defaultValue={`${announce.label}. El ${dateLabel(announce.date)} ${announce.kind === "school_day" ? "habrá clases según la jornada informada por la institución" : "no habrá clases"}. Gracias por tomar sus previsiones.`}
                />
              </Field>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
