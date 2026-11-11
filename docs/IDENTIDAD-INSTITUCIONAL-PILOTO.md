# Identidad institucional: piloto en la web

El piloto está habilitado exclusivamente en la institución persistida de pruebas `76c0a7f0-7348-4a8f-b5f7-4c6acbbf6570`. Los colegios reales mantienen su configuración y funciones actuales. La configuración se guarda por sede en `schools.appearance`; el servidor rechaza cambios si la institución no está registrada y habilitada como entorno persistido de pruebas.

Dirección abre **Identidad y documentos** desde el menú. Puede elegir Aurora, Academia, Bosque, Atelier u Horizonte, editar color principal y acento, bienvenida y lema, y cambiar el logo o la portada con el formulario existente. La selección se previsualiza antes de guardar. Aplicar identidad conserva la configuración y actualiza el aspecto de los paneles de esa sede; descartar vuelve a lo guardado. El color de texto de los botones se calcula para mantener contraste. Las plantillas conservan los mismos flujos y permisos.

## Documentos con membrete

El centro de documentos descarga PDF reales, sin depender del diálogo de impresión:

- Libretas con resultados y periodos publicados, respetando calificaciones cuantitativas y cualitativas. No modifica notas ni publica periodos. También se añadió la descarga al visor de libretas existente.
- Citaciones preparadas para entregar, con estudiante, curso, fecha, hora, lugar y motivo. Descargar no envía mensajes ni registra una entrevista. Las entrevistas existentes también permiten descargar su citación.
- Comunicados publicados y vigentes, con su contenido original y aviso de confirmación de lectura cuando corresponde. También se pueden descargar desde el visor del comunicado.
- Recibos de abonos registrados. Conservan sus importes, referencia y forma de pago; no constituyen factura fiscal.
- QR de demostración marcado como simulación sin valor de cobro. En las pantallas de QR bancario pendientes de la sede piloto puede descargarse un PDF con la imagen original; no altera su contenido, vigencia o aplicación del pago.

Los PDF usan logo, nombre, contacto y color institucional; repiten el encabezado y numeran páginas cuando el contenido continúa. Las muestras se marcan como pruebas. Ante una imagen remota no disponible se usa el monograma, conservando el resto del documento.

## Carnets escolares

Desde **Carnets escolares**, Dirección emite un carnet por estudiante y gestión, con un código aleatorio único en la base. Reintentar la emisión devuelve el existente. Para reemitir debe confirmar la invalidación del actual; el registro anterior se conserva revocado y un reintento desactualizado se rechaza. Cada carnet vence el 31 de diciembre de su gestión.

El PDF contiene frente y reverso de 85.6 x 54 mm, nombre, aula, institución, gestión y vencimiento. El QR contiene un enlace con código opaco y sede, sin nombre, fecha de nacimiento, CI ni datos médicos. Su validación requiere una cuenta autorizada de la institución. Dirección puede escanear tras iniciar sesión o pegar el código en Consultar vigencia. El enlace de una sede distinta no devuelve información de otra institución. Un carnet no es documento oficial ni autoriza recogidas.

## Alcance y comprobaciones

Esta entrega es una prueba **web**. No crea aplicaciones independientes por colegio, dominios institucionales nuevos ni cambia los paquetes de Android/iOS.

La migración es `202611090001_institution_branding_pilot.sql`; `scripts/migrate-branding.mjs` permite validar con rollback o aplicar con `--apply`. `scripts/setup-branding-pilot.mjs` habilita únicamente la sede de pruebas conocida y comprueba que las demás escuelas no cambiaron. No se realizaron operaciones bancarias ni publicaciones de mensajes.

Pruebas: permisos por rol y sede, rechazo fuera del sandbox, colores y campos permitidos, idempotencia de emisión, revocación y códigos únicos en PGlite; generación y paginación de PDF; contraste y plantillas; guardado real en las cinco plantillas, descargas y vista móvil en navegador. Evidencias en `output/qa/2026-11-09-branding/` y seis muestras ficticias en `output/pdf/identidad-prueba/`.

## Encabezado institucional del menú web

El menú de las instituciones muestra primero su logo de 72 px (76 px en móvil) y el nombre completo. La sede aparece en un selector independiente; el modo kínder y las sesiones de soporte o pruebas conservan sus indicadores. MiCole figura como firma pequeña al pie. Si falta el logo o falla la imagen, aparecen las iniciales de la institución. La plataforma de superadministración conserva su encabezado MiCole.

Esta jerarquía se aplica también a instituciones sin plantilla, sin cambiar sus datos, y conserva las cinco personalizaciones del piloto. La búsqueda de institución antes del ingreso en Android/iOS queda fuera de este ajuste web. `scripts/verify-sidebar-identity.mjs` comprueba las cinco plantillas, la navegación móvil, nombres largos, logos no disponibles y ausencia de cambios en los datos; las evidencias se guardan en `output/qa/2026-11-09-sidebar-identity/`.
