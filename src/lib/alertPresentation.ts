export const alertPresentations = {
  attendance: { label:"Asistencia de alumnos", icon:"ic_micole_tasks", color:"#3D6EF7", emoji:"📋", sound:"default", vibration:[0,180] },
  health: {
    label: "Salud y emergencias",
    icon: "ic_micole_health",
    color: "#B42336",
    emoji: "✚",
    sound: "micole_health",
    vibration: [0, 180, 100, 180, 100, 300],
  },
  pickup: {
    label: "Recojos y autorizaciones",
    icon: "ic_micole_pickup",
    color: "#A66A00",
    emoji: "🚗",
    sound: "micole_pickup",
    vibration: [0, 150, 150, 350],
  },
  grades: {
    label: "Notas y evaluaciones",
    icon: "ic_micole_grades",
    color: "#3D6EF7",
    emoji: "🎓",
    sound: "default",
    vibration: [0, 180],
  },
  tasks: {
    label: "Tareas y entregas",
    icon: "ic_micole_tasks",
    color: "#3D6EF7",
    emoji: "📚",
    sound: "default",
    vibration: [0, 100, 100, 100],
  },
  announcement: {
    label: "Comunicados",
    icon: "ic_micole_announcement",
    color: "#3D6EF7",
    emoji: "📣",
    sound: "default",
    vibration: [0, 250],
  },
  academic: {
    label: "Agenda y actividades",
    icon: "ic_micole_tasks",
    color: "#3D6EF7",
    emoji: "📅",
    sound: "default",
    vibration: [0, 180],
  },
  messages: {
    label: "Mensajes",
    icon: "ic_micole_messages",
    color: "#3D6EF7",
    emoji: "💬",
    sound: "default",
    vibration: [0, 180],
  },
  payments: {
    label: "Pagos y recibos",
    icon: "ic_micole_payments",
    color: "#177B58",
    emoji: "💳",
    sound: "default",
    vibration: [0, 180],
  },
  birthdays: {
    label: "Cumpleaños",
    icon: "ic_micole_birthday",
    color: "#A66A00",
    emoji: "🎂",
    sound: "default",
    vibration: [0, 180],
  },
  general: {
    label: "Avisos de MiCole",
    icon: "ic_micole_announcement",
    color: "#3D6EF7",
    emoji: "🔔",
    sound: "default",
    vibration: [0, 180],
  },
} as const;
export type PresentationType = keyof typeof alertPresentations;
export function presentationType(
  type: string | undefined,
  kind = "",
  category = "alerts",
): PresentationType {
  if (type && Object.hasOwn(alertPresentations, type))
    return type as PresentationType;
  if (kind === "announcement" || kind.startsWith("announcement_reminder_"))
    return "announcement";
  if (kind.startsWith("attendance_")) return "attendance";
  if (kind === "grade") return "grades";
  if (kind === "daily_task" || kind.startsWith("assignment_")) return "tasks";
  return category === "academic"
    ? "academic"
    : category === "messages"
      ? "messages"
      : category === "payments"
        ? "payments"
        : category === "birthdays"
          ? "birthdays"
          : "general";
}
export function alertChannel(type: PresentationType) {
  return `micole-${type === "general" ? "alerts" : type}`;
}
