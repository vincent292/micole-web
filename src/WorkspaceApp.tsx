import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ChartNoAxesCombined,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Heart,
  Headset,
  Images,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  NotebookPen,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, Button } from "./components/UI";
import { useAppStore } from "./lib/store";
import {
  liveMode,
  supabase,
  setSupportSession,
  supportStorageKey,
} from "./lib/supabase";
import { useIdentity } from "./lib/auth";
import { studentAccess, today } from "./lib/billing";
import type {
  Identity,
  Role,
  SupportSession,
  SupportAccount,
} from "./lib/types";
import { Overview } from "./features/Overview";
import {
  Community,
  Directory,
  Family,
  Payments,
  Settings,
} from "./features/Pages";
import type { PageProps } from "./features/Pages";
import { WorkspaceModal } from "./features/Forms";
import { Brand } from "./components/Brand";
import { AuthPage } from "./features/public/AuthPage";
import { PlatformOperations } from "./features/PlatformOperations";
import { rpc } from "./lib/repository";
import {
  PlatformOverview,
  PlatformSupport,
  PlatformSettings,
} from "./features/PlatformWorkspace";
import { FamilyIntakeModal } from "./features/FamilyEnrollment";
import { DocumentModal } from "./features/StudentDocuments";
import { Gallery } from "./features/Gallery";
import { Reports } from "./features/Reports";
const roleNames: Record<Role, string> = {
  superadmin: "Superadministración",
  director: "Dirección",
  teacher: "Docente",
  guardian: "Familia",
};
const ALL: Role[] = ["superadmin", "director", "teacher", "guardian"];
const pageDescriptions: Record<string, string> = {
  schools: "Gestiona instituciones e invita a sus directoras.",
  platform: "Activaciones y licencias de MiCole por institución.",
  reports: "Revisa ingresos, cuotas pendientes y movimientos por período.",
  support: "Entra en un colegio con un rol concreto y registra el motivo.",
  institutionRequests: "Revisa y responde las solicitudes de nuevos colegios.",
  audit: "Consulta quién cambió un registro y cuándo lo hizo.",
  settings: "Revisa la configuración y las conexiones disponibles.",
  students: "Gestiona inscripciones, familias y el estado de cada estudiante.",
  teachers: "Organiza el equipo docente y sus accesos.",
  classrooms: "Asigna docentes, cursos y horarios.",
  payments: "Consulta mensualidades, vencimientos y pagos.",
  family: "Información y ficha de salud de tus hijos.",
  journal: "Actividades y seguimiento de cada día.",
  calendar: "Eventos y tareas de tu comunidad.",
  announcements: "Avisos de la institución y de cada curso.",
  messages: "Conversaciones con las familias y el equipo del colegio.",
  requests: "Solicitudes de ausencia y autorizaciones de recogida.",
  grades: "Notas y recomendaciones de los docentes.",
  gallery: "Imágenes compartidas con las familias.",
  materials: "Materiales para las actividades del curso.",
};
const COMMUNITY_ROLES: Role[] = ["director", "teacher", "guardian"];
const nav: {
  key: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  group: string;
}[] = [
  {
    key: "overview",
    label: "Resumen",
    icon: LayoutDashboard,
    roles: ALL,
    group: "TU ESPACIO",
  },
  {
    key: "schools",
    label: "Instituciones",
    icon: Building2,
    roles: ["superadmin"],
    group: "TU ESPACIO",
  },
  {
    key: "students",
    label: "Estudiantes",
    icon: Users,
    roles: ["director", "teacher"],
    group: "TU ESPACIO",
  },
  {
    key: "teachers",
    label: "Equipo docente",
    icon: GraduationCap,
    roles: ["director"],
    group: "TU ESPACIO",
  },
  {
    key: "classrooms",
    label: "Aulas y cursos",
    icon: BookOpen,
    roles: ["director", "teacher"],
    group: "TU ESPACIO",
  },
  {
    key: "family",
    label: "Mis hijos",
    icon: Heart,
    roles: ["guardian"],
    group: "TU ESPACIO",
  },
  {
    key: "payments",
    label: "Pagos y mensualidades",
    icon: Wallet,
    roles: ["director", "guardian"],
    group: "TU ESPACIO",
  },
  {
    key: "platform",
    label: "Facturación MiCole",
    icon: Wallet,
    roles: ["superadmin"],
    group: "TU ESPACIO",
  },
  {
    key: "reports",
    label: "Reportes",
    icon: ChartNoAxesCombined,
    roles: ["superadmin", "director"],
    group: "TU ESPACIO",
  },
  {
    key: "journal",
    label: "Cuaderno digital",
    icon: NotebookPen,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "calendar",
    label: "Agenda",
    icon: CalendarDays,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "announcements",
    label: "Comunicados",
    icon: Megaphone,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "messages",
    label: "Mensajes",
    icon: MessageSquare,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "requests",
    label: "Permisos y recogidas",
    icon: ShieldCheck,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "grades",
    label: "Notas y recomendaciones",
    icon: BookOpen,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "gallery",
    label: "Galería",
    icon: Images,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "materials",
    label: "Materiales",
    icon: ListChecks,
    roles: COMMUNITY_ROLES,
    group: "COMUNIDAD",
  },
  {
    key: "support",
    label: "Soporte y probar roles",
    icon: Headset,
    roles: ["superadmin"],
    group: "ADMINISTRACIÓN",
  },
  {
    key: "institutionRequests",
    label: "Solicitudes de colegios",
    icon: Building2,
    roles: ["superadmin"],
    group: "ADMINISTRACIÓN",
  },
  {
    key: "audit",
    label: "Historial de cambios",
    icon: ShieldCheck,
    roles: ["superadmin", "director"],
    group: "ADMINISTRACIÓN",
  },
  {
    key: "settings",
    label: "Configuración",
    icon: SettingsIcon,
    roles: ["superadmin", "director"],
    group: "ADMINISTRACIÓN",
  },
];
export default function WorkspaceApp() {
  const location = useLocation();
  const auth = useIdentity();
  const store = useAppStore(
    auth.identity?.id || null,
    !!auth.identity?.roles.includes("superadmin") && !auth.identity.support,
    auth.identity?.support?.id || "",
  );
  if (liveMode && auth.loading)
    return (
      <main className="loading-screen">
        <RefreshCw className="spin" />
        <p>Preparando tu espacio…</p>
      </main>
    );
  if (liveMode && (!auth.identity || !auth.identity.roles.length))
    return <AuthPage auth={auth} store={store} />;
  if (location.pathname === "/login" && !liveMode)
    return <AuthPage auth={auth} store={store} />;
  if (!location.pathname.startsWith("/app/") || location.pathname === "/app")
    return <Navigate to="/app/overview" replace />;
  return (
    <Workspace
      key={
        auth.identity
          ? `${auth.identity.id}-${auth.identity.roles.join("-")}-${auth.identity.support?.id || "platform"}`
          : "local"
      }
      store={store}
      liveIdentity={auth.identity}
      refreshIdentity={auth.refresh}
    />
  );
}
function Workspace({
  store,
  liveIdentity,
  refreshIdentity,
}: {
  store: ReturnType<typeof useAppStore>;
  liveIdentity: Identity | null;
  refreshIdentity: () => Promise<void>;
}) {
  const location = useLocation(),
    navigate = useNavigate();
  const [role, setRole] = useState<Role>(liveIdentity?.roles[0] || "director");
  const [schoolId, setSchoolId] = useState(
    liveIdentity?.support?.schoolId || "s1",
  );
  const [demoSupport, setDemoSupport] = useState<SupportSession | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [demoAccount, setDemoAccount] = useState<SupportAccount | null>(null);
  const [studentId, setStudentId] = useState("a1");
  const [modal, setModal] = useState<{ type: string; id?: string } | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const [noticeError, setNoticeError] = useState("");
  const [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState(false),
    [notifications, setNotifications] = useState(false);
  const identity: Identity = liveIdentity || {
    canSupport: true,
    id: `demo-${role}`,
    name:
      role === "director"
        ? "María Fernández"
        : role === "teacher"
          ? "Camila Vargas"
          : role === "guardian"
            ? "Daniela Martínez"
            : "Administrador",
    email: role === "guardian" ? "daniela@example.com" : "demo@micole.local",
    roles: ALL,
    memberships: [],
    teacherIds:
      demoAccount?.role === "teacher"
        ? store.data.teachers
            .filter((t) => t.email === demoAccount.email)
            .map((t) => t.id)
        : ["t1"],
    guardianStudentIds: store.data.students
      .filter((s) =>
        [s.motherEmail || s.guardianEmail, s.fatherEmail].includes(
          demoAccount?.role === "guardian"
            ? demoAccount.email
            : "daniela@example.com",
        ),
      )
      .map((s) => s.id),
  };
  const support = liveIdentity?.support || demoSupport;
  const isPlatform = role === "superadmin" && !support;
  const availableSchools =
    liveMode && role !== "superadmin"
      ? store.data.schools.filter((s) =>
          identity.memberships.some(
            (m) => m.schoolId === s.id && m.role === role,
          ),
        )
      : store.data.schools;
  const school =
    availableSchools.find((s) => s.id === schoolId) || availableSchools[0];
  const schoolStudents = store.data.students.filter(
    (s) => s.schoolId === school?.id,
  );
  const students =
    role === "teacher"
      ? schoolStudents.filter((s) =>
          store.data.classrooms.some(
            (c) =>
              c.id === s.classroomId &&
              c.teacherIds.some((id) => identity.teacherIds.includes(id)),
          ),
        )
      : role === "guardian"
        ? schoolStudents.filter(
            (s) =>
              identity.guardianStudentIds.includes(s.id) ||
              (!liveMode &&
                store.data.invitations.some(
                  (i) =>
                    i.studentId === s.id &&
                    i.email === identity.email &&
                    i.status === "accepted",
                )),
          )
        : schoolStudents;
  const student = students.find((s) => s.id === studentId) || students[0];
  const access = studentAccess(student, store.data);
  const locked = role === "guardian" && !access.allowed;
  const needsProfile =
    role === "guardian" && !!student && !student.profileComplete;
  const page = location.pathname.split("/")[2] || "overview";
  const navItems = nav.filter(
    (n) =>
      n.roles.includes(role) &&
      (n.key !== "support" || identity.canSupport) &&
      (!locked || n.key === "payments") &&
      (!needsProfile || ["payments", "family"].includes(n.key)),
  );
  const validPage = locked
    ? "payments"
    : needsProfile && page !== "payments"
      ? "family"
      : navItems.some((n) => n.key === page)
        ? page
        : "overview";
  const announcements = store.data.announcements.filter(
    (a) =>
      a.schoolId === school?.id &&
      (!a.classroomId ||
        role === "director" ||
        role === "superadmin" ||
        students.some((s) => s.classroomId === a.classroomId)) &&
      (role === "superadmin" ||
        role === "director" ||
        a.audience === "all" ||
        a.audience === (role === "guardian" ? "families" : "staff")),
  );
  const visibleNotifications = store.data.notifications.filter(
    (n) =>
      (!n.schoolId || role === "superadmin" || n.schoolId === school?.id) &&
      (!n.studentId ||
        role === "superadmin" ||
        role === "director" ||
        students.some((s) => s.id === n.studentId)) &&
      (navItems.some((item) => item.key === n.target) ||
        (locked && n.kind === "payment")),
  );
  const unreadCount = visibleNotifications.filter((n) => !n.readAt).length;
  const go = (next: string) => {
    if (next.startsWith("school:")) {
      setSchoolId(next.split(":")[1]);
      navigate(isPlatform ? "/app/support" : "/app/students");
    } else navigate(`/app/${next}`);
    setMobile(false);
    setNotifications(false);
    setProfile(false);
  };
  const open = (type: string, item?: { id: string }) => {
    setModal({ type, id: item?.id });
  };
  const act = async (task: () => Promise<unknown>, message: string) => {
    setNoticeError("");
    try {
      await task();
      setToast(message);
    } catch (e) {
      setNoticeError(
        e instanceof Error ? e.message : "La operación no se pudo guardar.",
      );
    }
  };
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setProfile(false);
    setNotifications(false);
  }, [location.pathname]);
  const exitSupport = async () => {
    setSupportBusy(true);
    try {
      if (liveMode && support)
        await rpc("end_support_session", { p_id: support.id });
      setSupportSession(null);
      if (liveMode) await refreshIdentity();
      else {
        setDemoSupport(null);
        setDemoAccount(null);
        setRole("superadmin");
      }
      navigate("/app/overview");
    } catch (e) {
      setNoticeError(
        e instanceof Error ? e.message : "No se pudo cerrar soporte.",
      );
    } finally {
      setSupportBusy(false);
    }
  };
  const startSupport = async (
    sid: string,
    account: SupportAccount,
    reason: string,
  ) => {
    if (liveMode) {
      const session = await rpc<{ id: string }>("start_support_session", {
        p_school_id: sid,
        p_user_id: account.id,
        p_role: account.role,
        p_reason: reason.trim(),
      });
      setSupportSession(session.id);
      await refreshIdentity();
    } else {
      setDemoAccount(account);
      setRole(account.role);
      setSchoolId(sid);
      setDemoSupport({
        id: "demo-support",
        schoolId: sid,
        role: account.role,
        reason,
        adminId: "demo-superadmin",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }
    navigate("/app/overview");
  };
  useEffect(() => {
    if (page !== validPage && !store.loading && !store.error)
      navigate(`/app/${validPage}`, { replace: true });
  }, [page, validPage, store.loading, store.error, navigate]);
  useEffect(() => {
    if (!mobile) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = prior;
      window.removeEventListener("keydown", close);
    };
  }, [mobile]);
  const props: PageProps = {
    store,
    school,
    role,
    students,
    student,
    identity,
    open,
    act,
    go,
  };
  if (store.loading)
    return (
      <main className="loading-screen">
        <RefreshCw className="spin" />
        <p>Cargando tu comunidad…</p>
      </main>
    );
  return (
    <div
      className="app-layout"
      style={
        { "--school-color": school?.color || "#3D6EF7" } as React.CSSProperties
      }
    >
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <div className="brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Cerrar menú"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        {isPlatform ? (
          <div className="platform-context">
            <span className="row-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <b>Plataforma MiCole</b>
              <small>Superadministración</small>
            </div>
          </div>
        ) : (
          <div className="school-switcher">
            {school?.logoUrl ? (
              <img src={school.logoUrl} alt="" />
            ) : (
              <span
                className="school-symbol"
                style={{ background: school?.color || "#3D6EF7" }}
              >
                {school?.initials || "MC"}
              </span>
            )}
            <div>
              <small>{support ? "COLEGIO EN SOPORTE" : "MI INSTITUCIÓN"}</small>
              <select
                aria-label="Institución"
                disabled={!!support}
                value={school?.id || ""}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  setStudentId("");
                }}
              >
                {availableSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {!availableSchools.length && <b>MiCole</b>}
            </div>
          </div>
        )}
        <nav aria-label="Navegación principal">
          {["TU ESPACIO", "COMUNIDAD", "ADMINISTRACIÓN"].map(
            (group) =>
              navItems.some((n) => n.group === group) && (
                <div key={group}>
                  <div className="sidebar-label">{group}</div>
                  {navItems
                    .filter((n) => n.group === group)
                    .map((n) => (
                      <button
                        key={n.key}
                        aria-current={validPage === n.key ? "page" : undefined}
                        className={`nav-link ${validPage === n.key ? "active" : ""}`}
                        onClick={() => go(n.key)}
                      >
                        <n.icon size={18} strokeWidth={1.8} />
                        <span>{n.label}</span>
                        {n.key === "announcements" &&
                          announcements.length > 0 && (
                            <span className="nav-count" aria-hidden="true">
                              {announcements.length}
                            </span>
                          )}
                      </button>
                    ))}
                </div>
              ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="school-year">
            <span className="live-dot" />
            <b>Gestión {today().slice(0, 4)}</b>
            <span>{roleNames[role]}</span>
          </div>
          <small>MiCole · Cerca en cada paso</small>
        </div>
      </aside>
      {mobile && (
        <div className="nav-dimmer" onClick={() => setMobile(false)} />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Mi espacio <ChevronRight size={14} />
              <strong>{nav.find((n) => n.key === validPage)?.label}</strong>
            </span>
          </div>
          <div className="top-actions">
            <span className={`mode-badge ${liveMode ? "connected" : ""}`}>
              <span className="live-dot" />
              {liveMode ? "En línea" : "Datos de prueba"}
            </span>
            {liveMode && (
              <button
                className="icon-button"
                title="Actualizar datos"
                onClick={() => {
                  void store.refresh();
                }}
              >
                <RefreshCw size={18} />
              </button>
            )}
            <button
              className="notification-button"
              aria-label="Notificaciones"
              onClick={() => {
                setNotifications(!notifications);
                setProfile(false);
              }}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <i aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</i>
              )}
            </button>
            <div className="top-divider" />
            <button
              className="profile-button"
              aria-label="Menú de perfil"
              aria-expanded={profile}
              onClick={() => {
                setProfile(!profile);
                setNotifications(false);
              }}
            >
              <Avatar name={identity.name} />
              <span>
                <b>{identity.name}</b>
                <small>{roleNames[role]}</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
          {notifications && (
            <section className="floating-panel notifications">
              <div className="notifications-heading">
                <h3>
                  {isPlatform
                    ? "Notificaciones de plataforma"
                    : "Tu comunidad te cuenta"}
                </h3>
                {unreadCount > 0 && (
                  <button
                    className="text-button"
                    disabled={store.busy}
                    onClick={() => {
                      void act(
                        () => store.readNotification(),
                        "Notificaciones marcadas como leídas.",
                      );
                    }}
                  >
                    Marcar como leídas
                  </button>
                )}
              </div>
              {visibleNotifications.length ? (
                visibleNotifications.slice(0, 6).map((n) => (
                  <button
                    className={!n.readAt ? "unread" : ""}
                    key={n.id}
                    disabled={store.busy}
                    onClick={() => {
                      void act(async () => {
                        await store.readNotification(n.id);
                        if (role === "guardian" && n.studentId)
                          setStudentId(n.studentId);
                        go(locked ? "payments" : n.target);
                      }, "");
                    }}
                  >
                    <span className="row-icon">
                      <Bell size={18} />
                    </span>
                    <span>
                      <b>{n.title}</b>
                      <small>{n.body}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="muted">
                  {locked
                    ? "Tus novedades de pagos aparecerán aquí."
                    : "Estás al día con tu comunidad."}
                </p>
              )}
            </section>
          )}
          {profile && (
            <section className="floating-panel profile-menu">
              <small>
                {liveMode
                  ? "Tus accesos autorizados"
                  : "Explorar roles · modo local"}
              </small>
              {support && (
                <button
                  disabled={supportBusy}
                  onClick={() => {
                    void exitSupport();
                  }}
                >
                  <ShieldCheck size={16} /> Volver a superadmin
                </button>
              )}
              {isPlatform && identity.canSupport && (
                <button onClick={() => go("support")}>
                  <Headset size={16} /> Soporte y probar roles
                </button>
              )}
              {identity.roles
                .filter((r) => !liveMode || !isPlatform || r === "superadmin")
                .map((r) => (
                  <button
                    key={r}
                    className={role === r ? "selected" : ""}
                    onClick={() => {
                      setRole(r);
                      go("overview");
                    }}
                  >
                    {roleNames[r]}
                    {role === r && <span>✓</span>}
                  </button>
                ))}
              {liveMode ? (
                <button
                  onClick={() => {
                    void (async () => {
                      const sid = sessionStorage.getItem(supportStorageKey);
                      if (sid) await rpc("end_support_session", { p_id: sid });
                      setSupportSession(null);
                      await supabase?.auth.signOut();
                    })().catch((e) =>
                      setNoticeError(
                        e instanceof Error
                          ? e.message
                          : "No se pudo cerrar sesión.",
                      ),
                    );
                  }}
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              ) : (
                <p>Datos de ejemplo guardados en este navegador.</p>
              )}
            </section>
          )}
        </header>
        {support && (
          <div
            className="support-banner"
            role="region"
            aria-label="Sesión de soporte"
          >
            <Headset size={20} />
            <div>
              <b>
                Soporte · {roleNames[role]}
                {liveMode ? ` · ${identity.name}` : " · datos de ejemplo"}
              </b>
              <small>
                {school?.name} · hasta{" "}
                {new Date(support.expiresAt).toLocaleTimeString("es-BO", {
                  timeZone: "America/La_Paz",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {support.reason}
              </small>
            </div>
            <Button
              variant="secondary"
              disabled={supportBusy}
              onClick={() => {
                void exitSupport();
              }}
            >
              Volver a superadmin
            </Button>
          </div>
        )}
        <main className="main-content">
          <div className="view-top">
            <div>
              <div className="eyebrow">
                {isPlatform ? "PLATAFORMA MICOLE" : school?.name || "MICOLE"}
              </div>
              <h1>
                {validPage === "overview"
                  ? isPlatform
                    ? "Resumen de plataforma"
                    : "Tu día, de un vistazo"
                  : nav.find((n) => n.key === validPage)?.label}
              </h1>
              <p>
                {validPage === "overview"
                  ? isPlatform
                    ? "Instituciones, solicitudes y facturación de MiCole."
                    : "Todo lo que necesitas para acompañar un nuevo día."
                  : pageDescriptions[validPage] || "Tu espacio en MiCole."}
              </p>
            </div>
            <div className="page-date">
              <CalendarDays size={17} />
              <span>
                {new Date(`${today()}T12:00:00`).toLocaleDateString("es-BO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          {role === "guardian" && students.length > 0 && (
            <div className="child-switcher">
              <Heart size={18} />
              <label>
                Estás acompañando a{" "}
                <select
                  aria-label="Mi hijo"
                  value={student?.id || ""}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  {students.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {(store.error || noticeError) && (
            <div className="message error" role="alert">
              <span>{noticeError || store.error}</span>
              <Button
                variant="ghost"
                onClick={() => {
                  setNoticeError("");
                  void store.refresh();
                }}
              >
                Reintentar
              </Button>
            </div>
          )}
          {locked && (
            <div className="access-banner">
              <LockKeyhole size={24} />
              <div>
                <b>Tu agenda está en pausa</b>
                <p>{access.reason} Tus pagos siguen disponibles.</p>
              </div>
            </div>
          )}
          {role === "guardian" && student && !student.profileComplete && (
            <div className="message warn">
              <span>
                Completa la ficha de salud y los contactos de emergencia de{" "}
                {student.firstName}.
              </span>
              <Button
                variant="secondary"
                onClick={() => open("profile", student)}
              >
                Completar ficha
              </Button>
            </div>
          )}
          {(!liveMode || !store.error) && (
            <div className="workspace-page" key={`${validPage}-${school?.id || "platform"}-${identity.id}`}>
              {validPage === "overview" && isPlatform && (
                <PlatformOverview {...props} />
              )}
              {validPage === "support" && isPlatform && (
                <PlatformSupport
                  key={schoolId}
                  initialSchoolId={schoolId === "s1" ? undefined : schoolId}
                  {...props}
                  onStart={startSupport}
                />
              )}
              {validPage === "overview" && !isPlatform && (
                <Overview
                  data={store.data}
                  school={school}
                  role={role}
                  students={students}
                  name={identity.name}
                  go={go}
                  open={open}
                />
              )}
              {["schools", "students", "teachers", "classrooms"].includes(
                validPage,
              ) && (
                <Directory
                  key={`${validPage}-${school?.id}`}
                  page={validPage}
                  {...props}
                />
              )}
              {["payments", "platform"].includes(validPage) && (
                <Payments {...props} platform={validPage === "platform"} />
              )}
              {[
                "journal",
                "calendar",
                "announcements",
                "messages",
                "requests",
                "grades",
                "materials",
              ].includes(validPage) && (
                <Community
                  key={`${validPage}-${school?.id}`}
                  page={validPage}
                  {...props}
                />
              )}
              {validPage === "family" && <Family {...props} />}
              {validPage === "settings" &&
                (isPlatform ? <PlatformSettings /> : <Settings {...props} />)}
              {["institutionRequests", "audit"].includes(validPage) && (
                <PlatformOperations page={validPage} {...props} />
              )}
              {validPage === "gallery" && <Gallery {...props} />}
              {validPage === "reports" && ["superadmin", "director"].includes(role) && <Reports {...props} />}
              {!school && !isPlatform && validPage !== "schools" && (
                <div className="soft-note">
                  {role === "superadmin"
                    ? "Crea tu primera institución para comenzar."
                    : "No tienes una institución disponible para este rol."}
                </div>
              )}
            </div>
          )}
        </main>
        <footer className="footer">
          <span>
            <GraduationCap size={15} /> MiCole · Conectando pequeños mundos
          </span>
          <span>
            {liveMode
              ? "MiCole · Acceso protegido"
              : "Entorno local · configura Supabase para compartir datos"}
          </span>
        </footer>
      </div>
      {modal?.type === "intake" && (
        <FamilyIntakeModal
          {...props}
          id={modal.id}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "documents" && (
        <DocumentModal
          {...props}
          id={modal.id}
          onClose={() => setModal(null)}
        />
      )}
      {modal && !["intake", "documents"].includes(modal.type) && (
        <WorkspaceModal
          key={`${modal.type}-${modal.id}`}
          type={modal.type}
          id={modal.id}
          {...props}
          onClose={() => setModal(null)}
          onSuccess={(message) => {
            setModal(null);
            setToast(message);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <ShieldCheck size={19} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Cerrar aviso"
            onClick={() => setToast("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
