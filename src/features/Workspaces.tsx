import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Heart, Phone } from "lucide-react";
import { Button, Badge, Empty, Field, SectionTitle } from "../components/UI";
import type { PageProps } from "./Pages";
import { Community, Directory, fullName } from "./Pages";
import { Subjects, Assignments } from "./Academics";
import { Gradebook } from "./SchoolLife";
import { StudentAttendance } from "./StudentAttendance";
import { Gallery } from "./Gallery";
import { ContentAreaTracker } from "./ViewHistory";
import { Collections, Invoices } from "./Collections";
import { LearningRequests } from "./LearningRequests";
import { admissionRows } from "../lib/admission";
import { today } from "../lib/billing";
import { dateLabel } from "../lib/format";
import {
  classroomTabs,
  studentTabs,
  recordTabs,
  schoolRooms,
  canReadRecord,
  recordAcademicAccess,
  focusData,
  type ClassroomTab,
  type StudentTab,
} from "../lib/workspaceFocus";
import { useStudentAttendance } from "../lib/useStudentAttendance";
import { attendanceLabels, attendanceCounts } from "../lib/studentAttendance";
import "../styles/workspaces.css";
function Tabs({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <nav className="focus-tabs" aria-label={label}>
      {options.map(([key, title]) => (
        <button
          key={key}
          type="button"
          aria-current={value === key ? "page" : undefined}
          onClick={() => onChange(key)}
        >
          {title}
        </button>
      ))}
    </nav>
  );
}
export function ClassroomEntry(p: PageProps) {
  const params = new URLSearchParams(useLocation().search),
    id = params.get("classroom");
  if (!id) return <Directory page="classrooms" {...p} />;
  return <ClassroomCenter key={id} {...p} roomId={id} />;
}
function ClassroomCenter(p: PageProps & { roomId: string }) {
  const params = new URLSearchParams(useLocation().search),
    requested = params.get("tab") || "students",
    tab = Object.hasOwn(classroomTabs, requested)
      ? (requested as ClassroomTab)
      : "students";
  const rooms = schoolRooms(p.store.data, p.school?.id, p.role, p.identity),
    room = rooms.find((r) => r.id === p.roomId);
  const children = useMemo(
    () => p.students.filter((s) => s.classroomId === p.roomId),
    [p.students, p.roomId],
  );
  const scoped = useMemo(
    () =>
      room
        ? {
            ...p,
            students: children,
            student: undefined,
            store: {
              ...p.store,
              data: focusData(p.store.data, room, children, p.role),
            },
          }
        : null,
    [p, room, children],
  );
  if (!room || !scoped)
    return (
      <Empty
        title="Aula no disponible"
        subtitle="Vuelve a tus aulas y elige un curso asignado a tu cuenta."
      />
    );
  const setTab = (next: string, extra = "") => {
    const q = new URLSearchParams(extra);
    q.set("classroom", room.id);
    q.set("tab", next);
    p.go(`classrooms?${q}`);
  };
  const childProps = {
    ...scoped,
    go: (next: string) => {
      const key = next.split("?")[0];
      if (Object.hasOwn(classroomTabs, key))
        setTab(key, next.split("?")[1] || "");
      else p.go(next);
    },
  };
  return (
    <>
      <Button
        variant="ghost"
        icon={ArrowLeft}
        onClick={() => p.go("classrooms")}
      >
        Todas las aulas
      </Button>
      <section className="focus-heading">
        <div>
          <small>
            GESTIÓN {room.academicYear} · {room.level}
          </small>
          <h2>{room.name}</h2>
          <p>
            {room.schedule} ·{" "}
            {children.filter((s) => s.status !== "inactive").length} alumnos ·{" "}
            {room.active === false
              ? "Inscripciones cerradas"
              : `${Math.max(0, (room.capacity || 30) - children.filter((s) => s.status !== "inactive").length)} cupos disponibles`}
          </p>
        </div>
        {p.role === "director" && (
          <Button variant="secondary" onClick={() => p.open("classroom", room)}>
            Editar aula
          </Button>
        )}
      </section>
      <Tabs
        label="Trabajo del aula"
        value={tab}
        options={Object.entries(classroomTabs)}
        onChange={setTab}
      />
      <div key={`${room.id}:${tab}`} className="focus-content">
        {tab === "students" && <Directory page="students" {...childProps} />}
        {tab === "subjects" && <Subjects {...childProps} />}
        {tab === "assignments" && <Assignments {...childProps} />}
        {tab === "studentAttendance" && <StudentAttendance {...childProps} />}
        {tab === "gradebook" && <Gradebook {...childProps} />}
        {tab === "calendar" && <Community page="calendar" {...childProps} />}
        {tab === "materials" && (
          <LearningRequests page="materials" {...childProps} />
        )}
      </div>
    </>
  );
}
export function StudentRecord(p: PageProps) {
  const params = new URLSearchParams(useLocation().search),
    requestedId =
      p.role === "guardian"
        ? p.student?.id
        : params.get("student") || p.student?.id;
  const child = p.students.find((s) => s.id === requestedId),
    room = p.store.data.classrooms.find((r) => r.id === child?.classroomId);
  const tabs = recordTabs(p.role),
    requested = params.get("tab") || "summary",
    tab = tabs.includes(requested as StudentTab)
      ? (requested as StudentTab)
      : "summary";
  const focused = useMemo(
    () =>
      child && room
        ? {
            ...p,
            student: child,
            students: [child],
            store: {
              ...p.store,
              data: focusData(p.store.data, room, [child], p.role),
            },
          }
        : null,
    [p, child, room],
  );
  if (
    !child ||
    !room ||
    !canReadRecord(child, p.role, p.identity, p.store.data, p.school?.id) ||
    !focused
  )
    return (
      <Empty
        title="Expediente no disponible"
        subtitle="Selecciona un estudiante de tu institución o de tus aulas asignadas."
      />
    );
  const academic = recordAcademicAccess(
    child,
    p.role,
    p.store.data,
    p.identity,
  );
  const setTab = (value: string) =>
    p.go(`studentRecord?student=${encodeURIComponent(child.id)}&tab=${value}`);
  return (
    <>
      <Button
        variant="ghost"
        icon={ArrowLeft}
        onClick={() =>
          p.go(
            p.role === "guardian"
              ? "overview"
              : `students?classroom=${room.id}`,
          )
        }
      >
        {p.role === "guardian" ? "Volver al inicio" : "Volver a estudiantes"}
      </Button>
      <section className="focus-heading">
        <div>
          <small>EXPEDIENTE · {room.name}</small>
          <h2>{fullName(child)}</h2>
          <p>
            {child.birthDate
              ? dateLabel(child.birthDate)
              : "Nacimiento pendiente"}{" "}
            · Inscripción desde {dateLabel(child.enrolledAt)}
          </p>
          <Badge status={child.status} />
        </div>
        <div className="focus-actions">
          <Button
            icon={Heart}
            variant="secondary"
            onClick={() => setTab("health")}
          >
            Emergencias
          </Button>
          {p.role === "director" && (
            <Button onClick={() => p.open("student", child)}>
              Editar inscripción
            </Button>
          )}
        </div>
      </section>
      <Tabs
        label="Expediente del alumno"
        value={tab}
        options={tabs.map((k) => [k, studentTabs[k]])}
        onChange={setTab}
      />
      <div className="focus-content" key={`${child.id}:${tab}`}>
        {tab === "summary" && (
          <>
            <div className="focus-grid">
              <article className="panel focus-card">
                <h3>Inscripción</h3>
                <p>
                  <b>Aula:</b> {room.name} · Gestión {room.academicYear}
                </p>
                {p.role !== "teacher" && (
                  <>
                    <p>
                      <b>CI:</b> {child.identityNumber || "Pendiente"}
                    </p>
                    <p>
                      <b>RUDE:</b> {child.rude || "No registrado · opcional"}
                    </p>
                  </>
                )}
                <p>
                  <b>Ficha de cuidados:</b>{" "}
                  {child.profileComplete
                    ? "Completa"
                    : "Pendiente de completar"}
                </p>
                {child.withdrawalReason && (
                  <p>
                    <b>Motivo de baja:</b> {child.withdrawalReason}
                  </p>
                )}
                {p.role === "director" && (
                  <Button
                    variant="ghost"
                    onClick={() => p.open("status", child)}
                  >
                    {child.status === "active"
                      ? "Dar de baja con motivo"
                      : "Gestionar estado"}
                  </Button>
                )}
              </article>
              <article className="panel focus-card">
                <h3>Contactos prioritarios</h3>
                <Contact
                  name={child.emergencyContact}
                  phone={child.emergencyPhone}
                />
                <Contact
                  name={child.secondEmergencyContact}
                  phone={child.secondEmergencyPhone}
                />
                <p>
                  <b>Alergias:</b>{" "}
                  {child.allergies || "Sin información registrada"}
                </p>
                <Button variant="secondary" onClick={() => setTab("health")}>
                  Ver salud y emergencias
                </Button>
              </article>
            </div>
            <div className="focus-shortcuts">
              {(
                [
                  "attendance",
                  "family",
                  ...(p.role === "teacher" ? [] : ["account", "documents"]),
                ] as StudentTab[]
              ).map((k) => (
                <button key={k} onClick={() => setTab(k)}>
                  <span>{studentTabs[k]}</span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "health" && (
          <>
            <section className="panel focus-card">
              <SectionTitle
                title="Salud y emergencias"
                action={
                  p.role !== "teacher" ? (
                    <Button onClick={() => p.open("profile", child)}>
                      Completar o actualizar cuidados
                    </Button>
                  ) : undefined
                }
              />
              <div className="detail-grid">
                {[
                  ["Alergias", child.allergies],
                  ["Alimentos restringidos", child.foodRestrictions],
                  ["Condiciones médicas", child.medicalConditions],
                  ["Indicaciones de cuidado", child.careInstructions],
                  [
                    "Seguro",
                    child.hasInsurance
                      ? child.insuranceProvider || "Sí"
                      : child.hasInsurance === false
                        ? "No"
                        : "Pendiente",
                  ],
                  ["Número de seguro", child.insuranceNumber],
                ].map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <b>{v || "Sin información"}</b>
                  </div>
                ))}
              </div>
              <Contact
                name={child.emergencyContact}
                phone={child.emergencyPhone}
              />
              <Contact
                name={child.secondEmergencyContact}
                phone={child.secondEmergencyPhone}
              />
            </section>
          </>
        )}
        {tab === "family" && (
          <>
            <div className="focus-grid">
              {[
                [
                  "Madre",
                  child.motherName,
                  child.motherEmail,
                  child.motherPhone,
                ],
                [
                  "Padre",
                  child.fatherName,
                  child.fatherEmail,
                  child.fatherPhone,
                ],
              ].map(([title, name, email, phone]) => (
                <article className="panel focus-card" key={title}>
                  <h3>{title}</h3>
                  <p>{name || "Pendiente"}</p>
                  <p className="wrap-anywhere">{email || "Correo pendiente"}</p>
                  <Contact name="Teléfono" phone={phone} />
                </article>
              ))}
            </div>
            <section className="panel focus-card">
              <h3>Personas autorizadas y datos adicionales</h3>
              {admissionRows(child.admissionDetails).map(([label, value]) => (
                <p key={label}>
                  <b>{label}:</b> {value}
                </p>
              ))}
              <p>
                Los autorizados para recoger no reciben acceso a la cuenta.
                Verifica la solicitud y el documento antes de entregar al niño.
              </p>
              <div className="focus-actions">
                {p.role === "director" && (
                  <>
                    <Button onClick={() => p.open("intake", child)}>
                      Compartir o revisar ficha familiar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => p.open("invite", child)}
                    >
                      Invitar a madre o padre
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => p.open("studentLogin", child)}
                    >
                      Acceso del estudiante
                    </Button>
                  </>
                )}
                <Button variant="secondary" onClick={() => p.go("requests")}>
                  Permisos y recogidas
                </Button>
              </div>
            </section>
          </>
        )}
        {tab === "attendance" && <RecordAttendance {...focused} />}
        {tab === "documents" && (
          <section className="panel focus-card">
            <SectionTitle
              title="Documentos de inscripción"
              action={
                <Button
                  icon={FileText}
                  onClick={() => p.open("documents", child)}
                >
                  {p.role === "director"
                    ? "Gestionar documentos"
                    : "Abrir documentos privados"}
                </Button>
              }
            />
            {focused.store.data.studentDocuments.length ? (
              focused.store.data.studentDocuments.map((d) => (
                <article className="focus-document" key={d.id}>
                  <FileText size={20} />
                  <div>
                    <b>{d.fileName}</b>
                    <p>
                      {dateLabel(d.createdAt)} · {Math.ceil(d.sizeBytes / 1024)}{" "}
                      KB
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <p>
                No hay documentos registrados. Los archivos se conservan en
                almacenamiento privado.
              </p>
            )}
          </section>
        )}
        {tab === "learning" &&
          (academic ? (
            <RecordLearning {...focused} />
          ) : (
            <section className="panel focus-card">
              <h3>Seguimiento académico pendiente de habilitación</h3>
              <p>
                Completa los datos de cuidado y revisa las mensualidades. Puedes
                seguir consultando salud, asistencia, documentos y pagos.
              </p>
              <Button onClick={() => setTab("account")}>
                Consultar cuotas
              </Button>
            </section>
          ))}
        {tab === "account" && <Collections {...focused} />}
        {tab === "invoices" && <Invoices {...focused} />}
      </div>
    </>
  );
}
function Contact({ name, phone }: { name?: string; phone?: string }) {
  return (
    <p className="focus-contact">
      <span>{name || "Contacto pendiente"}</span>
      {phone ? (
        <a href={`tel:${phone.replace(/[^+0-9]/g, "")}`}>
          <Phone size={15} />
          {phone}
        </a>
      ) : (
        <small>Teléfono pendiente</small>
      )}
    </p>
  );
}
function RecordAttendance(p: PageProps) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data, error, loading, refresh } = useStudentAttendance(
    p.student?.classroomId || "",
    month + "-01",
    p.student?.id,
    p.store.data.notifications,
  );
  const rows = (data?.records || []).filter(
      (r) => r.confirmed && r.studentId === p.student?.id,
    ),
    counts = attendanceCounts(rows);
  return (
    <>
      <SectionTitle
        title="Historial de asistencia"
        action={
          <Button variant="secondary" onClick={refresh}>
            Actualizar
          </Button>
        }
      />
      <Field label="Mes" name="recordAttendanceMonth">
        <input
          type="month"
          max={today().slice(0, 7)}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          required
        />
      </Field>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando historial…</p>
      ) : (
        <>
          <div className="attendance-summary">
            {Object.entries(counts)
              .filter(([k]) => k !== "pending")
              .map(([k, v]) => (
                <span key={k}>
                  {v}{" "}
                  {attendanceLabels[
                    k as keyof typeof attendanceLabels
                  ].toLowerCase()}
                </span>
              ))}
          </div>
          {rows.map((r) => (
            <article className="panel focus-card" key={r.id}>
              <b>
                {dateLabel(r.date)} ·{" "}
                {r.status ? attendanceLabels[r.status] : "Sin marcar"}
              </b>
              {r.note && <p>{r.note}</p>}
            </article>
          ))}
          {!rows.length && (
            <Empty
              title="Sin registros confirmados"
              subtitle="Los días sin lista confirmada no se consideran faltas."
            />
          )}
        </>
      )}
    </>
  );
}
function RecordLearning(p: PageProps) {
  const [section, setSection] = useState("notes");
  return (
    <>
      <Tabs
        label="Seguimiento del alumno"
        value={section}
        options={Object.entries({
          notes: "Notas",
          tasks: "Tareas",
          diary: "Cuaderno",
          photos: "Galería",
        })}
        onChange={setSection}
      />
      <div key={section}>
        {section === "notes" && <Community page="grades" {...p} />}{" "}
        {section === "tasks" && <Assignments {...p} />}{" "}
        {section === "diary" && <Community page="journal" {...p} />}{" "}
        {section === "photos" && <Gallery {...p} />}
        <ContentAreaTracker
          key={section}
          page={
            section === "tasks"
              ? "assignments"
              : section === "diary"
                ? "daily"
                : ""
          }
          studentId={p.student?.id}
          enabled={p.role === "guardian"}
        />
      </div>
    </>
  );
}
