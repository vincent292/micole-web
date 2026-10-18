# Cuidados, evaluación, gestiones y alta de instituciones

Implementación compartida entre web y Android. Requiere las migraciones `202610180003_school_lifecycle.sql`, `202610180004_gradebook.sql` y `202610180005_onboarding_import.sql`.

## Cuidados diarios

Dirección y el docente del aula registran alimentación y cantidad consumida, intervalos de descanso, higiene, estado de ánimo e incidentes con observaciones. La familia consulta el resumen del día y sus registros. Las horas se eligen de una lista; no se admiten descansos con fin anterior al inicio ni registros futuros. Los datos usan el día de Bolivia. Los registros conservan el aula original aunque el niño se traslade.

## Evaluación y libretas

Dirección configura periodos dentro de una gestión, sin superposición. Cada periodo tiene peso relativo en el promedio anual. El docente asignado crea evaluaciones de su materia, con puntuación máxima y peso relativo dentro de ella. En aulas sin materias se usa Desarrollo integral.

Una evaluación vinculada a una tarea permite traer explícitamente sus entregas revisadas. Se copian las notas disponibles; las revisiones posteriores se incorporan al volver a pulsar Traer notas de tarea. Las notas y recomendaciones antiguas siguen conservándose en su módulo y no se convierten automáticamente en evaluaciones.

Ejemplo: evaluación de 10/20 con peso 1 y otra de 100/100 con peso 3 → promedio 87,5/100. Una nota pendiente no equivale a cero. La exención exige motivo y no participa del denominador.

Cerrar un periodo exige notas completas o exenciones para las evaluaciones de cada estudiante inscrito en las aulas evaluadas, incluidas las materias activas de esas aulas. Publica libretas inmutables con nombres, materias, pesos y notas de ese momento. Las familias no consultan borradores ni tablas de calificaciones editables. Dirección puede reabrir con motivo: se retiran las libretas anteriores para la familia, se conserva su versión y al volver a cerrar se publica una nueva revisión. Hay exportación CSV e impresión/guardado PDF en web y Android.

El promedio anual muestra los periodos publicados y conserva sus pesos originales. Sigue siendo provisional hasta cerrar la gestión. No es una certificación oficial ni impone un reglamento educativo nacional.

## Gestiones e historial

Las aulas existentes generan su gestión correspondiente. Se conserva un expediente de la inscripción actual; los datos anteriores a esta migración no se reconstruyen si nunca se guardaron.

Dirección crea años y copia aulas, horarios, materias y docentes al nuevo año. Copiar otra vez omite aulas ya existentes. La reinscripción/traslado selecciona el aula de destino y exige motivo; valida capacidad, estado y requisitos de materiales. Conserva al estudiante, la familia, documentos, libretas, tareas anteriores, cuotas y saldos; no vuelve a cobrar activación. Se crea el nuevo plan de pagos por separado para elegir sus meses y tarifas conscientemente. No se permite cambiar el año de un aula con historial: se crea/copía otra aula.

Cerrar una gestión exige cerrar sus periodos. El cierre es académico: no da de baja estudiantes ni detiene cobros. Se utiliza la baja con motivo cuando un alumno deja de pertenecer a la institución.

## Preparar institución e importar

El asistente dirige a identidad y requisitos → aulas/gestiones → docentes/materias → estudiantes/familias. Solo Dirección configura excepciones: madre y padre obligatorios (valor inicial), solo madre o solo padre; CI obligatorio u opcional; lista anual de materiales requerida u opcional. El RUDE sigue siendo opcional. Solo los progenitores registrados obtienen acceso; no se habilitan contactos de emergencia como familiares.

Las plantillas CSV UTF-8 se pueden completar en Excel/Sheets y exportar a CSV. Se admiten coma o punto y coma, comillas, saltos de línea en celdas y hasta 200 filas por archivo (1 MB). Para docentes, nombres de varias aulas de la misma gestión separados por `|`. Las aulas deben existir. Las fechas usan `AAAA-MM-DD` y los importes punto decimal.

Previsualizar ejecuta las mismas validaciones del servidor dentro de subtransacciones revertidas; no guarda personas, planes ni cargos. Confirmar guarda todo el archivo de forma atómica e idempotente: si falla una fila, ninguna se conserva. Se detectan duplicados y cupos insuficientes. Las tarifas mostradas se vuelven a comprobar para evitar usar una cotización antigua.

Importar estudiantes crea inscripción y plan, sin marcar pagos. La activación y las licencias usan las tarifas vigentes de la institución. Cuotas omitidas: 10; día de vencimiento omitido: 10; inicio omitido: día actual; mensualidad omitida: precio del aula. La ficha de cuidados sigue pendiente para completarla con la familia. Importar no envía correos ni WhatsApp automáticamente.

## Permisos y operación

Las tablas nuevas usan RLS y únicamente RPC autorizados para escribir. Se mantiene la separación entre instituciones, el soporte del superadmin, los bloqueos familiares por pagos y las cuentas infantiles limitadas al portal existente. Los cambios generan señales Realtime; la recarga existente sigue esperando al cierre de formularios.

`npm run supabase:migrate:school` aplica las migraciones. `npm run supabase:smoke:school` verifica permisos, calificaciones, publicación, reapertura e importación con datos temporales y rollback total; no realiza cobros ni envía correos/push.

El almacenamiento R2 se configura por separado. Para SMTP ver [EMAIL.md](EMAIL.md). Esta entrega actualiza código Android sin generar un APK nuevo.
