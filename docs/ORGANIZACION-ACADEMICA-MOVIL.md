# Organización académica en Android e iOS

Actualización del 12 de noviembre de 2026. Las aplicaciones comparten Expo SDK 57 / React Native y consumen las mismas funciones y permisos del servidor que la web. No se duplicaron las reglas de evaluación, inscripciones o autorización en otra base de datos.

## Cambios disponibles

- Inicio de Dirección con matrícula, retiros, cobros, saldos, asistencia diaria y por materia, y resultados que requieren atención.
- Inicio docente con sus materias, entregas pendientes y tutorías. El tutor consulta otras materias y consolidados sin poder editar los registros de otro docente.
- Secretaría organiza grados, paralelos, docentes, materias, horarios e inscripciones. Caja se habilita exclusivamente con el permiso independiente de Dirección. El servidor bloquea el cobro cuando se revoca.
- Grados con sus propios paralelos, tutoría, cupos, docentes y materias. El horario se abre filtrado por paralelo y conserva el generador anterior.
- Centro de cada materia con tareas, notas, asistencia de cada clase, seguimiento, comunicados, calendario y mensajes privados por alumno.
- Seguimiento positivo o de conducta, con foto opcional optimizada. Familia, tutoría y Dirección consultan los registros autorizados. Los avisos conservan el alumno y paralelo al abrirlos desde la bandeja o un toque de Android.
- Consolidado por alumno con períodos, resultados, método de cálculo, evaluaciones y pesos; PDF con identidad institucional y resultados completos bajo el mínimo en rojo. Los pendientes no se convierten en ceros.
- Creación/edición de instituciones con tipo Colegio/Kínder y vocabulario correspondiente. Se conservaron Mica y los flujos anteriores.
- Inscripciones: campañas y delegaciones, fichas desde nómina, nuevos con asignación equilibrada validada en servidor, importación XLSX/CSV y PDF/imágenes con IA, revisión de duplicados, contacto familiar verificado, QR individual, PDF de invitación, formulario presencial y pago QR o efectivo para personal autorizado. Las fichas importadas siguen siendo borradores hasta completarse y confirmarse.

Las familias conservan las condiciones previas para consultar contenido académico; el seguimiento del alumno se comparte inmediatamente con su familia verificada. Un enlace a un expediente selecciona el alumno autorizado indicado y actualiza el selector familiar.

## Fuentes y paquetes

Proyecto móvil original actualizado: `/Users/vincentariassaavedra/Desktop/micole-android/micole-android`. Se verificaron los hashes previos de los 47 archivos modificados antes de escribir. Las dependencias están fijadas e instaladas en ese proyecto. Se mantuvieron intactos los demás cambios que ya existían en su copia de trabajo.

La instantánea revisada, manifiesto de hashes y parche sin credenciales están en `output/mobile/2026-11-12-academic-workspaces/`. Las copias de compilación son `tmp/android-attendance-build` y `tmp/ios-local-20261030`; sus adaptaciones de firma permanecen separadas del proyecto compartido.

- Android: `output/apk/micole-organizacion-academica-v23.apk`, versión 23, ARM64 y ARMv7, certificado original comprobado. Instalación pendiente por ausencia de un Android conectado.
- iOS: `output/ios/2026-11-12/MiCole-organizacion-academica-v8.ipa`, versión 1.0.0 (8), instalada en el iPhone del propietario. Tras desbloquear el teléfono, se comprobó la apertura de la compilación 8 y que su proceso permanecía en ejecución. La firma personal de desarrollo incluye ese dispositivo y vence el 16 de noviembre a las 15:00:48 UTC; este paquete no es una publicación en TestFlight o App Store.

Las notificaciones remotas de iOS siguen siendo una capacidad pendiente del cliente anterior. La bandeja de avisos dentro de la aplicación y su actualización de datos son independientes de APNs.

## Verificación

Tipos y lint móvil sin errores; 139 pruebas en 28 archivos aprobadas. Compilaciones Release nativas de iOS y Android correctas y firmadas. Las pantallas compartidas se probaron mediante la exportación de producción de React Native Web a 390 × 844, con cuentas ficticias de Dirección, docentes, Secretaría y familia.

Se comprobaron creación de grado/paralelo/materia y vinculación del docente, activación y revocación de Caja, consulta de tutoría sin edición, PDF con resultados en rojo, observación con foto visible a la familia del alumno correcto, alumno nuevo asignado, QR individual, PDF de invitación y lectura de Excel con revisión de duplicados. Los PDF no tienen texto fuera de la página. No se hicieron llamadas al banco ni cambios en instituciones reales.

Los recorridos de navegador no equivalen a una revisión física completa de ambas plataformas. No se afirma entrega de push con la aplicación cerrada ni prueba de pagos bancarios reales.

Scripts: `scripts/verify-native-academic-smoke.mjs`, `scripts/verify-native-academic-flows.mjs`, `scripts/verify-native-enrollment.mjs`. Evidencias: `output/qa/2026-11-12-native-academic-workspaces/`.
