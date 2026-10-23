/** Published capabilities only. These IDs open existing pages/forms, never execute writes. */
export const guideActions = {
  bolivia:{label:"Gestión educativa Bolivia",page:"bolivia"},
  timetables: {label:"Horarios de clases",page:"timetables"},
  promotion: {label:"Promoción anual",page:"promotion"},
  student_attendance: {label:"Asistencia de alumnos",page:"studentAttendance"},
  staff_attendance: { label: "Asistencia del equipo", page: "staffAttendance" },
  staff_payroll: { label: "Boletas de pago", page: "staffPayroll" },
  students: { label: "Ver estudiantes", page: "students" },
  new_student: { label: "Abrir inscripción", form: "student" },
  classrooms: { label: "Ver aulas", page: "classrooms" },
  new_classroom: { label: "Crear aula", form: "classroom" },
  teachers: { label: "Ver docentes", page: "teachers" },
  new_teacher: { label: "Registrar docente", form: "teacher" },
  announcements: { label: "Ver comunicados", page: "announcements" },
  new_announcement: { label: "Preparar comunicado", form: "announcement" },
  calendar: { label: "Abrir agenda", page: "calendar" },
  calendar_import: { label: "Importar calendario", page: "calendarImport" },
  admission_form: {
    label: "Configurar ficha de inscripción",
    page: "admissionForms",
  },
  sites: { label: "Sedes y direcciones", page: "sites" },
  cash: { label: "Caja y cobros", page: "cash" },
  invoices: { label: "Ver facturas", page: "invoices" },
  reports: { label: "Abrir reportes", page: "reports" },
  views: { label: "Historial de consultas", page: "viewHistory" },
  settings: { label: "Abrir configuración", page: "settings" },
  subjects: { label: "Materias", page: "subjects" },
  assignments: { label: "Tareas y entregas", page: "assignments" },
  gradebook: { label: "Evaluación y libretas", page: "gradebook" },
  requests: { label: "Permisos y recogidas", page: "requests" },
  credit: { label: "Crédito MiCole", page: "credit" },
} as const;
export type GuideAction = keyof typeof guideActions;
export interface GuideReply {
  answer: string;
  steps: string[];
  actions: GuideAction[];
}
export interface GuideMessage {
  role: "user" | "model";
  text: string;
}
export const guideTopics = [
 {words:"bolivia normativa ministerial resolucion resoluciones poa pdc comision centralizador pedagogico calendario efectivos",
 answer:"Gestión educativa Bolivia reúne perfil de la gestión, días efectivos, POA, PDC, apoyo pedagógico y actas para primaria/secundaria. Inicial y guardería conservan sus reglas actuales; no se envía información al SIE.",
 steps:["Indica los niveles de la sede y el grado oficial del aula. En una sede mixta, inicial queda fuera de estos ajustes.","En Gestión educativa Bolivia selecciona la gestión y completa código de unidad educativa, distrito, departamento, autorización y referencia normativa vigente.","Prepara los días de clase, descuenta feriados y descanso regional, revisa cada fecha y confirma 200 días efectivos antes de marcar el perfil revisado.","Crea POA, planificación curricular o apoyo por alumno. Guarda borrador y luego envía a revisión; Dirección aprueba o devuelve con observaciones. Un aprobado conserva su contenido y los cambios se preparan como nueva versión.","Para el reforzamiento de un perfil revisado se requieren plan de apoyo aprobado con evidencias y acta aprobada de la Comisión. No se regalan puntos ni se modifican notas automáticamente.","Dirección puede descargar el centralizador de notas publicadas. Es un informe interno; no sustituye la Libreta Escolar Electrónica oficial del SIE.","En primaria/secundaria la mora familiar no bloquea el acceso académico. Los nuevos planes tienen hasta diez pensiones, sin matrícula ni licencia adicional para la familia; las cuotas históricas y la facturación de la institución se conservan."],actions:["bolivia","gradebook","timetables"]},
 {words:"horarios horario generar cruces bloques recreos periodos paralelos secretaría secretaria",
 answer:"Dirección o Secretaría académica prepara un horario semanal sin cruces de aulas y docentes. Se revisa y publica por separado; las familias solo ven versiones publicadas.",
 steps:["En Horarios de clases elige la gestión y pulsa Preparar horario.","Configura jornada, días, minutos por periodo pedagógico y recreos. Primaria/secundaria usa seis periodos diarios de 40 minutos en diurno o 35 en nocturno; inicial y guardería conservan su configuración.","Indica docente de cada materia y paralelo, periodos semanales, bloques e indisponibilidades. Dos docentes de Matemáticas pueden atender paralelos distintos.","Genera y revisa. Si faltan minutos o no hay solución, modifica las restricciones expresamente: no se amplía la jornada automáticamente. Agotar el límite de búsqueda no demuestra imposibilidad.","Guarda el borrador; Dirección o Secretaría con permiso adicional debe aprobar y publicar. La versión anterior se conserva.","Filtra por docente o paralelo. Dirección asigna o revoca Secretaría académica desde este mismo módulo; no concede acceso a cobros o expedientes."],actions:["timetables","subjects"]},
 {words:"promoción promocion reinscripcion sucesion aprobar retenido egreso reforzamiento dimensiones ser saber hacer autoevaluacion",
 answer:"La promoción anual revisa tres libretas trimestrales publicadas y completas. El modelo Bolivia 2026 usa Ser 10, Saber 45, Hacer 40 y Autoevaluación 5. Inicial conserva sus etiquetas cualitativas.",
 steps:["Dirección asigna grado oficial y modelo a cada paralelo desde Grado y evaluación. Cada columna numérica del modelo Bolivia 2026 necesita una dimensión.","Una nota menor a 51 puede recibir reforzamiento autorizado por Dirección antes del cierre trimestral. Se conserva la original y Dirección aprueba el resultado según su regla institucional.","Cierra los tres periodos y la gestión. Crea la siguiente gestión y prepara los paralelos de destino, materiales y capacidad.","En Promoción anual revisa los aprobados, retenidos, pendientes y egresados; los datos incompletos no se convierten en cero ni se promueven.","Selecciona casos listos y confirma el lote. Primaria 6 pasa a Secundaria 1; quien no aprueba permanece en el grado. Secundaria 6 aprobado egresa y finaliza su inscripción.","Los saldos e historial se conservan. Dirección prepara aparte el plan nuevo desde Mensualidades. Una gestión con lotes confirmados no se reabre directamente."],actions:["promotion","gradebook"]},
 {words:"expediente ficha alumno unificado historial emergencia documento aula pestaña pendientes inicio",
 answer:"Cada aula tiene su espacio de trabajo y cada alumno un expediente. El inicio presenta pendientes del rol y de la sede seleccionada.",
 steps:["Desde Inicio abre Mis aulas, o ve a Aulas y cursos y pulsa Abrir aula.","Usa las pestañas Alumnos, Asistencia, Materias, Tareas, Evaluaciones, Calendario y Materiales; conservan el curso elegido.","En Estudiantes pulsa Ver expediente. Reúne inscripción, salud y emergencias, familia, asistencia, documentos, seguimiento, cuotas y facturas.","Los docentes ven alumnos asignados sin documentos privados ni finanzas. Madre y padre ven solo sus hijos; en primaria/secundaria la mora no bloquea el seguimiento académico; inicial y guardería conservan sus reglas de habilitación.","Si falla la conexión, conserva abierto el formulario y reintenta. La inscripción y el comunicado usan un identificador fijo para evitar duplicados. Los borradores de esos formularios se conservan solo en memoria durante la sesión, hasta dos horas, y se eliminan al descartarlos o cerrar sesión."],actions:["classrooms","students"]},
  { words:"asistencia alumnos faltas ausencias pasar lista presentes permiso historial niño estudiantes",
    answer:"La asistencia de alumnos se registra por aula y fecha. Un borrador no genera avisos; al confirmar se avisa a las familias de las faltas.",
    steps:["Abre Asistencia de alumnos y elige aula y fecha.","Marca presentes con la casilla o elige Falta, Tardanza o Con permiso. Completa todos los estudiantes; sin marcar no significa falta.","Guarda un borrador si falta revisar. Pulsa Revisar y confirmar al terminar; se notificará a madre y padre vinculados.","Revisa antes de confirmar: la lista confirmada es definitiva y no permite cambios ni borrado, tampoco desde Dirección.","En Historial del mes consulta los registros y exporta CSV. Las familias ven solo su hijo, incluso si tienen cuotas pendientes."],actions:["student_attendance"]},
  {
    words:
      "asistencia marcacion marcar GPS geolocalizacion sueldo boleta salario planilla tardanza tolerancia",
    answer:
      "Dirección configura la ubicación, horarios y sueldos por sede. El docente marca entrada y salida; la boleta se calcula como borrador y Dirección revisa antes de aprobar.",
    steps: [
      "En Asistencia del equipo configura ubicación, rango y precisión GPS.",
      "En Horarios y sueldos elige modalidad mensual o por horas, días, turnos y descanso.",
      "Configura la tolerancia, el valor por minuto y si se descuenta solo el exceso o toda la tardanza. Los descuentos deben corresponder al reglamento aplicable.",
      "El docente pulsa Marcar entrada o salida desde su cuenta. La hora se guarda en el servidor y solo se consulta ubicación al marcar. Si hay un error, Dirección registra una corrección con motivo.",
      "En Boletas de pago elige el mes y prepara el borrador. Revisa los conceptos y agrega aportes, impuestos, bonos u otros ajustes que correspondan.",
      "Al terminar el mes, sin entradas pendientes, revisa y aprueba. El docente puede consultar e imprimir su boleta; registrar el pago no realiza una transferencia bancaria.",
    ],
    actions: ["staff_attendance", "staff_payroll"],
  },
  {
    words:
      "inscribir inscripcion matricular alumno estudiantes niño nino madre padre familiar registrar",
    answer:
      "La inscripción se realiza dentro de la sede seleccionada. Primero crea la gestión y las aulas; después registra al estudiante y su plan.",
    steps: [
      "En Aulas y cursos crea el curso y paralelo de la gestión.",
      "Abre Estudiantes → Inscribir estudiante. Completa cada paso y pulsa Siguiente.",
      "Registra los correos completos de madre y padre según la política familiar. El RUDE puede ser opcional.",
      "En primaria/secundaria define hasta diez pensiones dentro de la gestión, sin matrícula ni licencia adicional familiar. Inicial y guardería conservan sus planes actuales. Revisa y guarda en el último paso.",
      "En la ficha familiar genera el enlace y compártelo para completar salud, seguro, contactos de emergencia y autorizados.",
    ],
    actions: ["classrooms", "new_student", "admission_form"],
  },
  {
    words:
      "aviso comunicado anuncio acuerdo confirmar obligatorio notificacion leer lecturas",
    answer:
      "Dirección y docentes pueden publicar comunicados. Un aviso obligatorio exige aceptación personal y conserva un reporte de lecturas y confirmaciones.",
    steps: [
      "Abre Comunicados → Nuevo comunicado.",
      "Completa Mensaje y avanza a Destinatarios. Elige institución o aula y, si corresponde, ciertos niños.",
      "En Confirmación y recordatorios elige si exige Estoy de acuerdo y recordatorio horario. Guarda al terminar los tres pasos.",
      "Abre el aviso y selecciona Ver lecturas y confirmaciones. Puedes filtrar y exportar el reporte.",
      "Los recordatorios respetan 22:00–07:00 de Bolivia salvo urgencias de salud o recojo. Los avisos críticos siguen disponibles con deuda.",
    ],
    actions: ["new_announcement", "announcements"],
  },
  {
    words:
      "calendario importar anual gestion curricular pdf foto fecha agenda cumpleaños",
    answer:
      "Puedes importar el calendario de una gestión y revisarlo antes de publicarlo. Se guarda solo en la sede seleccionada; no se publica en otras instituciones.",
    steps: [
      "Abre Agenda → Importar calendario.",
      "Selecciona gestión y aula destinataria, o toda esta sede.",
      "Carga la plantilla PDF o fotos sin datos personales y solicita su lectura.",
      "Compara cada actividad con el original, corrige fechas y elige cuáles publicar.",
      "Confirma la revisión y publica. Las actividades aparecerán en la agenda correspondiente.",
    ],
    actions: ["calendar_import", "calendar"],
  },
  {
    words:
      "formulario plantilla emergencia alergia seguro ficha salud autorizados",
    answer:
      "La ficha de inscripción y el calendario tienen apartados separados. La ficha reúne salud, emergencias y preguntas propias de tu sede.",
    steps: [
      "Abre Formulario de inscripción.",
      "Selecciona la gestión y carga tu plantilla vacía, o añade preguntas manualmente.",
      "Revisa preguntas y condiciones antes de publicar.",
      "Abre la ficha familiar del estudiante para completar respuestas o compartir el enlace. Los cambios de plantilla corresponden a esa sede y gestión.",
    ],
    actions: ["admission_form", "students"],
  },
  {
    words:
      "sede sucursal multisede otra directora primaria kinder guarderia institucion",
    answer:
      "Una institución puede tener varias sedes con responsables y niveles educativos distintos. El crédito MiCole, la facturación y las credenciales bancarias se administran por sede.",
    steps: [
      "Abre Sedes y sucursales desde Dirección de la institución principal.",
      "Crea la sede, su ciudad, dirección y niveles: guardería, inicial, primaria o secundaria.",
      "La Dirección principal conserva acceso. Asigna por correo una directora de esa sede; si aún no tiene cuenta, comparte su invitación.",
      "Cambia de sede en el selector de institución o pulsa Abrir sede.",
      "Configura aulas, docentes, formularios, calendario y cuenta bancaria dentro de la sede correcta. Una directora exclusiva no administra las otras sedes.",
    ],
    actions: ["sites", "settings", "classrooms"],
  },
  {
    words:
      "pago pagar cuota caja efectivo deposito transferencia abono mensualidad precio qr banco baneco",
    answer:
      "Caja registra cobros y recibos por niño, admite cuotas adelantadas y abonos parciales. Un comprobante declarado no acredita dinero hasta su revisión.",
    steps: [
      "Abre Caja y cobros y elige el estudiante.",
      "Marca una o varias cuotas y sus importes. Para efectivo registra el cobro; para QR utiliza la cuenta bancaria configurada de esta sede.",
      "Para depósito o transferencia adjunta el comprobante, referencia y fecha. Dirección revisa el ingreso antes de confirmar los abonos.",
      "Si solicita factura, registra razón social, NIT/CI y celular.",
      "Consulta el estado de cuenta por niño para ver cuotas, abonos y saldos. No se reduce una cuota ya emitida: se registran abonos. En inicial/guardería las últimas dos cuotas requieren cobertura completa para el acceso; en primaria/secundaria la mora familiar no bloquea el contenido académico.",
    ],
    actions: ["cash", "invoices", "settings"],
  },
  {
    words: "factura nit recibo descargar comprobante",
    answer:
      "MiCole registra solicitudes y documentos de facturas emitidas manualmente. No emite una factura fiscal de forma automática.",
    steps: [
      "Al registrar o informar un pago indica si requiere factura y sus datos.",
      "Después de confirmar el pago, abre Facturas y revisa la solicitud.",
      "Adjunta el PDF o foto de la factura emitida y registra su número.",
      "La familia podrá descargarla. También puedes exportar la lista de solicitudes.",
    ],
    actions: ["invoices", "cash"],
  },
  {
    words:
      "materia matematicas lenguaje tarea docente profesor nota evaluacion libreta entrega",
    answer:
      "Un aula puede funcionar de forma general en inicial o tener materias y docentes asignados. Las familias consultan el contenido; el acceso del estudiante permite entregar tareas habilitadas.",
    steps: [
      "Crea la gestión y el aula. En Materias configura las asignaturas y su docente.",
      "Asigna cada docente a sus aulas y paralelos.",
      "En Tareas y entregas publica instrucciones, plazo y materia cuando corresponda.",
      "En Evaluación y libretas configura periodos, evaluaciones y notas. Dirección publica o reabre los periodos según el flujo.",
    ],
    actions: ["subjects", "teachers", "assignments", "gradebook"],
  },
  {
    words: "reporte historial consultas vistas respaldo exportar saldo deuda",
    answer:
      "Dispones de reportes, estados de cuenta por niño y un historial de consultas visibles y descargas. La aceptación de comunicados tiene su propio reporte.",
    steps: [
      "En Reportes selecciona gestión, fechas y filtros.",
      "En Caja abre Estado de cuenta por niño para cuotas, abonos, recibos y facturas.",
      "En Historial de consultas filtra por fechas, estudiante y contenido. Puedes exportar CSV.",
      "Para acuerdos abre el comunicado → Ver lecturas y confirmaciones. Sin confirmar no significa rechazo.",
    ],
    actions: ["reports", "views", "cash", "announcements"],
  },
  {
    words:
      "configurar configuracion logo banner direccion mapa telefono google smtp correo",
    answer:
      "La configuración de la sede reúne su identidad y conexión bancaria. El acceso Google y el SMTP son configuraciones de plataforma administradas en Supabase.",
    steps: [
      "Abre Configuración de la sede correcta.",
      "Actualiza logo, portada, dirección, teléfono y Google Maps según los campos disponibles.",
      "Configura la conexión bancaria de esta sede para QR; no compartas contraseñas ni API keys en este chat.",
      "Para SMTP o acceso Google contacta al administrador de MiCole. El asistente no cambia secretos ni cuentas.",
    ],
    actions: ["settings", "sites"],
  },
  {
    words:
      "recoger recojo permiso falta ausencia carnet ci persona autorizacion",
    answer:
      "Las familias pueden solicitar permisos y autorizar un recojo concreto. Para otra persona deben adjuntar su carnet y los datos de identificación.",
    steps: [
      "Abre Permisos y recogidas.",
      "Completa fecha, motivo y datos de quien recoge, y adjunta la foto del carnet cuando corresponde.",
      "Dirección o el personal autorizado revisa la solicitud y contrasta la identidad.",
      "La ficha familiar conserva contactos de emergencia y autorizados habituales; una autorización concreta mantiene su verificación propia.",
    ],
    actions: ["requests", "students"],
  },
  {
    words: "credito activar plataforma 500 29 licencia activacion",
    answer:
      "El crédito y la facturación MiCole son independientes para cada sede. El adelanto inicial cubre licencias mensuales; sus movimientos no se editan desde el cliente.",
    steps: [
      "Selecciona la sede correcta y abre Crédito MiCole.",
      "Consulta el estado y el QR del adelanto inicial de Bs 500. El banco debe confirmar el pago.",
      "Las licencias se descuentan de ese crédito según las tarifas vigentes.",
      "Las cuotas que las familias pagan a su institución se gestionan aparte en Caja y cobros.",
    ],
    actions: ["credit", "cash"],
  },
] as const;
export function localGuideReply(question: string): GuideReply {
  const words = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const ranked = guideTopics
    .map((t) => ({
      topic: t,
      score: words.filter((w) => t.words.includes(w)).length,
    }))
    .sort((a, b) => b.score - a.score);
  const t = ranked[0];
  return t.score
    ? {
        answer: t.topic.answer,
        steps: [...t.topic.steps],
        actions: [...t.topic.actions],
      }
    : {
        answer:
          "Puedo guiarte paso a paso para inscribir, publicar comunicados, importar calendarios, gestionar sedes, pagos y reportes. ¿Qué quieres hacer?",
        steps: [],
        actions: ["new_student", "new_announcement", "sites"],
      };
}
export function normalizeGuideReply(raw: unknown): GuideReply {
  const v = raw as Partial<GuideReply> | null;
  if (
    !v ||
    typeof v.answer !== "string" ||
    !v.answer.trim() ||
    v.answer.length > 6000 ||
    !Array.isArray(v.steps) ||
    v.steps.length > 10 ||
    v.steps.some((s) => typeof s !== "string" || s.length > 1800) ||
    !Array.isArray(v.actions)
  )
    throw new Error("No se pudo interpretar la respuesta del asistente.");
  return {
    answer: v.answer,
    steps: v.steps,
    actions: [
      ...new Set(
        v.actions.filter(
          (id): id is GuideAction =>
            typeof id === "string" && Object.hasOwn(guideActions, id),
        ),
      ),
    ].slice(0, 4),
  };
}
export const guideSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    steps: { type: "array", items: { type: "string" }, maxItems: 10 },
    actions: {
      type: "array",
      items: { type: "string", enum: Object.keys(guideActions) },
      maxItems: 4,
    },
  },
  required: ["answer", "steps", "actions"],
  additionalProperties: false,
};
