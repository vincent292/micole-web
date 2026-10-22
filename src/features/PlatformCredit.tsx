import { useWorkspaceRevision } from "../lib/useWorkspaceRevision";
import { useEffect, useState } from "react";
import { Button, Field, SectionTitle, StatCard } from "../components/UI";
import { Wallet, ShieldCheck } from "lucide-react";
import { rpc } from "../lib/repository";
import { liveMode } from "../lib/supabase";
import { money, dateLabel } from "../lib/format";
import { BankQrDialog } from "./BankQr";
import type { PlatformCredit } from "../lib/credit";
import type { AppStore } from "../lib/store";
import type { School } from "../lib/types";
export function PlatformCreditPanel({
  schoolId,
  schools,
  store,
}: {
  schoolId?: string;
  schools?: School[];
  store: AppStore;
}) {
  const [chosen, setChosen] = useState(schoolId || ""),
    [result, setResult] = useState<{
      scope: string;
      account?: PlatformCredit;
      error?: string;
    } | null>(null),
    [qr, setQr] = useState(false),
    [revision, setRevision] = useState(0);
  const selected = schoolId || chosen || schools?.[0]?.id || "";
  const liveRevision = useWorkspaceRevision(["platform_credit_accounts", "platform_credit_ledger", "platform_charges"], selected);
  const scope = `${selected}:${revision}`,
    account = result?.scope === scope ? result.account : undefined,
    error = result?.scope === scope ? result.error : "";
  useEffect(() => {
    let active = true;
    if (!selected) return;
    const task = liveMode
      ? rpc<PlatformCredit>("platform_credit_account", {
          p_school_id: selected,
        })
      : Promise.resolve({
          schoolId: selected,
          initialAmount: 500,
          initialPaid: true,
          balance: 442,
          chargeStatus: "paid",
          history: [
            {
              id: "demo-funding",
              kind: "funding" as const,
              chargeId: "demo-credit",
              createdAt: new Date().toISOString(),
              amount: 500,
              balance: 500,
            },
            {
              id: "demo-license",
              kind: "license" as const,
              chargeId: "demo-license",
              createdAt: new Date().toISOString(),
              amount: -58,
              balance: 442,
            },
          ],
        });
    void task
      .then((v) => {
        if (active) setResult({ scope, account: v });
      })
      .catch((e) => {
        if (active) setResult({ scope, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [selected, scope, liveRevision]);
  const refresh = () => {
    setRevision((v) => v + 1);
    void store.refresh();
  };
  return (
    <section className="panel platform-credit-panel">
      <SectionTitle
        title="Crédito de licencias MiCole"
        subtitle="El adelanto inicial de Bs 500 se utiliza para cubrir las licencias mensuales. Los movimientos se registran automáticamente."
        action={
          <Button variant="ghost" onClick={refresh}>
            Actualizar crédito
          </Button>
        }
      />
      {!schoolId && (
        <Field label="Institución del crédito" name="creditSchool">
          <select value={selected} onChange={(e) => setChosen(e.target.value)}>
            {schools?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {!account && !error && <p role="status">Consultando crédito…</p>}
      {account && (
        <>
          {!account.initialPaid && (
            <div className="message warn">
              <p>
                La institución debe completar el adelanto inicial de{" "}
                <b>Bs 500</b> para habilitar el uso académico. El importe queda
                como crédito para sus licencias.
              </p>
              {account.chargeId && (
                <Button onClick={() => setQr(true)}>
                  Pagar crédito inicial · Bs 500
                </Button>
              )}
            </div>
          )}
          <div className="stats-grid">
            <StatCard
              label="Saldo a favor"
              value={money(account.balance)}
              icon={Wallet}
              tone="blue"
              footer="Disponible para tus licencias"
            />
            <StatCard
              label="Habilitación inicial"
              value={account.initialPaid ? "Confirmada" : "Pendiente"}
              icon={ShieldCheck}
              tone={account.initialPaid ? "mint" : "amber"}
              footer="Adelanto institucional de Bs 500"
            />
          </div>
          <p className="muted">
            El saldo se calcula a partir de pagos bancarios confirmados y
            licencias emitidas. No se puede editar desde el panel.
          </p>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Importe</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {account.history.map((h) => (
                  <tr key={h.id}>
                    <td>{dateLabel(h.createdAt)}</td>
                    <td>
                      {h.kind === "funding"
                        ? "Adelanto confirmado"
                        : "Licencias mensuales"}
                    </td>
                    <td>
                      {h.amount > 0 ? "+" : ""}
                      {money(h.amount)}
                    </td>
                    <td>{money(h.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!account.history.length && (
            <p className="muted">
              Los movimientos aparecerán después del pago confirmado.
            </p>
          )}
          {qr && account.chargeId && (
            <BankQrDialog
              request={{
                kind: "platform",
                schoolId: selected,
                items: [{ chargeId: account.chargeId, amount: 500 }],
              }}
              onChanged={refresh}
              onClose={() => {
                setQr(false);
                refresh();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
