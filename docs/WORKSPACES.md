# Trabajo por aula y expediente del alumno

Actualizado: 21 de octubre de 2026. Web y código Android comparten Supabase; no se generó APK.

## Uso

- Inicio de Dirección: inscripciones incompletas, permisos/recojos pendientes, acceso a verificar depósitos, facturas pendientes y materiales por aprobar. Los contadores representan los datos autorizados de la sede; depósitos es un acceso de revisión, no un contador inventado.
- Inicio docente: aulas asignadas, asistencia del día, entregas por revisar, permisos y actividades.
- Inicio familiar: expediente del hijo seleccionado, avisos, calendario y pagos. Con ficha o cuotas pendientes conserva los accesos esenciales; no se monta el seguimiento académico bloqueado.
- Aulas y cursos → Abrir aula: Alumnos, Asistencia, Materias, Tareas, Evaluaciones, Calendario y Materiales. El curso permanece seleccionado. En primaria se pueden usar materias; no son obligatorias para los niveles que no las usan.
- Estudiantes → Ver expediente (Android: Abrir expediente): Resumen, Salud y emergencias, Familia y recojos, Asistencia, Documentos, Seguimiento, Cuotas y recibos, Facturas. La familia también tiene un acceso desde Inicio y el menú.
- El expediente reúne los registros existentes. Los documentos y facturas continúan en almacenamiento privado; subir un documento no cambia permisos ni lo publica.
- El docente no tiene pestañas de documentos privados ni finanzas en el expediente. Dirección y las familias consultan lo autorizado para el alumno; las familias solo sus hijos vinculados. Las autorizaciones de recojo no crean cuentas familiares.
- En asistencia, la casilla permite marcar presentes y las observaciones se despliegan cuando hacen falta. «Marcar pendientes como presentes» conserva las faltas, tardanzas y permisos ya registrados. Confirmar exige todos los estados; un día sin lista no es una falta.

## Conexión y reintentos

Las inscripciones y comunicados conservan un borrador en memoria de la sesión, hasta dos horas y un máximo de 30 formularios. Se separan por usuario, rol, sede, soporte y formulario. Se eliminan al guardar, descartar o cerrar sesión. No sobreviven a reiniciar/recargar la aplicación y no guardan contraseñas, API keys ni archivos. Un fallo de red conserva los campos en el formulario abierto; se puede reintentar manualmente.

Los identificadores de alumno, plan y comunicado se generan una vez. La migración `202610210002_enrollment_retry.sql` protege la inscripción atómica con bloqueo y huella del pedido: repetir exactamente el mismo pedido por el mismo actor devuelve éxito, sin duplicar alumno, plan ni cuotas. Reenviar datos diferentes con ese identificador exige revisar el expediente. La autorización de Dirección y sede se comprueba antes de aceptar cualquier reintento. No hay envío automático de cobros ni confirmación de pagos sin conexión.

Los espacios de aula y alumno filtran datos ya autorizados para presentarlos. No sustituyen las políticas RLS ni los permisos de los RPC de Supabase.

## Verificación

- Web: 358 pruebas unitarias/base de datos y 34 recorridos de demo en navegador y dos pruebas web de fallos de conexión/reintentos.
- Android: 45 pruebas unitarias y siete recorridos Expo web, además de lint y tipos.
- Se comprueban aislamiento entre aulas/sedes/hijos, ausencia de finanzas/documentos en el expediente docente, expediente familiar con deuda y bloqueo académico, registros de asistencia, formularios y reintentos tras error de red.
- La migración se verificó primero con rollback y luego se aplicó a Supabase.

## Pendiente para el piloto real

El 21 de octubre se verificaron escritura y lectura con URL firmada y un archivo sintético, eliminado al terminar. La misma URL devuelve preflight 204 para `https://micole-web.vercel.app` y 403 sin Access-Control-Allow-Origin para `https://www.micole.click`, tanto con host S3 por ruta como virtual. Es una diferencia efectiva de orígenes permitidos, no un fallo de credenciales. Aplicar en Cloudflare → R2 → aulanexo-private → Settings → CORS el contenido de `docs/r2-cors.json`. El token de archivos actual no autoriza administrar CORS. No hacer público el bucket ni cambiar sus claves.

Después de esa configuración, verificar una carga y descarga con cuentas reales autorizadas de Dirección, docente y familia. Probar el siguiente recorrido con datos de prueba de una institución consentida:

1. Dirección crea gestión, aula, docentes/materias y materiales anuales.
2. Inscribe un alumno con madre/padre y plan; comparte la ficha y completa emergencias.
3. Familia entra, consulta su expediente y elige factura al pagar; Dirección verifica efectivo/depósito o espera confirmación bancaria del QR.
4. Docente confirma la lista y comprueba el aviso de falta en las cuentas familiares vinculadas; corrige con motivo si corresponde.
5. Publica tarea/comunicado y confirma entrega, lectura/aceptación y reporte.
6. Familia descarga una factura/documento privado propio y se rechaza un archivo ajeno.
7. Ejecutar esos pasos en un teléfono físico con la próxima APK que genere el propietario. Las pruebas Expo web no sustituyen esa comprobación física ni envían notificaciones push reales.
