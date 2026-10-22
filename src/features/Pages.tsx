import {ContentSeen} from '../components/ContentSeen';
import {openAnnouncement} from '../lib/announcementEvents';
import {noticeCategories} from '../lib/announcements';
import {AlertIcon} from './Announcements';
import { admissionRows } from "../lib/admission";
import { expandCalendarEvents } from "../lib/documentImport";
import { platformBalance } from "../lib/pricing";
import { PickupIdentity } from "./PickupIdentity";
import { publicDemo } from "../lib/demo-config";
import {TariffSettings,ChargeAmountDialog,StudentFeesDialog,usePlatformTariffs} from './Pricing';
import { PlatformBankDues, BankRegister } from "./BankQr";
import { learningDay } from "../lib/learning";
import { PaymentConnection } from "./PaymentConnection";
import { SchoolLocation } from "../components/SchoolLocation";
import { chargeBalance } from "../lib/operations";
import { MonthCalendar } from "../components/MonthCalendar";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Heart,
  LockKeyhole,
  KeyRound,
  Mail,
  ClipboardList,
  FileText,
  Megaphone,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  SearchBox,
  SectionTitle,
  StatCard,
} from "../components/UI";
import { dateLabel, money } from "../lib/store";
import { chargeStatus, today } from "../lib/billing";
import { liveMode } from "../lib/supabase";
import type { AppStore } from "../lib/store";
import type {
  AppData,
  Collection,
  Identity,
  Role,
  School,
  Student,
} from "../lib/types";
export type OpenModal = (type: string, item?: { id: string }) => void;
export interface PageProps {
  store: AppStore;
  school?: School;
  role: Role;
  students: Student[];
  student?: Student;
  identity: Identity;
  open: OpenModal;
  act: (task: () => Promise<unknown>, message: string) => void;
  go: (page: string) => void;
}
export const fullName = (s?: Student) =>
  s ? `${s.firstName} ${s.lastName}` : "Estudiante";

function InstitutionLogo({ school }: { school?: School }) {
  const [failedLogo, setFailedLogo] = useState("");
  return school?.logoUrl && school.logoUrl !== failedLogo ? (
    <img
      className="institution-card-logo"
      src={school.logoUrl}
      alt={`Logo de ${school.name}`}
      referrerPolicy="no-referrer"
      onError={() => setFailedLogo(school.logoUrl || "")}
    />
  ) : (
    <span className="school-symbol large" style={{ background: school?.color }}>
      {school?.initials || "MC"}
    </span>
  );
}

