# MiCole · Estado

## Implementado y aplicado

Landing en `/`, identidad MiCole y fuentes propias; panel privado bajo `/app`; ingreso por proveedores habilitados; reserva de superadmin; incorporación solicitada y aprobada; gestión de institución, aulas, docentes y familias; inscripción, activación y planes; descuentos, prorrateo y bloqueo por deuda; pagos manuales idempotentes; corte diario activo; cuaderno, agenda, materiales, notas, permisos y mensajes; campana con lectura individual y auditoría de gestión. Panel de plataforma separado, conteos agregados sin fichas de alumnos y soporte exclusivo del propietario por colegio/rol/usuario, con motivo, caducidad y cambios atribuidos al administrador real. Inscripción con CI y RUDE opcional; madre/padre con vinculación automática por correo verificado; ficha por WhatsApp sin login con seguro y emergencias, revisión de Dirección y caducidad/revocación. Documentos privados preparados para R2. Reportes de cobros, cuotas pendientes/mora y estados de cuenta por estudiante; filtros por período/curso actual, agrupación por institución en plataforma, CSV e impresión a PDF. Mejoras visuales y animaciones finitas accesibles. Acceso opcional de estudiantes habilitado/revocado por Dirección con correo propio confirmado; portal mínimo de solo lectura para tareas, calendario, materiales y comunicados de su curso, con bloqueo por deuda y soporte del propietario. Padres con consulta académica sin edición y calendario mensual interactivo. Google habilitado y redirección inicial comprobada. Landing animada con Motion, vista previa interactiva y directorio de instituciones activas con carrusel; identidad institucional ampliada (logo, NIT, dirección y web), editable por superadmin o Dirección.

Las catorce migraciones están aplicadas, incluida `202610150004_realtime_notices.sql`. La identidad institucional y el directorio público están activos en Supabase y verificados con las pruebas remotas de instituciones. Las pruebas remotas ejecutan los flujos dentro de una transacción y terminan en rollback: no se dejan personas, colegios ni alumnos ficticios en el proyecto.

## Configuración que aún necesita proveedor/cuentas

- Completar el ingreso interactivo con las cuentas Google que usarán la app. El proveedor y su redirección inicial ya se verificaron habilitados; los callbacks locales están configurados.
- SMTP si se necesita correo para personas externas al equipo de Supabase.
- Bucket R2, secrets, CORS y despliegue de `r2-media`.
- Proveedor QR para la cuenta de MiCole y las de cada institución.
- Proveedor SIAT, si se implementa emisión fiscal.

## Contrato QR por implementar cuando llegue la API

Monto exacto en BOB, identificación del cargo, destinatario (MiCole/institución), referencia única y vencimiento. El webhook debe verificar firma, monto, moneda y destino; registrar la transacción una sola vez y confirmar el cobro en una transacción. La UI no confirma pagos bancarios por sí misma.

## Siguiente etapa

Android nativo y push; asistencia y validación presencial de recogidas; consentimiento de imágenes, miniaturas y cuotas de almacenamiento; módulos habilitables por institución; paginación general de directorios (los reportes ya están paginados y no truncan movimientos); auditoría de lecturas de datos sensibles; backups y restauración; devoluciones y ajustes con trazabilidad. Los abonos y anticipos ya están implementados.

## Validación

`npm test`, `npm run test:e2e`, `npm run build`, `npm run supabase:verify` y `npm run supabase:smoke` y `npm run supabase:smoke:reports` y `npm run supabase:smoke:institutions`, `npm run supabase:smoke:students`, `npm run supabase:smoke:operations` y `npm run auth:check`. Probar el acceso real de cada rol tras configurar los proveedores: familia vinculada únicamente a sus hijos, docente a sus aulas, dirección a su colegio y superadmin provisionado desde servidor.

## Revisar en esta instalación

- En la raíz revisar animaciones, vista ilustrativa, menú móvil e instituciones. Crear institución con logo/datos, activarla y confirmar que aparezca; ocultarla y confirmar su retirada, sin exponer NIT/dirección en el RPC público.
- Recargar `/app/overview` con la cuenta de superadmin: el menú debe mostrar únicamente administración de plataforma.
- Crear una institución de prueba e invitar a Dirección, o entrar mediante «Soporte y probar roles» → Dirección para prepararla.
- Crear aula, asignar docentes, aprobar materiales anuales e inscribir al estudiante con sus cuotas. Registrar la activación de Bs 50 desde Facturación MiCole, volver a Dirección, activar y generar cuotas.
- Registrar nombres/correos de madre y padre, ingresar con cada correo verificado y comprobar que los hijos estén vinculados. Probar que un contacto de emergencia o un correo ajeno no obtenga acceso. Para docentes, compartir y aceptar la invitación.
- Compartir la ficha por WhatsApp, completar alergias/alimentación/seguro/emergencias desde el celular, aprobarla desde Dirección y revisar que el plan de pagos permanezca igual.
- Revisar Docente y Familia desde soporte: aulas, hijos, salud pendiente y bloqueo por deuda. No se puede crear una vista familiar sin un vínculo real.
- Probar publicación, permiso, respuesta, mensaje y notificación; comprobar autoría de soporte en el historial.
- Abrir Reportes en Dirección: aplicar fechas, curso/estudiante, consultar mora y cobros; exportar CSV e imprimir. En superadmin verificar que solo aparezca la facturación MiCole por institución.
- Confirmar el ingreso completo con Google y la entrega real de correo con cuentas externas. Google ya está habilitado; SMTP todavía requiere validación con el proveedor.
- Probar imágenes y QR una vez conectados R2 y el banco; aún no son pruebas completas de proveedor.

Para el flujo original quedan pendientes las gestiones, grados y paralelos como entidades con reinscripción anual e historial; asignaciones por materia y evaluaciones vinculadas a calendario/notas; la integración bancaria automática, adjuntos en las conversaciones y módulos opcionales por colegio. Las credenciales de cobro por institución se almacenan en Vault; las aulas ya tienen horarios estructurados. Dirección registra al niño y sus padres; la familia puede completar los cuidados por enlace sin login y Dirección los revisa, o se completa la ficha dentro de la app; se comparte imagen mediante galería y mensajes de texto; el horario se selecciona con horas y días por aula. Android, push y emisión SIAT siguen siendo etapas posteriores.

La configuración y los permisos de acceso se detallan en [AUTH.md](AUTH.md). Para probar estudiantes: Dirección → Estudiantes → Acceso del estudiante; ingresar luego con un correo distinto al familiar, confirmado. El rol se deriva en el servidor y no se elige en el login.


La operación de aulas y cobros incorpora cupos y filtros de estudiantes por curso, baja con motivo, inscripción y plan atómicos, abonos y anticipos con recibos, exigencia del 50 % (100 % en las últimas dos cuotas), facturación manual/CSV, materiales y actividades con aprobación de Dirección y participación con motivo. Incluye señales Realtime sin sondeo periódico, formularios estables, cumpleaños y recordatorios 1/2 días antes usando el cron existente, banner/WebP, Maps y contacto privado de Dirección. Consulta [OPERATIONS.md](OPERATIONS.md).
