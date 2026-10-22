import { exportTable } from "../lib/financialApi";
import { publicDemo, setDemoRole } from "../lib/demo-config";
import { useMemo, useState } from "react";
import {
  Cross,
  Car,
  GraduationCap,
  Megaphone,
  BookOpen,
  Bell,
  MessageSquare,
  Wallet,
  Gift,
} from "lucide-react";
import { Button, Modal } from "../components/UI";
import { rpc } from "../lib/repository";
import { liveMode, supabase } from "../lib/supabase";
import {
  alertType,
  noticeCategories,
  type AnnouncementView,
  type AnnouncementReceipt,
} from "../lib/announcements";
import {
  useAnnouncementInbox,
  type NoticeApi,
} from "../lib/useAnnouncementInbox";
import type { Identity, Role } from "../lib/types";
import type { AppStore } from "../lib/store";
import "../styles/announcements.css";
export function AlertIcon({
  notice,
  size = 20,
}: {
  notice: { kind?: string; alertType?: string };
  size?: number;
}) {
  const type = alertType(notice);
  const Icon = {
    attendance: BookOpen,
    health: Cross,
    pickup: Car,
    grades: GraduationCap,
    tasks: BookOpen,
    announcement: Megaphone,
    academic: BookOpen,
    messages: MessageSquare,
    payments: Wallet,
    birthdays: Gift,
    general: Bell,
  }[type];
  return (
    <Icon
      size={size}
      aria-label={
        type === "health" ? "Salud" : type === "pickup" ? "Recojo" : undefined
      }
    />
  );
}
export function AnnouncementGate({
  identity,
  role,
  schoolId,
  store,
}: {
  identity: Identity;
  role: Role;
  schoolId?: string;
  store: AppStore;
}) {
  const scope = [
    identity.id,
    identity.support?.id || "",
    role,
    schoolId || "",
  ].join(":");
  const api = useMemo<NoticeApi>(() => {
    if (liveMode || publicDemo)
      return {
        pending: () =>
          identity.support
            ? Promise.resolve([])
            : rpc("pending_announcements", { p_school_id: schoolId }),
        view: (id) => rpc("announcement_view", { p_id: id }),
        read: (id, agree) =>
          rpc("read_announcement", { p_id: id, p_agree: agree }),
        report: (id) => rpc("announcement_report", { p_id: id }),
        withdraw: async (id) => {
          await rpc("withdraw_announcement", { p_id: id });
        },
      };
    const key = `micole.notice.receipts.${identity.id}.${role}`;
    const receipts = (): Record<
      string,
      { readAt?: string; acknowledgedAt?: string }
    > => {
      try {
        return JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        return {};
      }
    };
    const eligible = (n: AppStore["data"]["announcements"][number]) =>
      !n.revokedAt &&
      n.schoolId === schoolId &&
      (role === "director" ||
        ((!n.classroomId ||
          store.data.students.some(
            (s) =>
              s.classroomId === n.classroomId &&
              (role === "guardian"
                ? identity.guardianStudentIds.includes(s.id)
                : true) &&
              (!n.targetStudentIds?.length ||
                n.targetStudentIds.includes(s.id)),
          )) &&
          (n.audience === "all" ||
            n.audience === (role === "guardian" ? "families" : "staff"))));
    const view = async (id: string): Promise<AnnouncementView> => {
      const n = store.data.announcements.find(
        (n) => n.id === id && eligible(n),
      );
      if (!n) throw new Error("Este aviso no está disponible.");
      return {
        ...n,
        ...receipts()[id],
        canManage:
          role === "director" ||
          (role === "teacher" && n.createdBy === identity.id),
        canAcknowledge: !identity.support && n.createdBy !== identity.id,
      };
    };
    return {
      view,
      pending: async () => {
        if (identity.support) return [];
        const list = await Promise.all(
          store.data.announcements.filter(eligible).map((n) => view(n.id)),
        );
        return list
          .filter(
            (n) =>
              n.canAcknowledge &&
              ((n.requiresAcknowledgment && !n.acknowledgedAt) ||
                (["health", "pickup"].includes(n.category || "") && !n.readAt)),
          )
          .sort(
            (a, b) =>
              Number(!!b.requiresAcknowledgment) -
              Number(!!a.requiresAcknowledgment),
          );
      },
      read: async (id, agree) => {
        const n = await view(id);
        const r = receipts();
        r[id] = {
          ...r[id],
          readAt: r[id]?.readAt || new Date().toISOString(),
          ...(agree && n.requiresAcknowledgment
            ? { acknowledgedAt: new Date().toISOString() }
            : {}),
        };
        localStorage.setItem(key, JSON.stringify(r));
        return view(id);
      },
      report: async () => [],
      withdraw: async (id) => {
        const n = store.data.announcements.find((n) => n.id === id);
        if (n)
          await store.save("announcements", {
            ...n,
            revokedAt: new Date().toISOString(),
          });
      },
    };
  }, [scope, store.data.announcements, store.data.students]);
  const inbox = useAnnouncementInbox({
    scope,
    enabled: !!schoolId && role !== "superadmin" && role !== "student",
    api,
    revision: `${store.loading}:${store.data.notifications.map((n) => n.id + ":" + n.readAt).join("|")}:${store.data.announcements.map((n) => n.id + ":" + n.revokedAt).join("|")}`,
    canOpen: () =>
      !store.loading &&
      !store.busy &&
      !document.querySelector('[aria-modal="true"]'),
    onChanged: () => void store.refresh(["announcements", "notifications"]),
  });
  const n = inbox.notice;
  if (!n)
    return inbox.error ? (
      <div className="notice-load-error" role="alert">
        {inbox.error}{" "}
        <button className="text-button" onClick={inbox.retry}>
          Reintentar avisos
        </button>
      </div>
    ) : null;
  return (
    <Modal
      title={n.title}
      subtitle={
        inbox.required
          ? "Confirmación personal requerida"
          : noticeCategories[n.category || "general"]
      }
      dismissible={!inbox.required}
      onClose={inbox.close}
      onSubmit={(e) => {
        e.preventDefault();
        if (inbox.required) void inbox.action("accept");
        else inbox.close();
      }}
      submitLabel={
        inbox.required ? "Confirmar: estoy de acuerdo" : "Cerrar aviso"
      }
      submitDisabled={inbox.required && !inbox.agree}
      busy={inbox.busy}
      error={inbox.error}
    >
      <div className={`notice-heading notice-${n.category || "general"}`}>
        <AlertIcon
          notice={{
            alertType: n.category === "general" ? "announcement" : n.category,
          }}
        />
        <b>
          {noticeCategories[n.category || "general"]}
          {n.urgent ? " · Urgente" : ""}
        </b>
      </div>
      <p className="notice-content">{n.content}</p>
      {n.acknowledgedAt && (
        <div className="soft-note">
          Confirmado el {new Date(n.acknowledgedAt).toLocaleString("es-BO")}
        </div>
      )}
      {inbox.required && (
        <>
          <p className="muted">
            Esta confirmación se registra en tu cuenta. Leer el aviso no
            equivale a aceptarlo.
          </p>
          <label className="notice-consent">
            <input
              type="checkbox"
              checked={inbox.agree}
              onChange={(e) => inbox.setAgree(e.target.checked)}
            />{" "}
            He leído el aviso y estoy de acuerdo.
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              if (publicDemo) {
                setDemoRole(null);
                window.location.assign("/");
              } else if (supabase) void supabase.auth.signOut();
              else window.location.assign("/");
            }}
          >
            Cerrar sesión
          </Button>
        </>
      )}
      {identity.support && (
        <div className="soft-note">
          Vista de soporte: la confirmación debe hacerla la persona
          destinataria.
        </div>
      )}
      {n.canManage && (
        <div className="notice-management">
          <Button
            variant="secondary"
            onClick={() => void inbox.action("report")}
          >
            Ver lecturas y confirmaciones
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (
                window.confirm(
                  "¿Retirar este aviso? Se detendrán sus recordatorios.",
                )
              )
                void inbox.action("withdraw");
            }}
          >
            Retirar aviso
          </Button>
        </div>
      )}
      {inbox.report && (
        <ReceiptList
          rows={inbox.report}
          required={!!n.requiresAcknowledgment}
        />
      )}
    </Modal>
  );
}
function ReceiptList({
  rows,
  required,
}: {
  rows: AnnouncementReceipt[];
  required: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const shown = rows.filter(
    (r) =>
      filter === "all" ||
      (filter === "confirmed" ? !!r.acknowledgedAt : !r.acknowledgedAt),
  );
  return (
    <div className="notice-receipts">
      <h3>Destinatarios · {rows.length}</h3>
      <p>
        {required
          ? `${rows.filter((r) => r.acknowledgedAt).length} confirmados · ${rows.filter((r) => !r.acknowledgedAt).length} sin confirmar · `
          : ""}
        {rows.filter((r) => r.readAt).length} leídos ·{" "}
        {rows.filter((r) => !r.readAt).length} sin leer
      </p>
      {required && (
        <label className="field">
          <span>Estado de confirmación</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="confirmed">Confirmados</option>
            <option value="pending">Sin confirmar</option>
          </select>
        </label>
      )}
      <Button
        variant="secondary"
        onClick={() =>
          exportTable(
            "confirmaciones-aviso.csv",
            ["Persona", "Correo", "Niños", "Estado", "Leído el", "Confirmó el"],
            shown.map((r) => [
              r.name,
              r.email || "",
              r.children?.join(" · ") || "",
              r.acknowledgedAt
                ? "Confirmado"
                : r.accountPending
                  ? "Pendiente de ingreso"
                  : r.readAt
                    ? required
                      ? "Leído sin confirmar"
                      : "Leído"
                    : "Sin leer",
              r.readAt || "",
              r.acknowledgedAt || "",
            ]),
          )
        }
      >
        Exportar confirmaciones CSV
      </Button>
      {required && (
        <small>
          Sin confirmar indica que aún no se registró aceptación; no significa
          rechazo.
        </small>
      )}
      {!rows.length && (
        <p>Las lecturas aparecerán cuando ingresen los destinatarios.</p>
      )}
      {shown.map((r, i) => (
        <div key={i}>
          <b>{r.name}</b>
          <small>{r.children?.join(" · ")}</small>
          {r.accountPending && (
            <small>Pendiente de ingreso o vinculación de cuenta</small>
          )}
          <small>
            {r.acknowledgedAt
              ? `Confirmó: ${new Date(r.acknowledgedAt).toLocaleString("es-BO")}`
              : r.readAt
                ? required
                  ? "Leído · pendiente de confirmar"
                  : "Leído"
                : "Pendiente de lectura"}
          </small>
        </div>
      ))}
    </div>
  );
}
