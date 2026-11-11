# Asistencia de alumnos y permisos familiares

Regla actualizada el 29 de octubre de 2026: **solo el docente asignado pasa lista y corrige con justificativo. Dirección tiene acceso de consulta.** Esta asistencia es distinta de la marcación laboral del equipo.

## Antes de pasar lista

La familia solicita una ausencia desde **Permisos y recogidas**, con el hijo, la fecha y el motivo. Al abrir la asistencia de esa fecha, el docente ve un modal con los pedidos del aula: alumno, motivo, estado y respuesta. Dirección puede consultar los pedidos y el historial.

El docente responde **Aceptar permiso** o **Rechazar permiso**, con una respuesta de entre 5 y 1000 caracteres. No se permite confirmar una lista mientras tenga pedidos pendientes. Al continuar, los permisos aceptados se proponen como **Con permiso**, conservando Presente o Tardanza si el niño efectivamente asistió. Un permiso aceptado impide confirmar al alumno como Falta.

El servidor comprueba la revisión de los permisos al confirmar. Si llega o cambia un pedido mientras se prepara la lista, exige actualizar y revisarlo. Este control también protege frente a una APK antigua o una llamada directa al API. Una solicitud recibida después de confirmar se atiende mediante la corrección justificada del docente, conservando el original.

## Pasar lista

1. Seleccionar un aula asignada y una fecha permitida. No se admiten fechas futuras ni una gestión cerrada.
2. Revisar los permisos familiares. Marcar Presente, Falta, Tardanza o Con permiso según lo ocurrido.
3. Escribir las observaciones que debe consultar la familia. **Marcar pendientes como presentes** conserva los estados que ya fueron elegidos, incluidos los permisos.
4. **Guardar borrador** conserva el trabajo sin publicar asistencia a la familia ni enviar avisos de falta.
5. **Revisar y confirmar** muestra el resumen y exige que todos tengan estado. Las faltas confirmadas se notifican a mamá y papá vinculados. Reintentar el mismo pedido no duplica la lista ni los avisos.

**Sin marcar no significa falta.** Un día sin lista confirmada, feriado, fin de semana o borrador incompleto no genera automáticamente una ausencia.

## Corregir con justificativo

Solo el docente asignado dispone de **Corregir con justificativo**. Selecciona alumno y fecha, estado corregido, observación familiar y un justificativo obligatorio de 5 a 1000 caracteres. La corrección se aplica sin aprobación de Dirección y se avisa a la familia.

La lista original confirmada es inmutable. Se agrega un registro de corrección que conserva el estado anterior, el nuevo, el motivo, la cuenta y la fecha. Dirección consulta ese historial, pero no puede crear, aprobar, rechazar ni editar una corrección de asistencia. Los motivos internos no aparecen en la vista familiar; la observación familiar sí.

Cada corrección incluye la revisión efectiva que leyó el docente. Si otra sesión corrige primero, se rechaza el envío obsoleto y se pide actualizar; un reintento idéntico no duplica el historial ni los avisos.

El historial conserva correcciones y decisiones anteriores a este cambio de regla. No se reescribe la historia ya registrada.

## Consulta y privacidad

- Cada familia ve únicamente la asistencia confirmada de sus hijos. Los borradores y justificativos internos no se comparten con otras familias ni con cuentas infantiles.
- El docente accede solo a sus aulas. Dirección consulta las aulas de su sede. No se concede acceso al elegir un rol o enviar un ID ajeno.
- El padrón se obtiene de la inscripción correspondiente a cada fecha y conserva la historia de cambios de aula.
- Las actualizaciones simultáneas se rechazan por revisión para evitar sobrescribir el trabajo de otra persona.
- La recepción Android requiere permisos de notificación y un dispositivo registrado; se distingue de la creación del aviso y de su lectura.

## Implementación y verificación

Migraciones: `202610290001_teacher_attendance_permissions.sql` y `202610290002_attendance_correction_revision.sql`. Ambas aplicadas el 29 de octubre de 2026.

```sh
node scripts/migrate-attendance-permissions.mjs
node scripts/migrate-attendance-permissions.mjs --apply
```

