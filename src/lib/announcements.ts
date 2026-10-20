import type { Announcement } from "./types";
export const noticeCategories = {
  general: "Comunicado",
  academic: "Actividad o tarea",
  grades: "Notas y evaluación",
  health: "Salud",
  pickup: "Recojo",
} as const;
export type NoticeCategory = keyof typeof noticeCategories;
export interface AnnouncementView extends Announcement {
  readAt?: string;
  acknowledgedAt?: string;
  canManage: boolean;
  canAcknowledge: boolean;
}
export interface AnnouncementReceipt {
  email?:string;children?:string[];accountPending?:boolean;
  name: string;
  readAt?: string;
  acknowledgedAt?: string;
}
export function isAnnouncementNotice(kind: string) {
  return kind === "announcement" || kind.startsWith("announcement_reminder_");
}
export function pendingConfirmation(notice: Partial<AnnouncementView>) {
  return (
    notice.requiresAcknowledgment === true &&
    !notice.acknowledgedAt &&
    notice.canAcknowledge === true
  );
}
export function normalizePending(value: unknown): AnnouncementView[] {
  return Array.isArray(value)
    ? value.filter(
        (n) =>
          n &&
          typeof n.id === "string" &&
          typeof n.content === "string" &&
          typeof n.title === "string",
      )
    : [];
}
export const presentationTypes = [
  "health",
  "pickup",
  "grades",
  "tasks",
  "announcement",
  "academic",
  "messages",
  "payments",
  "birthdays",
  "general",
] as const;
export type AlertType = (typeof presentationTypes)[number];
export function alertType(notice: {
  kind?: string;
  alertType?: string;
}): AlertType {
  if (presentationTypes.includes(notice.alertType as AlertType))
    return notice.alertType as AlertType;
  const kind = notice.kind || "";
  return isAnnouncementNotice(kind)
    ? "announcement"
    : kind === "grade"
      ? "grades"
      : kind === "daily_task" || kind.startsWith("assignment_")
        ? "tasks"
        : kind === "message"
          ? "messages"
          : kind.startsWith("payment")
            ? "payments"
            : kind.startsWith("birthday")
              ? "birthdays"
              : kind === "calendar" || kind === "daily"
                ? "academic"
                : "general";
}
