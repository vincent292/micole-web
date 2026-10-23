# Tutoría de aula y entrevistas

Dirección asigna una tutora o jefe de aula desde **Aulas y cursos → Editar aula → Tutora o jefe de aula**. La elección vincula al docente con el aula. Es una responsabilidad del curso, no un nuevo rol global. No se concede automáticamente a todos los docentes existentes.

Cada aula conserva su gestión, paralelo y materias. Un docente puede enseñar en varios cursos y una tutora puede, además, enseñar una materia.

## Permisos

- El docente de una materia registra sus tareas, evaluaciones, calificaciones y actividades de calendario.
- La tutora consulta todas las materias desde **Aulas y cursos → Entrar al aula → Tutoría** y desde la pestaña **Tutoría** del expediente del alumno.
- Esa responsabilidad permite leer notas, pendientes, comentarios y cuidados, pero no calificar otra materia ni editar los cuidados de otro docente.
- Dirección conserva su supervisión administrativa. Los permisos se verifican en Supabase, no dependen solo de ocultar botones.
- Retirar al docente del aula revoca la tutoría y sus asignaciones de materias. Guardar un aula sin retirar al docente conserva esas asignaciones.

## Entrevistas

Desde el seguimiento se elige alumno y materia y se pulsa **Convocar entrevista**. También existe el módulo **Entrevistas**, disponible para Dirección, docentes y familias.

El formulario exige personas, fecha y lugar, y motivo. La convocatoria incluye al docente de la materia y avisa a la madre y el padre que tengan cuentas vinculadas y verificadas. La tutora/organizador también puede consultarla. Una cuenta sin vincular no puede recibir una notificación de la app.

Cada participante responde personalmente: asistirá, solicita otro horario o no puede asistir. Las últimas dos opciones exigen motivo. La lectura del aviso no confirma asistencia. La lista muestra quién respondió y quién está pendiente.

**Reprogramar** guarda una nueva revisión y exige confirmar el nuevo horario. Las respuestas anteriores se conservan en el historial de la base. Se puede cancelar o marcar realizada una entrevista que ya empezó. Reintentar una operación con el mismo identificador no duplica las convocatorias.

Las citas aparecen en el calendario solo para sus participantes y el personal autorizado; no se publican como eventos para todo el curso. Las familias con deuda pueden responder a sus entrevistas. Sus notas y otros contenidos académicos mantienen el bloqueo existente.

## Coordinación interna

**Mensaje al profesor** envía un mensaje privado sobre el alumno y su materia. Solo lo ven el emisor, el destinatario y Dirección. La familia no ve estos mensajes ni recibe sus avisos. El motivo de una entrevista sí es visible para la familia.

Web y Android se sincronizan por el canal Realtime existente. Firebase envía el aviso al teléfono; la pantalla de notificaciones web usa la misma notificación registrada. Los textos del teléfono son genéricos, sin publicar notas o motivos sensibles en la pantalla de bloqueo.

Migración: `202610220006_classroom_tutoring.sql`. La demo mantiene sus propios registros en el navegador, sin escribir en Supabase.

Android queda actualizado en sus fuentes. No se genera ni instala una APK como parte de esta actualización.