Sin `--apply`, valida en una transacción que termina con rollback. El servidor conserva las funciones de versiones anteriores con protección de permisos; el nuevo cliente envía además la revisión de los pedidos familiares. La web y la APK deben actualizarse para mostrar el modal y las acciones actuales. No se aplica una segunda migración desde Android.

Resultados de esta tanda: `output/qa/2026-10-29-asistencia/`. Se distinguen pruebas de base de datos, recorridos de navegador local, API real con cuentas normales y pantallas del teléfono. La web quedó publicada en `https://www.micole.click` y la APK 17 fue compilada y firmada localmente con el certificado existente e instalada mediante `adb install -r`, conservando la sesión. El flujo de permiso y corrección fue ejecutado físicamente en la APK. Los resultados diferencian la persistencia de notificaciones de su entrega push.

## Hoja semanal y calendario escolar — 3 de noviembre de 2026

En «Asistencia de alumnos → Pasar lista», la hoja muestra de lunes a domingo con fechas reales. Puede ordenarse por los apellidos o nombres registrados, conserva las marcas por estudiante al ordenar y permite elegir la fecha desde la cabecera. Una semana nueva empieza sin marcas si aún no hay registros; las semanas anteriores se conservan. Las casillas vacías siguen pendientes: nunca se convierten automáticamente en faltas.

La casilla marca Presente; el estado permite Falta, Tardanza o Con permiso. Guardar borrador no avisa a la familia. La confirmación sigue requiriendo revisar los permisos familiares y todos los estudiantes. Solo el docente asignado marca o corrige con justificativo; Dirección consulta. El historial mensual y su exportación siguen disponibles.

«Horarios de clases → Abrir calendario escolar» permite a Dirección o Secretaría delegada registrar feriados, suspensiones y jornadas especiales. Se respeta el horario semanal del aula. Un día sin clases bloquea la marcación también en la base de datos; una lista que nunca se tomó no genera faltas ni notificaciones. Los cambios quedan auditados y las revisiones concurrentes se rechazan para evitar sobrescribirlas.

«Consultar feriados nacionales de Bolivia» consulta únicamente BO y solicita revisar las fechas antes de aplicarlas. Para 2026, la propuesta corrige las diferencias de la API con el calendario oficial: traslados del 23 de enero y 22 de junio, y días adicionales del 5 de junio y 7 de agosto. Los feriados regionales y vacaciones se registran manualmente. Fuente oficial: https://mintrabajo.gob.bo/index.php/nota_prensa/la-paz-22/ .

Guardar o importar fechas no publica avisos. Para comunicar una fecha, use «Preparar comunicado», revise el texto y pulse «Publicar comunicado». Secretaría necesita delegación de publicación. Se evita repetir el mismo comunicado por revisión y las familias con deuda también pueden consultar este aviso operativo, sin habilitarles el resto de módulos académicos.

La matriz nativa mantiene los nombres visibles al deslizar los días. En pantallas cortas el historial se desplaza con el contenido y las acciones se compactan en horizontal. Las pruebas automatizadas móviles emplean React Native Web con datos ficticios; no sustituyen el piloto físico.

## Adaptación de la lista a celular y tablet — actualización 6

En el celular, «Pasar lista» abre «Lista del día»: nombres completos, casilla de Presente con área amplia, selector de estado y observación por estudiante. Los días de lunes a domingo siguen disponibles arriba. «Hoja semanal» permite consultar y marcar en la matriz; cambiar de formato conserva el borrador y las marcas.

La web decide el formato inicial según el ancho real disponible, incluido el espacio que ocupa el menú lateral. En la app se consideran el ancho, la altura y la escala de letra. Las pantallas grandes muestran inicialmente la hoja semanal. Las acciones de descartar e historial se desplazan con el contenido, dejando una barra inferior breve para guardar y confirmar.

Las fechas, permisos y reglas de confirmación siguen siendo las mismas. Esta actualización modifica la presentación y no necesita migraciones ni crear registros en instituciones. Evidencias: `output/qa/2026-11-03-asistencia-responsive`.
