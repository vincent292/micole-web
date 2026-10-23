import type { AppData, Identity, Role } from "./types";
import type { GradeTotal } from "./gradeSheet";
import { learningDay } from "./learning";
export type Interview = {
  id: string;
  school_id: string;
  classroom_id: string;
  student_id: string;
  class_subject_id?: string;
  teacher_id: string;
  title: string;
  reason: string;
  starts_at: string;
  ends_at: string;
  location: string;
  status: "scheduled" | "completed" | "cancelled";
  revision: number;
  created_by: string;
  studentName: string;
  classroomName: string;
  teacherName: string;
  subjectName: string;
  canManage: boolean;
  participants?: { userId: string; name: string }[];
  responses: {
    userId: string;
    name: string;
    response: string;
    note: string;
    respondedAt: string;
    revision: number;
  }[];
};
export type StaffMessage = {
  id: string;
  classroom_id: string;
  student_id: string;
  class_subject_id?: string;
  sender_id: string;
  recipient_teacher_id: string;
  body: string;
  created_at: string;
  senderName: string;
  recipientName: string;
  studentName: string;
  subjectName: string;
};
export type Coordination = {
  interviews: Interview[];
  messages: StaffMessage[];
};
export type TutorOverview = {
  studentId?: string;
  termName?: string;
  students: {
    id: string;
    name: string;
    pendingTasks: number;
    overdueTasks: number;
  }[];
  subjects: {
    id: string;
    name: string;
    total?: GradeTotal;
    teachers: { id: string; name: string; hasAccount: boolean }[];
    pendingTasks: number;
  }[];
  care: {
    id: string;
    kind: string;
    entry_date: string;
    note: string;
    food: string;
    mood: string;
  }[];
  recommendations: {
    id: string;
    subject: string;
    score: string;
    period: string;
    recommendation: string;
    created_at: string;
  }[];
  feedback: {
    title: string;
    subject: string;
    assessment_date: string;
    comment: string;
    score?: number;
    qualitative_score?: string;
  }[];
  pending: {
    id: string;
    title: string;
    class_subject_id?: string;
    due_at?: string;
    subject: string;
    submission_status: string;
  }[];
};
export function isClassroomTutor(
  data: AppData,
  identity: Identity | undefined | null,
  role: Role,
  roomId: string,
) {
  const tutor = data.classrooms.find((r) => r.id === roomId)?.tutorTeacherId;
  return (
    role === "teacher" && !!tutor && !!identity?.teacherIds.includes(tutor)
  );
}
export const interviewStatuses = {
  scheduled: "Programada",
  completed: "Realizada",
  cancelled: "Cancelada",
};
export const responseLabels: Record<string, string> = {
  confirmed: "Asistirá",
  request_change: "Solicita otro horario",
  declined: "No puede asistir",
};
export function interviewTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function interviewCalendar(rows: Interview[]) {
  return rows
    .filter((i) => i.status === "scheduled")
    .map((i) => ({
      id: `interview-${i.id}`,
      title: `Entrevista · ${i.studentName}`,
      date: learningDay(i.starts_at),
      description: `${interviewTime(i.starts_at)} · ${i.subjectName} · ${i.location}`,
      type: "event",
      classroomId: i.classroom_id,
    }));
}
export const interviewTimes = Array.from(
  { length: 96 },
  (_, i) =>
    `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
);
export function interviewDates(day: string, time: string, minutes: number) {
  const start = new Date(`${day}T${time}:00-04:00`);
  if (
    !Number.isFinite(start.getTime()) ||
    start.getTime() <= Date.now() ||
    !Number.isInteger(minutes) ||
    minutes < 15 ||
    minutes > 240
  )
    throw new Error(
      "Elige una fecha futura y una duración entre 15 y 240 minutos.",
    );
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + minutes * 60000).toISOString(),
  };
}

export function interviewClock(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
export function interviewDay(value: string) {
  return learningDay(value);
}
