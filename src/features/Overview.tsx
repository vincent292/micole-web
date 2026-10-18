import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Heart,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Building2,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  SectionTitle,
  StatCard,
} from "../components/UI";
import { money, dateLabel } from "../lib/store";
import { chargeStatus } from "../lib/billing";
import type { AppData, Role, School, Student } from "../lib/types";
export function Overview({
  data,
  school,
  role,
  students,
  name,
  go,
  open,
}: {
  data: AppData;
  school?: School;
  role: Role;
  students: Student[];
  name: string;
  go: (page: string) => void;
  open: (type: string) => void;
}) {
  const charges = data.charges.filter(
    (c) =>
      c.schoolId === school?.id &&
      (role !== "guardian" || students.some((s) => s.id === c.studentId)) &&
      c.status !== "cancelled",
  );
  const financial = role === "superadmin" ? data.platformCharges : charges;
  const paid = financial
    .filter((c) => c.status === "paid")
    .reduce((a, c) => a + c.amount, 0);
  const pending = financial
    .filter((c) => c.status !== "paid")
    .reduce((a, c) => a + c.amount, 0);
  const classrooms = data.classrooms.filter(
    (c) =>
      c.schoolId === school?.id &&
      (role !== "teacher" || students.some((s) => s.classroomId === c.id)),
  );
  const events = data.events
    .filter(
      (e) =>
        e.schoolId === school?.id &&
        (!e.classroomId ||
          role === "director" ||
          role === "superadmin" ||
          students.some((s) => s.classroomId === e.classroomId)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const entries = data.dailyEntries
    .filter((e) => students.some((s) => s.id === e.studentId))
    .slice()
    .reverse()
    .slice(0, 3);
  return (
    <>
      {role === "director" && school && <div className="soft-note life-actions"><span>Configura requisitos e importa tu comunidad desde el asistente.</span><Button variant="secondary" onClick={()=>go("onboarding")}>Preparar institución</Button></div>}
      {(role === "director" || role === "superadmin") &&
        (!school || !classrooms.length || !data.teachers.some(t => t.schoolId === school.id) || !data.academicRequests.some(r => r.schoolId === school.id && r.kind === "annual_materials" && r.status === "approved")) && (
          <section className="panel setup-guide">
            <SectionTitle
              title={
                school
                  ? "Demos el primer paso con tu colegio"
                  : "Tu primera comunidad comienza aquí"
              }
              subtitle="Configura tu institución antes de comenzar con las inscripciones."
            />
            <div className="setup-steps">
              {!school ? (
                <Button icon={Plus} onClick={() => open("school")}>
                  Crear primera institución
                </Button>
              ) : (
                <>
                  <Button icon={BookOpen} variant="secondary" onClick={() => open("classroom")}>1. Crear aulas y horarios</Button>
                  <Button icon={GraduationCap} variant="secondary" disabled={!classrooms.length} onClick={() => open("teacher")}>2. Agregar docentes</Button>
                  <Button icon={BookOpen} variant="secondary" disabled={!classrooms.length} onClick={() => go("materials")}>3. Publicar materiales anuales</Button>
                  <Button icon={Users} disabled={!classrooms.length} onClick={() => open("student")}>4. Inscribir estudiantes</Button>
                </>
              )}
            </div>
          </section>
        )}
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-label">
            <span className="live-dot" /> TU COMUNIDAD, MÁS CERCA
          </div>
          <h2>
            {role === "superadmin"
              ? "Hagamos crecer MiCole."
              : role === "guardian"
                ? "Cada pequeño paso cuenta."
                : `Un buen día empieza contigo, ${name.split(" ")[0]}.`}
          </h2>
          <p>
            {role === "superadmin"
              ? "Un espacio para acompañar a cada institución y construir nuevas conexiones."
              : role === "guardian"
                ? "Acompaña sus descubrimientos, revisa la agenda y mantente cerca de su colegio."
                : "Menos pendientes. Más tiempo para lo que importa: acompañar a nuestros pequeños."}
          </p>
          <Button
            icon={role === "guardian" ? Heart : Plus}
            onClick={() =>
              role === "guardian"
                ? go("family")
                : open(
                    role === "superadmin"
                      ? "school"
                      : role === "teacher"
                        ? "entry"
                        : "student",
                  )
            }
          >
            {role === "superadmin"
              ? "Crear institución"
              : role === "guardian"
                ? "Ver a mis hijos"
                : role === "teacher"
                  ? "Registrar actividad"
                  : "Nueva inscripción"}
          </Button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <div className="art-card art-main">
            <GraduationCap size={46} strokeWidth={1.5} />
            <strong>Aprendemos juntos</strong>
            <span>Una comunidad conectada</span>
            <div className="mini-avatars">
              <Avatar name="Sofía Martínez" />
              <Avatar name="Mateo García" />
              <Avatar name="Emma Rivera" />
              <span>♡</span>
            </div>
          </div>
          <div className="art-floating art-book">
            <BookOpen size={26} />
          </div>
          <div className="art-floating art-spark">
            <Sparkles size={22} />
          </div>
          <span className="art-dot dot-one" />
          <span className="art-dot dot-two" />
        </div>
      </section>
      <div className="stats-grid">
        {role === "superadmin" ? (
          <>
            <StatCard
              label="Instituciones"
              value={data.schools.length}
              icon={Building2}
              footer={`${data.schools.filter((s) => s.status === "active").length} activas`}
              tone="purple"
            />
            <StatCard
              label="Estudiantes activos"
              value={data.students.filter((s) => s.status === "active").length}
              icon={Users}
              tone="blue"
            />
            <StatCard
              label="Licencias mensuales"
              value={money(
                data.platformCharges.filter(c=>!c.studentId&&c.status!=="cancelled"&&c.period===new Date().toISOString().slice(0,7)).reduce((n,c)=>n+c.amount,0),
              )}
              icon={TrendingUp}
              footer="Liquidaciones emitidas del mes"
            />
            <StatCard
              label="Por cobrar · plataforma"
              value={money(
                data.platformCharges
                  .filter(
                    (c) => c.status !== "paid" && c.status !== "cancelled",
                  )
                  .reduce((a, c) => a + c.amount, 0),
              )}
              icon={Wallet}
              tone="amber"
            />
          </>
        ) : role === "teacher" ? (
          <>
            <StatCard
              label="Mis estudiantes"
              value={students.length}
              icon={Users}
              tone="purple"
            />
            <StatCard
              label="Mis aulas"
              value={classrooms.length}
              icon={BookOpen}
              tone="blue"
            />
            <StatCard
              label="Entradas del cuaderno"
              value={
                data.dailyEntries.filter((e) =>
                  students.some((s) => s.id === e.studentId),
                ).length
              }
              icon={CheckCircle2}
            />
            <StatCard
              label="Solicitudes pendientes"
              value={
                data.requests.filter(
                  (r) =>
                    students.some((s) => s.id === r.studentId) &&
                    r.status === "pending",
                ).length
              }
              icon={CalendarDays}
              tone="amber"
            />
          </>
        ) : (
          <>
            <StatCard
              label={role === "guardian" ? "Mis hijos" : "Estudiantes"}
              value={students.length}
              icon={Users}
              footer={`${students.filter((s) => s.status === "active").length} inscripciones activas`}
              tone="purple"
            />
            <StatCard
              label="Aulas"
              value={classrooms.length}
              icon={BookOpen}
              footer="Espacios para aprender"
              tone="blue"
            />
            <StatCard
              label="Pagos registrados"
              value={money(paid)}
              icon={CheckCircle2}
              footer="Total de cuotas pagadas"
            />
            <StatCard
              label="Cuotas por cobrar"
              value={money(pending)}
              icon={Wallet}
              footer={`${charges.filter((c) => chargeStatus(c) === "overdue").length} cuotas vencidas`}
              tone="amber"
            />
          </>
        )}
      </div>
      <div className="dashboard-grid">
        <div>
          <section className="panel">
            <SectionTitle
              title={
                role === "superadmin"
                  ? "Instituciones"
                  : role === "guardian" || role === "teacher"
                    ? "El día a día"
                    : "Estudiantes recientes"
              }
              subtitle={
                role === "superadmin"
                  ? "La comunidad MiCole"
                  : "Pequeñas historias, grandes descubrimientos"
              }
              action={
                <button
                  className="text-button"
                  onClick={() =>
                    go(
                      role === "superadmin"
                        ? "schools"
                        : role === "guardian" || role === "teacher"
                          ? "journal"
                          : "students",
                    )
                  }
                >
                  Ver todos <ArrowRight size={16} />
                </button>
              }
            />
            {role === "superadmin" ? (
              data.schools.map((s) => (
                <div className="list-row" key={s.id}>
                  <span
                    className="school-symbol"
                    style={{ background: s.color }}
                  >
                    {s.initials}
                  </span>
                  <div className="grow">
                    <b>{s.name}</b>
                    <small>
                      {s.city} ·{" "}
                      {data.students.filter((x) => x.schoolId === s.id).length}{" "}
                      estudiantes
                    </small>
                  </div>
                  <Badge status={s.status} />
                </div>
              ))
            ) : role === "guardian" || role === "teacher" ? (
              entries.length ? (
                entries.map((e) => (
                  <div key={e.id} className="list-row">
                    <span className="row-icon">
                      <BookOpen size={19} />
                    </span>
                    <div className="grow">
                      <b>
                        {students.find((s) => s.id === e.studentId)?.firstName}{" "}
                        · {e.category}
                      </b>
                      <small>{e.note}</small>
                    </div>
                    <small>{dateLabel(e.date)}</small>
                  </div>
                ))
              ) : (
                <Empty
                  title="Un nuevo día por escribir"
                  subtitle="Aquí aparecerán las actividades del cuaderno."
                />
              )
            ) : (
              students
                .slice()
                .reverse()
                .slice(0, 4)
                .map((s) => (
                  <div className="list-row" key={s.id}>
                    <Avatar name={`${s.firstName} ${s.lastName}`} />
                    <div className="grow">
                      <b>
                        {s.firstName} {s.lastName}
                      </b>
                      <small>
                        {classrooms.find((c) => c.id === s.classroomId)?.name ||
                          "Sin aula"}{" "}
                        · {s.guardianName}
                      </small>
                    </div>
                    <Badge status={s.status} />
                  </div>
                ))
            )}
            {!students.length && role === "director" && (
              <Empty action={() => open("student")} />
            )}
          </section>
          <section className="panel">
            <SectionTitle
              title={
                role === "teacher"
                  ? "Actividad por aula"
                  : "Estado de los pagos"
              }
              subtitle={
                role === "teacher"
                  ? "Cada registro acerca a las familias"
                  : "Importes registrados en tu comunidad"
              }
              action={
                <button
                  className="text-button"
                  onClick={() =>
                    go(
                      role === "superadmin"
                        ? "platform"
                        : role === "teacher"
                          ? "journal"
                          : "payments",
                    )
                  }
                >
                  Ver detalle <ArrowRight size={16} />
                </button>
              }
            />
            {role === "teacher" ? (
              classrooms.map((c) => (
                <div className="list-row" key={c.id}>
                  <span className="row-icon">
                    <BookOpen size={20} />
                  </span>
                  <div className="grow">
                    <b>{c.name}</b>
                    <small>
                      {students.filter((s) => s.classroomId === c.id).length}{" "}
                      estudiantes
                    </small>
                  </div>
                  <span className="course-tag">
                    {
                      data.dailyEntries.filter((e) =>
                        students.some(
                          (s) => s.id === e.studentId && s.classroomId === c.id,
                        ),
                      ).length
                    }{" "}
                    registros
                  </span>
                </div>
              ))
            ) : (
              <div className="collection-chart">
                <div className="collection-total">
                  <strong>{money(paid + pending)}</strong>
                  <span>Total de cuotas</span>
                </div>
                <div
                  className="collection-bar"
                  aria-label={`${money(paid)} pagado y ${money(pending)} pendiente`}
                >
                  <span
                    style={{
                      width: `${paid + pending ? (paid / (paid + pending)) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="chart-legend">
                  <span>
                    <i />
                    Pagado <b>{money(paid)}</b>
                  </span>
                  <span>
                    <i />
                    Pendiente <b>{money(pending)}</b>
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
        <div>
          <section className="panel agenda-preview">
            <SectionTitle
              title="En la agenda"
              subtitle="Lo que viene para nuestra comunidad"
              action={<CalendarDays size={19} />}
            />
            {events.slice(0, 3).map((e) => (
              <button
                className="event-preview"
                key={e.id}
                onClick={() => go("calendar")}
              >
                <span className="event-date">
                  <b>{e.date.slice(8, 10)}</b>
                  <small>
                    {new Date(`${e.date}T12:00:00`).toLocaleDateString("es", {
                      month: "short",
                    })}
                  </small>
                </span>
                <span className="grow">
                  <b>{e.title}</b>
                  <small>{e.description}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {!events.length && (
              <Empty
                title="Agenda despejada"
                subtitle="Los próximos eventos aparecerán aquí."
              />
            )}
            <Button
              variant="secondary"
              className="full"
              onClick={() => go(role === "superadmin" ? "schools" : "calendar")}
            >
              Ver {role === "superadmin" ? "instituciones" : "agenda completa"}{" "}
              <ArrowRight size={16} />
            </Button>
          </section>
          <div className="connection-card">
            <span className="row-icon">
              <Heart size={22} />
            </span>
            <h3>Crecer es un trabajo en equipo.</h3>
            <p>
              Una palabra, una foto, un pequeño logro. Mantén cerca a las
              familias.
            </p>
            <button
              className="text-button"
              onClick={() =>
                go(role === "superadmin" ? "schools" : "announcements")
              }
            >
              Conectar con mi comunidad <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
