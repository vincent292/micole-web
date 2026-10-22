export interface NotificationTestTemplate {
  key: string;
  label: string;
  group: string;
  kind: string;
  alertType: string;
  category: string;
  body: string;
  requiresAcknowledgment?: boolean;
}
export const notificationTestTemplates: NotificationTestTemplate[] = [
  {
    key: "general",
    label: "Aviso general",
    group: "Plataforma",
    kind: "push_test",
    alertType: "general",
    category: "alerts",
    body: "Aviso ficticio para verificar la campanita y la conexión del teléfono.",
  },
  {
    key: "school_request",
    label: "Solicitud de institución",
    group: "Plataforma",
    kind: "school_request",
    alertType: "general",
    category: "alerts",
    body: "Una institución ficticia solicita acceso. No se registró ninguna solicitud comercial.",
  },
  {
    key: "access",
    label: "Habilitación de acceso",
    group: "Plataforma",
    kind: "access",
    alertType: "general",
    category: "alerts",
    body: "Ejemplo de habilitación. No cambia permisos ni el estado de ningún alumno.",
  },
  {
    key: "intake",
    label: "Ficha familiar recibida",
    group: "Comunidad",
    kind: "intake",
    alertType: "general",
    category: "alerts",
    body: "Una ficha ficticia está lista para revisar. No contiene datos familiares reales.",
  },
  {
    key: "announcement",
    label: "Comunicado informativo",
    group: "Comunidad",
    kind: "announcement",
    alertType: "announcement",
    category: "alerts",
    body: "Este comunicado ficticio permite comprobar el icono y la apertura del aviso.",
  },
  {
    key: "mandatory",
    label: "Comunicado obligatorio",
    group: "Comunidad",
    kind: "announcement",
    alertType: "announcement",
    category: "alerts",
    body: "Ejemplo de un aviso que pide «Estoy de acuerdo». La confirmación solo pertenece a esta prueba.",
    requiresAcknowledgment: true,
  },
  {
    key: "reminder",
    label: "Recordatorio de comunicado",
    group: "Comunidad",
    kind: "announcement_reminder_test",
    alertType: "announcement",
    category: "alerts",
    body: "Ejemplo de recordatorio pendiente. Se envía una sola vez; no activa recordatorios horarios.",
  },
  {
    key: "health",
    label: "Salud y emergencia",
    group: "Cuidados",
    kind: "announcement",
    alertType: "health",
    category: "alerts",
    body: "Aviso ficticio de salud para comprobar la cruz, el sonido y el canal. No ocurrió una emergencia.",
  },
  {
    key: "pickup",
    label: "Autorización de recojo",
    group: "Cuidados",
    kind: "request",
    alertType: "pickup",
    category: "alerts",
    body: "Ejemplo de autorización de recojo. No autoriza a entregar a ningún niño.",
  },
  {
    key: "permission",
    label: "Solicitud de permiso",
    group: "Cuidados",
    kind: "request",
    alertType: "general",
    category: "alerts",
    body: "Una familia ficticia solicita permiso. No crea una solicitud real.",
  },
  {
    key: "permission_response",
    label: "Respuesta a un permiso",
    group: "Cuidados",
    kind: "request_response",
    alertType: "general",
    category: "alerts",
    body: "Respuesta ficticia para comprobar la alerta recibida por una familia.",
  },
  {
    key: "attendance_absent",
    label: "Falta de un alumno",
    group: "Cuidados",
    kind: "attendance_absent",
    alertType: "attendance",
    category: "alerts",
    body: "Ejemplo de falta registrada. No se modificó la asistencia de ningún alumno.",
  },
  {
    key: "attendance_corrected",
    label: "Corrección de asistencia",
    group: "Cuidados",
    kind: "attendance_corrected",
    alertType: "attendance",
    category: "alerts",
    body: "Ejemplo de corrección con aviso a la familia. No modifica ninguna lista real.",
  },
  {
    key: "message",
    label: "Mensaje interno",
    group: "Comunidad",
    kind: "message",
    alertType: "messages",
    category: "messages",
    body: "Mensaje ficticio para comprobar el icono y la alerta de conversación.",
  },
  {
    key: "daily",
    label: "Cuaderno digital",
    group: "Académico",
    kind: "daily",
    alertType: "academic",
    category: "academic",
    body: "Ejemplo de novedad del cuaderno. No se publicó una entrada real.",
  },
  {
    key: "daily_task",
    label: "Tarea diaria",
    group: "Académico",
    kind: "daily_task",
    alertType: "tasks",
    category: "academic",
    body: "Ejemplo de tarea diaria para comprobar su aviso.",
  },
  {
    key: "assignment",
    label: "Nueva tarea por materia",
    group: "Académico",
    kind: "assignment_published",
    alertType: "tasks",
    category: "academic",
    body: "Una tarea ficticia está disponible. No se creó una tarea en ningún aula.",
  },
  {
    key: "submission",
    label: "Entrega de tarea recibida",
    group: "Académico",
    kind: "assignment_submitted_test",
    alertType: "tasks",
    category: "academic",
    body: "Ejemplo de aviso al docente de una entrega nueva.",
  },
  {
    key: "review",
    label: "Tarea revisada",
    group: "Académico",
    kind: "assignment_reviewed_test",
    alertType: "tasks",
    category: "academic",
    body: "Ejemplo de aviso a la familia o estudiante de una revisión.",
  },
  {
    key: "grade",
    label: "Nota o recomendación",
    group: "Académico",
    kind: "grade",
    alertType: "grades",
    category: "academic",
    body: "Ejemplo de nota o recomendación. No se registró ninguna calificación.",
  },
  {
    key: "calendar",
    label: "Evento del calendario",
    group: "Académico",
    kind: "calendar",
    alertType: "academic",
    category: "academic",
    body: "Ejemplo de una actividad próxima en el calendario.",
  },
  {
    key: "materials",
    label: "Lista de materiales",
    group: "Académico",
    kind: "materials",
    alertType: "academic",
    category: "academic",
    body: "Ejemplo de materiales aprobados. No publica listas ni genera cobros.",
  },
  {
    key: "activity",
    label: "Actividad o salida",
    group: "Académico",
    kind: "activity",
    alertType: "academic",
    category: "academic",
    body: "Ejemplo de actividad escolar. No inscribe participantes ni genera cuotas.",
  },
  {
    key: "birthday_today",
    label: "Cumpleaños de hoy",
    group: "Cumpleaños",
    kind: "birthday_test_0",
    alertType: "birthdays",
    category: "birthdays",
    body: "Ejemplo de cumpleaños de hoy. Todos los datos de esta prueba son ficticios.",
  },
  {
    key: "birthday_upcoming",
    label: "Cumpleaños próximo",
    group: "Cumpleaños",
    kind: "birthday_test_2",
    alertType: "birthdays",
    category: "birthdays",
    body: "Ejemplo de recordatorio previo de cumpleaños.",
  },
  {
    key: "payment_due",
    label: "Cuota pendiente",
    group: "Pagos",
    kind: "payment_due_test",
    alertType: "payments",
    category: "payments",
    body: "Ejemplo de cuota por pagar. No crea deuda ni bloquea el acceso de nadie.",
  },
  {
    key: "payment_receipt",
    label: "Cobro confirmado y recibo",
    group: "Pagos",
    kind: "payment_receipt",
    alertType: "payments",
    category: "payments",
    body: "Ejemplo de recibo disponible. No se realizó ni registró un pago.",
  },
  {
    key: "payment_evidence",
    label: "Comprobante por verificar",
    group: "Pagos",
    kind: "payment_evidence",
    alertType: "payments",
    category: "payments",
    body: "Ejemplo de comprobante pendiente de revisión. No contiene archivos reales.",
  },
  {
    key: "payment_reviewed",
    label: "Comprobante revisado",
    group: "Pagos",
    kind: "payment_evidence_reviewed",
    alertType: "payments",
    category: "payments",
    body: "Ejemplo de resultado de revisión. No acredita dinero ni modifica saldos.",
  },
  {
    key: "invoice",
    label: "Factura disponible",
    group: "Pagos",
    kind: "payment_invoice_ready",
    alertType: "payments",
    category: "payments",
    body: "Ejemplo de factura disponible. No genera una factura fiscal.",
  },
];
export interface NotificationTestDevice {
  id: string;
  updatedAt: string;
  expiresAt: string;
  label: string;
}
export interface NotificationTestRun {
  id: string;
  template: string;
  title: string;
  body: string;
  alertType: string;
  channel: "web" | "both";
  createdAt: string;
  readAt?: string;
  acknowledgedAt?: string;
  requiresAcknowledgment: boolean;
  status: "web" | "pending" | "processing" | "sent" | "failed" | "discarded";
  error?: string;
}
export interface NotificationTestWorkspace {
  devices: NotificationTestDevice[];
  runs: NotificationTestRun[];
}
export const notificationTestStatus = {
  web: "Solo campanita",
  pending: "Pendiente de envío",
  processing: "Enviando a Firebase",
  sent: "Aceptada por Firebase",
  failed: "No enviada",
  discarded: "Descartada: revisar dispositivo",
};
