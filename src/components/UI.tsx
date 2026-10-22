import {
  cloneElement,
  isValidElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
const modalStack: symbol[] = [];
let bodyOverflowBeforeModals = "";
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
const FormNavigation = createContext<{
  active: string;
  register: (id: string, label: string) => () => void;
} | null>(null);
/** Keep all inputs mounted, so changing sections preserves values and FormData. */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId(),
    nav = useContext(FormNavigation),
    register = nav?.register;
  useLayoutEffect(() => register?.(id, title), [register, id, title]);
  return (
    <section
      data-form-section={id}
      hidden={!!nav?.active && nav.active !== id}
      className="form-section"
    >
      <h3>{title}</h3>
      <div className="form-section-body">{children}</div>
    </section>
  );
}
const FormDefaults=createContext<Record<string,string|boolean>>({});
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  submitLabel = "Guardar",
  submitDisabled = false,
  dismissible = true,
  busy = false,
  error = "",
  initialValues,
  onDraftChange,
}: {
  title: string;
  subtitle?: string;
  initialValues?:Record<string,string|boolean>;
  onDraftChange?:(form:HTMLFormElement)=>void;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  dismissible?: boolean;
  busy?: boolean;
  error?: string;
}) {
  const [discarding, setDiscarding] = useState(false);
  const [validationError, setValidationError] = useState("");
  const touched = useRef(false);
  const token = useRef(Symbol("modal"));
  const requestClose = () => {
    if (touched.current) setDiscarding(true);
    else onClose();
  };
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [reached, setReached] = useState(0);
  const register = useCallback((id: string, label: string) => {
    setSections((old) =>
      old.some((s) => s.id === id) ? old : [...old, { id, label }],
    );
    return () => setSections((old) => old.filter((s) => s.id !== id));
  }, []);
  const active = sections.some((s) => s.id === selected)
    ? selected
    : sections[0]?.id || "";
  const index = sections.findIndex((s) => s.id === active);
  const body = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const navigate = (id: string) => {
    setSelected(id);
    body.current?.scrollTo({ top: 0 });
  };
  const validate = (step: number) => {
    const node =
      sections[step] &&
      form.current?.querySelector<HTMLElement>(
        `[data-form-section="${sections[step].id}"]`,
      );
    const controls = [
      ...((node || form.current)?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input,select,textarea") || []),
    ];
    const invalid = controls.find(
      (input) => input.willValidate && !input.checkValidity(),
    );
    if (!invalid) return true;
    setValidationError(
      "Revisa los campos obligatorios o el formato del paso indicado antes de continuar.",
    );
    if (sections[step]) flushSync(() => setSelected(sections[step].id));
    requestAnimationFrame(() => {
      invalid.focus();
      invalid.reportValidity();
    });
    return false;
  };
  const forward = (next: number) => {
    for (let i = 0; i < next; i++) if (!validate(i)) return;
    setReached((n) => Math.max(n, next));
    navigate(sections[next].id);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || submitDisabled) return;
    if (sections.length > 1 && index < sections.length - 1) {
      forward(index + 1);
      return;
    }
    if (sections.length > 1 && reached < sections.length - 1) return;
    if (sections.length) {
      for (let i = 0; i < sections.length; i++) if (!validate(i)) return;
    } else if (!validate(0)) return;
    onSubmit(event);
  };
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(requestClose);
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;
  const busyRef = useRef(busy);
  closeRef.current = requestClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
        ) || []),
      ].filter((node) => node.getClientRects().length > 0);
    const modalToken = token.current;
    if (!modalStack.length)
      bodyOverflowBeforeModals = document.body.style.overflow;
    modalStack.push(modalToken);
    dialog.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const fit = () => {
      const height = viewport?.height || window.innerHeight;
      if (dialog.current) {
        dialog.current.style.setProperty("--modal-viewport", `${height}px`);
        const backdrop = dialog.current.parentElement;
        if (backdrop) {
          backdrop.style.height = `${height}px`;
          backdrop.style.top = `${viewport?.offsetTop || 0}px`;
          backdrop.style.bottom = "auto";
        }
      }
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    const key = (e: KeyboardEvent) => {
      if (modalStack.at(-1) !== modalToken) return;
      if (e.key === "Escape" && dismissRef.current && !busyRef.current)
        closeRef.current();
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
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      modalStack.splice(modalStack.indexOf(modalToken), 1);
      if (!modalStack.length)
        document.body.style.overflow = bodyOverflowBeforeModals;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      window.dispatchEvent(new Event("micole:modal-closed"));
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (
          e.target === e.currentTarget &&
          dismissible &&
          !busy &&
          modalStack.at(-1) === token.current
        )
          requestClose();
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
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
          {dismissible && (
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label="Cerrar"
              onClick={requestClose}
            >
              <X size={20} />
            </button>
          )}
        </div>
        {sections.length > 1 && (
          <nav className="form-step-nav" aria-label="Secciones del formulario">
            {sections.map((section, i) => (
              <button
                key={section.id}
                type="button"
                disabled={busy || i > reached}
                aria-current={active === section.id ? "step" : undefined}
                onClick={() => (i > index ? forward(i) : navigate(section.id))}
              >
                <span>{i + 1}</span>
                {section.label}
              </button>
            ))}
          </nav>
        )}
        {discarding && (
          <div className="modal-discard" role="alert">
            <p>Tienes cambios sin guardar. ¿Quieres descartarlos?</p>
            <div>
              <Button variant="secondary" onClick={() => setDiscarding(false)}>
                Seguir editando
              </Button>
              <Button variant="danger" onClick={onClose}>
                Descartar y cerrar
              </Button>
            </div>
          </div>
        )}
        {(error || validationError) && (
          <div className="modal-error message error" role="alert">
            {error || validationError}
          </div>
        )}
        <form
          ref={form}
          noValidate
          onSubmit={submit}
          onChange={e=>{const el=e.currentTarget;queueMicrotask(()=>{if(el.isConnected)onDraftChange?.(el);});}}
          onChangeCapture={() => {
            touched.current = true;
            setValidationError("");
          }}
        >
          <div
            className="modal-content"
            ref={body}
            tabIndex={0}
            aria-label="Contenido del formulario"
          >
            <fieldset disabled={busy}>
              <FormNavigation.Provider value={{ active, register }}>
                <FormDefaults.Provider value={initialValues||{}}>{children}</FormDefaults.Provider>
              </FormNavigation.Provider>
            </fieldset>
          </div>
          <div className="modal-footer">
            {sections.length > 1 && (
              <div className="form-step-controls">
                <small>
                  {index + 1} de {sections.length}
                </small>
                <Button
                  variant="ghost"
                  disabled={busy || index <= 0}
                  onClick={() => navigate(sections[index - 1].id)}
                >
                  Anterior
                </Button>
                {index < sections.length - 1 && (
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => forward(index + 1)}
                  >
                    Siguiente
                  </Button>
                )}
              </div>
            )}
            {dismissible && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={requestClose}
              >
                Cancelar
              </Button>
            )}
            {(sections.length <= 1 || index === sections.length - 1) && (
              <Button
                type="submit"
                disabled={busy || submitDisabled}
                icon={busy ? LoaderCircle : undefined}
              >
                {busy ? "Guardando…" : submitLabel}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body,
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
  const defaults=useContext(FormDefaults),value=defaults[name];
  let content=children;
  if(value!==undefined&&isValidElement<Record<string,unknown>>(children)&&['input','textarea','select'].includes(String(children.type))&&children.props.value===undefined&&children.props.checked===undefined){content=cloneElement(children,children.props.type==='checkbox'?{defaultChecked:value===true||value==='on'}:{defaultValue:String(value)});}
  return (
    <label className="field">
      <span>
        {label}
        {required && <sup> *</sup>}
      </span>
      {content || (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={value===undefined?defaultValue:String(value)}
          min={min}
          max={max}
          step={step}
        />
      )}
    </label>
  );
}
