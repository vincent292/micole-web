# Asistencia de alumnos y revisión de usabilidad

## Pasar lista

Dirección y los docentes asignados abren **Asistencia de alumnos** desde Inicio, un aula o el menú. Este registro es distinto de **Asistencia del equipo**, que corresponde al horario laboral de docentes.

1. Seleccionar aula y fecha. No se admiten fechas futuras ni cambios en una gestión cerrada.
2. Marcar la casilla de quienes asistieron. Para los demás, seleccionar **Falta**, **Tardanza** o **Con permiso**. **Completar sin marcar como presentes** permite comenzar una lista en la que la mayoría asistió, conservando estados ya elegidos.
3. Agregar observaciones si corresponden. Estas observaciones se comparten con la familia; el motivo interno de una corrección se conserva en el respaldo y no se muestra al familiar.
4. Guardar borrador para continuar después. Un borrador no genera notificaciones y no se muestra a las familias.
5. **Revisar y confirmar** muestra el resumen antes de guardar. Es necesario marcar a todos. Entonces se crean los avisos de falta para las cuentas verificadas de madre y padre vinculados; Android los recibe mediante el worker de Firebase existente. En web aparecen en la campanita. No se necesita mantener la app abierta para enviar el aviso.

**Sin marcar no significa falta.** Un día sin lista confirmada, fin de semana o feriado no produce ausencias automáticamente. La confirmación del docente evita avisar antes de terminar el registro. Las notificaciones del teléfono requieren sus permisos y una sesión/dispositivo registrado; siguen el horario de descanso y preferencias ya configurados.

## Consulta y correcciones

- **Historial del mes** muestra fecha, estudiante, estado y observación. La web permite exportar los registros confirmados a CSV.
- Cada familia consulta únicamente a sus hijos. Puede revisar asistencia incluso si tiene cuotas pendientes; esto no habilita tareas, notas o galerías bloqueadas por mensualidades.
- Las listas confirmadas se corrigen con un motivo de al menos cinco caracteres. Se conserva una copia del registro anterior y su autor. Corregir una falta ya notificada genera una actualización para la familia.
- Una actualización simultánea de otra persona se rechaza por revisión; no sobrescribe silenciosamente su trabajo. Guardar de nuevo no repite el aviso a la misma cuenta por estudiante y fecha.
- Se usan los expedientes de inscripción para el padrón de cada fecha y se conserva la historia de estudiantes que cambian de aula o se retiran. Dirección y docentes de un aula solo consultan los grupos autorizados de su sede.

## Cambios de interfaz

- Modales web fuera de contenedores transformados, con contenido desplazable, acciones visibles y altura/posición ajustadas al área disponible del navegador. Cerrar con cambios solicita descartarlos; los errores se muestran sin tener que buscar al final del formulario.
- Pasos secuenciales y validación de campos antes de avanzar. Los valores permanecen al volver a un paso anterior.
- Formularios Android con confirmación al descartar cambios y desplazamiento al inicio del nuevo paso. Los selectores con ocho o más opciones incluyen búsqueda sin distinguir tildes; las listas de selección muestran estados vacíos y recuentos.
- Materias con búsqueda, filtros de disponibles/archivadas para Dirección, recuento de materias sin docente y acceso a tareas conservando el aula y la materia.
- Accesos directos para pasar lista desde Inicio y Aulas; asistencia de alumnos en la navegación inferior del docente Android. Listas virtualizadas para no montar todo un curso a la vez.
- La demo privada permite probar listas, borradores, correcciones y avisos ficticios, conservados en el navegador, sin consultar servicios reales.

## Alcance de verificación

Recorrido web de 28 módulos de Dirección a 390, 768 y 1366 px, abriendo los formularios disponibles y comprobando desbordes, desplazamiento y visibilidad del pie. Flujos completos de inscripción, materias, tareas, avisos, pagos y sedes cubiertos por las pruebas existentes. Se añade la confirmación de asistencia y su consulta familiar, los cambios sin guardar y la reducción de altura del navegador.

Android se verifica en el runtime Expo para formularios, materias, Realtime y asistencia. Se deben comprobar adicionalmente teclado, TalkBack, permisos de notificación y recepción con la app cerrada en teléfonos físicos al instalar la siguiente APK. Esta tarea no genera APK.

## Publicación

Desde el proyecto web:

```sh
npm run supabase:migrate:attendance
```

La migración es transaccional y añade tablas, políticas RLS, RPC y avisos. Publicar junto con la web, la demo privada y las funciones `push-dispatch` y `guide-assistant`. No añade un proceso periódico: reutiliza la cola de notificaciones existente. El servidor impide editar tablas directamente y valida permisos y padrón en cada guardado.

Android usa la misma base y funciones; no se aplica una segunda migración desde su proyecto. Su código está actualizado, pero una APK previamente instalada no incorpora cambios automáticamente.

Referencias de interfaz: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [ScrollView](https://reactnative.dev/docs/scrollview), [KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview).
