import { useWorkspaceRevision } from "../lib/useWorkspaceRevision";
import { useEffect, useState } from "react";
import {
  Button,
  Field,
  Modal,
  FormSection,
  SectionTitle,
  Empty,
  Badge,
} from "../components/UI";
import { rpc } from "../lib/repository";
import { publicDemo } from "../lib/demo-config";
import { today } from "../lib/billing";
import { uid, money } from "../lib/format";
import {
  weekDays,
  staffHours,
  staffLateDeduction,
  staffPayrollHtml,
  staffStatus,
  staffTimestamp,
  previousPayrollMonth,
  type StaffWorkspace as Workspace,
  type StaffProfile,
  type StaffRecord,
  type StaffPayroll,
  type PayrollAdjustment,
  type WorkShift,
  type StaffLocation,
} from "../lib/staff";
import type { PageProps } from "./Pages";
import "../styles/staff.css";

function location(): Promise<StaffLocation> {
  if (publicDemo)
    return Promise.resolve({
      latitude: -16.5,
      longitude: -68.1,
      accuracy: 5,
      capturedAt: new Date().toISOString(),
    });
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          "Este dispositivo no permite obtener ubicación. Usa Android o solicita una corrección a Dirección.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          capturedAt: new Date(p.timestamp).toISOString(),
        }),
      () =>
        reject(
          new Error(
            "Permite la ubicación precisa, activa el GPS y vuelve a intentarlo. Si no funciona, solicita una corrección a Dirección.",
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });
}
function localTime(timestamp?: string | null) {
  if (!timestamp) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
const initialSchedule = (): WorkShift[] =>
  [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    start: "08:00",
    end: "16:00",
    breakMinutes: 60,
  }));

