import { useEffect, useState } from "react";
import {
  Download,
  RefreshCw,
  Users,
  Wallet,
  GraduationCap,
  AlertTriangle,
} from "lucide-react";
import { Button, Empty, StatCard } from "../components/UI";
import { rpc } from "../lib/repository";
import { liveMode } from "../lib/supabase";
import { today } from "../lib/billing";
import { money, dateLabel } from "../lib/format";
import { csvContent } from "../lib/reports";
import {
  metricNotes,
  metricsArgs,
  metricsModuleName,
  metricsPreset,
  metricsRangeError,
  validMetricsScope,
  type MetricsFilters,
  type SchoolMetrics as Snapshot,
} from "../lib/schoolMetrics";
import type { PageProps } from "./Pages";
import "./SchoolMetrics.css";
const average = (n: number | null) =>
  n === null ? "Sin dato" : `${n.toFixed(1)} / 100`;
type Tab = "summary" | "institutions" | "subjects" | "usage";
export function SchoolMetrics({ role, identity }: PageProps) {
  const initial: MetricsFilters = {
    ...metricsPreset("month", today()),
    schoolId: "",
    classroomId: "",
    environment: "production",
  };
  const [draft, setDraft] = useState(initial),
    [applied, setApplied] = useState(initial),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState<Tab>("summary"),
    [filtersOpen, setFiltersOpen] = useState(false),
    [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<{ key: string; data: Snapshot } | null>(
      null,
    ),
    [failure, setFailure] = useState<{ key: string; message: string } | null>(
      null,
    ),
    [catalog, setCatalog] = useState<Snapshot | null>(null);
  const allowed = role === "superadmin" && !identity.support,
    key = JSON.stringify(applied) + revision + identity.id;
  const data = loaded?.key === key ? loaded.data : null,
    error = failure?.key === key ? failure.message : "",
    busy = !data && !error;
  const validation = metricsRangeError(draft.from, draft.to);
  useEffect(() => {
    let active = true;
    if (!allowed) return;
    void (async () => {
      try {
        if (!liveMode)
          throw Error(
            "Conecta una cuenta de superadmin para consultar métricas reales.",
          );
        const value = await rpc<Snapshot>(
          "platform_school_metrics",
          metricsArgs(applied),
        );
        if (!validMetricsScope(value, applied))
          throw Error("La respuesta no corresponde a los filtros elegidos.");
        if (active) {
          setLoaded({ key, data: value });
          setCatalog(value);
        }
      } catch (e) {
        if (active)
          setFailure({
            key,
            message:
              e instanceof Error ? e.message : "No se pudo cargar el panel.",
          });
      }
    })();
    return () => {
      active = false;
    };
  }, [key, allowed, applied]);
  useEffect(() => {
    setPage(1);
  }, [tab, applied]);
  if (!allowed)
    return (
      <Empty
        title="Acceso reservado a Superadministración"
        subtitle="Sal de la sesión de soporte para consultar este panel."
      />
    );
  const options = catalog?.environment === draft.environment ? catalog : null;
  const s = data?.summary;
  const change = <K extends keyof MetricsFilters>(
    key: K,
    value: MetricsFilters[K],
  ) =>
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(key === "environment"
        ? { schoolId: "", classroomId: "" }
        : key === "schoolId"
          ? { classroomId: "" }
          : {}),
    }));
  function exportCsv() {
    if (!data) return;
    const sections = {
      institutions: {
        headers: [
          "Colegio",
          "Prueba",
          "Activos actuales",
          "Altas",
          "Alumnos con pago",
          "Cobrado Bs",
          "Saldo actual de cuotas del rango Bs",
          "Alumnos pendientes",
          "Media completa /100",
          "Alumnos bajo mínimo",
          "Altas auditadas",
        ],
        rows: data.institutions.map((r) => [
          r.name,
          r.testing ? "Sí" : "No",
          r.activeStudents,
          r.newStudents,
          r.studentsPaid,
          r.collected,
          r.outstanding,
          r.studentsPending,
          r.average ?? "",
          r.studentsAtRisk,
          r.registrations,
        ]),
      },
      subjects: {
        headers: [
          "Colegio",
          "Curso",
          "Periodo",
          "Desde periodo",
          "Hasta periodo",
          "Materia",
          "Media completa /100",
          "Completos",
          "Incompletos o cualitativos",
          "Bajo mínimo",
          "Evaluables para riesgo",
        ],
        rows: data.subjects.map((r) => [
          r.school,
          r.classroom,
          r.term_name,
          r.starts_on,
          r.ends_on,
          r.subject,
          r.average ?? "",
          r.completed,
          r.incomplete,
          r.below_minimum,
          r.risk_evaluated,
        ]),
      },
      usage: {
        headers: [
          "Actividad",
          "Altas auditadas",
          "Cambios auditados",
          "Consultas registradas",
        ],
        rows: data.usage.map((r) => [
          metricsModuleName(r.module),
          r.registrations,
          r.updates,
          r.consultations,
        ]),
      },
      summary: {
        headers: [
          "Desde",
          "Hasta",
          "Altas alumnos",
          "Alumnos con pago",
          "Cobrado Bs",
          "Altas auditadas colegio",
          "Consultas colegio",
        ],
        rows: data.trend.map((r) => [
          r.from,
          r.to,
          r.newStudents,
          r.studentsPaid,
          r.collected,
          r.registrations,
          r.consultations,
        ]),
      },
    };
    const section = sections[tab];
    const text = csvContent(section.headers, section.rows);
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `micole-metricas-${tab}-${data.from}-${data.to}-${data.environment}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const size = 15,
    rows =
      tab === "institutions"
        ? data?.institutions
        : tab === "subjects"
          ? data?.subjects
          : tab === "usage"
            ? data?.usage
            : data?.trend,
    total = rows?.length || 0,
    pages = Math.max(1, Math.ceil(total / size)),
    slice = <T,>(r: T[]) => r.slice((page - 1) * size, page * size);
  return (
    <div className="school-metrics">
      <div className="metrics-heading">
        <div>
          <span className="eyebrow">SUPERADMINISTRACIÓN</span>
          <h2>La actividad de tu red</h2>
          <p>Matrícula, cobranza, aprendizaje y actividad registrada.</p>
        </div>
        <Button
          icon={RefreshCw}
          variant="secondary"
          disabled={busy}
          onClick={() => setRevision((r) => r + 1)}
        >
          Actualizar
        </Button>
      </div>
      <section
        className="panel metrics-filters"
        aria-label="Filtros de métricas"
      >
        <div className="metrics-presets">
          {(
            [
              ["week", "Esta semana"],
              ["month", "Este mes"],
              ["sixMonths", "Últimos 6 meses"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant="secondary"
              onClick={() => {
                const f = { ...draft, ...metricsPreset(key, today()) };
                setDraft(f);
                setApplied(f);
              }}
            >
              {label}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? "Cerrar filtros" : "Filtrar por colegio y curso"}
          </Button>
        </div>
        {filtersOpen && (
          <div className="metrics-filter-grid">
            <label>
              Entorno
              <select
                aria-label="Entorno"
                value={draft.environment}
                onChange={(e) => {
                  const f = {
                    ...draft,
                    environment: e.target
                      .value as MetricsFilters["environment"],
                    schoolId: "",
                    classroomId: "",
                  };
                  setDraft(f);
                  setApplied(f);
                }}
              >
                <option value="production">Colegios reales</option>
                <option value="testing">Solo pruebas</option>
                <option value="all">Todos · incluye pruebas</option>
              </select>
            </label>
            <label>
              Colegio
              <select
                aria-label="Colegio"
                value={draft.schoolId}
                onChange={(e) => {
                  const f = {
                    ...draft,
                    schoolId: e.target.value,
                    classroomId: "",
                  };
                  setDraft(f);
                  setApplied(f);
                }}
              >
                <option value="">Todos los colegios</option>
                {options?.schools.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.testing ? " · Prueba" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Curso
              <select
                aria-label="Curso"
                value={draft.classroomId}
                disabled={
                  !draft.schoolId || options?.schoolId !== draft.schoolId
                }
                onChange={(e) => change("classroomId", e.target.value)}
              >
                <option value="">Todos los cursos</option>
                {options?.schoolId === draft.schoolId &&
                  options?.classrooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.year}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Desde
              <input
                type="date"
                value={draft.from}
                onChange={(e) => change("from", e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={draft.to}
                onChange={(e) => change("to", e.target.value)}
              />
            </label>
            <label>
              Agrupar
              <select
                aria-label="Agrupar"
                value={draft.group}
                onChange={(e) =>
                  change("group", e.target.value as MetricsFilters["group"])
                }
              >
                <option value="week">Por semana · lunes a domingo</option>
                <option value="month">Por mes</option>
              </select>
            </label>
            <Button
              disabled={!!validation || busy}
              onClick={() => {
                setApplied({ ...draft });
                setFiltersOpen(false);
              }}
            >
              Aplicar filtros
            </Button>
          </div>
        )}
        {filtersOpen && validation && <p role="alert">{validation}</p>}
      </section>
      {busy && (
        <div className="message info" role="status">
          Consultando métricas…
        </div>
      )}
      {error && (
        <div className="message error" role="alert">
          {error}
          <Button onClick={() => setRevision((r) => r + 1)}>Reintentar</Button>
        </div>
      )}
      {data && s && (
        <>
          <div className="metrics-context">
            <b>
              {data.environment === "production"
                ? "Colegios reales"
                : data.environment === "testing"
                  ? "Datos de prueba"
                  : "Incluye colegios de prueba"}
            </b>
            <span>
              {dateLabel(data.from)} – {dateLabel(data.to)} · {s.schoolCount}{" "}
              colegios
            </span>
            <small>
              Actualizado{" "}
              {new Date(data.generatedAt).toLocaleString("es-BO", {
                timeZone: "America/La_Paz",
              })}{" "}
              · Bolivia
            </small>
          </div>
          <div className="stats-grid">
            <StatCard
              label="Alumnos activos"
              value={s.activeStudents}
              icon={Users}
              footer={`${s.newStudents} cargados en el rango · estado actual`}
            />
            <StatCard
              label="Cobrado por colegios"
              value={money(s.collected)}
              icon={Wallet}
              footer={`${s.studentsPaid} alumnos con pago verificado`}
            />
            <StatCard
              label="Saldo pendiente"
              value={money(s.outstanding)}
              icon={AlertTriangle}
              tone="amber"
              footer={`${s.studentsPending} alumnos · cuotas que vencen en el rango`}
            />
            <StatCard
              label="Media de notas completas"
              value={average(s.average)}
              icon={GraduationCap}
              footer={`${s.completedGrades} resultados · ${s.incompleteGrades} incompletos o cualitativos`}
            />
          </div>
          <div
            className="metrics-tabs"
            role="tablist"
            aria-label="Vistas de métricas"
          >
            {(
              [
                ["summary", "Panorama"],
                ["institutions", "Por colegio"],
                ["subjects", "Materias y riesgo"],
                ["usage", "Uso y registros"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                id={`metrics-tab-${key}`}
                aria-controls="metrics-panel"
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
            <Button icon={Download} variant="secondary" onClick={exportCsv}>
              Exportar CSV
            </Button>
          </div>
          <section
            className="panel"
            id="metrics-panel"
            role="tabpanel"
            aria-labelledby={`metrics-tab-${tab}`}
          >
            <p className="metrics-table-hint">
              Desliza la tabla para ver todas las columnas.
            </p>
            {tab === "summary" && (
              <>
                <div className="metrics-mini-grid">
                  <div>
                    <span>Cuotas con vencimiento en el rango</span>
                    <strong>{money(s.due)}</strong>
                    <small>Saldo vencido hoy: {money(s.overdue)}</small>
                  </div>
                  <div>
                    <span>Señal de riesgo · Bolivia 2026</span>
                    <strong>
                      {s.riskEvaluated
                        ? `${s.studentsAtRisk} de ${s.riskEvaluated} alumnos`
                        : "Sin resultados completos evaluables"}
                    </strong>
                    <small>
                      Menos de 51 en al menos una materia y periodo.
                    </small>
                  </div>
                  <div>
                    <span>Asistencia confirmada · marcas</span>
                    <strong>
                      {s.present + s.late + s.absent + s.excused} registros
                    </strong>
                    <small>
                      {s.present} presentes · {s.late} atrasos · {s.absent}{" "}
                      faltas · {s.excused} permisos
                    </small>
                  </div>
                  <div>
                    <span>Actividad del colegio completo</span>
                    <strong>
                      {s.activeActors} usuarios con actividad registrada
                    </strong>
                    <small>
                      {s.registrations} altas · {s.updates} cambios ·{" "}
                      {s.consultations} consultas
                    </small>
                  </div>
                </div>
                <h3>
                  {data.group === "week"
                    ? "Evolución semanal"
                    : "Evolución mensual"}
                </h3>
                <p>
                  La primera y última fila pueden contener un periodo parcial.
                  Los alumnos con pago son únicos en cada fila.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Periodo</th>
                        <th>Alumnos cargados</th>
                        <th>Alumnos con pago</th>
                        <th>Cobrado</th>
                        <th>Altas auditadas</th>
                        <th>Consultas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(data.trend).map((r) => (
                        <tr key={r.from}>
                          <td>
                            {dateLabel(r.from)} – {dateLabel(r.to)}
                          </td>
                          <td>{r.newStudents}</td>
                          <td>{r.studentsPaid}</td>
                          <td>
                            <div className="metrics-bar-cell">
                              <span>{money(r.collected)}</span>
                              <i
                                aria-hidden="true"
                                style={{
                                  width: `${(Math.max(0, r.collected) / Math.max(1, ...data.trend.map((t) => t.collected))) * 100}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td>{r.registrations}</td>
                          <td>{r.consultations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "institutions" && (
              <>
                <h3>Comparación de colegios</h3>
                <p>
                  Altas y cobros corresponden al rango. Matrícula y saldo son
                  actuales.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Colegio",
                          "Activos",
                          "Altas",
                          "Alumnos con pago",
                          "Cobrado",
                          "Saldo pendiente",
                          "Alumnos pendientes",
                          "Media /100",
                          "Bajo mínimo",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slice(data.institutions).map((r) => (
                        <tr key={r.id}>
                          <th scope="row">
                            {r.name}
                            {r.testing && <small>Prueba</small>}
                          </th>
                          <td>{r.activeStudents}</td>
                          <td>{r.newStudents}</td>
                          <td>{r.studentsPaid}</td>
                          <td>{money(r.collected)}</td>
                          <td>{money(r.outstanding)}</td>
                          <td>{r.studentsPending}</td>
                          <td>
                            {r.average === null
                              ? "Sin dato"
                              : r.average.toFixed(1)}
                          </td>
                          <td>{r.studentsAtRisk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "subjects" && (
              <>
                <h3>Materias que necesitan atención</h3>
                <p>
                  Resultados actuales del periodo completo que coincide con las
                  fechas elegidas. Riesgo solo para Bolivia 2026; en otros
                  esquemas aparece «No aplica».
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Colegio / curso",
                          "Materia / periodo",
                          "Media /100",
                          "Completos",
                          "Incompletos o cualitativos",
                          "Bajo mínimo / evaluables",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slice(data.subjects).map((r, i) => (
                        <tr
                          key={`${r.term_id}:${r.classroom_id}:${r.class_subject_id}:${i}`}
                        >
                          <td>
                            {r.school}
                            <small>{r.classroom}</small>
                          </td>
                          <th scope="row">
                            {r.subject}
                            <small>
                              {r.term_name} · {dateLabel(r.starts_on)} –{" "}
                              {dateLabel(r.ends_on)}
                            </small>
                          </th>
                          <td>
                            {r.average === null
                              ? "Sin dato"
                              : r.average.toFixed(1)}
                          </td>
                          <td>{r.completed}</td>
                          <td>{r.incomplete}</td>
                          <td className={r.below_minimum ? "metrics-risk" : ""}>
                            {r.risk_evaluated
                              ? `${r.below_minimum} / ${r.risk_evaluated}`
                              : "No aplica"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "usage" && (
              <>
                <h3>Qué se registró y consultó</h3>
                <p>
                  Actividad de los colegios seleccionados. Altas y cambios son
                  eventos auditados; las consultas solo cubren contenido
                  instrumentado.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Actividad</th>
                        <th>Altas</th>
                        <th>Cambios</th>
                        <th>Aperturas / descargas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(data.usage).map((r) => (
                        <tr key={r.module}>
                          <th scope="row">{metricsModuleName(r.module)}</th>
                          <td>{r.registrations}</td>
                          <td>{r.updates}</td>
                          <td>{r.consultations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!total && (
              <Empty
                title="Sin registros para estos filtros"
                subtitle="Amplía las fechas o elige otro colegio. La falta de registros no significa que haya faltas o notas en cero."
              />
            )}
            {pages > 1 && (
              <div className="metrics-pagination">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>
                  Página {page} de {pages} · {total} filas
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </section>
          <details className="panel metrics-definitions">
            <summary>Cómo se calculan estas métricas</summary>
            {metricNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            <p>
              Solo se muestran agregados, sin nombres ni notas individuales de
              alumnos. CSV contiene la vista elegida con todas sus filas.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
