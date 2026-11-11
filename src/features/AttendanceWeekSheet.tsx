import { useEffect, useRef, useState } from "react";
import { dateLabel } from "../lib/format";
import {
  attendanceLabels,
  type AttendanceMark,
  type AttendanceStatus,
} from "../lib/studentAttendance";
import {
  attendanceDayLabel,
  attendanceSymbols,
  sortAttendancePupils,
  type AttendanceSort,
  type AttendanceWeek,
} from "../lib/attendanceWeek";

export function AttendanceWeekSheet({
  week,
  day,
  marks,
  order,
  search,
  disabled,
  change,
  selectDay,
}: {
  week: AttendanceWeek;
  day: string;
  marks: AttendanceMark[];
  order: AttendanceSort;
  search: string;
  disabled: boolean;
  change: (id: string, value: Partial<AttendanceMark>) => void;
  selectDay: (date: string) => void;
}) {
  const container = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(
    () =>
      typeof window === "undefined" ||
      window.innerWidth < 1000 ||
      window.innerHeight < 500,
  );
  const [format, setFormat] = useState<"day" | "week">();
  const mode = format || (compact ? "day" : "week");
  const selectedDay = week.days.find((date) => date.date === day);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const update = () =>
      setCompact(
        node.getBoundingClientRect().width < 760 || window.innerHeight < 500,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const rows = sortAttendancePupils(week.roster, order).filter((row) =>
    row.student_name
      .toLocaleLowerCase("es")
      .includes(search.toLocaleLowerCase("es")),
  );
  return (
    <section ref={container} className="attendance-sheet-layout">
      <div
        className="attendance-format"
        role="group"
        aria-label="Formato de lista"
      >
        <button
          type="button"
          aria-pressed={mode === "day"}
          onClick={() => setFormat("day")}
        >
          Lista del día
        </button>
        <button
          type="button"
          aria-pressed={mode === "week"}
          onClick={() => setFormat("week")}
        >
          Hoja semanal
        </button>
      </div>
      {mode === "day" ? (
        <>
          <div
            className="attendance-day-strip"
            role="group"
            aria-label="Días de la semana"
          >
            {week.days.map((date) => (
              <button
                type="button"
                key={date.date}
                aria-label={`Seleccionar fecha ${date.date}`}
                aria-pressed={date.date === day}
                onClick={() => selectDay(date.date)}
              >
                <span>{attendanceDayLabel(date.date).split(",")[0]}</span>
                <strong>{date.date.slice(8)}</strong>
                <small>
                  {date.date.slice(5, 7)}/{date.date.slice(0, 4)}
                </small>
              </button>
            ))}
          </div>
          <div className="attendance-day-title">
            <h3>{dateLabel(day)}</h3>
            <span>
              {selectedDay?.sessionStatus === "confirmed"
                ? "Lista confirmada"
                : "Lista del día"}
            </span>
          </div>
          <div
            className="attendance-day-list"
            role="region"
            aria-label="Lista del día"
          >
            {rows
              .filter((row) => selectedDay?.studentIds.includes(row.student_id))
              .map((row) => {
                const mark = marks.find((m) => m.studentId === row.student_id);
                if (!mark) return null;
                const name = row.student_name;
                return (
                  <article key={row.student_id} className="attendance-day-card">
                    <div className="attendance-day-name">
                      <strong>
                        {order === "lastName"
                          ? row.last_name || name
                          : row.first_name || name}
                      </strong>
                      {Boolean(row.first_name && row.last_name) && (
                        <span>
                          {order === "lastName"
                            ? row.first_name
                            : row.last_name}
                        </span>
                      )}
                    </div>
                    {selectedDay?.isSchoolDay ? (
                      <div className="attendance-day-actions">
                        <label
                          className={`attendance-present ${mark.status === "present" ? "is-present" : ""}`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Presente: ${name}`}
                            checked={mark.status === "present"}
                            disabled={disabled}
                            onChange={(e) =>
                              change(row.student_id, {
                                status: e.target.checked ? "present" : "",
                              })
                            }
                          />
                          <span>Presente</span>
                        </label>
                        <label className="attendance-status">
                          <span>Estado</span>
                          <select
                            aria-label={`Estado de ${name}`}
                            value={mark.status}
                            disabled={disabled}
                            onChange={(e) =>
                              change(row.student_id, {
                                status: e.target.value as AttendanceStatus | "",
                              })
                            }
                          >
                            <option value="">Sin marcar</option>
                            {Object.entries(attendanceLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <p className="attendance-help">{selectedDay?.label}</p>
                    )}
                    <details className="attendance-note">
                      <summary>
                        {mark.note
                          ? "Editar observación"
                          : "Añadir observación"}
                      </summary>
                      <textarea
                        aria-label={`Observación de ${name}`}
                        value={mark.note}
                        disabled={disabled || !selectedDay?.isSchoolDay}
                        maxLength={1000}
                        rows={2}
                        onChange={(e) =>
                          change(row.student_id, { note: e.target.value })
                        }
                      />
                    </details>
                  </article>
                );
              })}
          </div>
        </>
      ) : (
        <>
          <p className="attendance-help">
            ✓ Presente · F Falta · T Tardanza · J Con permiso · — Sin marcar.
            Selecciona la fecha de una columna para pasar esa lista. Desliza la
            hoja para ver todos los días.
          </p>
          <div
            className="attendance-sheet-scroll"
            role="region"
            aria-label="Hoja semanal de asistencia"
            tabIndex={0}
          >
            <table className="attendance-sheet">
              <thead>
                <tr>
                  <th scope="col">
                    {order === "lastName"
                      ? "Apellidos y nombres"
                      : "Nombres y apellidos"}
                  </th>
                  {week.days.map((date) => (
                    <th
                      key={date.date}
                      scope="col"
                      className={`${date.date === day ? "sheet-selected" : ""} ${date.isSchoolDay ? "" : "sheet-closed"}`}
                    >
                      <button
                        type="button"
                        aria-pressed={date.date === day}
                        onClick={() => selectDay(date.date)}
                      >
                        {attendanceDayLabel(date.date)}
                        <small>{date.date.slice(0, 4)}</small>
                      </button>
                      {!date.isSchoolDay && <small>{date.label}</small>}
                      {date.sessionStatus && (
                        <small>
                          {date.sessionStatus === "confirmed"
                            ? "Confirmada"
                            : "Borrador"}
                        </small>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const mark = marks.find(
                    (m) => m.studentId === row.student_id,
                  );
                  const name = row.student_name;
                  return (
                    <tr key={row.student_id}>
                      <th scope="row">
                        <strong>
                          {order === "lastName" && row.last_name
                            ? row.last_name
                            : row.first_name || name}
                        </strong>
                        {(row.first_name || row.last_name) && (
                          <span>
                            {order === "lastName"
                              ? row.first_name
                              : row.last_name}
                          </span>
                        )}
                        {mark && (
                          <details className="attendance-note">
                            <summary>
                              {mark.note
                                ? "Editar observación"
                                : "Añadir observación"}
                            </summary>
                            <input
                              aria-label={`Observación de ${name}`}
                              value={mark.note}
                              disabled={disabled}
                              maxLength={1000}
                              onChange={(e) =>
                                change(row.student_id, { note: e.target.value })
                              }
                            />
                          </details>
                        )}
                      </th>
                      {week.days.map((date) => {
                        const record = week.records.find(
                          (r) =>
                            r.studentId === row.student_id &&
                            r.date === date.date,
                        );
                        const active = date.date === day;
                        const enrolled = date.studentIds.includes(
                          row.student_id,
                        );
                        return (
                          <td
                            key={date.date}
                            className={`${active ? "sheet-selected" : ""} ${date.isSchoolDay ? "" : "sheet-closed"}`}
                          >
                            {active && mark && enrolled && date.isSchoolDay ? (
                              <div className="sheet-mark">
                                <label className="sheet-check"><input
                                  type="checkbox"
                                  aria-label={`Presente: ${name}`}
                                  checked={mark.status === "present"}
                                  disabled={disabled}
                                  onChange={(e) =>
                                    change(row.student_id, {
                                      status: e.target.checked ? "present" : "",
                                    })
                                  }
                                /></label>
                                <select
                                  aria-label={`Estado de ${name}`}
                                  value={mark.status}
                                  disabled={disabled}
                                  onChange={(e) =>
                                    change(row.student_id, {
                                      status: e.target.value as
                                        AttendanceStatus | "",
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {Object.entries(attendanceLabels).map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="sheet-cell"
                                aria-label={`${name} · ${date.date} · ${record?.status ? attendanceLabels[record.status] : !date.isSchoolDay ? date.label : enrolled ? "Sin marcar" : "Sin inscripción en esta fecha"}`}
                                onClick={() => selectDay(date.date)}
                              >
                                {record?.status
                                  ? attendanceSymbols[record.status]
                                  : !date.isSchoolDay || !enrolled
                                    ? "·"
                                    : "—"}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
