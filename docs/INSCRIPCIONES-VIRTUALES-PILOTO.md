# Inscripciones virtuales: disponibilidad general

Disponible para todas las instituciones activas desde **Más opciones → Inscripciones** y desde **Inscripciones de esta aula**. La lista de alumnos registrados también tiene **Generar QR de inscripción** junto a cada nombre. Cada Dirección configura su campaña y habilita al personal de su institución. No se crean campañas, tarifas ni alumnos automáticamente en colegios reales. El acceso no depende de las plantillas de personalización. Los datos y permisos permanecen separados por colegio.

## Preparación de Dirección

Dirección prepara una campaña para la gestión actual o siguiente. Selecciona las aulas abiertas y sus grupos de reparto. Los paralelos compatibles deben compartir grupo, nivel, sede, gestión y turno. Si hay grado académico oficial, se conserva su código; los grupos pedagógicos de inicial se revisan explícitamente. Los nuevos se asignan a los paralelos con menor proporción de ocupación, con desempate aleatorio. Se cuentan estudiantes activos y reservas; las solicitudes pendientes de pago conservan su lugar hasta resolución. Las asignaciones se serializan en el servidor para evitar superar el último cupo.

La nómina importada conserva el paralelo seleccionado. Los alumnos existentes conservan su expediente; un traslado o promoción debe confirmarse primero en el proceso académico existente. Importar, crear una ficha o guardar un borrador no activa al alumno. El formulario enviado crea, cuando corresponde, un registro pendiente; se confirma tras completar los requisitos y el pago exigible.

Solo en la institución de pruebas, la campaña de demostración tiene dos paralelos de inicial, un importe **ficticio de Bs 1** y simulación de QR. No contacta al banco ni mueve dinero. El personal habilitado también puede registrar efectivo ficticio en este entorno. Dirección puede editar condiciones antes de que existan solicitudes; luego se conserva la cotización. Educación regular mantiene inscripción sin cargos adicionales obligatorios. La planificación de pensiones sigue en el módulo de planes existente.

## Importar Excel, CSV y PDF

Dirección selecciona el paralelo y un archivo de hasta 5 MB. XLSX y CSV tienen lectura directa en el navegador; Excel, CSV, PDF y fotos pueden leerse con el servicio de IA configurado, previa confirmación de autorización. La IA solo transcribe datos permitidos; los documentos se tratan como contenido no confiable y no pueden cambiar cursos, pagos o permisos. No se guardan automáticamente las filas extraídas ni se inventan contactos ausentes.

La tabla de revisión permite corregir valores y excluir filas. La validación compara RUDE y CI normalizados con alumnos y solicitudes de la institución; detecta también repeticiones del archivo y posibles homónimos. Coincidencias ambiguas y filas sin ningún nombre deben resolverse antes de importar. RUDE, carnet, apellidos y correo son opcionales en esta carga; la ficha queda por completar. Se aceptan nombres completos en una sola columna, sin separar apellidos automáticamente. Una única columna de nombres puede importarse sin encabezado; para varias columnas se necesitan encabezados o lectura asistida con IA. El correo genérico se conserva como contacto, sin atribuirlo a madre o padre. La confirmación vuelve a validar en el servidor y revierte el lote si falla una fila o faltan cupos. Se permiten hasta 200 filas por lote.

## QR y acceso familiar

Cada ficha tiene **Generar QR** y **Llenar ahora**. Dirección o una docente habilitada valida el correo del responsable antes de generar la invitación. El QR contiene un enlace opaco; la tarjeta y el PDF muestran logo, institución, alumno, curso y gestión. La invitación vence en siete días y reemplaza la anterior. Hay descarga individual y por lista; cada tarjeta debe entregarse únicamente a la familia correspondiente.

Abrir el enlace sin autenticación muestra la institución y la verificación del correo, sin la identidad ni el expediente del niño. El formulario requiere una cuenta con correo confirmado que coincida con el contacto autorizado. La ficha permite guardar borrador y continuar. El servidor conserva nombres oficiales ya separados, identificadores ya registrados, curso y correos autorizados; si la lista solo incluía un nombre sin separar, el personal autorizado o la familia verificada completa los nombres y apellidos antes de enviar. los datos faltantes y los cuidados se validan antes de confirmar. Regenerar el enlace o revocarlo invalida el anterior. El QR no otorga acceso general a otros alumnos.

## Pago y permisos

La modalidad en línea ofrece QR; efectivo solo aparece en sesiones del personal con permiso de cobro. Generar un enlace desde una cuenta docente no habilita efectivo en la página pública. Dirección concede por separado permiso para inscribir y para recibir efectivo, únicamente dentro de la campaña. No se amplían los permisos docentes generales de finanzas.