export function StaffWorkspaceScreen({
  school,
  role,
  view,
}: PageProps & { view: "staffAttendance" | "staffPayroll" }) {
  return (
    <StaffWorkspaceContent
      key={`${school?.id}:${view}`}
      school={school}
      role={role}
      view={view}
    />
  );
}
function StaffWorkspaceContent({
  school,
  role,
  view,
}: Pick<PageProps, "school" | "role"> & {
  view: "staffAttendance" | "staffPayroll";
}) {
  const payrollView = view === "staffPayroll";
  const [month, setMonth] = useState(
      payrollView ? previousPayrollMonth(today()) : today().slice(0, 7),
    ),
    [snapshot, setSnapshot] = useState<{key:string; data:Workspace} | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [filter, setFilter] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false),
    [profile, setProfile] = useState<Partial<StaffProfile> | null>(null),
    [shifts, setShifts] = useState<WorkShift[]>([]),
    [geo, setGeo] = useState<{ latitude: number; longitude: number } | null>(
      null,
    );
  const [correction, setCorrection] = useState<Partial<StaffRecord> | null>(
      null,
    ),
    [detail, setDetail] = useState<StaffPayroll | null>(null),
    [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]),
    [note, setNote] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [payment, setPayment] = useState<StaffPayroll | null>(null);
  const schoolId = school?.id;
  const workspaceKey = JSON.stringify([schoolId, month, role]);
  const data = snapshot?.key === workspaceKey ? snapshot.data : null;
  const liveRevision = useWorkspaceRevision(["staff_attendance_settings", "staff_work_profiles", "staff_attendance_records", "staff_attendance_changes", "staff_payrolls", "teachers"], schoolId);
  useEffect(() => {
    let alive = true;
    setError("");

    if (schoolId && /^\d{4}-\d{2}$/.test(month))
      void rpc<Workspace>("staff_workspace", {
        p_school_id: schoolId,
        p_month: month + "-01",
      })
        .then((d) => {
          if (alive) setSnapshot({key:workspaceKey, data:d});
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [schoolId, month, revision, liveRevision, workspaceKey]);
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) =>
    data?.teachers.find((t) => t.id === id)?.name || "Docente";
  const records =
    data?.records.filter((r) => !filter || r.teacher_id === filter) || [];
  const showProfile = (teacherId: string) => {
    const p = data?.profiles.find((p) => p.teacher_id === teacherId);
    setProfile(
      p || {
        teacher_id: teacherId,
        pay_type: "monthly",
        monthly_salary: 0,
        hourly_rate: 0,
        active: true,
      },
    );
    setShifts(p?.schedule.map((s) => ({ ...s })) || initialSchedule());
    setError("");
  };
  const openDetail = (p: StaffPayroll) => {
    setDetail(p);
    setAdjustments(p.adjustments.map((a) => ({ ...a })));
    setNote(p.note);
    setReviewed(false);
    setError("");
  };
  const dirty =
    !!detail &&
    (JSON.stringify(adjustments) !== JSON.stringify(detail.adjustments) ||
      note !== detail.note);
  if (!school) return <Empty title="Selecciona una sede" />;
  return (
    <>
      <SectionTitle
        title={payrollView ? "Boletas de pago" : "Asistencia del equipo"}
        subtitle={
          payrollView
            ? "Revisión de sueldos, conceptos y pagos del equipo."
            : "Entradas y salidas por sede, con hora del servidor y correcciones justificadas."
        }
        action={
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setRevision((v) => v + 1)}
          >
            Actualizar
          </Button>
        }
      />
      <div className="staff-toolbar">
        <Field label="Mes" name="staffMonth">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
        <Field label="Docente" name="staffTeacher">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos mis autorizados</option>
            {data?.teachers.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {data?.canManage && !payrollView && (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setGeo(null);
                setError("");
                setSettingsOpen(true);
              }}
            >
              Configurar ubicación y reglas
            </Button>
            <Button
              disabled={!data.settings || !data.profiles.length}
              onClick={() => {
                setError("");
                setCorrection({});
              }}
            >
              Registrar corrección
            </Button>
          </>
        )}
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Consultando el equipo…</p>}
      {data && !payrollView && (
        <>
          {!data.settings ? (
            <div className="soft-note">
              Dirección debe configurar la ubicación de esta sede antes de
              habilitar marcaciones.
            </div>
          ) : (
            <div className="soft-note">
              Rango autorizado: {data.settings.radius_m} m · Precisión máxima
              aceptada: {data.settings.max_accuracy_m} m. La ubicación se
              solicita únicamente al pulsar una marcación.
              {publicDemo &&
                " En esta demo la ubicación y las marcaciones son simuladas."}
              {data.settings.deductions_enabled && (
                <p>
                  Tolerancia: {data.settings.tolerance_minutes} min ·{" "}
                  {money(data.settings.late_rate)} por minuto{" "}
                  {data.settings.late_mode === "excess"
                    ? "adicional"
                    : "de toda la tardanza si supera la tolerancia"}
                  . Dirección revisa el descuento antes de aprobar la boleta.
                </p>
              )}
            </div>
          )}
          {role === "teacher" &&
            data.teachers.map((t) => {
              const p = data.profiles.find(
                  (p) => p.teacher_id === t.id && p.active,
                ),
                entry = data.openRecords.find((r) => r.teacher_id === t.id);
              return (
                <section className="panel staff-clock" key={t.id}>
                  <div>
                    <h2>{t.name}</h2>
                    <p>
                      {entry
                        ? `Entrada registrada: ${staffTimestamp(entry.check_in)}`
                        : p
                          ? "Tu turno se identifica según los horarios configurados por Dirección."
                          : "Dirección debe configurar y habilitar tu horario."}
                    </p>
                  </div>
                  <Button
                    disabled={busy || !p || !data.settings}
                    onClick={() =>
                      void act(async () => {
                        const point = await location();
                        await rpc("mark_staff_attendance", {
                          p_teacher_id: t.id,
                          p_kind: entry ? "out" : "in",
                          p_location: point,
                          p_id: entry?.id || uid(),
                        });
                      })
                    }
                  >
                    {busy
                      ? "Comprobando ubicación…"
                      : entry
                        ? "Marcar salida"
                        : "Marcar entrada"}
                  </Button>
                </section>
              );
            })}
          {data.canManage && (
            <section className="panel">
              <h2>Horarios y sueldos</h2>
              <div className="staff-roster">
                {data.teachers.map((t) => {
                  const p = data.profiles.find((p) => p.teacher_id === t.id);
                  return (
                    <article key={t.id}>
                      <div>
                        <b>{t.name}</b>
                        <p>
                          {p
                            ? `${p.pay_type === "monthly" ? "Mensual" : "Por hora"} · ${money(p.pay_type === "monthly" ? p.monthly_salary : p.hourly_rate)} · ${p.schedule.length} turnos semanales`
                            : "Horario y sueldo pendientes"}
                          {p && !p.active ? " · Deshabilitado" : ""}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => showProfile(t.id)}
                      >
                        {p ? "Editar horario y sueldo" : "Configurar docente"}
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          <section className="panel">
            <h2>Registro de asistencia</h2>
            <p>
              {records.length} registros ·{" "}
              {staffHours(records.reduce((n, r) => n + r.worked_minutes, 0))}{" "}
              con salida registrada.
            </p>
            <div className="staff-record-grid">
              {records.map((r) => (
                <article className="entity-card" key={r.id}>
                  <div className="staff-line">
                    <b>{name(r.teacher_id)}</b>
                    <Badge
                      status={r.check_out ? "active" : "pending"}
                      label={r.check_out ? "Turno cerrado" : "Sin salida"}
                    />
                  </div>
                  <p>
                    Entrada: {staffTimestamp(r.check_in)}
                    <br />
                    Salida: {staffTimestamp(r.check_out)}
                  </p>
                  <p>
                    {staffHours(r.worked_minutes)} · {r.late_minutes} min de
                    tardanza
                    <br />
                    Descuento propuesto: {money(staffLateDeduction(r))}
                    {r.late_waived ? " · Justificada" : ""}
                  </p>
                  <small>
                    {r.source === "gps"
                      ? `Ubicación validada · precisión ${Math.round(r.entry_accuracy || 0)} m`
                      : "Corrección de Dirección"}
                    {r.note ? ` · ${r.note}` : ""}
                  </small>
                  {data.canManage && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setError("");
                        setCorrection(r);
                      }}
                    >
                      Corregir o justificar
                    </Button>
                  )}
                </article>
              ))}
            </div>
            {!records.length && (
              <Empty
                title="Sin marcaciones en este mes"
                subtitle="Las entradas, salidas y correcciones aparecerán aquí."
              />
            )}
          </section>
        </>
      )}
      {data && payrollView && (
        <>
          {data.canManage && (
            <section className="panel">
              <h2>Preparar y revisar</h2>
              <p>
                El cálculo mensual usa el sueldo configurado; por horas usa
                minutos registrados con salida, descontando el descanso.
                Aportes, impuestos, bonos y otros conceptos se agregan y revisan
                antes de aprobar. Las ausencias y horas extra no se sancionan
                automáticamente.
              </p>
              <p className="muted">
                La aprobación se habilita al terminar el mes. Recalcular un
                borrador reemplaza sus conceptos manuales.
              </p>
              <div className="staff-roster">
                {data.profiles
                  .filter((p) => !filter || p.teacher_id === filter)
                  .map((p) => {
                    const existing = data.payrolls.find(
                      (x) => x.teacher_id === p.teacher_id,
                    );
                    return (
                      <article key={p.id}>
                        <b>{name(p.teacher_id)}</b>
                        <Button
                          variant="secondary"
                          disabled={
                            busy || (!!existing && existing.status !== "draft")
                          }
                          onClick={() =>
                            void act(async () => {
                              if (
                                existing?.adjustments.length &&
                                !window.confirm(
                                  "Recalcular reemplazará los conceptos manuales del borrador. ¿Continuar?",
                                )
                              )
                                return;
                              await rpc("prepare_staff_payroll", {
                                p_teacher_id: p.teacher_id,
                                p_period: month + "-01",
                              });
                            })
                          }
                        >
                          {existing?.status === "draft"
                            ? "Recalcular borrador"
                            : "Preparar boleta"}
                        </Button>
                      </article>
                    );
                  })}
                {!data.profiles.length && (
                  <p>Configura los sueldos desde «Asistencia del equipo».</p>
                )}
              </div>
            </section>
          )}
          <div className="entity-grid">
            {data.payrolls
              .filter((p) => !filter || p.teacher_id === filter)
              .map((p) => (
                <article className="entity-card" key={p.id}>
                  <div className="staff-line">
                    <h2>
                      {p.profile_snapshot.teacherName || name(p.teacher_id)}
                    </h2>
                    <Badge
                      status={
                        p.status === "draft"
                          ? "pending"
                          : p.status === "paid"
                            ? "paid"
                            : "approved"
                      }
                      label={staffStatus[p.status]}
                    />
                  </div>
                  <p>
                    {month} ·{" "}
                    {p.profile_snapshot.pay_type === "monthly"
                      ? "Sueldo mensual"
                      : "Pago por horas"}
                  </p>
                  <p>
                    Ingresos: {money(p.gross_amount)}
                    <br />
                    Descuentos: {money(p.deductions)}
                  </p>
                  <h3>Líquido pagable: {money(p.net_amount)}</h3>
                  <Button variant="secondary" onClick={() => openDetail(p)}>
                    Ver boleta
                  </Button>
                </article>
              ))}
          </div>
          {!data.payrolls.length && (
            <Empty
              title={
                data.canManage
                  ? "Sin boletas preparadas"
                  : "Sin boletas aprobadas en este mes"
              }
              subtitle={
                data.canManage
                  ? "Prepara un borrador para revisar asistencia y conceptos."
                  : "Dirección publicará tu boleta después de revisarla."
              }
            />
          )}
        </>
      )}
      {settingsOpen && (
        <Modal
          busy={busy}
          title="Ubicación y reglas de asistencia"
          error={error}
          onClose={() => setSettingsOpen(false)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              await rpc("save_staff_settings", {
                p_school_id: school.id,
                p_values: {
                  latitude: Number(f.get("latitude")),
                  longitude: Number(f.get("longitude")),
                  radiusM: Number(f.get("radiusM")),
                  maxAccuracyM: Number(f.get("maxAccuracyM")),
                  toleranceMinutes: Number(f.get("toleranceMinutes")),
                  lateMode: f.get("lateMode"),
                  lateRate: Number(f.get("lateRate")),
                  deductionsEnabled: f.has("deductionsEnabled"),
                  policyNote: f.get("policyNote"),
                },
              });
              setSettingsOpen(false);
            });
          }}
        >
          <FormSection title="Ubicación de la sede">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void act(async () => setGeo(await location()))}
            >
              Usar mi ubicación actual
            </Button>
            <div className="form-grid">
              <Field label="Latitud" name="latitude" required>
                <input
                  key={geo?.latitude}
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  name="latitude"
                  defaultValue={geo?.latitude ?? data?.settings?.latitude}
                  required
                />
              </Field>
              <Field label="Longitud" name="longitude" required>
                <input
                  key={geo?.longitude}
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  name="longitude"
                  defaultValue={geo?.longitude ?? data?.settings?.longitude}
                  required
                />
              </Field>
              <Field label="Rango permitido · metros" name="radiusM" required>
                <input
                  type="number"
                  min={30}
                  max={2000}
                  name="radiusM"
                  defaultValue={data?.settings?.radius_m ?? 150}
                  required
                />
              </Field>
              <Field
                label="Precisión máxima GPS · metros"
                name="maxAccuracyM"
                required
              >
                <input
                  type="number"
                  min={5}
                  max={200}
                  name="maxAccuracyM"
                  defaultValue={data?.settings?.max_accuracy_m ?? 50}
                  required
                />
              </Field>
            </div>
            <p>
              Configura el punto estando en la sede o ingresa sus coordenadas.
              Un GPS impreciso requiere reintentar o una corrección justificada.
            </p>
          </FormSection>
          <FormSection title="Tardanzas y revisión">
            <div className="form-grid">
              <Field label="Tolerancia · minutos" name="toleranceMinutes">
                <input
                  type="number"
                  min={0}
                  max={120}
                  name="toleranceMinutes"
                  defaultValue={data?.settings?.tolerance_minutes ?? 10}
                />
              </Field>
              <Field label="Bs por minuto descontable" name="lateRate">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1000}
                  name="lateRate"
                  defaultValue={data?.settings?.late_rate ?? 0}
                />
              </Field>
              <Field label="Regla al superar tolerancia" name="lateMode">
                <select
                  name="lateMode"
                  defaultValue={data?.settings?.late_mode || "excess"}
                >
                  <option value="excess">Solo minutos adicionales</option>
                  <option value="all_after_tolerance">Toda la tardanza</option>
                </select>
              </Field>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="deductionsEnabled"
                defaultChecked={data?.settings?.deductions_enabled}
              />
              Proponer descuentos conforme al reglamento aplicable
            </label>
            <Field
              label="Reglamento o acuerdo que respalda la regla"
              name="policyNote"
            >
              <textarea
                name="policyNote"
                maxLength={2000}
                defaultValue={data?.settings?.policy_note || ""}
              />
            </Field>
            <p>
              Con tolerancia cero se cuentan todos los minutos de atraso. Las
              reglas nuevas se aplican a marcaciones futuras.
            </p>
          </FormSection>
        </Modal>
      )}
      {profile && (
        <Modal
          busy={busy}
          title={`Horario y sueldo · ${name(profile.teacher_id!)}`}
          error={error}
          onClose={() => setProfile(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              await rpc("save_staff_profile", {
                p_school_id: school.id,
                p_values: {
                  teacherId: profile.teacher_id,
                  payType: f.get("payType"),
                  monthlySalary: Number(f.get("monthlySalary")),
                  hourlyRate: Number(f.get("hourlyRate")),
                  active: f.has("active"),
                  schedule: shifts,
                },
              });
              setProfile(null);
            });
          }}
        >
          <FormSection title="Sueldo">
            <Field label="Modalidad" name="payType">
              <select name="payType" defaultValue={profile.pay_type}>
                <option value="monthly">Sueldo mensual</option>
                <option value="hourly">Por horas registradas</option>
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Sueldo mensual · Bs" name="monthlySalary" required>
                <input
                  name="monthlySalary"
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  defaultValue={profile.monthly_salary}
                  required
                />
              </Field>
              <Field label="Valor por hora · Bs" name="hourlyRate" required>
                <input
                  name="hourlyRate"
                  type="number"
                  min={0}
                  max={100000}
                  step="0.01"
                  defaultValue={profile.hourly_rate}
                  required
                />
              </Field>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="active"
                defaultChecked={profile.active}
              />
              Habilitar marcaciones de este docente
            </label>
          </FormSection>
          <FormSection title="Turnos de trabajo">
            <p>
              Agrega uno o más turnos por día. Los turnos de un mismo día no
              pueden superponerse ni cruzar medianoche.
            </p>
            {shifts.map((s, i) => (
              <div className="staff-shift" key={i}>
                <Field label="Día" name={`weekday${i}`}>
                  <select
                    value={s.weekday}
                    onChange={(e) =>
                      setShifts((v) =>
                        v.map((x, n) =>
                          n === i
                            ? { ...x, weekday: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  >
                    {weekDays.map((d, n) => (
                      <option value={n} key={n}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Entrada" name={`start${i}`}>
                  <input
                    type="time"
                    value={s.start}
                    required
                    onChange={(e) =>
                      setShifts((v) =>
                        v.map((x, n) =>
                          n === i ? { ...x, start: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Salida" name={`end${i}`}>
                  <input
                    type="time"
                    value={s.end}
                    required
                    onChange={(e) =>
                      setShifts((v) =>
                        v.map((x, n) =>
                          n === i ? { ...x, end: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Descanso · min" name={`break${i}`}>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={s.breakMinutes}
                    onChange={(e) =>
                      setShifts((v) =>
                        v.map((x, n) =>
                          n === i
                            ? { ...x, breakMinutes: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  variant="ghost"
                  aria-label={`Quitar turno ${i + 1}`}
                  onClick={() => setShifts((v) => v.filter((_, n) => n !== i))}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={shifts.length >= 21}
              onClick={() =>
                setShifts((v) => [
                  ...v,
                  { weekday: 1, start: "08:00", end: "12:00", breakMinutes: 0 },
                ])
              }
            >
              Agregar turno
            </Button>
          </FormSection>
        </Modal>
      )}
      {correction && (
        <Modal
          busy={busy}
          title="Corrección de asistencia"
          error={error}
          onClose={() => setCorrection(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              await rpc("correct_staff_attendance", {
                p_school_id: school.id,
                p_values: {
                  id: correction.id,
                  teacherId: f.get("teacherId"),
                  checkIn: String(f.get("checkIn")) + ":00-04:00",
                  checkOut: f.get("checkOut")
                    ? String(f.get("checkOut")) + ":00-04:00"
                    : "",
                  shiftStart: f.get("shiftStart"),
                  waiveLate: f.has("waiveLate"),
                },
                p_reason: f.get("reason"),
              });
              setCorrection(null);
            });
          }}
        >
          <Field label="Docente de la corrección" name="teacherId">
            <select
              name="teacherId"
              defaultValue={
                correction.teacher_id || filter || data?.profiles[0]?.teacher_id
              }
              required
            >
              {data?.profiles.map((p) => (
                <option value={p.teacher_id} key={p.id}>
                  {name(p.teacher_id)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Entrada · hora Bolivia" name="checkIn" required>
              <input
                type="datetime-local"
                name="checkIn"
                defaultValue={
                  localTime(correction.check_in) || today() + "T08:00"
                }
                required
              />
            </Field>
            <Field label="Salida · hora Bolivia" name="checkOut">
              <input
                type="datetime-local"
                name="checkOut"
                defaultValue={localTime(correction.check_out)}
              />
            </Field>
            {!correction.id && (
              <Field
                label="Inicio del turno programado"
                name="shiftStart"
                required
              >
                <input
                  type="time"
                  name="shiftStart"
                  defaultValue="08:00"
                  required
                />
              </Field>
            )}
          </div>
          <label className="checkbox-row">
            <input
              name="waiveLate"
              type="checkbox"
              defaultChecked={correction.late_waived}
            />
            Justificar tardanza y excluir su descuento
          </label>
          <Field
            label="Motivo y respaldo de la corrección"
            name="reason"
            required
          >
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              defaultValue={correction.note}
            />
          </Field>
          <p>
            La corrección conserva su historial. No se modifican registros de
            períodos con boleta aprobada.
          </p>
        </Modal>
      )}
      {detail && (
        <Modal
          busy={busy}
          title={`Boleta · ${detail.profile_snapshot.teacherName || name(detail.teacher_id)}`}
          error={error}
          submitLabel={
            data?.canManage && detail.status === "draft"
              ? "Guardar conceptos"
              : "Cerrar"
          }
          onClose={() => setDetail(null)}
          onSubmit={(e) => {
            e.preventDefault();
            if (data?.canManage && detail.status === "draft")
              void act(async () => {
                await rpc("edit_staff_payroll", {
                  p_id: detail.id,
                  p_adjustments: adjustments,
                  p_note: note,
                });
                setDetail(null);
              });
            else setDetail(null);
          }}
        >
          <div className="soft-note">
            <b>
              {staffStatus[detail.status]} · {month}
            </b>
            <p>
              Tiempo registrado: {staffHours(detail.worked_minutes)} · Tardanza:{" "}
              {detail.late_minutes} min
            </p>
            <p>
              Base: {money(detail.base_amount)} · Tardanzas propuestas:{" "}
              {money(detail.late_deduction)}
            </p>
          </div>
          <h3>Líquido registrado: {money(detail.net_amount)}</h3>
          <Button
            variant="secondary"
            onClick={() => {
              const popup = window.open("", "_blank");
              if (!popup) {
                setError("Permite abrir la impresión para guardar el PDF.");
                return;
              }
              popup.document.write(
                staffPayrollHtml(detail, name(detail.teacher_id), school.name),
              );
              popup.document.close();
              popup.print();
            }}
          >
            Imprimir / guardar PDF
          </Button>
          {data?.canManage && detail.status === "draft" ? (
            <>
              <h3>Conceptos adicionales</h3>
              {adjustments.map((a, i) => (
                <div className="staff-adjustment" key={i}>
                  <Field label="Tipo" name={`kind${i}`}>
                    <select
                      value={a.kind}
                      onChange={(e) =>
                        setAdjustments((v) =>
                          v.map((x, n) =>
                            n === i
                              ? {
                                  ...x,
                                  kind: e.target
                                    .value as PayrollAdjustment["kind"],
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="earning">Ingreso</option>
                      <option value="deduction">Descuento / aporte</option>
                    </select>
                  </Field>
                  <Field label="Concepto" name={`label${i}`}>
                    <input
                      value={a.label}
                      minLength={2}
                      maxLength={160}
                      required
                      onChange={(e) =>
                        setAdjustments((v) =>
                          v.map((x, n) =>
                            n === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Importe · Bs" name={`amount${i}`}>
                    <input
                      value={a.amount}
                      type="number"
                      step="0.01"
                      min={0}
                      max={1000000}
                      required
                      onChange={(e) =>
                        setAdjustments((v) =>
                          v.map((x, n) =>
                            n === i
                              ? { ...x, amount: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setAdjustments((v) => v.filter((_, n) => n !== i))
                    }
                  >
                    Quitar
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() =>
                  setAdjustments((v) => [
                    ...v,
                    { kind: "earning", label: "", amount: 0 },
                  ])
                }
              >
                Agregar concepto
              </Button>
              <Field label="Observaciones de la boleta" name="payrollNote">
                <textarea
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              {dirty && (
                <p className="message warn">
                  Guarda los conceptos y vuelve a abrir la boleta antes de
                  aprobar.
                </p>
              )}
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                He revisado la asistencia, los conceptos y los descuentos de
                esta boleta.
              </label>
              <Button
                disabled={busy || dirty || !reviewed}
                onClick={() =>
                  void act(async () => {
                    await rpc("approve_staff_payroll", { p_id: detail.id });
                    setDetail(null);
                  })
                }
              >
                Aprobar boleta
              </Button>
            </>
          ) : (
            <>
              {detail.adjustments.map((a, i) => (
                <p key={i}>
                  {a.label}: {a.kind === "deduction" ? "−" : ""}
                  {money(a.amount)}
                </p>
              ))}
              <p>{detail.note}</p>
              {detail.approved_at && (
                <p>Aprobada: {staffTimestamp(detail.approved_at)}</p>
              )}
              {detail.paid_at && (
                <p>
                  Pago: {staffTimestamp(detail.paid_at)} ·{" "}
                  {detail.payment_reference}
                </p>
              )}
              {data?.canManage && detail.status === "approved" && (
                <Button
                  onClick={() => {
                    setPayment(detail);
                    setDetail(null);
                  }}
                >
                  Registrar pago efectuado
                </Button>
              )}
            </>
          )}
        </Modal>
      )}
      {payment && (
        <Modal
          busy={busy}
          title="Registrar pago de boleta"
          error={error}
          onClose={() => setPayment(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              await rpc("record_staff_payroll_payment", {
                p_id: payment.id,
                p_method: f.get("method"),
                p_reference: f.get("reference"),
              });
              setPayment(null);
            });
          }}
        >
          <p>
            Importe aprobado: {money(payment.net_amount)}. Registra el pago que
            ya realizaste al docente.
          </p>
          <Field label="Método de pago" name="method">
            <select name="method">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="deposit">Depósito</option>
            </select>
          </Field>
          <Field
            label="Referencia o número de recibo"
            name="reference"
            required
          >
            <input name="reference" minLength={3} maxLength={160} required />
          </Field>
        </Modal>
      )}
    </>
  );
}
