import { StaffWorkspaceScreen } from "./features/StaffWorkspace";
import { ownerPaymentAccess } from "./lib/support-access";
import { DirectorAssistant } from "./features/DirectorAssistant";
import { guideActions } from "./lib/assistant";
import { InstitutionSites } from "./features/InstitutionSites";
import { siteLabel,schoolGroup } from "./lib/sites";
import {ViewHistory,ContentAreaTracker} from './features/ViewHistory';
import {AnnouncementGate,AlertIcon} from './features/Announcements';
import {isAnnouncementNotice} from './lib/announcements';
import {openAnnouncement} from './lib/announcementEvents';
import { StudentEmergency } from "./features/StudentEmergency";
import { DocumentImports } from "./features/DocumentImports";
import { PlatformCreditPanel } from "./features/PlatformCredit";
import { DemoRequests } from "./features/DemoRequests";
import { publicDemo, demoRole, setDemoRole, demoAccounts, logoutDemo } from "./lib/demo-config";
import { DemoAccess } from "./features/public/DemoAccess";
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
import { StudentLoginModal, StudentOverview } from "./features/StudentAccess";
import { Collections, Invoices } from "./features/Collections";
import { LearningRequests } from "./features/LearningRequests";
import { Subjects, Assignments } from "./features/Academics";
import {Care,Gradebook,Years,Onboarding} from "./features/SchoolLife";
import { Reports } from "./features/Reports";
const roleNames: Record<Role, string> = {
  superadmin: "Superadministración",
  director: "Dirección",
  teacher: "Docente",
  guardian: "Familia",
  student: "Estudiante",
};
const ALL: Role[] = ["superadmin", "director", "teacher", "guardian", "student"];
const pageDescriptions: Record<string, string> = {
 viewHistory:"Registro de consultas y descargas por persona y estudiante.",
 credit:"Adelanto, saldo a favor y aplicación de las licencias mensuales.", demoRequests:"Solicitudes recibidas desde la landing y su seguimiento.",
  care:"Cuidados y resumen diario para las familias.",gradebook:"Evaluaciones, promedios y libretas publicadas.",years:"Reinscripciones e historial por gestión.",onboarding:"Configura e importa tu comunidad por pasos.",
  subjects:"Organiza materias opcionales y sus docentes por aula.",
  assignments:"Publica tareas, recibe entregas y revisa trabajos.",
  schools: "Gestiona instituciones e invita a sus directoras.",
  platform: "Activaciones y licencias de MiCole por institución.",
  reports: "Revisa ingresos, cuotas pendientes y movimientos por período.",
  support: "Prueba roles en tu institución o abre soporte para atender un caso.",
  institutionRequests: "Revisa y responde las solicitudes de nuevos colegios.",
  audit: "Consulta quién cambió un registro y cuándo lo hizo.",
  settings: "Revisa la configuración y las conexiones disponibles.",
  students: "Gestiona inscripciones, familias y el estado de cada estudiante.",
  teachers: "Organiza el equipo docente y sus accesos.",
  classrooms: "Asigna docentes, cursos y horarios.",
  payments: "Consulta mensualidades, vencimientos y pagos.",
  cash: "Abonos, anticipos, cobros agrupados y recibos.",
  invoices: "Solicitudes de factura y seguimiento de emisión manual.",
  activities: "Solicitudes, aprobaciones, participantes y cobros de actividades.",
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
  { key:"viewHistory",label:"Historial de consultas",icon:BookOpen,roles:["director","teacher"],group:"ADMINISTRACIÓN" },
  { key: "cash", label: "Caja y cobros", icon: Wallet, roles: ["director", "teacher", "guardian"], group: "TU ESPACIO" },
  { key: "invoices", label: "Facturas", icon: BookOpen, roles: ["director", "guardian"], group: "TU ESPACIO" },
  { key: "activities", label: "Actividades y salidas", icon: CalendarDays, roles: COMMUNITY_ROLES, group: "COMUNIDAD" },
  {key:"credit",label:"Crédito MiCole",icon:Wallet,roles:["superadmin","director"],group:"TU ESPACIO"},
  {key:"demoRequests",label:"Solicitudes de demo",icon:Building2,roles:["superadmin"],group:"ADMINISTRACIÓN"},
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
  {key:"staffAttendance",label:"Asistencia del equipo",icon:CalendarDays,roles:["director","teacher"],group:"EQUIPO"},
  {key:"staffPayroll",label:"Boletas de pago",icon:Wallet,roles:["director","teacher"],group:"EQUIPO"},
  {key:"care",label:"Cuidados diarios",icon:Heart,roles:COMMUNITY_ROLES,group:"COMUNIDAD"},
  {key:"gradebook",label:"Evaluación y libretas",icon:GraduationCap,roles:COMMUNITY_ROLES,group:"COMUNIDAD"},
  {key:"years",label:"Gestiones e historial",icon:BookOpen,roles:COMMUNITY_ROLES,group:"ADMINISTRACIÓN"},
  {key:"sites",label:"Sedes y sucursales",icon:Building2,roles:["director"],group:"ADMINISTRACIÓN"},
  {key:"admissionForms",label:"Formulario de inscripción",icon:BookOpen,roles:["director"],group:"ADMINISTRACIÓN"},
  {key:"calendarImport",label:"Importar calendario",icon:CalendarDays,roles:["director"],group:"COMUNIDAD"},
  {key:"onboarding",label:"Preparar institución",icon:ListChecks,roles:["director"],group:"ADMINISTRACIÓN"},
  {key:"subjects",label:"Materias",icon:BookOpen,roles:["director","teacher","guardian","student"],group:"COMUNIDAD"},
  {key:"assignments",label:"Tareas y entregas",icon:ListChecks,roles:["director","teacher","guardian","student"],group:"COMUNIDAD"},
  {
    key: "journal",
    label: "Cuaderno digital",
    icon: NotebookPen,
    roles: [...COMMUNITY_ROLES, "student"],
    group: "COMUNIDAD",
  },
  {
    key: "calendar",
    label: "Agenda",
    icon: CalendarDays,
    roles: [...COMMUNITY_ROLES, "student"],
    group: "COMUNIDAD",
  },
  {
    key: "announcements",
    label: "Comunicados",
    icon: Megaphone,
    roles: [...COMMUNITY_ROLES, "student"],
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
    roles: [...COMMUNITY_ROLES, "student"],
    group: "COMUNIDAD",
  },
  {
    key: "support",
    label: "Pruebas y soporte",
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
    auth.identity?.roles[0] === "student",
  );
  if (publicDemo && !demoRole()) return <DemoAccess />;
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
  const [role, setRole] = useState<Role>(liveIdentity?.roles[0] || (publicDemo ? demoRole() : null) || "director");
  const siteSelectionKey=`micole_selected_site:${liveIdentity?.id||"local"}:${role}`;
  const [schoolId, setSelectedSchoolId] = useState(
    liveIdentity?.support?.schoolId || sessionStorage.getItem(siteSelectionKey) || "s1",
  );
  const setSchoolId=(id:string)=>{sessionStorage.setItem(siteSelectionKey,id);setSelectedSchoolId(id);};
  const [demoSupport, setDemoSupport] = useState<SupportSession | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [demoAccount, setDemoAccount] = useState<SupportAccount | null>(null);
  const [studentId, setStudentId] = useState("a1");
  const [modal, setModal] = useState<{ type: string; id?: string } | null>(
    null,
  );
  const [resetOpen,setResetOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [noticeError, setNoticeError] = useState("");
  const [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState(false),
    [notifications, setNotifications] = useState(false);
  const identity: Identity = liveIdentity || {
    canSupport: !publicDemo,
    id: `demo-${role}`,
    name: publicDemo ? demoAccounts.find(a=>a.role===role)!.name :
      role === "director"
        ? "María Fernández"
        : role === "teacher"
          ? "Camila Vargas"
          : role === "guardian"
            ? "Daniela Martínez"
            : "Administrador",
    email: publicDemo ? demoAccounts.find(a=>a.role===role)!.email : role === "guardian" ? "daniela@example.com" : "demo@micole.local",
    roles: publicDemo ? ALL.filter(r=>r!=="superadmin") : ALL,
    memberships: [],
    teacherIds:
      demoAccount?.role === "teacher"
        ? store.data.teachers
            .filter((t) => t.email === demoAccount.email)
            .map((t) => t.id)
        : ["t1"],
    studentIds: store.data.students.slice(0, 1).map((s) => s.id),
    guardianStudentIds: store.data.students
      .filter((s) =>
        [s.motherEmail || s.guardianEmail, s.fatherEmail].includes(
          demoAccount?.role === "guardian"
            ? demoAccount.email
            : publicDemo ? "familia@micole.test" : "daniela@example.com",
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
      : role === "student"
        ? schoolStudents.filter((s) => identity.studentIds?.includes(s.id))
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
  const paymentBypass = ownerPaymentAccess(liveIdentity, school?.id);
  const access = studentAccess(student, store.data);
  const studentLocked = !paymentBypass && role === "student" && store.data.studentPortalAccess?.allowed === false;
  const locked = !paymentBypass && role === "guardian" && !access.allowed;
  const startupLocked=liveMode&&role!=="superadmin"&&!identity.support&&school?.platformEnabled===false;
  const startupAllowed=role==="director"?["credit","settings","onboarding","classrooms","teachers","sites"]:role==="guardian"?["payments","cash","invoices","requests"]:["overview","requests"];
  const needsProfile =
    !paymentBypass && role === "guardian" && !!student && !student.profileComplete;
  const requestedPage = location.pathname.split("/")[2] || "overview";
  const page = requestedPage === "imports" ? "admissionForms" : requestedPage;
  const navItems = nav.filter(
    (n) =>
      n.roles.includes(role) &&
      (!startupLocked||startupAllowed.includes(n.key))&&
      (n.key !== "support" || identity.canSupport) &&
      (!locked || ["payments", "cash", "invoices"].includes(n.key)) &&
      (!needsProfile || ["payments", "cash", "invoices", "family"].includes(n.key)),
  );
  const validPage = startupLocked ? (startupAllowed.includes(page)?page:role==="director"?"credit":startupAllowed[0]) : studentLocked ? (["overview","settings"].includes(page)?page:"overview") : locked
    ? (["payments", "cash", "invoices"].includes(page) ? page : "payments")
    : needsProfile && !["payments", "cash", "invoices"].includes(page)
      ? "family"
      : navItems.some((n) => n.key === page)
        ? page
        : "overview";
  const announcements = store.data.announcements.filter(
    (a) =>
      a.schoolId === school?.id &&
      (!a.classroomId || a.createdBy===identity.id ||
        role === "director" ||
        role === "superadmin" ||
        students.some((s) => s.classroomId === a.classroomId)) &&
      (role === "superadmin" ||
        role === "director" ||
        a.createdBy===identity.id || a.audience === "all" ||
        a.audience === (["guardian", "student"].includes(role) ? "families" : "staff")),
  );
  const visibleNotifications = store.data.notifications.filter(
    (n) =>
      (!n.schoolId || role === "superadmin" || n.schoolId === school?.id) &&
      (!n.studentId ||
        role === "superadmin" ||
        role === "director" ||
        students.some((s) => s.id === n.studentId)) &&
      (navItems.some((item) => item.key === n.target) ||
        (locked && n.kind === "payment") || isAnnouncementNotice(n.kind)),
  );
  const unreadCount = visibleNotifications.filter((n) => !n.readAt).length;
  const go = (next: string) => {
    const linkedStudent = new URLSearchParams(next.split("?")[1] || "").get("student");
    if (linkedStudent) setStudentId(linkedStudent);
    if (next.startsWith("school:")) {
      setSchoolId(next.split(":")[1]);
      navigate(isPlatform ? "/app/support" : "/app/students");
    } else navigate(`/app/${next}`);
    setMobile(false);
    setNotifications(false);
    setProfile(false);
  };
  const open = (type: string, item?: { id: string }) => {
    if (type === "materials") { go("materials"); return; }
    if (["payment", "qr"].includes(type)) {
      const charge = store.data.charges.find(c => c.id === item?.id);
      if (charge) { go(`cash?student=${charge.studentId}&charge=${charge.id}`); return; }
    }
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
  const exitSupport = async (destination = "/app/overview") => {
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
      navigate(destination);
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
  const startTest = async (sid: string, account: import("./features/TestWorkspace").TestAccount) => {
    const session = await rpc<{ id: string }>("start_test_session", {
      p_school_id: sid, p_role: account.role,
      p_target_id: account.role === "director" ? null : account.id,
      p_relationship: account.relationship || null,
    });
    setSupportSession(session.id);
    await refreshIdentity();
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
                {[...new Set(availableSchools.map(schoolGroup))].map(root=><optgroup key={root} label={availableSchools.find(s=>s.id===root)?.name||availableSchools.find(s=>schoolGroup(s)===root)?.name}>{availableSchools.filter(s=>schoolGroup(s)===root).map(s=><option key={s.id} value={s.id}>{siteLabel(s)}</option>)}</optgroup>)}
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
                    .filter((n) => n.group === group && n.key!=="calendarImport")
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
              {liveMode ? (store.realtimeStatus === "connected" ? "Conectado" : store.realtimeStatus === "offline" ? "Reconectando…" : "Conectando…") : "Datos de prueba"}
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
                        if(isAnnouncementNotice(n.kind)){setNotifications(false);openAnnouncement(n.sourceId);}
                        else go(locked ? "payments" : n.target);
                      }, "");
                    }}
                  >
                    <span className="row-icon">
                      <AlertIcon notice={n} size={18}/>
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
                  <Headset size={16} /> Pruebas y soporte
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
                      if(publicDemo) setDemoRole(r);
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
                <><p>Datos de ejemplo guardados en este navegador.</p>{publicDemo&&<button onClick={()=>{void logoutDemo().catch(e=>setNoticeError(e.message));}}><LogOut size={16}/>Salir de la demo</button>}</>
              )}
            </section>
          )}
        </header>
        {publicDemo && <section className="public-demo-banner" aria-label="Controles de demostración"><div><b>Demo MiCole · Todo es ficticio</b><small>Cambios solo en este navegador. Los pagos y envíos se simulan. Utiliza datos de ejemplo.</small></div><div className="demo-banner-actions"><select aria-label="Rol de demostración" value={role} onChange={e=>{const next=e.target.value as Role;setDemoRole(next);setRole(next);setModal(null);go("overview");}}>{demoAccounts.map(a=><option key={a.role} value={a.role}>{a.label}</option>)}</select><Button variant="secondary" onClick={()=>setResetOpen(true)}>Restablecer demo</Button><Button variant="ghost" onClick={()=>{void logoutDemo().catch(e=>setNoticeError(e.message));}}>Salir</Button></div></section>}
        {support && (
          <div
            className="support-banner"
            role="region"
            aria-label={support.mode === "test" ? "Sesión de pruebas" : "Sesión de soporte"}
          >
            <Headset size={20} />
            <div>
              <b>
                {support.mode === "test" ? "Pruebas" : "Soporte"} · {roleNames[role]}
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
                {paymentBypass && " · Revisión sin bloqueo por pagos"}
              </small>
            </div>
            {support.mode === "test" && <Button variant="secondary" disabled={supportBusy} onClick={() => void exitSupport("/app/support")}>Cambiar rol</Button>}
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
          {startupLocked&&validPage!=="credit"&&<div className="platform-startup-notice" role="status"><b>Crédito inicial pendiente de confirmación</b><p>Dirección debe completar el adelanto de Bs 500 para habilitar la institución. El importe se utilizará para cubrir licencias mensuales.</p></div>}
          {publicDemo && <details className="demo-tour"><summary>Qué puedes probar como {roleNames[role]}</summary><p>{role==="director"?"Crea aulas, inscribe un estudiante con su plan, registra un cobro y consulta los reportes. También puedes probar avisos con confirmación, formularios de inscripción, importación de calendarios, facturas e historial de consultas.":role==="teacher"?"Explora tus aulas, publica una tarea, revisa una entrega y registra los cuidados del día. Publica un aviso obligatorio y cambia a Familia para aceptarlo; al volver podrás ver el reporte de confirmaciones.":role==="guardian"?"Consulta a Sofía y Diego, sus tareas, agenda, cuidados y libretas. Prueba un permiso o un pago simulado; la información académica es de lectura.":"Consulta las tareas de Sofía, escribe una respuesta y entrégala. Luego cambia a Docente para revisar tu entrega."}</p><div className="demo-tour-links">{(role==="director"?[["students","Estudiantes"],["cash","Caja y cobros"],["announcements","Avisos y confirmaciones"],["sites","Sedes"],["admissionForms","Ficha de inscripción"],["calendarImport","Calendario anual"],["invoices","Facturas"],["viewHistory","Historial de consultas"],["reports","Reportes"]]:role==="teacher"?[["assignments","Tareas y entregas"],["announcements","Avisos y confirmaciones"],["care","Cuidados diarios"],["gradebook","Evaluación"],["viewHistory","Historial de consultas"]]:role==="guardian"?[["family","Mis hijos"],["calendar","Agenda"],["gradebook","Libretas"],["cash","Pagos"]]:[["assignments","Entregar una tarea"],["calendar","Agenda"]]).map(([key,label])=><button key={key} onClick={()=>go(key)}>{label}</button>)}</div></details>}
          {resetOpen && <section className="panel" role="alert"><h2>¿Restablecer los datos de la demo?</h2><p>Se borrarán tus cambios locales y volverán los ejemplos iniciales. Los datos de la plataforma real no se modifican.</p><div className="demo-reset-actions"><Button onClick={()=>{store.reset();setResetOpen(false);setModal(null);go("overview");setToast("Demo restablecida. Puedes empezar de nuevo.");}}>Sí, restablecer</Button><Button variant="secondary" onClick={()=>setResetOpen(false)}>Conservar mis pruebas</Button></div></section>}
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
          {studentLocked && <div className="access-banner" role="status"><LockKeyhole size={24} /><p>{store.data.studentPortalAccess?.message}</p></div>}
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
                  onTest={startTest}
                />
              )}
              {validPage === "overview" && role === "student" && <StudentOverview {...props} /> }
              {validPage === "overview" && !isPlatform && role !== "student" && (
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
              ].includes(validPage) && (
                <Community
                  key={`${validPage}-${school?.id}`}
                  page={validPage}
                  {...props}
                />
              )}
              {validPage === "care" && <Care key={`${school?.id}-${student?.id}`} {...props} />}
              {validPage === "gradebook" && <Gradebook key={`${school?.id}-${student?.id}`} {...props} />}
              {validPage === "years" && <Years key={`${school?.id}-${student?.id}`} {...props} />}
              {validPage === "sites" && <InstitutionSites {...props} onIdentityChanged={refreshIdentity} onChoose={id=>{setSchoolId(id);setStudentId("");go("overview");}}/>}
              {["admissionForms","calendarImport"].includes(validPage) && <DocumentImports key={`${school?.id}:${validPage}`} {...props} documentKind={validPage==="admissionForms"?"form":"calendar"}/>}
              {["staffAttendance","staffPayroll"].includes(validPage) && <StaffWorkspaceScreen key={`${school?.id}:${validPage}`} {...props} view={validPage as "staffAttendance"|"staffPayroll"}/>}
              {validPage === "onboarding" && <Onboarding {...props} />}
              {validPage === "subjects" && <Subjects key={`${school?.id}-${student?.id}`} {...props} />}
              {validPage === "assignments" && <Assignments key={`${school?.id}-${student?.id}`} {...props} />}
              {validPage === "cash" && <Collections key={`${school?.id}-${student?.id}`} {...props} />}
              {validPage === "invoices" && <Invoices key={`${school?.id}-${student?.id}`} {...props} />}
              {validPage === "materials" && (role === "student" ? <Community page="materials" {...props} /> : <LearningRequests key={`${school?.id}-${student?.id}-materials`} page="materials" {...props} />)}
              {validPage === "activities" && <LearningRequests key={`${school?.id}-${student?.id}-activities`} page="activities" {...props} />}
              {validPage === "family" && <Family {...props} />}
              {validPage === "settings" &&
                (isPlatform ? <PlatformSettings schools={store.data.schools} /> : <Settings {...props} />)}
              {["institutionRequests", "audit"].includes(validPage) && (
                <PlatformOperations page={validPage} {...props} />
              )}
              {validPage === "credit" && <PlatformCreditPanel schoolId={role==="superadmin"?undefined:school?.id} schools={store.data.schools} store={store}/>}
              {validPage === "demoRequests" && <DemoRequests {...props}/>}
              {validPage === "gallery" && <Gallery {...props} />}
              <ContentAreaTracker key={`${role}:${school?.id}:${student?.id}:${validPage}`} page={validPage} studentId={student?.id} enabled={["guardian","student"].includes(role)&&!locked&&!studentLocked&&!needsProfile}/>
              {validPage==='viewHistory'&&<ViewHistory {...props}/>}
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
              : publicDemo ? "Demo local · datos ficticios" : "Entorno local · configura Supabase para compartir datos"}
          </span>
        </footer>
      </div>
      <AnnouncementGate key={`${identity.id}:${identity.support?.id||''}:${role}:${school?.id||''}`} identity={identity} role={role} schoolId={school?.id} store={store}/>
      {role==="director" && school && !modal && <DirectorAssistant key={school.id} schoolId={school.id} onAction={id=>{const action=guideActions[id];if("page" in action)go(action.page);else open(action.form);}}/>}
      {modal?.type === "studentLogin" && <StudentLoginModal {...props} id={modal.id} onClose={() => setModal(null)} /> }
      {modal?.type === "emergency" && <StudentEmergency student={store.data.students.find(s=>s.id===modal.id)} onClose={()=>setModal(null)}/>}
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
      {modal && !["intake", "documents", "studentLogin", "emergency"].includes(modal.type) && (
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
