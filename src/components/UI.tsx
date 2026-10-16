import { useEffect, useRef } from "react";
import type { ReactNode, FormEvent } from "react";
import { X, Inbox, Plus, Search, LoaderCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
export function Button({
  children,
  onClick,
  variant = "primary",
  icon: Icon,
  type = "button",
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  type?: "submit" | "button";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-${variant} ${className}`}
    >
      {Icon && <Icon size={17} />}
      <span>{children}</span>
    </button>
  );
}
export function Badge({ status, label }: { status: string; label?: string }) {
  const friendly: Record<string, string> = {
    active: "Activo",
    pending: "Pendiente",
    inactive: "De baja",
    paid: "Pagado",
    overdue: "Vencido",
    cancelled: "Anulado",
    all: "Toda la comunidad",
    families: "Familias",
    staff: "Equipo",
    approved: "Aprobado",
    rejected: "Rechazado",
    accepted: "Aceptada",
    revoked: "Revocada",
  };
  return (
    <span className={`badge status-${status}`}>
      <span className="badge-dot" />
      {label || friendly[status] || status}
    </span>
  );
}
export function Avatar({
  name,
  color,
  size = "md",
}: {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: color }}
    >
      {letters}
    </span>
  );
}
export function StatCard({
  label,
  value,
  icon: Icon,
  footer,
  tone = "mint",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  footer?: string;
  tone?: "mint" | "blue" | "amber" | "purple";
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon tone-${tone}`}>
        <Icon size={20} />
      </div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{footer || "Resumen actual"}</small>
      </div>
    </div>
  );
}
export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Buscar...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-box">
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Empty({
  title = "Todo empieza aquí",
  subtitle = "Agrega tu primer registro para comenzar.",
  action,
}: {
  title?: string;
  subtitle?: string;
  action?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {action && (
        <Button variant="secondary" icon={Plus} onClick={action}>
          Crear nuevo
        </Button>
      )}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  submitLabel = "Guardar",
  submitDisabled = false,
  busy = false,
  error = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  busy?: boolean;
  error?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [
      ...(dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
      ) || []),
    ];
    focusable()[1]?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) closeRef.current();
      if (e.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
      window.dispatchEvent(new Event("micole:modal-closed"));
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <fieldset disabled={busy}>
            <div className="modal-content">
              {children}
              {error && (
                <div className="message error" role="alert">
                  {error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={busy || submitDisabled}
                icon={busy ? LoaderCircle : undefined}
              >
                {busy ? "Guardando…" : submitLabel}
              </Button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
export function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  defaultValue,
  min,
  max,
  step,
  children,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  min?: string | number;
  max?: string | number;
  step?: string;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <sup> *</sup>}
      </span>
      {children || (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          min={min}
          max={max}
          step={step}
        />
      )}
    </label>
  );
}