La ruta bancaria reutiliza el módulo Baneco existente y su conciliación. El formulario no acepta estados, importes ni confirmaciones de pago enviados por el navegador. Solo un cobro efectivamente aplicado a la cuota confirma la solicitud. Una captura no acredita un pago. La simulación es explícita y solo funciona en instituciones de pruebas registradas por la plataforma. Los colegios reales no pueden activar simulación; los pagos QR requieren conexión bancaria configurada y confirmación del proveedor. Reintentar una confirmación no crea otro recibo.

Un QR bancario pendiente impide cobrar efectivo o cancelar la solicitud hasta comprobar/cancelar ese cobro. Las reservas impagas sin operación bancaria pueden cancelarse; se conserva el historial. La constancia PDF solo está disponible después de confirmar. La falta de pago de una solicitud no convierte a un alumno importado en activo ni modifica su historial académico anterior.

## Implementación y verificación

Migraciones: `202611090002_virtual_enrollment.sql`, `202611100001_registration_review.sql`, `202611100002_registration_payment_verification.sql`, `202611100003_registration_support_permissions.sql` y `202611100004_registration_general_availability.sql`. Aplicación o validación con rollback: `scripts/migrate-registration.mjs [--apply]`. Configuración del entorno ficticio: `scripts/setup-registration-pilot.mjs`. El análisis extiende `document-analyze` sin cambiar los flujos anteriores de plantillas vacías y calendarios. La validación de pagos también protege las cuotas de inscripción frente a confirmaciones QR manuales desde la caja anterior. Las pruebas del propietario respetan los permisos de la docente seleccionada y conservan al operador real en el recibo.

Las URLs `/matricula/**` están permitidas para el retorno de Auth en los dominios MiCole; se conservan los retornos nativos y proveedores existentes. La página es privada y no indexable. No se envían invitaciones por WhatsApp automáticamente: el personal copia el enlace o descarga la ficha.

Pruebas de base: asignación y capacidad, importación atómica, duplicados, contactos, aislamiento, enlaces vencidos/reemplazados, revisiones concurrentes, pagos y permisos. Pruebas de navegador: QR/PDF, acceso familiar, borradores, pago simulado, efectivo delegado, importación revisada y móvil. Evidencias en `output/qa/2026-11-09-registration/`.

## Disponibilidad general — 10 de noviembre

Se eliminó la dependencia de instituciones de pruebas y de `appearance` en navegación, aulas, alumnos, configuración, acceso familiar e importación con IA. Se mantienen las reglas generales de habilitación de la plataforma. Cada institución prepara su campaña; la migración no crea alumnos, tarifas ni campañas en colegios reales. El servidor informa si la institución es de pruebas; en colegios reales oculta y rechaza la simulación, y emite recibos de efectivo con referencia `INS-`.

Validación: 616 pruebas en 70 archivos, incluidos colegios sin registro de pruebas ni plantilla, aislamiento entre colegios, invitaciones familiares, importación, efectivo delegado y rechazo de QR manual/simulado. La auditoría de producción se hizo con transacción de solo lectura: las tres instituciones activas con Dirección existentes eran de pruebas, por lo que el flujo de colegios reales se verificó en la base aislada de pruebas. También se comprobó en navegador el menú y la configuración sin `appearance`, la marca institucional del portal familiar y el diseño móvil. Evidencias de esta publicación en `output/qa/2026-11-10-registration-general/`.

## Listas mínimas — 10 de noviembre

La migración `202611100005_registration_optional_roster.sql` permite preparar fichas con solo el nombre. Acepta nombre con RUDE, carnet y/o correo, sin exigir esos campos al importar. Los datos de la inscripción final conservan los requisitos definidos por el colegio. No se activa al alumno al cargar la lista ni se emite una invitación sin correo autorizado verificado. La revisión compara nombres normalizados e identificadores presentes, detecta duplicados incluso entre filas mínimas y completas, y no vincula automáticamente por nombre.

Verificación de listas mínimas: 624 pruebas en 70 archivos; navegador real con CSV mínimo y duplicados, Excel de una columna sin encabezado, PDF de solo nombres con IA, correo genérico sin parentesco supuesto, borrador familiar, completar nombres/apellidos y confirmación tras pago simulado. La escritura de prueba se limita a la institución ficticia; no hubo cobros bancarios ni cambios en alumnos reales. Evidencias en `output/qa/2026-11-10-registration-optional/`.
