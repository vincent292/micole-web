import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, CheckCheck, Heart, Users } from "lucide-react";
import { Button, Empty, Field, Modal } from "../components/UI";
import { today } from "../lib/billing";
import { dateLabel } from "../lib/format";
import { rpc } from "../lib/repository";
import { schoolRooms } from "../lib/workspaceFocus";
import { careKinds, foodAmounts, hourOptions, hygieneKinds, moods } from "../lib/school";
import { clearCareBatchAttempt, readCareBatchAttempt, rememberCareBatchAttempt, type CareBatchAttempt, type GroupCareKind, type GroupCareValues } from "../lib/careBatch";
import type { PageProps } from "./Pages";
import { fullName } from "./Pages";
import "../styles/care-batch.css";

type IndividualValues = Partial<Pick<GroupCareValues, "amount" | "ended_at" | "hygiene" | "mood" | "note">>;

const groupKinds: Record<GroupCareKind, string> = { meal: "Alimentación", rest: "Descanso", hygiene: "Higiene", mood: "Estado de ánimo" };
function currentHour() {
  const value = new Intl.DateTimeFormat("en-GB", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  return `${value.slice(0, 2)}:${String(Math.floor(Number(value.slice(3, 5)) / 15) * 15).padStart(2, "0")}`;
}
const options = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>);