function InstitutionDetails({ school }: { school: School }) {
  const rows = [
    ["NIT", school.nit],
    ["Dirección", school.address],
    ["Teléfono", school.phone],
  ].filter(([, value]) => value);
  return (
    <>
      {school.bannerUrl && <img className="institution-banner-preview" src={school.bannerUrl} alt={`Portada de ${school.name}`} />}
      <SchoolLocation school={school} />
      {rows.length > 0 && (
        <dl className="institution-details">
          {rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}
      {school.website && (
        <a className="institution-site" href={school.website} target="_blank" rel="noopener noreferrer">
          Visitar sitio web
        </a>
      )}
    </>
  );
}

export function Directory({
  page,
  store,
  school,
  role,
  students,
  open,
  act,
  go,
  identity,
}: PageProps & { page: string }) {
  const location = useLocation();
  const [classroomFilter, setClassroomFilter] = useState(new URLSearchParams(location.search).get("classroom") || "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const data = store.data,
    canEdit = role === "director" || role === "superadmin";
  const teachers = data.teachers.filter((t) => t.schoolId === school?.id);
  const rooms = data.classrooms.filter(
    (c) =>
      c.schoolId === school?.id &&
      (role !== "teacher" || c.teacherIds.some(id => identity.teacherIds.includes(id))),
  );
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  const visible = students.filter(
    (s) =>
      matches(`${fullName(s)} ${s.guardianName} ${s.guardianEmail}`) &&
      (filter === "all" || s.status === filter) && (!classroomFilter || s.classroomId === classroomFilter),
  );
  return (
    <>
      <SectionTitle
        title={
          page === "schools"
            ? "Tu red de instituciones"
            : page === "teachers"
              ? "Personas que hacen la diferencia"
              : page === "classrooms"
                ? "Un espacio para cada etapa"
                : "Nuestra comunidad de estudiantes"
        }
        subtitle={
          page === "students"
            ? "Inscripciones, familias y seguimiento, en un solo lugar."
            : "Organiza tu comunidad y acompaña su crecimiento."
        }
        action={
          canEdit && (
            <Button
              icon={Plus}
              onClick={() =>
                open(
                  page === "schools"
                    ? "school"
                    : page === "teachers"
                      ? "teacher"
                      : page === "classrooms"
                        ? "classroom"
                        : "student",
                )
              }
            >
              {page === "schools"
                ? "Nueva institución"
                : page === "teachers"
                  ? "Agregar docente"
                  : page === "classrooms"
                    ? "Crear aula"
                    : "Inscribir estudiante"}
            </Button>
          )
        }
      />
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre…"
        />
        {page === "students" && <select aria-label="Filtrar estudiantes por aula" value={classroomFilter} onChange={e => setClassroomFilter(e.target.value)}><option value="">Todas las aulas</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name} · {room.academicYear || today().slice(0,4)}</option>)}</select>}
        {page === "students" && (
          <div className="segmented">
            {[
              ["all", "Todos"],
              ["active", "Activos"],
              ["pending", "Pendientes"],
              ["inactive", "De baja"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "selected" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {page === "students" && (
        <section className="panel table-panel">
          <div className="table-caption">
            <b>{visible.length} estudiantes</b>
            <span>Información de inscripción</span>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>ESTUDIANTE</th>
                  <th>AULA</th>
                  <th>FAMILIA</th>
                  <th>MENSUALIDAD</th>
                  <th>ESTADO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="table-identity">
                        <Avatar name={fullName(s)} />
                        <div>
                          <b>{fullName(s)}</b>
                          <small>Desde {dateLabel(s.enrolledAt)}</small>
                          {s.rude && <small>RUDE: {s.rude}</small>}
                          {s.status === "inactive" && s.withdrawalReason && <small>Motivo: {s.withdrawalReason}</small>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="course-tag">
                        {rooms.find((c) => c.id === s.classroomId)?.name ||
                          "Sin aula"}
                      </span>
                    </td>
                    <td>
                      <div className="table-detail">
                        <span>{s.guardianName}</span>
                        <small>{s.guardianEmail}</small>
                        <small>
                          {s.profileComplete
                            ? "Cuidados completos"
                            : store.data.familyIntakes.some(
                                  (f) =>
                                    f.studentId === s.id &&
                                    f.status === "submitted",
                                )
                              ? "Ficha por revisar"
                              : "Ficha pendiente"}
                        </small>
                      </div>
                    </td>
                    <td>
                      <b>{money(s.monthlyFee)}</b>
                    </td>
                    <td>
                      <Badge status={s.status} />
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="mini-btn" onClick={()=>open("emergency",s)}>Emergencias</button>
                        {canEdit && (
                          <>
                            <button
                              className="icon-button"
                              title="Editar estudiante"
                              onClick={() => open("student", s)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              title="Invitar a la familia"
                              onClick={() => open("invite", s)}
                            >
                              <Mail size={16} />
                            </button>
                            <button
                              className="icon-button"
                              title="Ficha familiar y WhatsApp"
                              onClick={() => open("intake", s)}
                            >
                              <ClipboardList size={16} />
                            </button>
                            <button
                              className="icon-button"
                              title="Completar cuidados"
                              onClick={() => open("profile", s)}
                            >
                              <Heart size={16} />
                            </button>
                            <button
                              className="icon-button"
                              title="Documentos del estudiante"
                              onClick={() => open("documents", s)}
                            >
                              <FileText size={16} />
                            </button>
                            <button className="icon-button" title="Acceso del estudiante" onClick={() => open("studentLogin", s)}><KeyRound size={16} /></button>
                            <button
                              className="mini-btn"
                              disabled={store.busy}
                              onClick={() => open("status", s)}
                            >
                              {s.status === "active"
                                ? "Dar de baja"
                                : "Activar"}
                            </button>
                          </>
                        )}
                        {role === "teacher" && (
                          <button
                            className="mini-btn"
                            onClick={() => open("access", s)}
                          >
                            Plazo de acceso
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <Empty
              title="No encontramos estudiantes"
              subtitle="Prueba otra búsqueda o registra una inscripción."
              action={canEdit ? () => open("student") : undefined}
            />
          )}
        </section>
      )}
      {page === "schools" && (
        <div className="card-grid">
          {data.schools
            .filter((s) => matches(`${s.name} ${s.city}`))
            .map((s) => (
              <article className="entity-card institution-card" key={s.id}>
                <div className="entity-top">
                  <InstitutionLogo school={s} />
                  <Badge status={s.status} />
                </div>
                <h3>{s.name}</h3>
                <p>
                  {s.city} · {s.director}
                </p>
                <InstitutionDetails school={s} />
                <p className="institution-public-state">
                  {s.showOnLanding === false
                    ? "Oculta en la página de MiCole"
                    : s.status === "active"
                      ? "Visible en la página de MiCole"
                      : "Se mostrará en MiCole al activarla"}
                </p>
                <div className="entity-meta">
                  <span>
                    <Users size={16} />
                    {s.activeStudentCount ??
                      data.students.filter(
                        (x) => x.schoolId === s.id && x.status === "active",
                      ).length}{" "}
                    activos
                  </span>
                </div>
                <div className="entity-footer">
                  <Button variant="secondary" icon={Pencil} onClick={() => open("branding", s)}>
                    Editar institución
                  </Button>
                  {identity.canSupport && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        go(`school:${s.id}`);
                      }}
                    >
                      Abrir soporte
                    </Button>
                  )}
                  <button
                    className="icon-button"
                    title="Invitar directora"
                    onClick={() => open("directorInvite", s)}
                  >
                    <Mail size={17} />
                  </button>
                  <button
                    className="icon-button"
                    title={
                      s.status === "active"
                        ? "Suspender institución"
                        : "Activar institución"
                    }
                    disabled={store.busy}
                    onClick={() =>
                      act(
                        () =>
                          store.save("schools", {
                            ...s,
                            status:
                              s.status === "active" ? "inactive" : "active",
                          }),
                        "Estado de institución actualizado.",
                      )
                    }
                  >
                    <LockKeyhole size={17} />
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
      {page === "teachers" && (
        <div className="card-grid">
          {teachers
            .filter((t) => matches(`${t.name} ${t.specialty}`))
            .map((t) => (
              <article className="entity-card" key={t.id}>
                <div className="entity-top">
                  <Avatar name={t.name} size="lg" />
                  <Badge status={t.status} />
                </div>
                <h3>{t.name}</h3>
                <p>{t.specialty}</p>
                <small className="icon-line">
                  <Mail size={14} />
                  {t.email}
                </small>
                <div className="tag-list">
                  {rooms
                    .filter((c) => c.teacherIds.includes(t.id))
                    .map((c) => (
                      <span className="course-tag" key={c.id}>
                        {c.name}
                      </span>
                    ))}
                </div>
                <div className="entity-footer">
                  <Button
                    variant="secondary"
                    onClick={() => open("teacher", t)}
                  >
                    Editar docente
                  </Button>
                  <button
                    className="icon-button"
                    title="Crear invitación docente"
                    onClick={() => open("teacherInvite", t)}
                  >
                    <Mail size={17} />
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
      {page === "classrooms" && (
        <div className="card-grid">
          {rooms
            .filter((c) => matches(`${c.name} ${c.level}`))
            .map((c, i) => (
              <article className="entity-card" key={c.id}>
                <span className={`room-icon room-${i % 3}`}>
                  <BookOpen size={26} />
                </span>
                <h3><button className="text-button" onClick={() => go(`students?classroom=${encodeURIComponent(c.id)}`)}>{c.name}</button></h3>
                <p>{c.active === false ? "Inscripciones cerradas" : `${Math.max(0,(c.capacity || 30)-students.filter(s=>s.classroomId===c.id && s.status!=="inactive").length)} cupos disponibles`} · Gestión {c.academicYear || today().slice(0,4)}</p>
                <p>{c.level}</p>
                <div className="icon-line">
                  <Clock size={16} />
                  {c.schedule}
                </div>
                <div className="icon-line">
                  <Users size={16} />
                  {
                    students.filter(
                      (s) => s.classroomId === c.id && s.status === "active",
                    ).length
                  }{" "}
                  estudiantes activos
                </div>
                <Button variant="secondary" onClick={() => go(`students?classroom=${encodeURIComponent(c.id)}`)}>Ver estudiantes</Button>
                <div className="table-actions"><Button variant="ghost" onClick={()=>go(`studentAttendance?classroom=${encodeURIComponent(c.id)}`)}>Pasar lista</Button><Button variant="ghost" onClick={()=>go(`subjects?classroom=${encodeURIComponent(c.id)}`)}>Materias</Button><Button variant="ghost" onClick={()=>go(`assignments?classroom=${encodeURIComponent(c.id)}`)}>Tareas y entregas</Button></div>
                <div className="entity-footer">
                  <div className="avatar-stack">
                    {c.teacherIds.map((id) => (
                      <Avatar
                        key={id}
                        name={
                          teachers.find((t) => t.id === id)?.name || "Docente"
                        }
                        size="sm"
                      />
                    ))}
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      onClick={() => open("classroom", c)}
                    >
                      Editar aula
                    </Button>
                  )}
                </div>
              </article>
            ))}
        </div>
      )}
      {page !== "students" &&
        !(
          page === "schools"
            ? data.schools
            : page === "teachers"
              ? teachers
              : rooms
        ).length && (
          <section className="panel">
            <Empty
              action={
                canEdit
                  ? () =>
                      open(
                        page === "schools"
                          ? "school"
                          : page === "teachers"
                            ? "teacher"
                            : "classroom",
                      )
                  : undefined
              }
            />
          </section>
        )}
    </>
  );
}
export function Payments({
  store,
  school,
  role,
  students,
  student,
  open,
  act,
  platform: platformView,
}: PageProps & { platform?: boolean }) {
  const [filter, setFilter] = useState("all");
  const platform = platformView ?? role === "superadmin";
  const charges = platform
    ? store.data.platformCharges
    : [
        ...store.data.charges.filter(
          (c) =>
            c.schoolId === school?.id &&
            (role !== "guardian" || c.studentId === student?.id),
        ),
        ...(role === "guardian"
          ? store.data.platformCharges.filter(
              (c) => c.studentId === student?.id,
            )
          : []),
      ];
  const [adjusted,setAdjusted]=useState<{id:string;amount:number;concept:string}|null>(null),[feeStudent,setFeeStudent]=useState<Student|null>(null);
  const {rates}=usePlatformTariffs(school?.id);
  const usable = charges.filter((c) => c.status !== "cancelled");
  const sum = (paid: boolean) =>
    usable
      .filter((c) => (c.status === "paid") === paid)
      .reduce((a, c) => a + (platform&&!paid?platformBalance(c):c.amount), 0);
  return (
    <>
      {platform&&<TariffSettings schools={store.data.schools}/>}
      <SectionTitle
        title={platform ? "Facturación de MiCole" : "Cada pago, en orden"}
        subtitle={
          platform
            ? "Activaciones y licencias según las tarifas configuradas al emitir cada cobro."
            : "Mensualidades, matrículas y el estado de cuenta de cada familia."
        }
        action={
          role !== "guardian" && (
            <div className="action-group">
              {platform && (
                <Button
                  variant="secondary"
                  disabled={store.busy}
                  onClick={() =>
                    act(
                      () => store.billingCycle(),
                      "Corte del mes completado sin duplicar cargos.",
                    )
                  }
                >
                  Ejecutar corte del mes
                </Button>
              )}
              {!platform && (
                <Button
                  variant="secondary"
                  icon={Plus}
                  onClick={() => open("charge")}
                >
                  Cobro adicional
                </Button>
              )}
              <Button
                icon={ReceiptText}
                onClick={() => open(platform ? "platformInvoice" : "plan")}
              >
                {platform ? "Generar liquidación" : "Crear plan de pagos"}
              </Button>
            </div>
          )
        }
      />
      <div className="stats-grid three">
        <StatCard
          label="Pagos registrados"
          value={money(sum(true))}
          icon={CheckCircle2}
        />
        <StatCard
          label="Saldo pendiente"
          value={money(sum(false))}
          icon={Wallet}
          tone="amber"
        />
        <StatCard
          label="Cuotas"
          value={usable.length}
          icon={ReceiptText}
          tone="purple"
        />
      </div>
      <div className="toolbar">
        <div className="segmented">
          {[
            ["all", "Todos"],
            ["pending", "Pendientes"],
            ["paid", "Pagados"],
            ["overdue", "Vencidos"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "selected" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted">Importes en bolivianos</span>
      </div>
      <section className="panel table-panel">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>CONCEPTO</th>
                <th>{platform ? "INSTITUCIÓN" : "ESTUDIANTE"}</th>
                <th>{platform ? "PERÍODO" : "VENCIMIENTO"}</th>
                <th>IMPORTE</th>
                <th>ESTADO</th>
                <th>ACCIÓN</th>
              </tr>
            </thead>
            <tbody>
              {charges
                .filter(
                  (c) =>
                    filter === "all" ||
                    ("dueDate" in c ? chargeStatus(c) : c.status) === filter,
                )
                .map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.concept}</b>
                      {"licenseAmount" in c && !!c.licenseAmount && (
                        <small className="cell-note">
                          Incluye {money(c.licenseAmount)} de licencia
                          {c.discountAmount
                            ? ` · descuento ${money(c.discountAmount)}`
                            : ""}
                        </small>
                      )}
                      {"invoiceName" in c && !!c.invoiceName && (
                        <small className="cell-note">
                          Factura: {c.invoiceName} · NIT/CI {c.invoiceNit} ·{" "}
                          {c.invoicePhone}
                        </small>
                      )}
                      {!("dueDate" in c) && c.studentId && (
                        <small className="cell-note">
                          Pago a MiCole · activación inicial
                        </small>
                      )}
                    </td>
                    <td>
                      {platform
                        ? store.data.schools.find((s) => s.id === c.schoolId)
                            ?.name
                        : fullName(students.find((s) => s.id === c.studentId))}
                    </td>
                    <td>{"dueDate" in c ? dateLabel(c.dueDate) : c.period}</td>
                    <td>
                      <b>{money(c.amount)}</b>{platform&&"creditApplied" in c&&!!c.creditApplied&&<small className="block">Crédito {money(c.creditApplied)} · Saldo {money(platformBalance(c))}</small>}{"paidAmount" in c && !!c.paidAmount && c.status !== "paid" && <small className="block">Abonado {money(c.paidAmount)} · Saldo {money(chargeBalance(c))}</small>}
                    </td>
                    <td>
                      <Badge
                        status={"dueDate" in c ? chargeStatus(c) : c.status}
                      />
                    </td>
                    <td>
                      <div className="table-actions">
                        {['superadmin','director'].includes(role)&&!['paid','cancelled'].includes(c.status)&&(!platform||((!('kind' in c)||c.kind!=='credit_topup')&&(!('creditApplied' in c)||!c.creditApplied)))&&<Button variant="ghost" onClick={()=>setAdjusted(c)}>Aumentar importe</Button>}

                        {c.status !== "cancelled" && c.status !== "paid" && (!platform||((!("kind" in c)||c.kind!=="credit_topup")&&(!("creditApplied" in c)||!c.creditApplied))) && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              open(
                                role === "guardian"
                                  ? "qr"
                                  : platform
                                    ? "platformPayment"
                                    : "payment",
                                c,
                              )
                            }
                          >
                            {role === "guardian"
                              ? "Pagar con QR"
                              : "Registrar pago"}
                          </Button>
                        )}
                        {role === "guardian" &&
                          "dueDate" in c &&
                          c.status !== "cancelled" && (
                            <button
                              className="icon-button"
                              title="Solicitar factura"
                              onClick={() => open("invoice", c)}
                            >
                              <ReceiptText size={17} />
                            </button>
                          )}
                        {platform && !["paid","cancelled"].includes(c.status) && <Button variant="secondary" onClick={()=>open("qr",c)}>Generar QR Baneco</Button>}
                        {c.status === "paid" && (
                          <Check size={17} className="green-text" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!charges.length && (
          <Empty
            title="Todavía no hay cuotas"
            subtitle="Crea un plan de pagos para generar las mensualidades."
          />
        )}
      </section>
      {role !== "guardian" &&
        !platform &&
        store.data.paymentPlans
          .filter((p) => p.schoolId === school?.id)
          .map((p) => (
            <section key={p.id} className="panel">
              <SectionTitle
                title={`Plan de ${fullName(students.find((s) => s.id === p.studentId))}`}
                subtitle={`${p.months} meses · ${money(p.monthlyFee)} de mensualidad · ${p.discount ? money(p.discount) + " de descuento" : "Sin descuento"}`}
                action={
                  <div className="action-group"><Button variant="secondary" onClick={()=>{const target=students.find(s=>s.id===p.studentId);if(target)setFeeStudent(target);}}>Precios para nuevas cuotas</Button><Button
                    variant="secondary"
                    onClick={() => open("planDiscount", p)}
                  >
                    Ajustar descuento
                  </Button></div>
                }
              />
            </section>
          ))}
      {!platform && ["director","guardian"].includes(role) && <PlatformBankDues charges={store.data.platformCharges.filter(c=>c.schoolId===school?.id&&(role!=="guardian"||c.studentId===student?.id))} onChanged={()=>void store.refresh()}/>}
      {platform&&<BankRegister canReview={true}/>}
      {adjusted&&<ChargeAmountDialog charge={adjusted} kind={platform?'platform':'school'} onClose={()=>setAdjusted(null)} onSaved={()=>{setAdjusted(null);void store.refresh();}}/>}
      {feeStudent&&<StudentFeesDialog student={feeStudent} onClose={()=>setFeeStudent(null)} onSaved={()=>{setFeeStudent(null);void store.refresh();}}/>}
      <div className="soft-note">
        <ReceiptText size={18} />
        <span>
          {platform
            ? "Las liquidaciones se pagan a la cuenta de MiCole. Son independientes de los cobros escolares."
            : `Las nuevas mensualidades incluyen ${money(rates.monthlyLicenseFee)} de licencia MiCole. Las emitidas conservan su importe.`}{" "}
          Los QR usan la conexión Baneco correspondiente a cada cuenta.
        </span>
      </div>
    </>
  );
}
export function Community({
  page,
  store,
  school,
  role,
  students,
  student,
  identity,
  open,
  act,
  go,
}: PageProps & { page: string }) {
  const data = store.data,
    schoolId = school?.id,
    canWrite =
      role === "teacher" || role === "director" || role === "superadmin";
  const [body, setBody] = useState("");
  const [threadId, setThreadId] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState("");
  const changeMonth = (value: string) => { if (value) { setMonth(value); setSelectedDay(""); } };
  const current =
    ["guardian", "student"].includes(role)
      ? student
      : students.find((s) => s.id === threadId) || students[0];
  const visibleIds = students.map((s) => s.id);
  if (page === "journal") {
    const entries = data.dailyEntries
      .filter(
        (e) =>
          e.schoolId === schoolId &&
          visibleIds.includes(e.studentId) &&
          (!["guardian", "student"].includes(role) || e.studentId === student?.id) &&
          (role !== "student" || e.category === "tarea"),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    return (
      <>
        <SectionTitle
          title={role === "student" ? "Mis tareas" : "Nuestro cuaderno digital"}
          subtitle={role === "student" ? "Consulta las tareas que tu docente comparte contigo." : "Actividades, comidas, descanso y esas pequeñas cosas que cuentan."}
          action={
            canWrite && (
              <Button icon={Plus} onClick={() => open("entry")}>
                Nueva entrada
              </Button>
            )
          }
        />
        <div className="journal-grid">
          <section className="panel">
            {entries.map((e) => (
              <article className="journal-entry" key={e.id}>
                <span className="row-icon">
                  <BookOpen size={20} />
                </span>
                <div className="grow">
                  <div className="entry-top">
                    <b>
                      {fullName(students.find((s) => s.id === e.studentId))}
                    </b>
                    <small>{dateLabel(e.date)}</small>
                  </div>
                  <span className="course-tag">{e.category}</span>
                  <p>{e.note}</p>
                </div>
              </article>
            ))}
            {!entries.length && (
              <Empty
                title="Una nueva historia por escribir"
                action={canWrite ? () => open("entry") : undefined}
              />
            )}
          </section>
          <aside className="connection-card">
            <Heart size={28} />
            <h3>Su día también es tuyo.</h3>
            <p>
              Un cuaderno compartido entre el colegio y la familia. Cada entrada
              acompaña su crecimiento.
            </p>
          </aside>
        </div>
      </>
    );
  }
  if (page === "announcements") {
    const announcements = data.announcements.filter(
      (a) =>
        a.schoolId === schoolId && !a.revokedAt &&
        (!a.targetStudentIds?.length || !["guardian","student"].includes(role) || !!student&&a.targetStudentIds.includes(student.id)) &&
        (!a.classroomId || a.createdBy===identity.id ||
          role === "director" ||
          role === "superadmin" ||
          (role === "guardian" || role === "student" ? student?.classroomId === a.classroomId : students.some((s) => s.classroomId === a.classroomId))) &&
        (role === "director" ||
          role === "superadmin" ||
          a.createdBy===identity.id || a.audience === "all" ||
          a.audience === (["guardian", "student"].includes(role) ? "families" : "staff")),
    );
    return (
      <>
        <SectionTitle
          title="Novedades para compartir"
          subtitle="Información que mantiene conectada a nuestra comunidad."
          action={
            canWrite && (
              <Button icon={Megaphone} onClick={() => open("announcement")}>
                Nuevo comunicado
              </Button>
            )
          }
        />
        <div className="card-grid">
          {announcements
            .slice()
            .reverse()
            .map((a) => (
              <article key={a.id} className="entity-card announcement-card">
                <div className="entity-top">
                  <span className="row-icon">
                    <AlertIcon notice={{alertType:a.category==='general'?'announcement':a.category}} size={22}/>
                  </span>
                  <Badge
                    status={a.audience}
                    label={
                      a.classroomId
                        ? data.classrooms.find((c) => c.id === a.classroomId)
                            ?.name
                        : undefined
                    }
                  />
                </div>
                <h3>{a.title}</h3>
                <small>{noticeCategories[a.category||'general']}{a.requiresAcknowledgment?' · Confirmación requerida':''}</small><p>{role!=='student'&&a.content.length>250?a.content.slice(0,250)+'…':a.content}</p>
                <div className="entity-footer">
                  <small>{dateLabel(a.createdAt)}</small>{role!=='student'&&<Button variant="secondary" onClick={()=>openAnnouncement(a.id)}>{canWrite?'Ver aviso y lecturas':'Leer aviso'}</Button>}
                </div>
              </article>
            ))}
        </div>
        {!announcements.length && (
          <section className="panel">
            <Empty title="Sin comunicados nuevos" />
          </section>
        )}
      </>
    );
  }
  if (page === "calendar" || page === "materials") {
    const agendaStudents =
      ["guardian", "student"].includes(role) ? (student ? [student] : []) : students;
    const rooms = data.classrooms.filter(
      (c) =>
        c.schoolId === schoolId &&
        (role === "director" ||
          role === "superadmin" ||
          agendaStudents.some((s) => s.classroomId === c.id)),
    );
    const events = data.events.filter(
      (e) =>
        e.schoolId === schoolId &&
        (!e.classroomId || rooms.some((c) => c.id === e.classroomId)) &&
        (page !== "materials" || e.type === "materials"),
    );
    const taskDates=data.assignments.filter(a=>a.schoolId===schoolId&&a.status!=='draft'&&a.dueAt&&rooms.some(r=>r.id===a.classroomId)).map(a=>({id:`assignment-${a.id}`,title:a.title,date:learningDay(a.dueAt),description:'Fecha límite de entrega',type:'homework'}));
    const birthdays = agendaStudents
      .filter((s) => s.birthDate && s.status !== "inactive")
      .map((s) => ({
        id: `birthday-${s.id}`,
        title: `Cumpleaños de ${s.firstName}`,
        date: `${month.slice(0, 4)}-${s.birthDate.slice(5)}`,
        description: fullName(s),
        type: "birthday",
      }));
    const agenda = (page === "calendar" ? [...expandCalendarEvents(events,month), ...birthdays, ...taskDates] : events)
      .filter((e) => e.date.startsWith(month))
      .sort((a, b) => a.date.localeCompare(b.date));
    return (
      <>
        <SectionTitle
          title={
            page === "materials"
              ? "Todo listo para aprender"
              : "Una agenda compartida"
          }
          subtitle={
            page === "materials"
              ? "Las listas de materiales de cada aula."
              : "Eventos, tareas y cumpleaños. Para que no se nos escape nada."
          }
          action={
            canWrite && (<div className="action-group">{role==="director"&&page==="calendar"&&<Button variant="secondary" onClick={()=>go("calendarImport")}>Importar calendario</Button>}
              <Button
                icon={Plus}
                onClick={() =>
                  open(page === "materials" ? "materials" : "event")
                }
              >
                {page === "materials" ? "Nueva lista" : "Agregar evento"}
              </Button></div>
            )
          }
        />
        <div className="toolbar">
          <label className="month-picker">
            <CalendarDays size={18} />
            <input
              aria-label="Mes de la agenda"
              type="month"
              value={month}
              onChange={(e) => changeMonth(e.target.value)}
            />
          </label>
          <span className="muted">{agenda.length} actividades este mes</span>
        </div>
        {page === "calendar" && <MonthCalendar month={month} events={agenda} selected={selectedDay} onSelect={setSelectedDay} onMonth={changeMonth} />}
        <section className="panel">
          {(selectedDay ? agenda.filter(e => e.date === selectedDay) : agenda).map((e) => (
            <article className="calendar-row" key={e.id}>
              <span className="event-date">
                <b>{e.date.slice(8, 10)}</b>
                <small>
                  {new Date(`${e.date}T12:00:00`).toLocaleDateString("es", {
                    weekday: "short",
                  })}
                </small>
              </span>
              <div className="grow">
                <span className="category-label">
                  {
                    {
                      event: "Evento",
                      homework: "Tarea",
                      materials: "Materiales",
                      birthday: "Cumpleaños",
                    }[e.type]
                  }
                </span>
                <h3>{e.title}</h3>
                <p>{e.description}</p>
              </div>
              {e.id.startsWith("assignment-") && <Button variant="ghost" onClick={()=>go("assignments")}>Ver tarea</Button>}
              {canWrite && !e.id.startsWith("birthday-") && !e.id.startsWith("assignment-") && (
                <button
                  className="icon-button"
                  title="Editar evento"
                  onClick={() =>
                    open(e.type === "materials" ? "materials" : "event", {id:e.id.split(":")[0]})
                  }
                >
                  <Pencil size={17} />
                </button>
              )}
            </article>
          ))}
          {!(selectedDay ? agenda.filter(e => e.date === selectedDay) : agenda).length && (
            <Empty
              title={selectedDay ? "Sin actividades este día" : "Este mes está por escribir"}
              subtitle="No hay actividades registradas para el mes seleccionado."
            />
          )}
        </section>
      </>
    );
  }
  if (page === "requests") {
    const requests = data.requests.filter(
      (r) =>
        r.schoolId === schoolId &&
        visibleIds.includes(r.studentId) &&
        (role !== "guardian" || r.studentId === student?.id),
    );
    return (
      <>
        <SectionTitle
          title="Permisos y recogidas"
          subtitle="Cada autorización llega a dirección y a la maestra de su aula."
          action={
            role === "guardian" && (
              <div className="action-group">
                <Button variant="secondary" onClick={() => open("absence")}>
                  Solicitar permiso
                </Button>
                <Button icon={UserPlus} onClick={() => open("pickup")}>
                  Autorizar recogida
                </Button>
              </div>
            )
          }
        />
        <section className="panel">
          {requests
            .slice()
            .reverse()
            .map((r) => (
              <div key={r.id} className="request-row">
                <div className="grow">
                  <div className="entry-top">
                    <h3>
                      {r.type === "absence"
                        ? "Permiso de ausencia"
                        : "Recogida autorizada"}{" "}
                      · {fullName(students.find((s) => s.id === r.studentId))}
                    </h3>
                    <Badge status={r.status} />
                  </div>
                  <small>{dateLabel(r.date)}</small>
                  <p>{r.reason}</p>
                  {r.type === "pickup" && (
                    <div className="soft-note">
                      <span>
                        <b>{r.pickupName}</b> · Documento: {r.pickupId} · Placa:{" "}
                        {r.vehiclePlate || "No indicada"}
                      </span>
                    </div>
                  )}
                  {r.type==="pickup"&&<PickupIdentity request={r} canVerify={canWrite} onChanged={()=>store.refresh()} saveLocal={request=>store.save("requests",request)}/>}
                  {r.response && (
                    <p className="response-text">Respuesta: {r.response}</p>
                  )}
                  {canWrite && r.status === "pending" && (
                    <Button
                      variant="secondary"
                      onClick={() => open("requestResponse", r)}
                    >
                      Revisar solicitud
                    </Button>
                  )}
                </div>
              </div>
            ))}
          {!requests.length && (
            <Empty
              title="Sin solicitudes pendientes"
              subtitle="Los permisos y autorizaciones aparecerán aquí."
            />
          )}
        </section>
      </>
    );
  }
  if (page === "messages") {
    const messages = data.messages
      .filter((m) => m.studentId === current?.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return (
      <>
        <SectionTitle
          title="Conversemos"
          subtitle="Un inbox por estudiante, compartido por su familia, maestras y dirección."
        />
        <section className="panel inbox">
          {role !== "guardian" && (
            <label className="field">
              <span>Conversación de</span>
              <select
                aria-label="Estudiante de la conversación"
                value={current?.id || ""}
                onChange={(e) => setThreadId(e.target.value)}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="message-feed">
            {messages.map((m) => (
              <article
                className={`chat-message ${m.authorId === identity.id ? "own" : ""}`}
                key={m.id}
              >
                <small>
                  {m.authorName} · {dateLabel(m.createdAt)}
                </small>
                <p>{m.body}</p>
              </article>
            ))}
            {!messages.length && (
              <Empty
                title={`Un espacio para hablar sobre ${current?.firstName || "tu hijo"}`}
                subtitle="Envía un mensaje para comenzar la conversación. Usa la galería para compartir imágenes."
              />
            )}
          </div>
          <form
            className="message-compose"
            onSubmit={(e) => {
              e.preventDefault();
              if (!body.trim() || !current) return;
              const text = body.trim();
              act(async () => {
                await store.save("messages", {
                  id: crypto.randomUUID(),
                  schoolId: schoolId!,
                  studentId: current.id,
                  body: text,
                  authorId: identity.id,
                  authorName: identity.name,
                  authorRole: role,
                  createdAt: new Date().toISOString(),
                });
                setBody("");
              }, "Mensaje enviado.");
            }}
          >
            <textarea
              required
              maxLength={4000}
              aria-label="Mensaje"
              placeholder="Escribe un mensaje…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button
              type="submit"
              icon={Send}
              disabled={store.busy || !current || !body.trim()}
            >
              Enviar
            </Button>
          </form>
          <small className="muted">
            {liveMode
              ? "Los mensajes se actualizan al recibir novedades. Puedes usar el botón de actualizar."
              : "Modo local: los mensajes se guardan en este navegador."}
          </small>
        </section>
      </>
    );
  }
  if (page === "grades") {
    const grades = data.grades.filter(
      (g) =>
        g.schoolId === schoolId &&
        visibleIds.includes(g.studentId) &&
        (role !== "guardian" || g.studentId === student?.id),
    );
    return (
      <>
        <SectionTitle
          title="Acompañamos su progreso"
          subtitle="Notas, logros y recomendaciones de cada materia."
          action={
            canWrite && (
              <Button icon={Plus} onClick={() => open("grade")}>
                Registrar evaluación
              </Button>
            )
          }
        />
        <div className="card-grid">
          {grades.map((g) => (
            <ContentSeen kind="grade" id={g.id} key={`${g.id}:${g.score}:${g.recommendation}`}><article className="entity-card">
              <div className="entity-top">
                <span className="row-icon">
                  <BookOpen size={20} />
                </span>
                <span className="grade-score">{g.score}</span>
              </div>
              <h3>{g.subject}</h3>
              <p>
                {fullName(students.find((s) => s.id === g.studentId))} ·{" "}
                {g.period}
              </p>
              <p>{g.recommendation}</p>
              <small>{dateLabel(g.createdAt)}</small>
            </article></ContentSeen>
          ))}
        </div>
        {!grades.length && (
          <section className="panel">
            <Empty
              title="Cada logro merece su espacio"
              subtitle="Las evaluaciones aparecerán aquí."
            />
          </section>
        )}
      </>
    );
  }
  return null;
}
export function Family({ student, store, open }: PageProps) {
  if (!student)
    return (
      <section className="panel">
        <Empty
          title="Todavía no tienes hijos vinculados"
          subtitle="Ingresa con el correo de madre o padre registrado por Dirección."
        />
      </section>
    );
  return (
    <>
      <SectionTitle
        title="Todo empieza por conocerle"
        subtitle="Su información ayuda a cuidarle mejor cada día."
        action={
          <div className="action-group">
            <Button icon={Pencil} onClick={() => open("profile", student)}>
              Completar ficha
            </Button>
            <Button
              variant="secondary"
              icon={FileText}
              onClick={() => open("documents", student)}
            >
              Documentos
            </Button>
          </div>
        }
      />
      <section className="panel family-card">
        <div className="family-card-head">
          <Avatar name={fullName(student)} size="lg" />
          <div>
            <h2>{fullName(student)}</h2>
            <p>
              {store.data.classrooms.find((c) => c.id === student.classroomId)
                ?.name || "Sin aula asignada"}
            </p>
          </div>
          <Badge status={student.status} />
        </div>
        <div className="detail-grid">
          {[
            ...admissionRows(student.admissionDetails),
            ["Nacimiento", dateLabel(student.birthDate)],
            ["Madre", student.motherName || student.guardianName],
            ["Padre", student.fatherName || "Pendiente"],
            [
              "Seguro",
              student.hasInsurance === undefined
                ? "Pendiente"
                : student.hasInsurance
                  ? student.insuranceProvider || "Sí"
                  : "No",
            ],
            [
              "Segundo contacto",
              student.secondEmergencyContact || "No registrado",
            ],
            [
              "Segundo teléfono",
              student.secondEmergencyPhone || "No registrado",
            ],
            ["Alergias", student.allergies || "Sin especificar"],
            [
              "Alimentos que evita",
              student.foodRestrictions || "Sin especificar",
            ],
            ["Contacto de emergencia", student.emergencyContact || "Pendiente"],
            ["Teléfono de emergencia", student.emergencyPhone || "Pendiente"],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </div>
        {!student.profileComplete && (
          <div className="message warn">
            Completa la ficha de salud y emergencia para acompañar su
            inscripción.
          </div>
        )}
      </section>
    </>
  );
}
export function Settings({ store, school, role, open, act }: PageProps) {
  const download = () => {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `micole-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      {role === "director" && school && <PaymentConnection schoolId={school.id} />}
      <SectionTitle
        title="A tu manera"
        subtitle="La identidad de tu institución, en cada detalle."
      />
      <div className="settings-grid">
        <section className="panel">
          <SectionTitle title="Identidad de la institución" />
          <div className="brand-preview">
            <InstitutionLogo school={school} />
            <div>
              <h3>{school?.name || "MiCole"}</h3>
              <p>{school?.city}</p>
            </div>
          </div>
          {school && <InstitutionDetails school={school} />}
          {school && (
            <p className="institution-public-state">
              {school.showOnLanding === false
                ? "Oculta en la página de MiCole"
                : school.status === "active"
                  ? "Visible en la página de MiCole"
                  : "Se mostrará en MiCole al activarla"}
            </p>
          )}
          <Button
            variant="secondary"
            icon={Pencil}
            disabled={!school}
            onClick={() => open("branding", school)}
          >
            Editar identidad
          </Button>
        </section>
        {publicDemo ? <section className="panel"><SectionTitle title="Tu espacio de demostración" subtitle="Prueba MiCole con datos ficticios."/><p>Inscripciones, actividades y archivos se conservan solo en este navegador. Los pagos y recibos son simulados. No necesitas conectar cuentas bancarias, correo ni almacenamiento.</p><p className="muted">Utiliza «Restablecer demo» para volver a los ejemplos iniciales.</p></section> : (        <section className="panel">
          <SectionTitle
            title="Conexiones"
            subtitle="Servicios de tu plataforma"
          />
          <div className="integration-row">
            <span>Supabase · datos y Google Auth</span>
            <Badge
              status={liveMode ? "active" : "pending"}
              label={liveMode ? "Configurado" : "Modo local"}
            />
          </div>
          <div className="integration-row">
            <span>Cloudflare R2 · imágenes privadas</span>
            <Badge
              status={
                import.meta.env.VITE_R2_ENABLED === "true"
                  ? "active"
                  : "pending"
              }
              label={
                import.meta.env.VITE_R2_ENABLED === "true"
                  ? "Configurado"
                  : "Pendiente"
              }
            />
          </div>
          <div className="integration-row">
            <span>QR dinámico bancario</span>
            <Badge status="active" label="Baneco disponible" />
          </div>
          <p className="muted">
            Las credenciales bancarias y de R2 se configuran en el servidor. La
            app nunca almacena claves privadas.
          </p>
        </section>
)}
        <section className="panel">
          <SectionTitle
            title="Accesos de tu comunidad"
            subtitle="Invitaciones con correo, rol y fecha de caducidad"
          />
          <Button
            icon={Mail}
            variant="secondary"
            onClick={() =>
              open(role === "superadmin" ? "directorInvite" : "invite")
            }
          >
            Crear invitación
          </Button>
          {store.data.invitations
            .filter((i) => role === "superadmin" || i.schoolId === school?.id)
            .map((i) => (
              <div className="integration-row" key={i.id}>
                <div>
                  <b>{i.email}</b>
                  <small className="cell-note">
                    {i.role} · vence {dateLabel(i.expiresAt)}
                  </small>
                </div>
                <Badge status={i.status} />
                {i.status === "pending" && (
                  <button
                    className="icon-button"
                    title="Revocar invitación"
                    disabled={store.busy}
                    onClick={() =>
                      act(
                        () =>
                          store.save("invitations", {
                            ...i,
                            status: "revoked",
                          }),
                        "Invitación revocada.",
                      )
                    }
                  >
                    <LockKeyhole size={16} />
                  </button>
                )}
              </div>
            ))}
        </section>
        <section className="panel">
          <SectionTitle
            title="Tus datos"
            subtitle={
              liveMode
                ? "Exporta la información visible para tu cuenta."
                : "Los datos del modo local se guardan solo en este navegador."
            }
          />
          <Button variant="secondary" icon={Download} onClick={download}>
            Exportar JSON
          </Button>
          {!liveMode && (
            <p>
              <Button variant="ghost" onClick={() => open("reset")}>
                Restaurar datos de ejemplo
              </Button>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
export function findRecord(data: AppData, collection: Collection, id?: string) {
  return id ? data[collection].find((x) => x.id === id) : undefined;
}
