import { useWorkspaceRevision } from "../lib/useWorkspaceRevision";
import { useEffect, useState } from "react";
import { Button, Field, Modal, SectionTitle } from "../components/UI";
import { rpc } from "../lib/repository";
import { liveMode } from "../lib/supabase";
import { money } from "../lib/format";
import {
  defaultTariffs,
  loadTariffs,
  loadPublicTariffs,
  type PlatformTariffs,
} from "../lib/pricing";
import type { School, Student } from "../lib/types";
export function usePlatformTariffs(schoolId?: string | null, enabled = true, anonymous = false) {
  const [value, setValue] = useState<{
      scope: string;
      rates: PlatformTariffs;
    } | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const scope = anonymous ? "public" : schoolId || "global";
  const liveRevision = useWorkspaceRevision(["platform_tariffs"], schoolId, enabled && !anonymous);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError("");
    void (anonymous ? loadPublicTariffs() : loadTariffs(schoolId))
      .then((rates) => {
        if (active) setValue({ scope, rates });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [schoolId, scope, enabled, anonymous, revision, liveRevision]);
  useEffect(() => {
    const update = () => setRevision((v) => v + 1);
    window.addEventListener("micole:tariffs", update);
    return () => window.removeEventListener("micole:tariffs", update);
  }, []);
  return {
    rates: value?.scope === scope ? value.rates : defaultTariffs,
    ready: !liveMode || !enabled || value?.scope === scope,
    error,
    refresh: () => setRevision((v) => v + 1),
  };
}
export function TariffSettings({ schools }: { schools: School[] }) {
  const [schoolId, setSchoolId] = useState(""),
    [editing, setEditing] = useState(false),
    [notice, setNotice] = useState("");
  const [activationChange,setActivationChange]=useState<boolean|null>(null);
  const [activationBusy,setActivationBusy]=useState(false),[activationError,setActivationError]=useState("");
  const { rates, ready, error, refresh } = usePlatformTariffs(schoolId);
  return (
    <section className="panel">
      <SectionTitle
        title="Tarifas de MiCole"
        subtitle="Solo el superadmin define la activación y licencia. Los cambios aplican a nuevos cobros."
      />
      <Field label="Aplicar tarifas a" name="tariffSchool">
        <select
          value={schoolId}
          onChange={(e) => {
            setSchoolId(e.target.value);
            setNotice("");
          }}
        >
          <option value="">Tarifas generales</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="message info">
          {notice}
        </p>
      )}
      {ready ? (
        <>
          <p className="message info">Activación por estudiante: <b>{rates.activationEnabled===false?"Deshabilitada":"Habilitada"}</b>. El adelanto inicial de la institución es Bs 500.</p>
          <Button variant="secondary" disabled={!liveMode} onClick={()=>{setActivationChange(rates.activationEnabled===false);setActivationError("");}}>{rates.activationEnabled===false?"Habilitar activación por estudiante":"Deshabilitar activación por estudiante"}</Button>
          <div className="form-grid">
            <div className="preview-total">
              <span>Activación por estudiante</span>
              <b>{money(rates.activationFee)}</b>
            </div>
            <div className="preview-total">
              <span>Licencia mensual por estudiante</span>
              <b>{money(rates.monthlyLicenseFee)}</b>
            </div>
          </div>
          {schoolId && (
            <p className="muted">
              {rates.inherited
                ? "Esta institución usa las tarifas generales."
                : "Esta institución tiene sus propias tarifas MiCole."}
            </p>
          )}
          <Button
            variant="secondary"
            disabled={!liveMode}
            onClick={() => setEditing(true)}
          >
            Modificar tarifas MiCole
          </Button>
        </>
      ) : (
        <p>Consultando tarifas…</p>
      )}
      <p className="muted">
        Las cuotas emitidas y sus abonos se conservan. Un precio nuevo no
        modifica deudas anteriores.
      </p>
      {activationChange!==null&&<Modal title={activationChange?"Habilitar cobro de activación":"Deshabilitar cobro de activación"} busy={activationBusy} error={activationError} onClose={()=>setActivationChange(null)} onSubmit={async e=>{e.preventDefault();setActivationBusy(true);setActivationError("");try{const f=new FormData(e.currentTarget);await rpc("set_platform_activation",{p_enabled:activationChange,p_reason:String(f.get("reason")||"")});refresh();window.dispatchEvent(new Event("micole:tariffs"));setActivationChange(null);setNotice("Configuración de activación actualizada.");}catch(e){setActivationError((e as Error).message);}finally{setActivationBusy(false);}}}><p>El cambio se aplica al cobro de activación de las instituciones. Los importes ya emitidos conservarán su historial.</p><Field label="Motivo del cambio" name="reason"><textarea name="reason" required minLength={5} maxLength={500} rows={3}/></Field></Modal>}
      {editing && (
        <TariffDialog
          schoolId={schoolId}
          rates={rates}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
            window.dispatchEvent(new Event("micole:tariffs"));
            setNotice(
              "Tarifas guardadas para nuevos cobros. Los importes emitidos siguen intactos.",
            );
          }}
        />
      )}
    </section>
  );
}
function TariffDialog({
  schoolId,
  rates,
  onClose,
  onSaved,
}: {
  schoolId: string;
  rates: PlatformTariffs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [inherit, setInherit] = useState(!!schoolId && rates.inherited),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Modificar tarifas MiCole"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await rpc("save_platform_tariffs", {
            p_school_id: schoolId || null,
            p_activation_fee: inherit ? null : Number(f.get("activation")),
            p_monthly_license_fee: inherit ? null : Number(f.get("monthly")),
            p_reason: String(f.get("reason") || "").trim(),
            p_use_global: inherit,
          });
          onSaved();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron guardar las tarifas.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {schoolId && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={inherit}
            onChange={(e) => setInherit(e.target.checked)}
          />
          Usar las tarifas generales
        </label>
      )}
      <div className="form-grid">
        <Field
          label="Activación MiCole · Bs"
          name="activation"
          type="number"
          min={0.01}
          max={1000000}
          step=".01"
        >
          <input
            name="activation"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            disabled={inherit}
            defaultValue={rates.configuredActivationFee??rates.activationFee}
          />
        </Field>
        <Field
          label="Licencia mensual MiCole · Bs"
          name="monthly"
          type="number"
          min={0.01}
          max={1000000}
          step=".01"
        >
          <input
            name="monthly"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            disabled={inherit}
            defaultValue={rates.monthlyLicenseFee}
          />
        </Field>
      </div>
      <Field label="Motivo del cambio" name="reason">
        <textarea name="reason" required minLength={5} maxLength={500} />
      </Field>
      <p className="soft-note">
        Esta configuración se utiliza al emitir nuevos cobros. No reduce ni
        recalcula cuotas ya creadas.
      </p>
    </Modal>
  );
}
export function ChargeAmountDialog({
  charge,
  kind,
  onClose,
  onSaved,
}: {
  charge: { id: string; amount: number; concept: string };
  kind: "school" | "platform";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Aumentar importe de la cuota"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await rpc("increase_issued_charge", {
            p_kind: kind,
            p_charge_id: charge.id,
            p_amount: Number(f.get("amount")),
            p_reason: String(f.get("reason") || "").trim(),
          });
          onSaved();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "No se pudo ajustar la cuota.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        {charge.concept} · Importe actual: <b>{money(charge.amount)}</b>
      </p>
      <Field
        label="Nuevo importe total · Bs"
        name="amount"
        type="number"
        min={charge.amount}
        max={1000000000}
        step=".01"
        required
        defaultValue={charge.amount}
      />
      <Field label="Motivo del ajuste" name="reason">
        <textarea name="reason" required minLength={5} maxLength={500} />
      </Field>
      <p className="soft-note">
        El importe emitido no se puede disminuir. Para cubrir una parte,
        registra un abono en Caja. Si hay un QR pendiente, compruébalo o
        cancélalo primero.
      </p>
    </Modal>
  );
}
export function StudentFeesDialog({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Precios para nuevas cuotas"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await rpc("set_student_fees", {
            p_student_id: student.id,
            p_monthly_fee: Number(f.get("monthly")),
            p_snack_fee: Number(f.get("snack")),
            p_enrollment_fee: Number(f.get("enrollment")),
            p_reason: String(f.get("reason") || "").trim(),
          });
          onSaved();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron actualizar los precios.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        {student.firstName} {student.lastName}
      </p>
      <div className="form-grid">
        <Field
          label="Nueva mensualidad base · Bs"
          name="monthly"
          type="number"
          min={0}
          max={1000000000}
          step=".01"
          required
          defaultValue={student.monthlyFee}
        />
        <Field
          label="Merienda mensual · Bs"
          name="snack"
          type="number"
          min={0}
          max={1000000000}
          step=".01"
          required
          defaultValue={student.snackFee || 0}
        />
        <Field
          label="Matrícula · Bs"
          name="enrollment"
          type="number"
          min={0}
          max={1000000000}
          step=".01"
          required
          defaultValue={student.enrollmentFee || 0}
        />
      </div>
      <Field label="Motivo del cambio" name="reason">
        <textarea name="reason" required minLength={5} maxLength={500} />
      </Field>
      <p className="soft-note">
        Se utilizarán en nuevas emisiones. Todas las cuotas ya creadas,
        incluidas las de meses futuros del plan, conservan su importe.
      </p>
    </Modal>
  );
}