export function CareBatchModal(p: PageProps & { initialDay: string; onClose: () => void; onSaved: (count: number, day: string, studentId: string) => void }) {
  const requestedRoom = new URLSearchParams(useLocation().search).get("classroom");
  const scope = JSON.stringify([p.identity.id, p.role, p.school?.id, p.identity.support?.id || ""]);
  const [restored] = useState(() => readCareBatchAttempt(scope));
  const rooms = schoolRooms(p.store.data, p.school?.id, p.role, p.identity).filter(room => room.active !== false);
  const [roomId, setRoomId] = useState(restored?.payload.p_classroom_id || rooms.find(room => room.id === requestedRoom)?.id || rooms[0]?.id || "");
  const [day, setDay] = useState(restored?.payload.p_day || p.initialDay);
  const [values, setValues] = useState<GroupCareValues>(() => restored?.values || ({ kind: "meal", occurred_at: currentHour(), ended_at: "14:00", food: "", amount: "all", hygiene: "toilet", mood: "calm", note: "" }));
  const [selected, setSelected] = useState<string[]>(() => restored?.children.map(child => child.id) || []);
  const [individual, setIndividual] = useState<Record<string, IndividualValues>>(() => Object.fromEntries((restored?.payload.p_records || []).map(record => [record.student_id, record])));
  const [review, setReview] = useState(Boolean(restored));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<CareBatchAttempt | null>(restored || null);
  const submitting = useRef(false);
  const reviewSummary = useRef<HTMLDivElement>(null);
  const students = p.students.filter(child => child.schoolId === p.school?.id && child.classroomId === roomId && child.status === "active");
  const chosen = students.filter(child => selected.includes(child.id));
  const room = rooms.find(value => value.id === roomId);
  const locked = busy || Boolean(pending);
  const reviewChildren = pending?.children || chosen.map(child => ({ id: child.id, name: fullName(child) }));
  useEffect(() => {
    if (!review) return;
    const summary = reviewSummary.current;
    summary?.closest(".modal-content")?.scrollTo({ top: 0 });
    summary?.focus({ preventScroll: true });
  }, [review]);

  function change<K extends keyof GroupCareValues>(key: K, value: GroupCareValues[K]) {
    setValues(previous => ({ ...previous, [key]: value }));
    setError("");
    if (key === "kind") setIndividual({});
  }
  function customize(id: string, key: keyof IndividualValues, value: string) {
    setIndividual(previous => ({ ...previous, [id]: { ...previous[id], [key]: value } }));
    setError("");
  }
  function records() {
    return chosen.map(child => {
      const value = { ...values, ...individual[child.id] };
      return {
        ...value, student_id: child.id,
        ended_at: value.kind === "rest" ? value.ended_at : "",
        food: value.kind === "meal" ? value.food.trim() : "",
        amount: value.kind === "meal" ? value.amount : "",
        hygiene: value.kind === "hygiene" ? value.hygiene : "",
        mood: value.kind === "mood" ? value.mood : "",
        note: value.note.trim(),
      };
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!pending && (!room || !p.school?.id || !day || day > today())) { setError("Elige un aula y una fecha hasta hoy."); return; }
    if (!pending && (!chosen.length || chosen.length > 200)) { setError("Selecciona entre 1 y 200 niños que recibieron este cuidado."); return; }
    const rows = records();
    if (!pending && rows.some(row => row.kind === "meal" && row.food.length < 2)) { setError("Escribe el alimento que compartieron."); return; }
    if (!pending && rows.some(row => row.kind === "rest" && (!row.ended_at || row.ended_at <= row.occurred_at))) { setError("El fin del descanso debe ser posterior a su inicio para cada niño."); return; }
    if (!review) { setReview(true); return; }
    const payload = pending?.payload || { p_school_id: p.school!.id, p_classroom_id: room!.id, p_day: day, p_request_id: crypto.randomUUID(), p_records: rows };
    const attempt = pending || { payload, values, roomName: room!.name, children: reviewChildren };
    rememberCareBatchAttempt(scope, attempt);
    setPending(attempt);
    submitting.current = true; setBusy(true);
    try {
      const result = await rpc<{ saved: number }>("save_care_batch", payload);
      if (result.saved !== payload.p_records.length) throw new Error("No pudimos comprobar el guardado. Reintenta para verificarlo.");
      clearCareBatchAttempt(scope);
      p.onSaved(result.saved, payload.p_day, payload.p_records[0].student_id);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "No pudimos guardar los cuidados.";
      const code = (failure as { code?: string } | null)?.code || "";
      const rejected = ["P0001", "23514", "23503", "22P02", "42501", "PGRST202"].includes(code) && !message.includes("ya fue procesado");
      if (rejected) { clearCareBatchAttempt(scope); setPending(null); }
      setError(rejected ? message : `${message} Puedes reintentar el mismo guardado; los registros no se duplicarán.`);
    } finally { submitting.current = false; setBusy(false); }
  }

  return <Modal title="Registrar para el aula" subtitle={review ? "Revisa cada niño antes de compartir el registro con su familia." : "Un cuidado compartido, con atención a cada niño."} onClose={p.onClose} onSubmit={event => void submit(event)} submitLabel={pending ? "Reintentar guardado" : review ? "Guardar cuidados" : "Revisar registros"} submitDisabled={!pending && (!room || !chosen.length)} busy={busy} error={error}>
    <div className="care-batch-steps" aria-label="Pasos del registro"><span aria-current={!review ? "step" : undefined}><b>1</b> Cuidado y niños</span><span aria-current={review ? "step" : undefined}><b>2</b> Revisar y guardar</span></div>
    {restored && pending && <p className="message info">Hay un guardado pendiente de comprobar. Reintenta para confirmar el resultado antes de comenzar otro registro.</p>}
    {!review ? <>
      <div className="form-grid">
        <Field label="Aula" name="batchRoom"><select id="batchRoom" value={roomId} onChange={event => { setRoomId(event.target.value); setSelected([]); setIndividual({}); setError(""); }} required>{rooms.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
        <Field label="Fecha" name="batchDay"><input id="batchDay" type="date" max={today()} value={day} required onChange={event => setDay(event.target.value)} /></Field>
        <Field label="Tipo de cuidado" name="batchKind"><select id="batchKind" value={values.kind} onChange={event => change("kind", event.target.value as GroupCareKind)}>{options(groupKinds)}</select></Field>
        <Field label="Hora" name="batchTime"><select id="batchTime" value={values.occurred_at} onChange={event => change("occurred_at", event.target.value)}>{hourOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        {values.kind === "meal" && <><Field label="Alimento" name="batchFood"><input id="batchFood" value={values.food} required minLength={2} maxLength={300} placeholder="Por ejemplo, fruta y yogur" onChange={event => change("food", event.target.value)} /></Field><Field label="Cantidad que comieron" name="batchAmount"><select id="batchAmount" value={values.amount} onChange={event => change("amount", event.target.value)}>{options(foodAmounts)}</select></Field></>}
        {values.kind === "rest" && <Field label="Fin del descanso" name="batchEnd"><select id="batchEnd" value={values.ended_at} onChange={event => change("ended_at", event.target.value)}>{hourOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>}
        {values.kind === "hygiene" && <Field label="Registro de higiene" name="batchHygiene"><select id="batchHygiene" value={values.hygiene} onChange={event => change("hygiene", event.target.value)}>{options(hygieneKinds)}</select></Field>}
        {values.kind === "mood" && <Field label="Estado de ánimo" name="batchMood"><select id="batchMood" value={values.mood} onChange={event => change("mood", event.target.value)}>{options(moods)}</select></Field>}
      </div>
      <Field label="Observación general (opcional)" name="batchNote"><textarea id="batchNote" rows={2} maxLength={4000} value={values.note} onChange={event => change("note", event.target.value)} placeholder="Un detalle de esta actividad para las familias seleccionadas" /></Field>
      <p className="care-batch-help">La observación general será visible para cada familia seleccionada. En el siguiente paso puedes cambiarla para un niño.</p>
      <div className="care-batch-selection-heading"><div><h3><Users size={18} /> ¿Quiénes recibieron este cuidado?</h3><p>Selecciona a los niños. Este registro no modifica la asistencia.</p></div><Button variant="secondary" onClick={() => setSelected(chosen.length === students.length ? [] : students.map(child => child.id))} disabled={!students.length}>{chosen.length === students.length && students.length ? "Quitar selección" : "Seleccionar todos"}</Button></div>
      <p className="care-batch-count" role="status">{chosen.length} de {students.length} seleccionados</p>
      <div className="care-batch-roster">{students.map(child => <label key={child.id} className={`care-batch-select-row${selected.includes(child.id) ? " selected" : ""}`}><input type="checkbox" checked={selected.includes(child.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, child.id] : previous.filter(id => id !== child.id))} /><span><strong>{fullName(child)}</strong>{values.kind === "meal" && (child.allergies || child.foodRestrictions) && <small>{[child.allergies && `Alergias: ${child.allergies}`, child.foodRestrictions && `Alimentos restringidos: ${child.foodRestrictions}`].filter(Boolean).join(" · ")}</small>}</span></label>)}</div>
      {!students.length && <Empty title="No hay niños activos en esta aula" subtitle="Elige otra aula o revisa sus inscripciones." />}
      <p className="care-batch-help">Los incidentes se registran individualmente desde «Registrar cuidado».</p>
    </> : <>
      <div className="care-batch-summary" ref={reviewSummary} tabIndex={-1}><span><Heart size={20} /></span><div><h3>{careKinds[values.kind]} · {pending?.roomName || room?.name}</h3><p>{dateLabel(day)} · {values.occurred_at} · {reviewChildren.length} {reviewChildren.length === 1 ? "niño" : "niños"}</p>{values.kind === "meal" && <p>{values.food}</p>}</div><CheckCheck size={24} /></div>
      <p className="care-batch-help">Ajusta las excepciones. Cada familia consultará únicamente el registro de su hijo.</p>
      <div className="care-batch-review">{reviewChildren.map(child => {
        const value = { ...values, ...individual[child.id] };
        const name = child.name;
        return <section key={child.id} className="care-batch-review-row"><h3>{name}</h3><div className="form-grid">
          {values.kind === "meal" && <Field label={`Cantidad para ${name}`} name={`amount-${child.id}`}><select id={`amount-${child.id}`} value={value.amount} disabled={locked} onChange={event => customize(child.id, "amount", event.target.value)}>{options(foodAmounts)}</select></Field>}
          {values.kind === "rest" && <Field label={`Fin del descanso para ${name}`} name={`end-${child.id}`}><select id={`end-${child.id}`} value={value.ended_at} disabled={locked} onChange={event => customize(child.id, "ended_at", event.target.value)}>{hourOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>}
          {values.kind === "hygiene" && <Field label={`Higiene para ${name}`} name={`hygiene-${child.id}`}><select id={`hygiene-${child.id}`} value={value.hygiene} disabled={locked} onChange={event => customize(child.id, "hygiene", event.target.value)}>{options(hygieneKinds)}</select></Field>}
          {values.kind === "mood" && <Field label={`Ánimo para ${name}`} name={`mood-${child.id}`}><select id={`mood-${child.id}`} value={value.mood} disabled={locked} onChange={event => customize(child.id, "mood", event.target.value)}>{options(moods)}</select></Field>}
          <Field label={`Observación para ${name}`} name={`note-${child.id}`}><textarea id={`note-${child.id}`} rows={2} maxLength={4000} value={value.note} disabled={locked} onChange={event => customize(child.id, "note", event.target.value)} /></Field>
        </div></section>;
      })}</div>
      {pending ? <p className="care-batch-help">Conservamos la selección para que puedas reintentar el mismo guardado con seguridad.</p> : <Button variant="ghost" icon={ArrowLeft} onClick={() => { setReview(false); setError(""); }}>Volver a la selección</Button>}
    </>}
  </Modal>;
}
