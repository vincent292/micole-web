import { useWorkspaceRevision } from "../lib/useWorkspaceRevision";
import { useEffect, useState } from "react";
import { Button, Field, SectionTitle, Empty } from "../components/UI";
import { rpc } from "../lib/repository";
import { publicDemo } from "../lib/demo-config";
import { liveMode } from "../lib/supabase";
import { today } from "../lib/billing";
import { exportTable, recordView } from "../lib/financialApi";
import {
  viewKinds,
  type ViewKind,
  type ViewReport,
  type ViewRow,
} from "../lib/financialRecords";
import type { PageProps } from "./Pages";
const headers = [
  "Fecha y hora",
  "Persona",
  "Rol",
  "Estudiante",
  "Aula",
  "Contenido",
  "Título",
  "Acción",
  "Aplicación",
  "Huella del contenido",
];
const rows = (list: ViewRow[]) =>
  list.map((r) => [
    new Date(r.viewedAt).toLocaleString("es-BO", {
      timeZone: "America/La_Paz",
    }),
    r.viewerName,
    r.viewerRole,
    r.studentName,
    r.classroomName || "",
    viewKinds[r.kind as ViewKind] || r.kind,
    r.title,
    r.action === "download" ? "Descarga" : "Visualización",
    r.client,
    r.contentHash,
  ]);
export function ViewHistory({ school, students }: PageProps) {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [child, setChild] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(0),
    [query, setQuery] = useState({
      from: today().slice(0, 7) + "-01",
      to: today(),
      studentId: "",
      kind: "",
    }),
    [data, setData] = useState<ViewReport>({ total: 0, rows: [] }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const liveRevision = useWorkspaceRevision(["content_view_events"], school?.id);
  const load = (offset: number, limit = 50) =>
    (liveMode || publicDemo)
      ? rpc<ViewReport>("content_view_report", {
          p_school_id: school?.id,
          p_from: query.from,
          p_to: query.to,
          p_student_id: query.studentId || null,
          p_kind: query.kind || null,
          p_offset: offset,
          p_limit: limit,
        })
      : Promise.resolve({ total: 0, rows: [] });
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void load(page * 50)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [school?.id, query, page, liveRevision]);
  async function csv() {
    if (data.total > 10000) {
      setError(
        "Acota las fechas para exportar hasta 10.000 registros por archivo.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      let list: ViewRow[] = [];
      for (let offset = 0; offset < data.total; offset += 500) {
        const result = await load(offset, 500);
        list.push(...result.rows);
      }
      exportTable("consultas-micole.csv", headers, rows(list));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionTitle
        title="Historial de consultas"
        subtitle="Visualizaciones y descargas registradas por cuenta. No equivalen a aceptar un comunicado."
        action={
          <Button
            variant="secondary"
            disabled={busy || !data.total}
            onClick={() => void csv()}
          >
            Exportar historial CSV
          </Button>
        }
      />
      <form
        className="panel form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setQuery({ from, to, studentId: child, kind });
        }}
      >
        <Field label="Desde" name="from">
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Hasta" name="to">
          <input
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="Estudiante" name="viewStudent">
          <select value={child} onChange={(e) => setChild(e.target.value)}>
            <option value="">Todos los autorizados</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contenido" name="kind">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(viewKinds).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={busy}>
          Aplicar filtros
        </Button>
      </form>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <p>{busy ? "Consultando…" : `${data.total} registros`}</p>
        {data.rows.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  {headers.slice(0, 9).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows(data.rows).map((row, i) => (
                  <tr key={data.rows[i].id}>
                    {row.slice(0, 9).map((value, j) => (
                      <td key={j}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Sin consultas en este período"
            subtitle="Se registran las visualizaciones realizadas a partir de esta actualización."
          />
        )}
        <div className="notice-management">
          <Button
            variant="secondary"
            disabled={!page || busy}
            onClick={() => setPage((n) => n - 1)}
          >
            Anterior
          </Button>
          <span>Página {page + 1}</span>
          <Button
            variant="secondary"
            disabled={busy || (page + 1) * 50 >= data.total}
            onClick={() => setPage((n) => n + 1)}
          >
            Siguiente
          </Button>
        </div>
      </section>
    </>
  );
}
export function ContentAreaTracker({
  page,
  studentId,
  enabled,
}: {
  page: string;
  studentId?: string;
  enabled: boolean;
}) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      !enabled ||
      !studentId ||
      !["daily", "calendar", "materials", "assignments"].includes(page)
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector('[aria-modal="true"]')
      )
        void recordView(page as ViewKind, studentId).catch(() =>
          setError("No se pudo registrar la apertura de esta sección."),
        );
      else timer = setTimeout(check, 1000);
    };
    timer = setTimeout(check, 700);
    return () => clearTimeout(timer);
  }, [page, studentId, enabled]);
  return error ? (
    <p className="message error" role="alert">
      {error}
    </p>
  ) : null;
}
