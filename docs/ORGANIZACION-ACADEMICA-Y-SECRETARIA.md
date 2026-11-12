# Organización académica y Secretaría

La web organiza el trabajo por institución, gestión, nivel, grado, paralelo y materia. Los paralelos conservan sus alumnos y registros existentes. Dirección y Secretaría organizan los grados y sus paralelos; cada paralelo tiene tutoría, capacidad y materias con docentes asignados. Al asignar una materia, su docente queda vinculado al paralelo en la misma operación.

Dirección entra a un tablero de matrícula, retiros, cobros, saldos, rendimiento y asistencia. La asistencia diaria del paralelo y la asistencia de cada clase se cuentan por separado. Los promedios se calculan con las reglas del libro de notas; un resultado incompleto conserva sus pendientes.

Los docentes abren sus materias y, cuando tienen una tutoría, consultan el consolidado del paralelo. Cada materia reúne tareas, notas, asistencia por fecha y hora, seguimiento, comunicados, calendario y mensajes. La consulta de otras materias por tutoría no habilita su edición. El consolidado permite consultar evaluaciones, pesos y resultados por período y descargar un PDF membretado. Dirección configura el mínimo sobre 100 utilizado para destacar los resultados completos que requieren atención.

## Acceso de Secretaría

Desde Configuración, Dirección habilita el correo verificado de Secretaría. Este acceso permite organizar grados, paralelos, docentes, horarios e inscripciones. El permiso de recibir cobros es independiente y está deshabilitado inicialmente. Revocarlo bloquea el cobro en el servidor aunque exista una pantalla abierta.

El rol existente de Secretaría académica conserva su identificador `scheduler`. Los accesos anteriores limitados a horarios conservan esa condición hasta que Dirección active la administración de Secretaría. La capacidad nueva no concede el rol de Dirección ni acceso a la facturación de la plataforma. Las invitaciones de Secretaría se limitan a docentes y familias de su institución y mantienen la verificación de contactos.

## Seguimiento y familia

Una observación identifica al alumno, materia o tutoría general, autor, fecha y tipo: reconocimiento o incidencia. Puede incluir una foto opcional. La familia verificada del alumno, tutoría y Dirección pueden verla inmediatamente; los demás docentes no adquieren acceso por pertenecer a la institución. Las notificaciones utilizan los indicadores verde y rojo junto con el texto del tipo de observación.

La familia consulta el seguimiento desde el expediente y entra a las materias de su hijo para consultar comunicados, calendario, asistencia confirmada y mensajes. Los mensajes de un alumno se mantienen dentro de su propio contexto familiar. Las notas no publicadas se reservan para Dirección y tutoría; las familias conservan sus libretas publicadas.

## Horarios y tipo de institución

Cada paralelo abre su horario. El generador existente utiliza las materias, docentes, cargas semanales, turnos, recreos y disponibilidad y comprueba cruces docentes. Generar, revisar y publicar conservan el flujo de planificación existente.

La creación de una institución solicita el tipo Colegio o Kínder y guardería. El vocabulario y las herramientas de cuidado se aplican al modo correspondiente. Las instituciones existentes conservan su configuración, incluido el modo automático previo. Los nuevos módulos autenticados se revisan en la institución persistida de pruebas; la demostración local conserva sus recorridos anteriores.

## Validación y publicación

Las migraciones `202611110001` a `202611110011` y `202611120001` se aplican con `node scripts/migrate-academic-workspaces.mjs --apply`; sin la opción se validan con rollback. La suite incluye permisos de Secretaría, revocación de cobros, aislamiento por materia y familia, asistencia por clase, consolidado y separación entre instituciones.

Las comprobaciones del navegador usan exclusivamente cuentas y alumnos ficticios mediante `scripts/verify-academic-workspaces-smoke.mjs` y `scripts/verify-academic-workspaces-flows.mjs`. Evidencias de la entrega en `output/qa/2026-11-12-academic-workspaces/`. Android e iOS quedan para la siguiente etapa acordada.
