import { ArrowRight } from "lucide-react";
import { Button, Empty, SectionTitle } from "../components/UI";
import {
  dayActions,
  schoolRooms,
  recordAcademicAccess,
} from "../lib/workspaceFocus";
import type { AppData, Identity, Role, School, Student } from "../lib/types";
import { today } from "../lib/billing";
import { dateLabel } from "../lib/format";
import { isKinderClassroom, isKinderWorkspace } from "../lib/kinder";
import "../styles/workspaces.css";
export function RoleHome({
  data,
  school,
  role,
  students,
  student,
  identity,
  name,
  go,
}: {
  data: AppData;
  school?: School;
  role: Role;
  students: Student[];
  student?: Student;
  identity: Identity;
  name: string;
  go: (page: string) => void;
}) {
  const family = role === "guardian",
    academic =
      !family ||
      (!!student && recordAcademicAccess(student, role, data, identity));
  const kinderMode = isKinderWorkspace(school);
  const existingActions = dayActions(data, school?.id, role, students, student).filter(
    (a) => academic || a.key !== "calendar",
  );
  const actions = kinderMode && (!family || academic)
    ? [{ key: "care", title: family ? "Así fue su día" : "Cuidados del aula", detail: family ? "Alimentación, descanso y observaciones de tu hijo." : "Registra un cuidado para el grupo y ajusta cada niño.", page: "care", priority: true }, ...existingActions]
    : existingActions;
  const rooms = schoolRooms(data, school?.id, role, identity);
  const events = academic
    ? data.events
        .filter(
          (e) =>
            e.schoolId === school?.id &&
            e.date >= today() &&
            (!e.classroomId ||
              (family
                ? e.classroomId === student?.classroomId
                : rooms.some((r) => r.id === e.classroomId))),
        )
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4)
    : [];
  return (
    <>
      <SectionTitle
        title={kinderMode ? family ? "Hoy en su kínder" : "Tu jornada en el kínder" : "Pendientes y accesos"}
        subtitle={`Hola, ${name.split(" ")[0]}. ${family ? `Acompaña a ${student?.firstName || "tu familia"} desde un solo lugar.` : "Revisa lo pendiente y continúa el trabajo de tus aulas."}`}
      />
      {family && !academic && (
        <section className="focus-notice">
          <b>
            {!student?.profileComplete
              ? "La ficha de cuidado está pendiente."
              : "El acceso académico está pendiente de habilitación."}
          </b>
          <p>
            Puedes consultar salud, contactos, asistencia, documentos y pagos
            desde el expediente.
          </p>
          <Button
            variant="secondary"
            onClick={() => go("studentRecord?tab=health")}
          >
            Revisar ficha familiar
          </Button>
        </section>
      )}
      {role === "director" && (
        <div className="focus-actions">
          <Button onClick={() => go("classrooms")}>Abrir mis aulas</Button>
          <Button variant="secondary" onClick={() => go("students")}>
            {kinderMode ? "Inscribir o buscar niño" : "Inscribir o buscar alumno"}
          </Button>
          <Button variant="ghost" onClick={() => go("onboarding")}>
            Preparar institución
          </Button>
        </div>
      )}
      <div className="day-actions">
        {actions.map((a) => (
          <button
            key={a.key}
            className="day-action"
            data-priority={a.priority}
            onClick={() => go(a.page)}
          >
            <b>{a.title}</b>
            {a.count !== undefined && <strong>{a.count}</strong>}
            <small>{a.detail}</small>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      {!family && (
        <>
          <SectionTitle
            title="Mis aulas"
            subtitle={kinderMode ? "Cuidados, asistencia y actividades para acompañar a cada niño." : "Alumnos, asistencia, materias y trabajo diario del curso."}
          />
          <div className="focus-grid">
            {rooms.map((r) => (
              <article key={r.id} className="panel focus-card">
                <h3>{r.name}</h3>
                <p>
                  Gestión {r.academicYear} · {r.schedule}
                </p>
                <p>
                  {
                    students.filter(
                      (s) => s.classroomId === r.id && s.status !== "inactive",
                    ).length
                  }{" "}
                  alumnos activos
                </p>
                <div className="focus-actions">
                  <Button
                    onClick={() =>
                      go(`classrooms?classroom=${r.id}&tab=${isKinderClassroom(r, school) ? "today" : "students"}`)
                    }
                  >
                    Abrir aula
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      go(`classrooms?classroom=${r.id}&tab=studentAttendance`)
                    }
                  >
                    Pasar lista
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!rooms.length && (
            <Empty
              title="Sin aulas asignadas"
              subtitle={
                role === "director"
                  ? "Crea las aulas para comenzar la gestión."
                  : "Dirección debe asignarte a un aula para comenzar."
              }
            />
          )}
        </>
      )}
      {academic && (
        <section className="panel focus-card">
          <SectionTitle
            title="Próximas actividades"
            action={
              <Button variant="ghost" onClick={() => go("calendar")}>
                Ver calendario
              </Button>
            }
          />
          {events.map((e) => (
            <div key={e.id} className="focus-contact">
              <span>
                <b>{e.title}</b>
                <br />
                {dateLabel(e.date)}
              </span>
              <small>
                {data.classrooms.find((r) => r.id === e.classroomId)?.name ||
                  "Toda la institución"}
              </small>
            </div>
          ))}
          {!events.length && <p>No hay actividades próximas registradas.</p>}
        </section>
      )}
    </>
  );
}
