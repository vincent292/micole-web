import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, ArrowDownToLine, CalendarRange, ChevronLeft, ChevronRight, CircleDollarSign, Download, FileBarChart2, Printer, RefreshCw, Wallet } from "lucide-react";
import { Badge, Button, Empty, SearchBox, StatCard } from "../components/UI";
import type { PageProps } from "./Pages";
import { rpc } from "../lib/repository";
import { liveMode } from "../lib/supabase";
import { today } from "../lib/billing";
import { dateLabel, money } from "../lib/format";
import { csvContent, demoReport, reportDebtors, reportMonths, reportTotals, validateReportRange, validReportScope } from "../lib/reports";
import type { ReportFilters, ReportSnapshot } from "../lib/reports";

type Tab = "summary" | "charges" | "payments" | "debtors";
type TableRow = { key: string; cells: (string | number)[]; status?: string; studentId?: string };
const statusNames: Record<string, string> = { pending: "Pendiente", overdue: "Vencido", paid: "Pagado", cancelled: "Anulado" };
const methodNames = { cash: "Efectivo", transfer: "Transferencia", qr: "QR", deposit:"Depósito bancario" };

export function Reports({ store, school, role, identity }: PageProps) {
  const platform = role === "superadmin";
  const scope = platform ? "platform" : "school";
  const scopeKey = `${scope}:${school?.id || ""}:${identity.id}`;
  const initial: ReportFilters = { schoolId: platform ? "" : school?.id || "", from: `${today().slice(0, 4)}-01-01`, to: today(), classroomId: "", studentId: "" };
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; value: ReportSnapshot } | null>(null);
  const [catalog, setCatalog] = useState<ReportSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("summary");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);
  const queryKey = `${scopeKey}:${JSON.stringify(applied)}:${revision}`;
  const report = result?.key === queryKey ? result.value : null;
  const rangeError = validateReportRange(draft.from, draft.to);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setResult(null);
    if (!platform && !school?.id) {
      setBusy(false);
      setError("No tienes una institución asignada para consultar sus reportes.");
      return;
    }
    const load = async () => {
      try {
        const value = liveMode
          ? await rpc<ReportSnapshot>("financial_report", { p_school_id: applied.schoolId || null, p_from: applied.from, p_to: applied.to, p_classroom_id: platform ? null : applied.classroomId || null, p_student_id: platform ? null : applied.studentId || null })
          : demoReport(store.data, scope, applied);
        if (!validReportScope(value, scope, applied)) throw new Error("El reporte recibido no corresponde a este acceso. Vuelve a intentarlo.");
        if (!active) return;
        setResult({ key: queryKey, value });
        if (!applied.classroomId && !applied.studentId && (!platform || !applied.schoolId)) setCatalog(value);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
      } finally {
        if (active) setBusy(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [queryKey, applied, platform, scope, school?.id, store.data]);

  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);

  const schools = catalog?.schools || store.data.schools;
  const classrooms = catalog?.classrooms || store.data.classrooms.filter((c) => c.schoolId === school?.id);
  const students = catalog?.students || store.data.students.filter((s) => s.schoolId === school?.id).map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, classroomId: s.classroomId, status: s.status }));
  const studentName = (id?: string) => report?.students.find((s) => s.id === id)?.name || students.find((s) => s.id === id)?.name || "Sin estudiante";
  const schoolName = (id: string) => report?.schools.find((s) => s.id === id)?.name || schools.find((s) => s.id === id)?.name || "Institución";
  const classroomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name || "Sin curso asignado";
  const totals = report ? reportTotals(report) : null;
  const months = useMemo(() => report ? reportMonths(report) : [], [report]);
  const debtors = report ? reportDebtors(report) : [];
  const matches = (value: string) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const aggregate = report ? (platform ? report.schools : [...report.classrooms, { id: "unassigned", name: "Sin curso asignado" }]).map((entity) => {
    const ids = new Set(report.students.filter((s) => entity.id === "unassigned" ? !s.classroomId || !report.classrooms.some((c) => c.id === s.classroomId) : s.classroomId === entity.id).map((s) => s.id));
    const charges = report.charges.filter((c) => platform ? c.schoolId === entity.id : ids.has(c.studentId || ""));
    const payments = report.payments.filter((p) => platform ? p.schoolId === entity.id : ids.has(p.studentId || ""));
    return { entity, totals: reportTotals({ charges, payments }), licenses: charges.filter((c) => c.kind === "license" && c.status !== "cancelled").reduce((n, c) => n + (c.licenseCount || 0), 0), activations: charges.filter((c) => c.kind === "activation" && c.status !== "cancelled").length, count: charges.length + payments.length };
  }).filter((row) => row.count > 0 && matches(row.entity.name)) : [];
  let headers: string[];
  let rows: TableRow[];
  if (tab === "charges") {
    headers = [platform ? "Institución" : "Estudiante", "Concepto", platform ? "Fecha de emisión" : "Vencimiento", "Importe (Bs)", "Estado"];
    rows = (report?.charges || []).filter((c) => (status === "all" || c.status === status) && matches(`${c.concept} ${platform ? schoolName(c.schoolId) : studentName(c.studentId)}`)).map((c) => ({ key: c.id, cells: [platform ? schoolName(c.schoolId) : studentName(c.studentId), c.concept, c.date, c.amount, statusNames[c.status]], status: c.status }));
  } else if (tab === "payments") {
    headers = ["Fecha de cobro", platform ? "Institución" : "Estudiante", "Concepto", "Método", "Referencia", "Cobrado (Bs)"];
    rows = (report?.payments || []).filter((p) => matches(`${p.concept} ${p.reference} ${platform ? schoolName(p.schoolId) : studentName(p.studentId)}`)).map((p) => ({ key: p.id, cells: [p.date, platform ? schoolName(p.schoolId) : studentName(p.studentId), p.concept, methodNames[p.method], p.reference || "—", p.amount] }));
  } else if (tab === "debtors") {
    headers = ["Estudiante", "Curso actual", "Cuotas pendientes", "Pendiente (Bs)", "Vencido (Bs)", "Mayor atraso (días)"];
    rows = debtors.filter((s) => matches(`${s.name} ${classroomName(s.classroomId)}`)).map((s) => ({ key: s.id, studentId: s.id, cells: [s.name, classroomName(s.classroomId), s.charges, s.outstanding, s.overdue, s.lateDays] }));
  } else {
    headers = [platform ? "Institución" : "Curso actual", "Emitido (Bs)", "Cobrado (Bs)", "Pendiente (Bs)", "Vencido (Bs)", ...(platform ? ["Licencias por mes", "Activaciones"] : [])];
    rows = aggregate.map((row) => ({ key: row.entity.id, cells: [row.entity.name, row.totals.issued, row.totals.collected, row.totals.outstanding, row.totals.overdue, ...(platform ? [row.licenses, row.activations] : [])] }));
  }
  useEffect(() => { setPage(1); }, [tab, search, status, queryKey]);
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = printing ? rows : rows.slice((currentPage - 1) * 25, currentPage * 25);
  const tabs: { key: Tab; label: string; count?: number }[] = [{ key: "summary", label: "Resumen" }, { key: "charges", label: platform ? "Licencias" : "Cuotas", count: report?.charges.length }, { key: "payments", label: "Movimientos", count: report?.payments.length }, ...(!platform ? [{ key: "debtors" as const, label: "Morosos", count: debtors.length }] : [])];
  const apply = (filters = draft) => {
    if (validateReportRange(filters.from, filters.to)) return;
    setApplied({ ...filters });
    setRevision((n) => n + 1);
  };
  const preset = (value: "month" | "year") => {
    const next = { ...draft, from: value === "month" ? `${today().slice(0, 7)}-01` : `${today().slice(0, 4)}-01-01`, to: today() };
    setDraft(next); apply(next);
  };
  const statement = (studentId: string) => {
    const next = { ...applied, studentId };
    setDraft(next); apply(next); setTab("charges"); setStatus("all"); setSearch("");
  };
  const exportCsv = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([csvContent(headers, rows.map((row) => row.cells))], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `micole-${scope}-${tab}-${report.fromDate}-${report.toDate}.csv`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    setPrinting(true);
    requestAnimationFrame(() => requestAnimationFrame(() => { try { window.print(); } catch { setPrinting(false); } }));
  };
  const maxMonth = Math.max(1, ...months.flatMap((m) => [m.issued, m.collected]));
  const reportLabel = platform ? (report?.schools.length === 1 ? report.schools[0].name : "Todas las instituciones") : school?.name;
  const selectedStudent = students.find((s) => s.id === applied.studentId);
  const tableTitle = tab === "summary" ? (platform ? "Detalle por institución" : "Detalle por curso") : tab === "charges" ? (selectedStudent ? `Estado de cuenta · ${selectedStudent.name}` : platform ? "Licencias y activaciones" : "Cuotas del período") : tab === "payments" ? "Cobros registrados" : "Estudiantes con cuotas vencidas";
  return (
    <section className={`financial-report ${printing ? "report-printing" : ""}`} aria-label="Reportes financieros">
      <div className="report-heading">
        <div className="report-heading-copy"><span className="report-heading-icon"><FileBarChart2 size={24} /></span><div><h2>{platform ? "Ingresos de MiCole" : "Finanzas de tu colegio"}</h2><p>{platform ? "Licencias, activaciones y cobros de la plataforma." : "Cuotas, cobros y estados de cuenta en un solo lugar."}</p></div></div>
        <div className="report-actions"><Button variant="secondary" icon={Download} disabled={!report || busy || rows.length === 0} onClick={exportCsv}>Exportar CSV</Button><Button variant="secondary" icon={Printer} disabled={!report || busy} onClick={print}>Imprimir / Guardar PDF</Button></div>
      </div>
      <form className="report-filters panel" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <div className="report-filter-top"><span><CalendarRange size={18} /> Período del reporte</span><div><button type="button" onClick={() => preset("month")} disabled={busy}>Este mes</button><button type="button" onClick={() => preset("year")} disabled={busy}>Este año</button></div></div>
        <div className="report-filter-grid">
          <label className="field"><span>Desde</span><input type="date" required value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="field"><span>Hasta</span><input type="date" required value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
          {platform ? <label className="field"><span>Institución del reporte</span><select value={draft.schoolId} onChange={(e) => setDraft({ ...draft, schoolId: e.target.value })}><option value="">Todas las instituciones</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : <>
            <label className="field"><span>Curso actual</span><select value={draft.classroomId} onChange={(e) => setDraft({ ...draft, classroomId: e.target.value, studentId: "" })}><option value="">Todos los cursos</option>{classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="field"><span>Estudiante</span><select value={draft.studentId} onChange={(e) => setDraft({ ...draft, studentId: e.target.value })}><option value="">Todos los estudiantes</option>{students.filter((s) => !draft.classroomId || s.classroomId === draft.classroomId).map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "inactive" ? " · de baja" : ""}</option>)}</select></label>
          </>}
          <Button type="submit" icon={RefreshCw} disabled={busy || !!rangeError}>Aplicar filtros</Button>
        </div>
        {rangeError && <p className="report-validation" role="alert">{rangeError}</p>}
        {!rangeError && JSON.stringify(draft) !== JSON.stringify(applied) && <p className="report-filter-hint" role="status">Filtros cambiados. Pulsa Aplicar filtros para actualizar el reporte.</p>}
      </form>
      <p className="report-explanation">{platform ? "Los cobros se filtran por fecha de pago; las licencias, por mes de emisión, y las activaciones, por su fecha de creación. El estado es actual." : "Los ingresos se filtran por fecha de cobro; las cuotas y la mora, por fecha de vencimiento. El estado de las cuotas es actual."}</p>
      {!liveMode && <p className="report-demo-note">Datos de prueba. Los movimientos se ilustran a partir de pagos locales; en línea se consulta el registro de pagos verificados.</p>}
      {error && <div className="message error" role="alert"><AlertCircle size={19} /><span>{error}</span><Button variant="ghost" onClick={() => setRevision((n) => n + 1)}>Reintentar reporte</Button></div>}
      {busy && <div className="report-loading" role="status"><RefreshCw size={24} /><div><b>Preparando tu reporte…</b><span>Consultando cuotas y movimientos del período.</span></div></div>}
      {report && totals && !busy && <>
        <div className="report-print-header"><h1>MiCole · Reporte financiero</h1><p>{reportLabel} · {dateLabel(report.fromDate)} al {dateLabel(report.toDate)}</p><p>{selectedStudent?.name || (applied.classroomId ? classroomName(applied.classroomId) : "")}</p><small>Generado el {new Date(report.generatedAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" })}. Estado de cuotas actual.</small></div>
        <div className="report-period"><span>{reportLabel} <i>·</i> {dateLabel(report.fromDate)} — {dateLabel(report.toDate)}</span><small>Actualizado {new Date(report.generatedAt).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" })}</small></div>
        <div className="stats-grid report-metrics">
          <div data-testid="report-issued"><StatCard label="Emitido" value={money(totals.issued)} icon={FileBarChart2} tone="blue" footer="Cuotas del período, sin anuladas" /></div>
          <div data-testid="report-collected"><StatCard label="Cobrado" value={money(totals.collected)} icon={CircleDollarSign} tone="mint" footer="Pagos verificados en el período" /></div>
          <div data-testid="report-outstanding"><StatCard label="Pendiente" value={money(totals.outstanding)} icon={Wallet} tone="amber" footer="Incluye cuotas vencidas" /></div>
          <div data-testid="report-overdue"><StatCard label="Vencido" value={money(totals.overdue)} icon={AlertCircle} tone="amber" footer={platform ? "Liquidaciones marcadas vencidas" : "Vencidas a la fecha de hoy"} /></div>
        </div>
        <div className="report-tabs" role="tablist" aria-label="Tipo de reporte">{tabs.map((item, index) => <button type="button" key={item.key} id={`report-tab-${item.key}`} role="tab" tabIndex={tab === item.key ? 0 : -1} aria-selected={tab === item.key} aria-controls="report-detail" onClick={() => setTab(item.key)} onKeyDown={(e) => { const target = e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1; if (target >= 0) { e.preventDefault(); setTab(tabs[target].key); document.getElementById(`report-tab-${tabs[target].key}`)?.focus(); } }}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>
        {tab === "summary" && months.length > 0 && <section className="panel report-chart"><div className="report-chart-heading"><div><h3>Emitido y cobrado por mes</h3><p>Los cobros pueden corresponder a cuotas de otros meses.</p></div><div className="report-legend"><span><i className="issued" /> Emitido</span><span><i className="collected" /> Cobrado</span></div></div><div className="report-month-list">{months.map((m) => <div className="report-month" key={m.month}><span>{new Date(`${m.month}-01T12:00:00-04:00`).toLocaleDateString("es-BO", { month: "short", year: "2-digit" })}</span><div className="report-bars" role="img" aria-label={`${m.month}: emitido ${money(m.issued)}, cobrado ${money(m.collected)}`}><div className="report-bar issued" style={{ width: `${100 * m.issued / maxMonth}%` }} /><div className="report-bar collected" style={{ width: `${100 * m.collected / maxMonth}%` }} /></div><div className="report-month-values"><b>{money(m.issued)}</b><span>{money(m.collected)}</span></div></div>)}</div></section>}
        <section id="report-detail" className="panel report-detail" role="tabpanel" aria-labelledby={`report-tab-${tab}`}>
          <div className="report-table-tools"><div><h3>{tableTitle}</h3><p>{rows.length} {rows.length === 1 ? "registro" : "registros"}{tab === "summary" && platform ? " · Las licencias se suman por cada mes facturado." : ""}</p></div><div className="report-table-filters"><SearchBox value={search} onChange={setSearch} placeholder={platform ? "Buscar concepto o institución" : "Buscar concepto o estudiante"} />{tab === "charges" && <label className="report-status"><span className="sr-only">Estado de cuota</span><select aria-label="Estado de cuota" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos los estados</option>{Object.entries(statusNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}</div></div>
          {rows.length > 0 ? <><div className="report-table-scroll" tabIndex={0} role="region" aria-label="Tabla del reporte, desplázate para ver todas las columnas"><table><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}{tab === "debtors" && <th scope="col" className="report-row-action">Detalle</th>}</tr></thead><tbody>{visibleRows.map((row) => <tr data-testid="report-row" key={row.key}>{row.cells.map((cell, index) => <td key={index} className={typeof cell === "number" ? "report-number" : ""}>{row.status && index === row.cells.length - 1 ? <Badge status={row.status} /> : typeof cell === "number" && headers[index].includes("(Bs)") ? money(cell) : cell}</td>)}{row.studentId && <td className="report-row-action"><button type="button" className="text-button" onClick={() => statement(row.studentId!)}>Ver estado de cuenta <ChevronRight size={14} /></button></td>}</tr>)}</tbody></table></div><div className="report-pagination"><span>{(currentPage - 1) * 25 + 1}–{Math.min(currentPage * 25, rows.length)} de {rows.length} <small>· El CSV incluye todos los resultados filtrados.</small></span><div><button type="button" aria-label="Página anterior del reporte" disabled={currentPage <= 1} onClick={() => setPage((n) => n - 1)}><ChevronLeft size={18} /></button><b>{currentPage} / {pageCount}</b><button type="button" aria-label="Página siguiente del reporte" disabled={currentPage >= pageCount} onClick={() => setPage((n) => n + 1)}><ChevronRight size={18} /></button></div></div></> : <Empty title={tab === "debtors" ? "Sin cuotas vencidas en este período" : "No hay registros con estos filtros"} subtitle="Puedes cambiar el período, la selección o el texto de búsqueda." />}
        </section>
        <p className="report-footnote"><ArrowDownToLine size={15} /> CSV e impresión reflejan la pestaña y los filtros visibles. Este reporte es informativo.{!platform && " El estado de cuenta comprende las cuotas que vencen en el período elegido."}</p>
      </>}
    </section>
  );
}
