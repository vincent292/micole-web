# Kárdex y asistencia por lote

El expediente del alumno incorpora **Kárdex e historial** en web, Android e iOS. Se consulta por gestión y tipo de registro, con páginas de hasta 40 eventos y PDF de la página consultada. La consulta conserva la misma identidad del estudiante al cambiar de aula o gestión.

Se reúnen inscripciones, traslados, retiros, asistencia confirmada y sus correcciones, asistencia por materia, evaluaciones y correcciones de notas, libretas publicadas, entregas revisadas, seguimiento, cuaderno anterior, cuidados, documentos, permisos, recojos y recibos. Cada fuente conserva sus registros originales. El kárdex no inventa movimientos anteriores: los cambios administrativos de la ficha empiezan a registrarse desde la activación de esta función; la trayectoria anterior utiliza los datos que ya estaban guardados.

La familia verifica su vínculo con el estudiante. Sus resultados académicos mantienen las condiciones previas de acceso, y las observaciones autorizadas siguen disponibles inmediatamente. Las justificaciones internas de las correcciones de asistencia no se muestran a la familia. Los docentes consultan sus alumnos y materias; al dejar de estar asignados al aula pierden el acceso. Dirección y tutoría conservan la consulta académica correspondiente. Los pagos requieren Dirección, permiso de cobros de Secretaría o vínculo familiar verificado. No se exponen objetos privados ni fotos completas dentro de cada página del historial.

## Operaciones y sincronización

La web y las apps ya enviaban la lista completa a `save_student_attendance` en una sola petición. Se optimizó su núcleo privado: un `INSERT … SELECT … ON CONFLICT` guarda el conjunto y otro prepara los avisos para sus destinatarios autorizados. Se conservan los controles de docente, matrícula, permisos familiares, revisión, gestión abierta, inmutabilidad de listas confirmadas e identificador de reintento. Las filas sin cambios no se reescriben.

La sincronización de nuevas notificaciones genera una actualización por institución y sentencia de inserción. La entrega de avisos y push conserva sus validaciones individuales de destinatario. La prueba de 31 alumnos registra exactamente tres cambios del canal: creación de la sesión, confirmación y una invalidación del lote de avisos. Reintentar no duplica la lista ni los avisos.

El kárdex usa una consulta paginada con cursor por fecha e identificador; no descarga el historial completo ni consulta cada fila desde el cliente. Tiene índices por estudiante y por las referencias del historial. La hoja semanal escucha solamente las tablas de asistencia pertinentes y deja de consultarse al abrir el historial mensual.

## Entrega y comprobaciones

Migraciones: `202611120002_student_kardex.sql`, `202611120003_attendance_batches.sql` y `202611120004_kardex_indexes.sql`. Se aplican mediante `node scripts/migrate-academic-workspaces.mjs --apply`; sin la opción se valida con rollback.

639 pruebas web/SQL y 139 pruebas móviles aprobadas. Se comprobaron filtros, cursor, PDF y permisos con cuentas ficticias de Dirección, docentes y familia en web y pantallas compartidas de React Native. Los seis PDF de comprobación no tienen texto recortado. No se hicieron operaciones bancarias ni cambios en alumnos de instituciones reales.

Evidencias: `output/qa/2026-11-12-kardex/`. Fuentes móviles actualizadas en el proyecto original, con instantánea y hashes en `output/mobile/2026-11-12-kardex/`. APK: `output/apk/micole-kardex-v24.apk`. La versión de iOS corresponde a la compilación 9; su estado de instalación se registra en las evidencias y en `docs/COMPILACION-IOS-LOCAL.md`.

MiCole continúa en el proyecto y la base actuales. No se separó el producto ni se preparó otra versión comercial.
