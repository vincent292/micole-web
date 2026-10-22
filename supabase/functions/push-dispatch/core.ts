import {
  alertPresentations,
  alertChannel,
  presentationType,
} from "../_shared/alert-presentation.ts";
export interface Delivery {
  token: string;
  recipientId: string;
  notificationId: string;
  category: string;
  kind: string;
  isTest?: boolean;
  testKind?: string;
  testLabel?: string;
  alertType?: string;
  collapseId?: string;
}
const copy: Record<string, [string, string]> = {
  academic: [
    "Novedad académica",
    "Hay una actualización de tareas, actividades o notas en MiCole.",
  ],
  alerts: [
    "Nuevo aviso de MiCole",
    "Tienes un comunicado o una solicitud por revisar.",
  ],
  messages: [
    "Nuevo mensaje en MiCole",
    "Abre tu cuenta para consultar el mensaje.",
  ],
  payments: [
    "Aviso de pagos",
    "Consulta tus cuotas, recibos y saldo dentro de MiCole.",
  ],
  birthdays: [
    "Cumpleaños en MiCole",
    "Hay un recordatorio de cumpleaños en tu agenda.",
  ],
};
export function firebaseMessage(item: Delivery) {
  const category = Object.hasOwn(copy, item.category)
    ? item.category
    : "alerts";
  const kind = item.isTest === true ? item.testKind || item.kind : item.kind;
  let [title, body] = copy[category];
  if (kind === "assignment_published") title = "Nueva tarea en MiCole";
  if (kind.startsWith("assignment_submitted_"))
    title = "Nueva entrega de tarea";
  if (kind.startsWith("assignment_reviewed_"))
    title = "Tu tarea tiene una revisión";
  if (kind.startsWith("attendance_")) {
    title = "Actualización de asistencia";
    body = "Revisa el registro de asistencia en tu cuenta de MiCole.";
  }
  if (kind === "grade") title = "Nueva nota o recomendación";
  if (kind === "daily_task") title = "Nueva tarea en MiCole";
  if (kind === "payment_receipt") {
    title = "Cobro confirmado";
    body = "Tu recibo está disponible dentro de MiCole.";
  }
  if (kind === "push_test") {
    title = "MiCole está conectado";
    body = "Las notificaciones de este teléfono están activas.";
  }
  const type = presentationType(item.alertType, kind, category),
    style = alertPresentations[type];
  if (type === "health") {
    title = "✚ Aviso de salud";
    body = "Hay un aviso de salud por revisar dentro de MiCole.";
  } else if (type === "pickup") {
    title = "🚗 Aviso de recojo";
    body = "Revisa la autorización o solicitud de recojo dentro de MiCole.";
  } else if (type === "announcement") {
    title = "📣 Comunicado de MiCole";
    body = kind.startsWith("announcement_reminder_")
      ? "Tienes un comunicado pendiente de leer o confirmar."
      : "Hay un comunicado para ti dentro de MiCole.";
  }
  if (item.isTest === true) {
    title = `[PRUEBA] ${item.testLabel || style.label}`;
    body =
      "Aviso ficticio solicitado desde tu cuenta. No corresponde a un caso real.";
  }
  return {
    message: {
      token: item.token,
      notification: { title, body },
      data: {
        notificationId: item.notificationId,
        recipientId: item.recipientId,
      },
      android: {
        priority:
          category === "messages" ||
          category === "alerts" ||
          type === "health" ||
          type === "pickup"
            ? "HIGH"
            : "NORMAL",
        ttl: "86400s",
        collapse_key: `micole-${category}`,
        notification: {
          channel_id: alertChannel(type),
          icon: style.icon,
          color: style.color,
          tag: item.collapseId || item.notificationId,
          visibility: "PRIVATE",
          sound: style.sound,
        },
      },
    },
  };
}
export function deliveryResult(
  status: number,
  payload: unknown,
): { result: "sent" | "retry" | "invalid" | "failed"; code: string } {
  if (status >= 200 && status < 300) return { result: "sent", code: "" };
  const value = payload as {
    error?: { status?: string; details?: Array<{ errorCode?: string }> };
  };
  const code =
    value?.error?.details?.find((x) => x.errorCode)?.errorCode ||
    value?.error?.status ||
    `HTTP_${status}`;
  if (code === "UNREGISTERED") return { result: "invalid", code };
  // Permission/project configuration problems must not revoke everybody's valid device tokens.
  if (status === 429 || status >= 500 || status === 401 || status === 403)
    return { result: "retry", code };
  return { result: "failed", code };
}
export async function equalSecret(provided: string | null, expected: string) {
  if (!provided) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a),
    y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
